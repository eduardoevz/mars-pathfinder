"use client";

import React, { useState } from "react";
import {
  Layers,
  Info,
  AlertTriangle,
  Eye,
  EyeOff,
  X,
  ExternalLink,
} from "lucide-react";
import { TWENTY_MARS_LAYERS, CartographicLayerDef } from "@/lib/nasa-seed-data";
import { useMissionStore } from "@/lib/mission-store";

export default function LayerManagerSidebar() {
  const layers = useMissionStore((s) => s.layers);
  const toggleLayer = useMissionStore((s) => s.toggleLayer);
  const setLayerOpacity = useMissionStore((s) => s.setLayerOpacity);
  const inspectedId = useMissionStore((s) => s.inspectedProvenanceLayerId);
  const setInspectedId = useMissionStore((s) => s.setInspectedProvenanceLayer);
  const [layerFilter, setLayerFilter] = useState<"ALL" | "SCIENTIFIC" | "SAFETY_EVA">("ALL");

  const scientificLayers = TWENTY_MARS_LAYERS.filter((l) => l.category === "SCIENTIFIC");
  const safetyLayers = TWENTY_MARS_LAYERS.filter((l) => l.category === "SAFETY_EVA");
  const inspectedLayer: CartographicLayerDef | undefined = TWENTY_MARS_LAYERS.find(
    (l) => l.id === inspectedId
  );

  // Critical Rule Warning: mixed low-res (MOLA/THEMIS) + high-res (HiRISE/Slope) active simultaneously
  const mixedResActive =
    (layers.OPTICAL?.visible || layers.SLOPE?.visible) &&
    (layers.THERMAL?.visible || layers.ATMOSPHERE?.visible || layers.RADIATION?.visible);

  const renderLayerItem = (l: CartographicLayerDef) => {
    const st = layers[l.id] || { visible: l.defaultVisible, opacity: l.defaultOpacity };
    return (
      <div
        key={l.id}
        className={`rounded-lg border p-2 transition ${
          st.visible
            ? "bg-slate-900/95 border-slate-700"
            : "bg-slate-950/60 border-slate-800/80 opacity-75"
        }`}
      >
        <div className="flex items-center justify-between gap-1.5">
          <button
            onClick={() => toggleLayer(l.id)}
            className="flex items-center gap-2 text-left flex-1 min-w-0"
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: st.visible ? l.color : "#334155" }}
            />
            <span className="font-mono text-[10px] px-1 rounded bg-slate-800 text-slate-300 shrink-0">
              {l.code}
            </span>
            <span className="text-[11px] font-medium text-slate-200 truncate">
              {l.name}
            </span>
          </button>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setInspectedId(inspectedId === l.id ? null : l.id)}
              title="Ver NASA Provenance Card"
              className={`p-1 rounded hover:bg-slate-800 ${
                inspectedId === l.id ? "text-hudcyan" : "text-slate-400"
              }`}
            >
              <Info className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => toggleLayer(l.id)}
              title={st.visible ? "Ocultar capa" : "Mostrar capa"}
              className="p-1 rounded hover:bg-slate-800 text-slate-300"
            >
              {st.visible ? <Eye className="w-3.5 h-3.5 text-hudcyan" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
            </button>
          </div>
        </div>

        {st.visible && (
          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={100}
              value={st.opacity}
              onChange={(e) => setLayerOpacity(l.id, Number(e.target.value))}
              className="w-full h-1 accent-cyan-400"
            />
            <span className="font-mono text-[10px] text-slate-400 w-8 text-right">
              {st.opacity}%
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col bg-panel/90 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-3 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-bold text-white">
          <Layers className="w-4 h-4 text-hudcyan" />
          Gestor Multicapa (20 Capas)
        </div>
        <span className="font-mono text-[10px] text-slate-400">
          {Object.values(layers).filter((x) => x.visible).length} activas
        </span>
      </div>

      {mixedResActive && (
        <div className="m-2 p-2 rounded-lg bg-amber-950/60 border border-amber-500/40 text-[10px] text-amber-200 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <span>
            <b>Aviso de Remuestreo Multi-Escala:</b> Estás combinando capas de alta resolución (HiRISE 0.25–1 m) con productos regionales (THEMIS 100 m / MOLA 463 m). El índice de incertidumbre <i>U</i> se penaliza localmente.
          </span>
        </div>
      )}

      {inspectedLayer && (
        <div className="m-2 p-2.5 rounded-lg bg-slate-950 border border-hudcyan/60 text-[11px] space-y-1.5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="font-mono font-bold text-hudcyan text-[10px] uppercase">
              NASA Provenance Card [{inspectedLayer.code}]
            </span>
            <button
              onClick={() => setInspectedId(null)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="font-semibold text-white">{inspectedLayer.name_es}</div>
          <p className="text-[10px] text-slate-300 leading-snug">{inspectedLayer.description}</p>
          <div className="grid grid-cols-1 gap-0.5 font-mono text-[10px] text-slate-400 pt-1 border-t border-slate-800">
            <div><span className="text-slate-500">Mission:</span> <span className="text-slate-200">{inspectedLayer.provenance.mission}</span></div>
            <div><span className="text-slate-500">Instrument:</span> <span className="text-slate-200">{inspectedLayer.provenance.instrument}</span></div>
            <div><span className="text-slate-500">Product ID:</span> <span className="text-hudcyan">{inspectedLayer.provenance.product_id}</span></div>
            <div><span className="text-slate-500">Obs. Date:</span> {inspectedLayer.provenance.observation_date}</div>
            <div><span className="text-slate-500">Resolution:</span> {inspectedLayer.provenance.spatial_resolution}</div>
            <div><span className="text-slate-500">Coverage:</span> {inspectedLayer.provenance.coverage}</div>
            <div><span className="text-slate-500">Uncertainty:</span> <span className="text-amber-300">{inspectedLayer.provenance.uncertainty}</span></div>
            <div><span className="text-slate-500">Temporal Class:</span> <span className="text-emerald-300">{inspectedLayer.provenance.temporal_class}</span></div>
            <div><span className="text-slate-500">QGIS Layer:</span> <span className="text-slate-300">{inspectedLayer.qgisLayerName}</span></div>
          </div>
          <a
            href={inspectedLayer.provenance.pds_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-hudcyan hover:underline pt-1"
          >
            Abrir Repositorio Oficial NASA <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      <div className="px-2 py-1.5 bg-slate-950/70 border-b border-slate-800 grid grid-cols-3 gap-1 text-[10px] font-mono">
        <button
          onClick={() => setLayerFilter("ALL")}
          className={`px-1.5 py-1 rounded border transition ${
            layerFilter === "ALL"
              ? "bg-slate-800 border-slate-500 text-white font-semibold"
              : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200"
          }`}
        >
          Todas (20)
        </button>
        <button
          onClick={() => setLayerFilter("SCIENTIFIC")}
          className={`px-1.5 py-1 rounded border transition ${
            layerFilter === "SCIENTIFIC"
              ? "bg-mars/20 border-mars text-orange-200 font-semibold"
              : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200"
          }`}
        >
          Científicas (7)
        </button>
        <button
          onClick={() => setLayerFilter("SAFETY_EVA")}
          className={`px-1.5 py-1 rounded border transition ${
            layerFilter === "SAFETY_EVA"
              ? "bg-cyan-950/90 border-hudcyan text-hudcyan font-semibold"
              : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200"
          }`}
        >
          Seguridad (13)
        </button>
      </div>

      <div className="p-2 space-y-3 max-h-[620px] overflow-y-auto">
        {(layerFilter === "ALL" || layerFilter === "SCIENTIFIC") && (
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-mars mb-1.5 px-1">
              Capas Científicas (7)
            </div>
            <div className="space-y-1.5">{scientificLayers.map(renderLayerItem)}</div>
          </div>
        )}
        {(layerFilter === "ALL" || layerFilter === "SAFETY_EVA") && (
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-hudcyan mb-1.5 px-1">
              Ambientales, Terreno y Seguridad EVA (13)
            </div>
            <div className="space-y-1.5">{safetyLayers.map(renderLayerItem)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
