"use client";

import React, { useEffect } from "react";
import {
  Rocket,
  Orbit,
  Eye,
  Award,
  Play,
  SkipForward,
  X,
} from "lucide-react";
import MissionControlWorkspace from "@/components/mission-control/MissionControlWorkspace";
import AstronautHudWorkspace from "@/components/astronaut-hud/AstronautHudWorkspace";
import NasaRubricModal from "@/components/rubric-modal/NasaRubricModal";
import { useMissionStore } from "@/lib/mission-store";
import { RegionId } from "@/lib/nasa-seed-data";
import { RawQgisRegionJson } from "@/lib/mars-core";

export default function HomePage() {
  const activeSystem = useMissionStore((s) => s.activeSystem);
  const setActiveSystem = useMissionStore((s) => s.setActiveSystem);
  const setRubricModalOpen = useMissionStore((s) => s.setRubricModalOpen);
  const guidedTourStep = useMissionStore((s) => s.guidedTourStep);
  const runGuidedTourStep = useMissionStore((s) => s.runGuidedTourStep);
  const setQgisTerrainData = useMissionStore((s) => s.setQgisTerrainData);
  const fieldLogs = useMissionStore((s) => s.fieldLogs);

  // Hydrate exact QGIS/GDAL-processed regional terrain grids from public/gis/qgis_processed_terrain.json
  useEffect(() => {
    fetch("/gis/qgis_processed_terrain.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.regions) {
          setQgisTerrainData(
            data.regions as Record<RegionId, RawQgisRegionJson>,
            data.metadata || {}
          );
        }
      })
      .catch(() => {
        // Fallback deterministic terrain engine stays active automatically
      });
  }, [setQgisTerrainData]);

  const pendingSyncCount = fieldLogs.filter((l) => !l.synced).length;

  return (
    <div className="min-h-screen flex flex-col bg-[#07090E] text-slate-100">
      {/* Top Aerospace Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-[#07090E]/95 backdrop-blur-md">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-mars to-orange-700 flex items-center justify-center shadow-lg shadow-orange-950/50">
              <Rocket className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-black tracking-wide text-white">
                  MARS PATHFINDER
                </h1>
                <span className="hidden md:inline-block text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-hudcyan">
                  NASA SPACE APPS 2026
                </span>
              </div>
              <p className="text-[10px] font-mono text-slate-400">
                EXPLORE WITH PURPOSE. DISCOVER BEYOND THE KNOWN. · FROM DATA TO DISCOVERY
              </p>
            </div>
          </div>

          {/* System Switcher: Mission Control <-> Astronaut Field HUD */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl bg-slate-900 p-1 border border-slate-800">
              <button
                onClick={() => setActiveSystem("MISSION_CONTROL")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                  activeSystem === "MISSION_CONTROL"
                    ? "bg-mars text-white shadow"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                <Orbit className="w-3.5 h-3.5" />
                Mission Control
              </button>
              <button
                onClick={() => setActiveSystem("ASTRONAUT_HUD")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                  activeSystem === "ASTRONAUT_HUD"
                    ? "bg-hudcyan text-slate-950 shadow"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                Astronaut Field HUD
                {pendingSyncCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full bg-purple-600 text-white text-[10px] font-mono">
                    {pendingSyncCount}
                  </span>
                )}
              </button>
            </div>

            <button
              onClick={() => setRubricModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs shadow-lg transition"
            >
              <Award className="w-4 h-4" />
              NASA Space Apps Rubric & Guided Demo
            </button>
          </div>
        </div>

        {/* Active Guided Pitch Step Banner */}
        {guidedTourStep > 0 && (
          <div className="border-t border-mars/40 bg-orange-950/50 px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 font-mono text-orange-200">
              <Play className="w-3.5 h-3.5 text-mars" />
              <span>
                <b>MODO PITCH GUIADO ({guidedTourStep}/6):</b>{" "}
                {guidedTourStep === 1 && "Objetivo Reto 2025 en Esfera 3D (GALE-BOXWORK-2025)."}
                {guidedTourStep === 2 && "Inspección Multicapa 3D (Óptica + Espectral CRISM + Térmica THEMIS + Boxwork)."}
                {guidedTourStep === 3 && "Predictor Pre-EVA de Tormentas de Polvo activado (CAUTION)."}
                {guidedTourStep === 4 && "Comparativa Ruta A vs. Ruta B en Margin Unit de Jezero (ahorro O₂)."}
                {guidedTourStep === 5 && "Simulación en vivo Mission Twin (5×) de consumo metabólico O₂."}
                {guidedTourStep === 6 && "Astronaut Field HUD en Neretva Vallis: Sombra de Radio + RAG + Field Log Offline."}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {guidedTourStep < 6 && (
                <button
                  onClick={() => runGuidedTourStep(guidedTourStep + 1)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-mars text-white font-bold text-[11px]"
                >
                  Siguiente Paso <SkipForward className="w-3 h-3" />
                </button>
              )}
              <button
                onClick={() => runGuidedTourStep(0)}
                className="p-1 rounded hover:bg-slate-800 text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-3 sm:px-5 py-4">
        {activeSystem === "MISSION_CONTROL" ? (
          <MissionControlWorkspace />
        ) : (
          <AstronautHudWorkspace />
        )}
      </main>

      <NasaRubricModal />
    </div>
  );
}
