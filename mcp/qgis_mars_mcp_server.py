#!/usr/bin/env python3
"""
MARS PATHFINDER — QGIS Desktop MCP Server (stdio JSON-RPC 2.0 + CLI Bridge)
Connects Model Context Protocol clients and the Next.js Web App to:
  1. Live QGIS Desktop (127.0.0.1:9876 via mars_pathfinder_mcp plugin)
  2. OSGeo4W QGIS Processing CLI (qgis_process-qgis-ltr.bat)
  3. GDAL/OGR 3.13.3 CLI (gdaldem, gdal_viewshed, gdal_contour, ogr2ogr)
"""

import json
import os
import socket
import subprocess
import sys
from pathlib import Path

WORKSPACE_DIR = Path(r"c:\Users\eduem\OneDrive\Desktop\nasa 1")
OSGEO_BIN = Path(r"C:\Users\eduem\AppData\Local\Programs\OSGeo4W\bin")
QGIS_PROCESS_BAT = OSGEO_BIN / "qgis_process-qgis-ltr.bat"
PYTHON_QGIS_BAT = OSGEO_BIN / "python-qgis-ltr.bat"
MASTER_PROJECT = WORKSPACE_DIR / "qgis" / "mars_pathfinder_master.qgs"
QGIS_HOST = "127.0.0.1"
QGIS_PORT = 9876


def send_to_qgis_desktop(command: str, params: dict | None = None, timeout: float = 3.0) -> dict:
    try:
        with socket.create_connection((QGIS_HOST, QGIS_PORT), timeout=timeout) as sock:
            payload = json.dumps({"command": command, "params": params or {}}) + "\n"
            sock.sendall(payload.encode("utf-8"))
            sock.settimeout(timeout)
            buf = b""
            while b"\n" not in buf:
                chunk = sock.recv(65536)
                if not chunk:
                    break
                buf += chunk
            text = buf.decode("utf-8", errors="ignore").strip()
            if not text:
                return {"ok": False, "connected": False, "error": "Empty response from QGIS Desktop plugin"}
            data = json.loads(text.splitlines()[0])
            data["connected"] = True
            return data
    except Exception as exc:
        return {
            "ok": False,
            "connected": False,
            "error": f"QGIS Desktop live socket (127.0.0.1:{QGIS_PORT}) unreachable: {exc}. "
                     "Restart QGIS Desktop once so the installed mars_pathfinder_mcp plugin binds port 9876, "
                     "or use offline GDAL/qgis_process tools.",
        }


def run_qgis_pipeline() -> dict:
    script = WORKSPACE_DIR / "qgis" / "generate_mars_gis_data.py"
    if not script.exists():
        return {"ok": False, "error": f"Missing pipeline script: {script}"}
    proc = subprocess.run(
        [str(PYTHON_QGIS_BAT), str(script)],
        cwd=str(WORKSPACE_DIR),
        capture_output=True,
        text=True,
        timeout=180,
    )
    return {
        "ok": proc.returncode == 0,
        "returncode": proc.returncode,
        "stdout": proc.stdout[-4000:],
        "stderr": proc.stderr[-2000:],
        "project_file": str(MASTER_PROJECT),
    }


def open_project_in_qgis_desktop(region: str | None = None) -> dict:
    live = send_to_qgis_desktop("load_project", {"path": str(MASTER_PROJECT)})
    if live.get("ok"):
        if region == "JEZERO_CRATER":
            send_to_qgis_desktop("zoom_to_coords", {"lon": 77.38, "lat": 18.45, "span_deg": 0.25})
        elif region == "GALE_MOUNT_SHARP":
            send_to_qgis_desktop("zoom_to_coords", {"lon": 137.41, "lat": -4.68, "span_deg": 0.25})
        return {"ok": True, "mode": "live_socket", "details": live}

    qgis_bat = OSGEO_BIN / "qgis-ltr.bat"
    if qgis_bat.exists() and MASTER_PROJECT.exists():
        popen_kwargs: dict = {
            "cwd": str(WORKSPACE_DIR),
            "stdin": subprocess.DEVNULL,
            "stdout": subprocess.DEVNULL,
            "stderr": subprocess.DEVNULL,
            "close_fds": True,
        }
        if os.name == "nt":
            popen_kwargs["creationflags"] = (
                getattr(subprocess, "DETACHED_PROCESS", 0)
                | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
            )
        subprocess.Popen([str(qgis_bat), str(MASTER_PROJECT)], **popen_kwargs)
        return {
            "ok": True,
            "mode": "launched_qgis_desktop",
            "project_file": str(MASTER_PROJECT),
            "note": "Launched QGIS Desktop with mars_pathfinder_master.qgs and mars_pathfinder_mcp plugin active.",
        }
    return {"ok": False, "error": "Could not connect to QGIS Desktop or find qgis-ltr.bat"}


