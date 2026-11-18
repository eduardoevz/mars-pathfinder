import json
import os
from qgis.PyQt.QtCore import QObject
from qgis.PyQt.QtNetwork import QTcpServer, QHostAddress
from qgis.PyQt.QtWidgets import QAction, QMessageBox
from qgis.core import (
    Qgis,
    QgsProject,
    QgsRasterLayer,
    QgsVectorLayer,
    QgsRectangle,
    QgsCoordinateReferenceSystem,
    QgsCoordinateTransform,
)


class MarsPathfinderMcpPlugin(QObject):
    def __init__(self, iface):
        super().__init__()
        self.iface = iface
        self.server = None
        self.action = None
        self.port = 9876
        self.clients = []

    def initGui(self):
        self.action = QAction("MARS PATHFINDER MCP Bridge", self.iface.mainWindow())
        self.action.triggered.connect(self.show_status)
        self.iface.addPluginToMenu("&MARS PATHFINDER MCP", self.action)
        self.start_server()

    def unload(self):
        if self.server:
            self.server.close()
            self.server = None
        if self.action:
            self.iface.removePluginMenu("&MARS PATHFINDER MCP", self.action)
            self.action = None

    def start_server(self):
        self.server = QTcpServer(self)
        if self.server.listen(QHostAddress("127.0.0.1"), self.port):
            self.server.newConnection.connect(self._on_new_connection)
            self.iface.messageBar().pushMessage(
                "MARS PATHFINDER MCP",
                f"MCP Bridge activo en 127.0.0.1:{self.port}",
                level=Qgis.Info,
                duration=5,
            )
        else:
            self.iface.messageBar().pushMessage(
                "MARS PATHFINDER MCP",
                f"No se pudo abrir puerto {self.port}: {self.server.errorString()}",
                level=Qgis.Warning,
                duration=6,
            )

    def show_status(self):
        proj = QgsProject.instance()
        layers = [l.name() for l in proj.mapLayers().values()]
        msg = (
            f"MARS PATHFINDER MCP Bridge\n"
            f"Puerto TCP: 127.0.0.1:{self.port}\n"
            f"Proyecto activo: {proj.fileName() or '(Sin proyecto guardado)'}\n"
            f"Capas cargadas ({len(layers)}): {', '.join(layers[:12])}"
        )
        QMessageBox.information(self.iface.mainWindow(), "MARS PATHFINDER MCP", msg)

    def _on_new_connection(self):
        while self.server.hasPendingConnections():
            client = self.server.nextPendingConnection()
            self.clients.append(client)
            client.readyRead.connect(lambda c=client: self._on_ready_read(c))
            client.disconnected.connect(lambda c=client: self._on_disconnected(c))

    def _on_disconnected(self, client):
        if client in self.clients:
            self.clients.remove(client)
        client.deleteLater()

    def _on_ready_read(self, client):
        raw = bytes(client.readAll()).decode("utf-8", errors="ignore").strip()
        if not raw:
            return
        for line in raw.splitlines():
            if not line.strip():
                continue
            try:
                req = json.loads(line)
                resp = self._handle_command(req)
            except Exception as exc:
                resp = {"ok": False, "error": str(exc)}
            client.write((json.dumps(resp, ensure_ascii=False) + "\n").encode("utf-8"))
            client.flush()

    def _handle_command(self, req):
        cmd = req.get("command", "get_status")
        params = req.get("params", {}) or {}
        proj = QgsProject.instance()
        canvas = self.iface.mapCanvas()

        if cmd == "get_status":
            return {
                "ok": True,
                "qgis_version": Qgis.QGIS_VERSION,
                "project_file": proj.fileName(),
                "crs": proj.crs().authid() or proj.crs().description(),
                "layer_count": len(proj.mapLayers()),
                "layers": [
                    {
                        "id": l.id(),
                        "name": l.name(),
                        "type": str(l.type()),
                        "source": l.source()[:160],
                    }
                    for l in proj.mapLayers().values()
                ],
                "extent": {
                    "xmin": canvas.extent().xMinimum(),
                    "xmax": canvas.extent().xMaximum(),
                    "ymin": canvas.extent().yMinimum(),
                    "ymax": canvas.extent().yMaximum(),
                },
            }

        if cmd == "load_project":
            path = params.get("path")
            if not path or not os.path.exists(path):
                return {"ok": False, "error": f"Project file not found: {path}"}
            ok = proj.read(path)
            canvas.refresh()
            return {"ok": bool(ok), "project_file": proj.fileName(), "layer_count": len(proj.mapLayers())}

        if cmd == "add_raster_layer":
            uri = params.get("uri")
            name = params.get("name", "NASA Mars Raster")
            provider = params.get("provider", "gdal")
            layer = QgsRasterLayer(uri, name, provider)
            if not layer.isValid():
                return {"ok": False, "error": f"Invalid raster layer: {uri}"}
            proj.addMapLayer(layer)
            canvas.refresh()
            return {"ok": True, "layer_id": layer.id(), "name": layer.name()}

        if cmd == "add_vector_layer":
            path = params.get("path")
            name = params.get("name", "Mars Vector Layer")
            layer = QgsVectorLayer(path, name, "ogr")
            if not layer.isValid():
                return {"ok": False, "error": f"Invalid vector layer: {path}"}
            proj.addMapLayer(layer)
            canvas.refresh()
            return {"ok": True, "layer_id": layer.id(), "name": layer.name()}

        if cmd == "zoom_to_coords":
            lon = float(params.get("lon", 77.4))
            lat = float(params.get("lat", 18.5))
            span = float(params.get("span_deg", 0.35))
            rect = QgsRectangle(lon - span, lat - span, lon + span, lat + span)
            src_crs = QgsCoordinateReferenceSystem("EPSG:4326")
            dst_crs = proj.crs()
            if dst_crs.isValid() and dst_crs != src_crs:
                try:
                    xform = QgsCoordinateTransform(src_crs, dst_crs, proj)
                    rect = xform.transformBoundingBox(rect)
                except Exception:
                    pass
            canvas.setExtent(rect)
            canvas.refresh()
            return {"ok": True, "center": [lon, lat], "span_deg": span}

        if cmd == "export_canvas":
            out_path = params.get("output_path")
            if not out_path:
                return {"ok": False, "error": "Missing output_path"}
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            canvas.saveAsImage(out_path)
            return {"ok": True, "output_path": out_path}

        return {"ok": False, "error": f"Unknown command: {cmd}"}
