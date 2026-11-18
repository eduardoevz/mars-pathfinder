"use client";

import React, { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  Target,
  Route as RouteIcon,
  Wind,
  Activity,
  ShieldAlert,
  Play,
  Pause,
  CheckCircle2,
  Bot,
  Radio,
  BarChart3,
  ListChecks,
  Sparkles,
  Sun,
  Gauge,
} from "lucide-react";
import MarsGoogleEarthViewer from "@/components/globe/MarsGoogleEarthViewer";
import LayerManagerSidebar from "./LayerManagerSidebar";
import {
  HISTORICAL_ENV_SERIES,
  SCIENTIFIC_TARGETS,
} from "@/lib/nasa-seed-data";
import {
  computeSOI,
  findNearestTopographicShelters,
} from "@/lib/mars-core";
import {
  useDerivedMissionComputation,
  useMissionStore,
} from "@/lib/mission-store";

type McSubTab =
  | "SCIENCE_SOI"
  | "TRAVERSE_O2"
  | "WEATHER_RAD"
  | "PLANNER_TWIN";

export default function MissionControlWorkspace() {
  const [subTab, setSubTab] = useState<McSubTab>("TRAVERSE_O2");

  const activeRegionId = useMissionStore((s) => s.activeRegionId);
  const activeTargetId = useMissionStore((s) => s.activeTargetId);
  const selectTarget = useMissionStore((s) => s.selectTarget);
  const selectedRouteId = useMissionStore((s) => s.selectedRouteId);
  const selectRoute = useMissionStore((s) => s.selectRoute);
  const soiWeights = useMissionStore((s) => s.soiWeights);
  const setSoiWeight = useMissionStore((s) => s.setSoiWeight);
  const suitParams = useMissionStore((s) => s.suitParams);
  const updateSuitParams = useMissionStore((s) => s.updateSuitParams);
  const weatherInputs = useMissionStore((s) => s.weatherInputs);
  const updateWeatherInputs = useMissionStore((s) => s.updateWeatherInputs);
  const twinPlaying = useMissionStore((s) => s.twinPlaying);
  const setTwinPlaying = useMissionStore((s) => s.setTwinPlaying);
  const twinSpeed = useMissionStore((s) => s.twinSpeed);
  const setTwinSpeed = useMissionStore((s) => s.setTwinSpeed);
  const twinProgress = useMissionStore((s) => s.twinProgress);
  const setTwinProgress = useMissionStore((s) => s.setTwinProgress);
  const plannerStep = useMissionStore((s) => s.plannerStep);
  const setPlannerStep = useMissionStore((s) => s.setPlannerStep);
  const approveMissionForHud = useMissionStore((s) => s.approveMissionForHud);
  const fieldLogs = useMissionStore((s) => s.fieldLogs);
  const layers = useMissionStore((s) => s.layers);

  const { grid, target, routes, activeRoute, weather } = useDerivedMissionComputation();

  // Mission Twin real-time playback ticker
  useEffect(() => {
    if (!twinPlaying) return;
    const id = setInterval(() => {
      const curr = useMissionStore.getState().twinProgress;
      const next = curr + 0.008 * useMissionStore.getState().twinSpeed;
      if (next >= 1) {
        setTwinProgress(1);
        setTwinPlaying(false);
      } else {
        setTwinProgress(next);
      }
    }, 120);
    return () => clearInterval(id);
  }, [twinPlaying, setTwinProgress, setTwinPlaying]);

  const wpIdx = Math.min(
    activeRoute.waypoints.length - 1,
    Math.max(0, Math.round(twinProgress * (activeRoute.waypoints.length - 1)))
  );
  const currentWp = activeRoute.waypoints[wpIdx] || activeRoute.waypoints[0];

  const shelters = findNearestTopographicShelters(
    grid,
    currentWp?.gx ?? grid.baseGrid[0],
    currentWp?.gy ?? grid.baseGrid[1],
    4
  );

  const rankedTargets = [...SCIENTIFIC_TARGETS]
    .map((t) => ({
      target: t,
      soi: computeSOI(t.soi_base, soiWeights),
    }))
    .sort((a, b) => b.soi.total - a.soi.total);

  const activeSoi = computeSOI(target.soi_base, soiWeights);

  // Radiation dose calculation (RAD Gale ref + DONKI Solar Particle Event multiplier)
  const missionDurationHours = Number(((activeRoute.totalDistanceKm * 1000) / (suitParams.walkingSpeedMs * 3600) * 1.8 + suitParams.observationMinutes / 60).toFixed(2));
  const sepMultiplier = suitParams.solarEventActive ? 4.8 : 1.0;
  const radiationDoseUsv = Number((target.radiation_reference.surface_dose_rate_usv_h * missionDurationHours * sepMultiplier).toFixed(1));

  const chartProfileData = activeRoute.waypoints.map((w) => ({
    distKm: Number((w.cumDistanceM / 1000).toFixed(2)),
    elevM: w.elevationM,
    slopeDeg: w.slopeDeg,
    o2LeftPct: w.remainingO2Percent,
    returnReqPct: Number((w.returnO2RequiredPercent + suitParams.reservePercent).toFixed(1)),
  }));

  const envHistory = HISTORICAL_ENV_SERIES[activeRegionId];

  const plannerStepsList = [
    "1. Selección de Punto Mapeado (10 Sitios)",
    "2. Objetivo Científico Real NASA",
    "3. Evidencia PDS y Cálculo SOI",
    "4. Predictor Pre-EVA Tormentas de Polvo",
    "5. Traje PLSS, Carga y Tanque O₂",
    "6. Pendiente S_max, Sombra LoS y Refugios",
    "7. Enrutamiento A* vs. Dijkstra (Rutas A/B/C)",
    "8. Asignación de Rover Scout Repetidor",
    "9. Validación Bingo O₂ (+20% Reserva)",
    "10. Aprobar Plan y Transmitir al HUD",
  ];

  const syncedLogsCount = fieldLogs.filter((l) => l.synced).length;
  const pendingLogsCount = fieldLogs.filter((l) => !l.synced).length;

  return (
    <div className="space-y-4">
      {/* Executive KPI Dashboard Strip (Module 11) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
        <div className="bg-panel border border-slate-800 rounded-xl p-3">
          <div className="text-[10px] font-mono text-slate-400 uppercase">Objetivo Activo</div>
          <div className="text-xs font-bold text-hudcyan truncate mt-0.5">{target.target_id}</div>
          <div className="text-[11px] font-mono text-slate-300 mt-0.5">SOI: {activeSoi.total.toFixed(3)}</div>
        </div>
        <div className="bg-panel border border-slate-800 rounded-xl p-3">
          <div className="text-[10px] font-mono text-slate-400 uppercase">Ruta ({activeRoute.id.replace("_", " ")})</div>
          <div className="text-sm font-mono font-bold text-white mt-0.5">{activeRoute.totalDistanceKm} km</div>
          <div className="text-[11px] font-mono text-slate-400">+{activeRoute.elevationGainM}m · Max {activeRoute.maxSlopeDeg}°</div>
        </div>
        <div className="bg-panel border border-slate-800 rounded-xl p-3">
          <div className="text-[10px] font-mono text-slate-400 uppercase">Consumo O₂ / Bingo</div>
          <div className={`text-sm font-mono font-bold mt-0.5 ${activeRoute.bingoO2Safe ? "text-nominal" : "text-critical"}`}>
            {activeRoute.o2ConsumedPercent}% ({activeRoute.o2ConsumedLiters} L)
          </div>
          <div className="text-[10px] font-mono text-slate-400 truncate">
            {activeRoute.bingoO2Safe ? "✓ Margen Seguro +20%" : "✕ Violación Bingo O₂"}
          </div>
        </div>
        <div className="bg-panel border border-slate-800 rounded-xl p-3">
          <div className="text-[10px] font-mono text-slate-400 uppercase">Semáforo Pre-EVA</div>
          <div
            className={`text-sm font-mono font-bold mt-0.5 ${
              weather.status === "GO"
                ? "text-nominal"
                : weather.status === "CAUTION"
                ? "text-caution"
                : "text-critical"
            }`}
          >
            {weather.status} ({weather.stormProbabilityPercent}%)
          </div>
          <div className="text-[10px] font-mono text-slate-400">Visibilidad {weather.visibilityKm} km</div>
        </div>
        <div className="bg-panel border border-slate-800 rounded-xl p-3">
          <div className="text-[10px] font-mono text-slate-400 uppercase">Cobertura Alta Res & LoS</div>
          <div className="text-sm font-mono font-bold text-hudcyan mt-0.5">
            {activeRoute.highResCoveragePercent}% HiRISE · {activeRoute.commCoveragePercent}% LoS
          </div>
          <div className="text-[10px] font-mono text-slate-400">Dosis Rad: {radiationDoseUsv} μSv</div>
        </div>
        <div className="bg-panel border border-slate-800 rounded-xl p-3">
          <div className="text-[10px] font-mono text-slate-400 uppercase">Field Logs Sincronizados</div>
          <div className="text-sm font-mono font-bold text-emerald-300 mt-0.5">
            {syncedLogsCount} Sincronizados
          </div>
          <div className="text-[10px] font-mono text-amber-300">
            {pendingLogsCount} en Buffer Offline HUD
          </div>
        </div>
      </div>

      {/* Main Spatial Workspace: Google Earth Mars Globe / 3D Surface + 20-Layer Sidebar */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-9 space-y-3">
          <MarsGoogleEarthViewer
            grid={grid}
            routes={routes}
            activeRoute={activeRoute}
            shelters={shelters}
          />

          {/* Quick Target Selection Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {SCIENTIFIC_TARGETS.map((t) => {
              const active = t.target_id === activeTargetId;
              return (
                <button
                  key={t.target_id}
                  onClick={() => selectTarget(t.target_id)}
                  className={`text-left py-2 px-3 rounded-xl border transition ${
                    active
                      ? "bg-slate-900 border-mars shadow-lg shadow-orange-950/30"
                      : "bg-panel/80 border-slate-800 hover:border-slate-600"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-950 text-hudcyan border border-slate-800">
                      {t.target_id}
                    </span>
                    <span className="font-mono text-[10px] text-amber-300">
                      {t.coordinates.latitude.toFixed(2)}°, {t.coordinates.longitude.toFixed(2)}°
                    </span>
                  </div>
                  <div className="text-xs font-bold text-white leading-snug truncate">{t.title_es}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 truncate">{t.rover_mission}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="xl:col-span-3">
          <LayerManagerSidebar />
        </div>
      </div>

      {/* Mandatory Challenge Verbatim Quote Banner when GALE-BOXWORK-2025 is selected */}
      {target.challenge_mandate_quote && (
        <div className="rounded-xl border border-mars/60 bg-gradient-to-r from-orange-950/60 via-slate-900 to-slate-900 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-mars font-bold mb-1">
              ★ Escenario Oficial del Reto NASA Space Apps 2026 — Monte Sharp (Curiosity 2025)
            </div>
            <blockquote className="text-xs sm:text-sm italic text-orange-100 leading-relaxed">
              &ldquo;{target.challenge_mandate_quote}&rdquo;
            </blockquote>
          </div>
          <span className="shrink-0 font-mono text-[11px] px-2.5 py-1 rounded bg-slate-950 border border-mars/40 text-orange-300">
            GALE-BOXWORK-2025
          </span>
        </div>
      )}

      {/* Lower Operations Workbench Tabs */}
      <div className="bg-panel border border-slate-800 rounded-xl overflow-hidden">
        <div className="flex flex-wrap border-b border-slate-800 bg-slate-950/80 px-2 pt-2 gap-1">
          {[
            { id: "TRAVERSE_O2", label: "Smart Traverse (A* / Dijkstra) & Soporte Vital O₂", icon: RouteIcon },
            { id: "SCIENCE_SOI", label: "Evidencia Científica PDS & Calculadora SOI", icon: Target },
            { id: "WEATHER_RAD", label: "Predictor Tormentas Pre-EVA, Radiación & Refugios", icon: Wind },
            { id: "PLANNER_TWIN", label: "Mission Twin (Simulador) & Asistente 10 Pasos", icon: Play },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id as McSubTab)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-t-lg text-xs font-semibold border-b-2 transition ${
                  active
                    ? "bg-slate-900 text-hudcyan border-hudcyan"
                    : "text-slate-400 border-transparent hover:text-white"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="p-4">
          {/* TAB 1: SMART TRAVERSE + PLSS + ROBOTIC SUPPORT */}
          {subTab === "TRAVERSE_O2" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left: 3 Route Cards + A* vs Dijkstra Validation */}
              <div className="lg:col-span-7 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {routes.map((rt) => {
                    const isSel = rt.id === selectedRouteId;
                    return (
                      <button
                        key={rt.id}
                        onClick={() => selectRoute(rt.id)}
                        className={`text-left p-3 rounded-xl border transition ${
                          isSel
                            ? "bg-slate-900 border-hudcyan ring-1 ring-hudcyan/40"
                            : "bg-slate-950/70 border-slate-800 hover:border-slate-600"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: rt.color }}
                          />
                          <span
                            className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                              rt.bingoO2Safe
                                ? "bg-emerald-950 text-nominal"
                                : "bg-red-950 text-critical"
                            }`}
                          >
                            {rt.bingoO2Safe ? "BINGO SAFE" : "PELIGRO"}
                          </span>
                        </div>
                        <div className="text-xs font-bold text-white">{rt.label}</div>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{rt.subtitle}</p>
                        <div className="mt-2 pt-2 border-t border-slate-800 grid grid-cols-2 gap-1 font-mono text-[10px]">
                          <span className="text-slate-400">Dist: <b className="text-white">{rt.totalDistanceKm} km</b></span>
                          <span className="text-slate-400">Max S: <b className="text-white">{rt.maxSlopeDeg}°</b></span>
                          <span className="text-slate-400">Tanque O₂: <b style={{ color: rt.color }}>{rt.o2ConsumedPercent}%</b></span>
                          <span className="text-slate-400">Litros: <b className="text-white">{rt.o2ConsumedLiters} L</b></span>
                          <span className="text-slate-400">LoS Radio: <b className="text-cyan-300">{rt.commCoveragePercent}%</b></span>
                          <span className="text-slate-400">Ciencia: <b className="text-amber-300">{rt.scienceValueScore}</b></span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* A* vs Dijkstra Proof Box */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                  <div className="flex items-center gap-2 text-hudcyan">
                    <BarChart3 className="w-4 h-4" />
                    <span>Validación Algorítmica (Ruta B Óptima):</span>
                  </div>
                  <div className="flex flex-wrap gap-4 text-[11px]">
                    <span className="text-emerald-300">
                      A*: <b>{routes[1].algorithmStats.astarNodesExplored}</b> nodos en{" "}
                      <b suppressHydrationWarning>{routes[1].algorithmStats.astarTimeMs} ms</b>
                    </span>
                    <span className="text-slate-300">
                      Dijkstra (h=0): <b>{routes[1].algorithmStats.dijkstraNodesExplored}</b> nodos en{" "}
                      <b suppressHydrationWarning>{routes[1].algorithmStats.dijkstraTimeMs} ms</b>
                    </span>
                    <span className="text-amber-300">
                      Ahorro O₂ vs Ruta A:{" "}
                      <b>{Math.max(0, routes[0].o2ConsumedPercent - routes[1].o2ConsumedPercent).toFixed(1)}%</b>
                    </span>
                  </div>
                </div>

                {/* Dual Interactive Recharts: Elevation/Slope + O2 Discharge vs Distance */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                    <div className="text-[11px] font-mono text-slate-300 mb-2">
                      Perfil de Elevación (m) y Pendiente (°)
                    </div>
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartProfileData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="distKm" tick={{ fontSize: 10, fill: "#94a3b8" }} unit=" km" />
                          <YAxis yAxisId="elev" tick={{ fontSize: 10, fill: "#38bdf8" }} domain={["auto", "auto"]} />
                          <YAxis yAxisId="slope" orientation="right" tick={{ fontSize: 10, fill: "#f59e0b" }} />
                          <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", fontSize: 11 }} />
                          <Area yAxisId="elev" type="monotone" dataKey="elevM" stroke="#38bdf8" fill="#0284c7" fillOpacity={0.25} name="Elevación (m)" />
                          <Line yAxisId="slope" type="monotone" dataKey="slopeDeg" stroke="#f59e0b" dot={false} strokeWidth={2} name="Pendiente (°)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                    <div className="text-[11px] font-mono text-slate-300 mb-2">
                      Descarga Tanque O₂ (%) vs. Umbral Bingo O₂
                    </div>
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartProfileData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="distKm" tick={{ fontSize: 10, fill: "#94a3b8" }} unit=" km" />
                          <YAxis tick={{ fontSize: 10, fill: "#10b981" }} domain={[0, 100]} />
                          <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", fontSize: 11 }} />
                          <Line type="monotone" dataKey="o2LeftPct" stroke="#10b981" strokeWidth={2.5} dot={false} name="O₂ Restante (%)" />
                          <Line type="monotone" dataKey="returnReqPct" stroke="#ef4444" strokeDasharray="4 4" strokeWidth={2} dot={false} name="Requerido Regreso +20%" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Human Mobility, Suit PLSS & Robotic Support Configurator (Modules 6 & 12) */}
              <div className="lg:col-span-5 space-y-3">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-mars" />
                      Configurador Movilidad Humana & PLSS (g = 3.721 m/s²)
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      Masa total: {suitParams.bodyMassKg + suitParams.suitMassKg + suitParams.payloadMassKg} kg
                    </span>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] font-mono text-slate-300">
                      <span>Herramientas y Muestras (m_load)</span>
                      <span className="text-hudcyan">{suitParams.payloadMassKg} kg</span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={40}
                      value={suitParams.payloadMassKg}
                      onChange={(e) => updateSuitParams({ payloadMassKg: Number(e.target.value) })}
                      className="w-full accent-cyan-400"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] font-mono text-slate-300">
                      <span>Pendiente Máxima Admisible (S_max)</span>
                      <span className="text-amber-300">{suitParams.maxSlopeDeg}°</span>
                    </div>
                    <input
                      type="range"
                      min={8}
                      max={25}
                      value={suitParams.maxSlopeDeg}
                      onChange={(e) => updateSuitParams({ maxSlopeDeg: Number(e.target.value) })}
                      className="w-full accent-amber-400"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] font-mono text-slate-300">
                      <span>Capacidad Útil Tanque O₂</span>
                      <span className="text-emerald-300">{suitParams.tankCapacityL} L</span>
                    </div>
                    <input
                      type="range"
                      min={400}
                      max={750}
                      step={25}
                      value={suitParams.tankCapacityL}
                      onChange={(e) => updateSuitParams({ tankCapacityL: Number(e.target.value) })}
                      className="w-full accent-emerald-400"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="flex justify-between text-[10px] font-mono text-slate-400">
                        <span>Tiempo Ciencia</span>
                        <span>{suitParams.observationMinutes} min</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={60}
                        step={5}
                        value={suitParams.observationMinutes}
                        onChange={(e) => updateSuitParams({ observationMinutes: Number(e.target.value) })}
                        className="w-full accent-cyan-400"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] font-mono text-slate-400">
                        <span>Astronautas EVA</span>
                        <span>{suitParams.astronautCount}</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={4}
                        value={suitParams.astronautCount}
                        onChange={(e) => updateSuitParams({ astronautCount: Number(e.target.value) })}
                        className="w-full accent-cyan-400"
                      />
                    </div>
                  </div>

                  <div className="p-2 rounded bg-slate-900 border border-slate-800 font-mono text-[11px] flex items-center justify-between">
                    <span className="text-slate-300">Estado Bingo O₂ ({activeRoute.label}):</span>
                    <span className={activeRoute.bingoO2Safe ? "text-nominal font-bold" : "text-critical font-bold"}>
                      {activeRoute.bingoStatusText}
                    </span>
                  </div>
                </div>

                {/* Robotic Support Planner (Module 12) */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Bot className="w-4 h-4 text-hudcyan" />
                      Robotic Support & Mobile LoS Repeater
                    </span>
                    <button
                      onClick={() =>
                        updateSuitParams({ roverRelayEnabled: !suitParams.roverRelayEnabled })
                      }
                      className={`px-2 py-1 rounded text-[10px] font-mono font-bold border ${
                        suitParams.roverRelayEnabled
                          ? "bg-cyan-950 border-hudcyan text-hudcyan"
                          : "bg-slate-900 border-slate-700 text-slate-400"
                      }`}
                    >
                      {suitParams.roverRelayEnabled ? "REPETIDOR ACTIVO" : "ACTIVAR ROVER RELAY"}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Despliega el Rover Scout en el borde del cañón o zona boxwork para iluminar sombras de radio (COMM_BLACKOUT) y pre-inspeccionar celdas con U &gt; 0.6.
                  </p>
                  <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
                    <label className="text-slate-300">
                      Rover Grid X ({suitParams.roverRelayGrid[0]}):
                      <input
                        type="range"
                        min={5}
                        max={grid.nx - 5}
                        value={suitParams.roverRelayGrid[0]}
                        onChange={(e) =>
                          updateSuitParams({
                            roverRelayEnabled: true,
                            roverRelayGrid: [Number(e.target.value), suitParams.roverRelayGrid[1]],
                          })
                        }
                        className="w-full accent-cyan-400"
                      />
                    </label>
                    <label className="text-slate-300">
                      Rover Grid Y ({suitParams.roverRelayGrid[1]}):
                      <input
                        type="range"
                        min={5}
                        max={grid.ny - 5}
                        value={suitParams.roverRelayGrid[1]}
                        onChange={(e) =>
                          updateSuitParams({
                            roverRelayEnabled: true,
                            roverRelayGrid: [suitParams.roverRelayGrid[0], Number(e.target.value)],
                          })
                        }
                        className="w-full accent-cyan-400"
                      />
                    </label>
                  </div>
                  <div className="text-[10px] font-mono text-cyan-300 flex items-center gap-1">
                    <Radio className="w-3 h-3" /> Cobertura LoS en ruta activa: {activeRoute.commCoveragePercent}% ({activeRoute.commBlackoutCells} celdas sin señal)
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SCIENTIFIC EVIDENCE & SOI CALCULATOR (Modules 2 & 3) */}
          {subTab === "SCIENCE_SOI" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7 space-y-3">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
                  <div className="text-xs font-bold text-white mb-1">{target.title_es}</div>
                  <p className="text-xs text-slate-300 leading-relaxed mb-3">
                    {target.scientific_summary_es}
                  </p>
                  <div className="text-[10px] font-mono uppercase text-hudcyan mb-1.5">
                    Correlación Órbita–Superficie (PDS Evidence Matrix)
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] text-left">
                      <thead className="text-slate-400 border-b border-slate-800 font-mono text-[10px]">
                        <tr>
                          <th className="py-1.5 pr-2">Tipo</th>
                          <th className="py-1.5 pr-2">Instrumento</th>
                          <th className="py-1.5 pr-2">Product ID PDS</th>
                          <th className="py-1.5 pr-2">Resolución</th>
                          <th className="py-1.5">Hallazgo Clave</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {target.pds_evidence.map((ev, i) => (
                          <tr key={i}>
                            <td className="py-1.5 pr-2 font-mono text-amber-300">{ev.source_type}</td>
                            <td className="py-1.5 pr-2 text-white font-semibold">{ev.instrument}</td>
                            <td className="py-1.5 pr-2 font-mono text-hudcyan">{ev.product_id}</td>
                            <td className="py-1.5 pr-2 font-mono text-slate-400">{ev.resolution}</td>
                            <td className="py-1.5 text-slate-300">{ev.finding}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-3">
                <div className="text-xs font-bold text-white flex items-center justify-between">
                  <span>Calculadora SOI = αM + βG + γT + δQ</span>
                  <span className="font-mono text-hudcyan text-sm">{activeSoi.total.toFixed(3)}</span>
                </div>

                {[
                  { key: "alpha" as const, label: "α Mineralogía (M)", val: soiWeights.alpha },
                  { key: "beta" as const, label: "β Geología (G)", val: soiWeights.beta },
                  { key: "gamma" as const, label: "γ Pregunta Científica (T)", val: soiWeights.gamma },
                  { key: "delta" as const, label: "δ Calidad/Cobertura Datos (Q)", val: soiWeights.delta },
                ].map((sl) => (
                  <div key={sl.key}>
                    <div className="flex justify-between text-[11px] font-mono text-slate-300">
                      <span>{sl.label}</span>
                      <span>
                        peso norm: {(activeSoi.normalizedWeights[sl.key] * 100).toFixed(0)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.05}
                      max={1}
                      step={0.05}
                      value={sl.val}
                      onChange={(e) => setSoiWeight(sl.key, Number(e.target.value))}
                      className="w-full accent-orange-500"
                    />
                  </div>
                ))}

                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <div className="text-[10px] font-mono uppercase text-slate-400">
                    Priorización en Vivo (Desglose Explicable)
                  </div>
                  {rankedTargets.map(({ target: rt, soi }) => (
                    <div key={rt.target_id} className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="font-mono text-slate-200">{rt.target_id}</span>
                        <span className="font-mono font-bold text-hudcyan">{soi.total.toFixed(3)}</span>
                      </div>
                      <div className="h-2.5 w-full bg-slate-900 rounded-full overflow-hidden flex">
                        <div style={{ width: `${soi.contributions.M * 100}%` }} className="bg-purple-500" title="M" />
                        <div style={{ width: `${soi.contributions.G * 100}%` }} className="bg-amber-500" title="G" />
                        <div style={{ width: `${soi.contributions.T * 100}%` }} className="bg-hudcyan" title="T" />
                        <div style={{ width: `${soi.contributions.Q * 100}%` }} className="bg-nominal" title="Q" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PRE-EVA DUST STORM PREDICTOR, RADIATION & TOPOGRAPHIC SHELTERS (Modules 5 & 7) */}
          {subTab === "WEATHER_RAD" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-6 bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Wind className="w-4 h-4 text-amber-400" />
                    Predictor Pre-EVA de Tormentas de Polvo (MEDA / REMS)
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded font-mono text-xs font-bold ${
                      weather.status === "GO"
                        ? "bg-emerald-950 text-nominal border border-nominal/50"
                        : weather.status === "CAUTION"
                        ? "bg-amber-950 text-caution border border-caution/50"
                        : "bg-red-950 text-critical border border-critical/50"
                    }`}
                  >
                    {weather.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
                  <label className="text-slate-300">
                    Caída Barométrica ΔP (3h): <b className="text-hudcyan">{weatherInputs.pressureDrop3hPa} Pa</b>
                    <input
                      type="range"
                      min={-24}
                      max={0}
                      step={0.5}
                      value={weatherInputs.pressureDrop3hPa}
                      onChange={(e) => updateWeatherInputs({ pressureDrop3hPa: Number(e.target.value) })}
                      className="w-full accent-cyan-400"
                    />
                  </label>
                  <label className="text-slate-300">
                    Opacidad Polvo (τ): <b className="text-amber-300">{weatherInputs.opticalDepthTau}</b>
                    <input
                      type="range"
                      min={0.2}
                      max={3.0}
                      step={0.05}
                      value={weatherInputs.opticalDepthTau}
                      onChange={(e) => updateWeatherInputs({ opticalDepthTau: Number(e.target.value) })}
                      className="w-full accent-amber-400"
                    />
                  </label>
                  <label className="text-slate-300">
                    Longitud Solar Ls: <b className="text-orange-300">{weatherInputs.solarLongitudeLsDeg}°</b>
                    <input
                      type="range"
                      min={0}
                      max={360}
                      value={weatherInputs.solarLongitudeLsDeg}
                      onChange={(e) => updateWeatherInputs({ solarLongitudeLsDeg: Number(e.target.value) })}
                      className="w-full accent-orange-400"
                    />
                  </label>
                  <label className="text-slate-300">
                    Ráfagas Viento / ΔT: <b className="text-slate-200">{weatherInputs.windGustMs} m/s</b>
                    <input
                      type="range"
                      min={2}
                      max={30}
                      step={0.5}
                      value={weatherInputs.windGustMs}
                      onChange={(e) => updateWeatherInputs({ windGustMs: Number(e.target.value) })}
                      className="w-full accent-cyan-400"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-3 gap-2 font-mono text-center bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                  <div>
                    <div className="text-[10px] text-slate-400">Riesgo Tormenta</div>
                    <div className="text-sm font-bold text-white">{weather.stormProbabilityPercent}%</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Dust Devils</div>
                    <div className="text-sm font-bold text-amber-300">{weather.dustDevilProbabilityPercent}%</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Visibilidad</div>
                    <div className="text-sm font-bold text-hudcyan">{weather.visibilityKm} km</div>
                  </div>
                </div>
                <p className="text-[11px] text-slate-300">{weather.statusMessage}</p>

                <div className="h-36 pt-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={envHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="sol" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#60a5fa" }} domain={["auto", "auto"]} />
                      <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", fontSize: 11 }} />
                      <Line type="monotone" dataKey="pressurePa" stroke="#60a5fa" strokeWidth={2} name="Presión (Pa)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="lg:col-span-6 bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sun className="w-4 h-4 text-yellow-400" />
                    Radiación (RAD Ref + DONKI) & Refugios Topográficos
                  </span>
                  <button
                    onClick={() => updateSuitParams({ solarEventActive: !suitParams.solarEventActive })}
                    className={`px-2 py-1 rounded font-mono text-[10px] font-bold border ${
                      suitParams.solarEventActive
                        ? "bg-red-950 border-critical text-critical"
                        : "bg-slate-900 border-slate-700 text-slate-300"
                    }`}
                  >
                    {suitParams.solarEventActive ? "⚠ EVENTO SOLAR SEP ACTIVO (4.8×)" : "Simular Evento Solar DONKI"}
                  </button>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] space-y-1">
                  <div className="font-mono text-amber-300">{target.radiation_reference.sensor_note}</div>
                  <div className="flex justify-between font-mono text-slate-200 pt-1">
                    <span>Tasa Superficie: <b>{target.radiation_reference.surface_dose_rate_usv_h} μSv/h</b></span>
                    <span>Dosis EVA ({missionDurationHours} h): <b className={suitParams.solarEventActive ? "text-critical" : "text-nominal"}>{radiationDoseUsv} μSv</b></span>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-mono uppercase text-nominal mb-1.5">
                    Refugios Topográficos de Emergencia Detectados en el DEM
                  </div>
                  <div className="space-y-1.5">
                    {shelters.map((sh) => (
                      <div
                        key={sh.id}
                        className="flex items-center justify-between p-2 rounded bg-slate-900/90 border border-emerald-800/40 text-[11px]"
                      >
                        <div>
                          <div className="font-semibold text-emerald-300">{sh.label}</div>
                          <div className="font-mono text-[10px] text-slate-400">
                            {sh.lat}°, {sh.lon}° · Elev {sh.elevationM} m · Rumbo {sh.bearingDeg}°
                          </div>
                        </div>
                        <div className="text-right font-mono">
                          <div className="text-white font-bold">{sh.distanceM} m</div>
                          <div className="text-[10px] text-nominal">{sh.shieldingPercent}% apantall.</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: MISSION TWIN SIMULATOR & 10-STEP PLANNER (Modules 9 & 10) */}
          {subTab === "PLANNER_TWIN" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Mission Twin Playback (Module 10) */}
              <div className="lg:col-span-6 bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Gauge className="w-4 h-4 text-hudcyan" />
                    Mission Twin — Simulador Interactivo EVA en Vivo
                  </span>
                  <div className="flex items-center gap-1">
                    {([1, 5, 10] as const).map((sp) => (
                      <button
                        key={sp}
                        onClick={() => setTwinSpeed(sp)}
                        className={`px-2 py-0.5 rounded font-mono text-[10px] border ${
                          twinSpeed === sp
                            ? "bg-hudcyan text-slate-950 border-hudcyan font-bold"
                            : "bg-slate-900 text-slate-400 border-slate-700"
                        }`}
                      >
                        {sp}x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setTwinPlaying(!twinPlaying)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-mars hover:bg-orange-500 text-white text-xs font-bold"
                  >
                    {twinPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    {twinPlaying ? "Pausar" : "Simular EVA"}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={twinProgress}
                    onChange={(e) => setTwinProgress(Number(e.target.value))}
                    className="w-full accent-orange-500"
                  />
                  <span className="font-mono text-xs text-hudcyan w-12 text-right">
                    {Math.round(twinProgress * 100)}%
                  </span>
                </div>

                {currentWp && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-[11px]">
                    <div className="p-2 rounded bg-slate-900 border border-slate-800">
                      <div className="text-[10px] text-slate-400">Tanque O₂</div>
                      <div className="text-sm font-bold text-nominal">{currentWp.remainingO2Percent}%</div>
                    </div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800">
                      <div className="text-[10px] text-slate-400">Batería PLSS</div>
                      <div className="text-sm font-bold text-hudcyan">{currentWp.plssBatteryPercent}%</div>
                    </div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800">
                      <div className="text-[10px] text-slate-400">Pendiente Actual</div>
                      <div className="text-sm font-bold text-amber-300">{currentWp.slopeDeg}°</div>
                    </div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800">
                      <div className="text-[10px] text-slate-400">Gasto Metabólico</div>
                      <div className="text-sm font-bold text-white">{currentWp.o2FlowLMin} L/min</div>
                    </div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800">
                      <div className="text-[10px] text-slate-400">Enlace Radio LoS</div>
                      <div className={`text-xs font-bold ${currentWp.hasCommLoS ? "text-nominal" : "text-critical"}`}>
                        {currentWp.hasCommLoS ? "ONLINE LoS" : "COMM BLACKOUT"}
                      </div>
                    </div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800">
                      <div className="text-[10px] text-slate-400">Incertidumbre U</div>
                      <div className="text-sm font-bold text-slate-200">{currentWp.uncertainty}</div>
                    </div>
                  </div>
                )}

                {currentWp && !currentWp.hasCommLoS && (
                  <div className="p-2 rounded bg-purple-950/60 border border-purple-500/50 text-[11px] text-purple-200 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-purple-300 shrink-0" />
                    Astronauta dentro de Sombra Topográfica (COMM_BLACKOUT). El HUD conmuta automáticamente a OFFLINE_LOCAL_CACHE.
                  </div>
                )}
              </div>

              {/* 10-Step Scientific Mission Planner (Module 9) */}
              <div className="lg:col-span-6 bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <ListChecks className="w-4 h-4 text-nominal" />
                    Scientific Mission Planner (Asistente 10 Pasos)
                  </span>
                  <span className="font-mono text-[10px] text-hudcyan">
                    Paso {plannerStep} / 10
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-60 overflow-y-auto pr-1">
                  {plannerStepsList.map((label, idx) => {
                    const stepNum = idx + 1;
                    const done = stepNum <= plannerStep;
                    return (
                      <button
                        key={stepNum}
                        onClick={() => setPlannerStep(stepNum)}
                        className={`text-left px-2.5 py-1.5 rounded text-[11px] border flex items-center gap-1.5 transition ${
                          stepNum === plannerStep
                            ? "bg-cyan-950/70 border-hudcyan text-white font-semibold"
                            : done
                            ? "bg-slate-900 border-emerald-800/50 text-emerald-300"
                            : "bg-slate-900/40 border-slate-800 text-slate-400"
                        }`}
                      >
                        <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${done ? "text-nominal" : "text-slate-600"}`} />
                        <span className="truncate">{label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800">
                  <div className="text-[10px] text-slate-400 font-mono">
                    {Object.values(layers).filter((l) => l.visible).length} capas · {activeRoute.label}
                  </div>
                  <button
                    onClick={approveMissionForHud}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-nominal hover:bg-emerald-400 text-slate-950 font-bold text-xs transition shadow-lg shadow-emerald-950/40"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Aprobar Plan de Misión y Transmitir al Astronaut HUD
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