def get_system_status() -> dict:
    live = send_to_qgis_desktop("get_status", {}, timeout=1.5)
    terrain_json = WORKSPACE_DIR / "public" / "gis" / "qgis_processed_terrain.json"
    terrain_meta = {}
    if terrain_json.exists():
        try:
            with open(terrain_json, "r", encoding="utf-8") as f:
                data = json.load(f)
                terrain_meta = data.get("metadata", {})
        except Exception:
            pass

    return {
        "ok": True,
        "qgis_desktop_live": live.get("connected", False),
        "qgis_desktop_details": live,
        "qgis_process_available": QGIS_PROCESS_BAT.exists(),
        "master_project_exists": MASTER_PROJECT.exists(),
        "master_project_path": str(MASTER_PROJECT),
        "processed_terrain_metadata": terrain_meta,
    }


TOOLS = [
    {
        "name": "qgis_get_status",
        "description": "Check live QGIS Desktop MCP bridge status, loaded layers, project path, and GDAL/QGIS processing provenance.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "qgis_run_mars_pipeline",
        "description": "Run the PyQGIS + GDAL 3.13 terrain and NASA Mars Trek global mosaic pipeline to build mars_pathfinder_master.qgs, GeoTIFFs, GeoJSONs, and WebGL textures.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "qgis_open_project",
        "description": "Load mars_pathfinder_master.qgs inside the local QGIS Desktop application and optionally zoom to a Mars target region.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "region": {
                    "type": "string",
                    "enum": ["GLOBAL", "JEZERO_CRATER", "GALE_MOUNT_SHARP"],
                    "description": "Optional Mars region to zoom the QGIS Desktop canvas to.",
                }
            },
        },
    },
    {
        "name": "qgis_zoom_to_coords",
        "description": "Pan and zoom the active QGIS Desktop map canvas to specific Mars planetocentric coordinates.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "lon": {"type": "number", "description": "Mars East longitude (-180 to 180)"},
                "lat": {"type": "number", "description": "Mars latitude (-90 to 90)"},
                "span_deg": {"type": "number", "description": "Bounding box half-width in degrees"},
            },
            "required": ["lon", "lat"],
        },
    },
    {
        "name": "qgis_run_qgis_process",
        "description": "Execute any QGIS Processing algorithm via qgis_process-qgis-ltr.bat (e.g. native:slope, native:hillshade, gdal:viewshed).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "algorithm": {"type": "string", "description": "QGIS Processing algorithm ID"},
                "args": {"type": "array", "items": {"type": "string"}, "description": "CLI key=value arguments"},
            },
            "required": ["algorithm"],
        },
    },
]


def call_tool(name: str, arguments: dict) -> dict:
    if name == "qgis_get_status":
        return get_system_status()
    if name == "qgis_run_mars_pipeline":
        return run_qgis_pipeline()
    if name == "qgis_open_project":
        return open_project_in_qgis_desktop(arguments.get("region"))
    if name == "qgis_zoom_to_coords":
        return send_to_qgis_desktop("zoom_to_coords", arguments)
    if name == "qgis_run_qgis_process":
        alg = arguments["algorithm"]
        args = arguments.get("args", [])
        proc = subprocess.run(
            [str(QGIS_PROCESS_BAT), "run", alg, *args],
            cwd=str(WORKSPACE_DIR),
            capture_output=True,
            text=True,
            timeout=120,
        )
        return {"ok": proc.returncode == 0, "stdout": proc.stdout, "stderr": proc.stderr}
    return {"ok": False, "error": f"Unknown tool: {name}"}


def serve_stdio():
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        msg_id = msg.get("id")
        method = msg.get("method")
        params = msg.get("params", {}) or {}

        if method == "initialize":
            result = {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "qgis-mars-mcp", "version": "1.0.0"},
            }
        elif method == "notifications/initialized":
            continue
        elif method == "tools/list":
            result = {"tools": TOOLS}
        elif method == "tools/call":
            tool_name = params.get("name")
            args = params.get("arguments", {}) or {}
            output = call_tool(tool_name, args)
            result = {
                "content": [{"type": "text", "text": json.dumps(output, ensure_ascii=False, indent=2)}],
                "isError": not output.get("ok", True),
            }
        else:
            result = {"error": {"code": -32601, "message": f"Method not found: {method}"}}

        if msg_id is not None:
            reply = {"jsonrpc": "2.0", "id": msg_id, "result": result}
            sys.stdout.write(json.dumps(reply, ensure_ascii=False) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--cli":
        tool = sys.argv[2] if len(sys.argv) > 2 else "qgis_get_status"
        arg_json = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
        print(json.dumps(call_tool(tool, arg_json), ensure_ascii=False, indent=2))
    else:
        serve_stdio()
