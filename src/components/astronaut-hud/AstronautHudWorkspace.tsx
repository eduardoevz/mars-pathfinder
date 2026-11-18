"use client";

import React, { useMemo, useState } from "react";
import {
  Compass,
  Crosshair,
  AlertTriangle,
  ShieldAlert,
  Wifi,
  WifiOff,
  Bot,
  Send,
  Camera,
  CheckSquare,
  Shield,
  Users,
  RefreshCw,
  ExternalLink,
  Siren,
  ArrowUpRight,
  ChevronRight,
} from "lucide-react";
import {
  findNearestTopographicShelters,
  queryVerifiableMarsRag,
  RagStructuredResponse,
} from "@/lib/mars-core";
import {
  useDerivedMissionComputation,
  useMissionStore,
} from "@/lib/mission-store";

export default function AstronautHudWorkspace() {
  const twinProgress = useMissionStore((s) => s.twinProgress);
  const setTwinProgress = useMissionStore((s) => s.setTwinProgress);
  const suitParams = useMissionStore((s) => s.suitParams);
  const emergencyActive = useMissionStore((s) => s.emergencyActive);
  const emergencyType = useMissionStore((s) => s.emergencyType);
  const triggerEmergency = useMissionStore((s) => s.triggerEmergency);
  const offlineOverrideMode = useMissionStore((s) => s.offlineOverrideMode);
  const setOfflineOverrideMode = useMissionStore((s) => s.setOfflineOverrideMode);
  const fieldLogs = useMissionStore((s) => s.fieldLogs);
  const addFieldLog = useMissionStore((s) => s.addFieldLog);
  const syncOfflineLogs = useMissionStore((s) => s.syncOfflineLogs);
  const eva2O2Percent = useMissionStore((s) => s.eva2O2Percent);
  const missionApprovedForHud = useMissionStore((s) => s.missionApprovedForHud);
  const weatherInputs = useMissionStore((s) => s.weatherInputs);

  const { grid, target, activeRoute, weather } = useDerivedMissionComputation();

  const wpIdx = Math.min(
    activeRoute.waypoints.length - 1,
    Math.max(0, Math.round(twinProgress * (activeRoute.waypoints.length - 1)))
  );
  const currentWp = activeRoute.waypoints[wpIdx] || activeRoute.waypoints[0];
  const nextWp = activeRoute.waypoints[Math.min(activeRoute.waypoints.length - 1, wpIdx + 1)] || currentWp;

  const shelters = findNearestTopographicShelters(grid, currentWp.gx, currentWp.gy, 3);
  const nearestShelter = shelters[0];

  const isCommBlackout =
    offlineOverrideMode === "FORCE_OFFLINE" ||
    (offlineOverrideMode === "AUTO" && !currentWp.hasCommLoS);

  // Heading calculation toward next waypoint
  const headingDeg = useMemo(() => {
    const dx = nextWp.gx - currentWp.gx;
    const dy = nextWp.gy - currentWp.gy;
    if (dx === 0 && dy === 0) return 265;
    return Math.round(((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360);
  }, [currentWp, nextWp]);

  const remainingDistM = Math.max(
    0,
    Math.round(activeRoute.totalDistanceKm * 1000 - currentWp.cumDistanceM)
  );
  const bingoMarginPct = Number(
    (
      currentWp.remainingO2Percent -
      currentWp.returnO2RequiredPercent -
      suitParams.reservePercent
    ).toFixed(1)
  );
  const bingoMinutesLeft = Math.max(
    0,
    Math.round(((bingoMarginPct / 100) * suitParams.tankCapacityL) / Math.max(0.7, currentWp.o2FlowLMin))
  );

  // Local Interactive State
  const [checklistChecked, setChecklistChecked] = useState<Record<number, boolean>>({});
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [surfaceSplitMode, setSurfaceSplitMode] = useState(true);
  const [ragQuery, setRagQuery] = useState(
    "¿Qué evidencia real respalda este afloramiento y qué riesgos de O₂ o radio tenemos?"
  );
  const [ragReply, setRagReply] = useState<RagStructuredResponse>(() =>
    queryVerifiableMarsRag(
      "¿Qué evidencia real respalda este afloramiento y qué riesgos de O₂ o radio tenemos?",
      target,
      activeRoute,
      weather,
      suitParams
    )
  );

  // Field Log Form State
  const [logTitle, setLogTitle] = useState(
    `Muestreo in situ — ${target.target_id}`
  );
  const [logDesc, setLogDesc] = useState(
    "Observación de venas minerales / crestas consolidadas en punto de interés."
  );
  const [logSpectro, setLogSpectro] = useState(
    target.target_id === "GALE-BOXWORK-2025"
      ? "MgSO4·nH2O + SiO2 (Cemento Boxwork)"
      : target.target_id === "JEZERO-CHEYAVA-2024"
      ? "Fe3(PO4)2·8H2O (Vivianita) + Orgánicos"
      : "Mg/Fe-Carbonato + Olivino alterado"
  );
  const [logTube, setLogTube] = useState("TUBE-EVA-027");

  const activePhoto = target.surface_photos[activePhotoIdx] || target.surface_photos[0];
  const pendingOfflineCount = fieldLogs.filter((l) => !l.synced).length;

  const handleAskRag = (qText?: string) => {
    const query = qText || ragQuery;
    setRagQuery(query);
    setRagReply(queryVerifiableMarsRag(query, target, activeRoute, weather, suitParams));
  };

  const handleSaveFieldLog = (e: React.FormEvent) => {
    e.preventDefault();
    addFieldLog({
      targetId: target.target_id,
      regionId: target.region_id,
      title: logTitle,
      description: logDesc,
      spectrometerReading: logSpectro,
      sampleTubeId: logTube,
      lat: currentWp.lat,
      lon: currentWp.lon,
      elevationM: currentWp.elevationM,
      synced: !isCommBlackout,
      savedOffline: isCommBlackout,
    });
  };

  return (
    <div className="space-y-4">
      {/* Curved Helmet AR Visor Outer Frame */}
      <div
        className={`relative rounded-[28px] border-2 p-4 sm:p-5 overflow-hidden shadow-2xl hud-grid-bg ${
          emergencyActive
            ? "border-critical bg-gradient-to-b from-red-950/40 via-[#07090E] to-[#07090E]"
            : isCommBlackout
            ? "border-purple-500/70 bg-gradient-to-b from-purple-950/25 via-[#07090E] to-[#07090E]"
            : "border-hudcyan/50 bg-gradient-to-b from-cyan-950/25 via-[#07090E] to-[#07090E]"
        }`}
      >
        <div className="pointer-events-none absolute inset-0 hud-scanline opacity-40" />

        {/* TOP HELMET BAR: Heading Tape, Mission Status, Comm LoS & Emergency Trigger */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-cyan-500/20">
          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 rounded-lg bg-slate-950/90 border border-hudcyan/40 font-mono">
              <div className="text-[9px] text-slate-400">RUMBO AR</div>
              <div className="text-base font-bold text-hudcyan flex items-center gap-1">
                <Compass className="w-4 h-4" />
                {headingDeg}°{" "}
                <span className="text-xs text-slate-300">
                  ({currentWp.lat.toFixed(3)}°, {currentWp.lon.toFixed(3)}°)
                </span>
              </div>
            </div>
            <div className="font-mono text-xs">
              <div className="text-slate-400 text-[10px]">
                DESTINO: <span className="text-amber-300 font-bold">{target.target_id}</span>
                {missionApprovedForHud && (
                  <span className="ml-2 text-nominal">[PLAN APROBADO]</span>
                )}
              </div>
              <div className="text-white font-bold">
                Faltan {remainingDistM} m · Elev {currentWp.elevationM} m
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Offline / Comm Blackout Switch */}
            <div className="flex items-center gap-1 bg-slate-950/90 border border-slate-700 rounded-lg p-1 text-[10px] font-mono">
              <button
                onClick={() => setOfflineOverrideMode("AUTO")}
                className={`px-2 py-1 rounded ${
                  offlineOverrideMode === "AUTO" ? "bg-hudcyan text-slate-950 font-bold" : "text-slate-400"
                }`}
              >
                AUTO LoS
              </button>
              <button
                onClick={() => setOfflineOverrideMode("FORCE_OFFLINE")}
                className={`px-2 py-1 rounded ${
                  offlineOverrideMode === "FORCE_OFFLINE" ? "bg-purple-600 text-white font-bold" : "text-slate-400"
                }`}
              >
                Sombra Offline
              </button>
              <button
                onClick={() => setOfflineOverrideMode("FORCE_ONLINE")}
                className={`px-2 py-1 rounded ${
                  offlineOverrideMode === "FORCE_ONLINE" ? "bg-emerald-600 text-white font-bold" : "text-slate-400"
                }`}
              >
                Online
              </button>
            </div>

            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs font-bold border ${
                isCommBlackout
                  ? "bg-purple-950 border-purple-400 text-purple-200 animate-pulse"
                  : "bg-emerald-950/80 border-nominal/50 text-nominal"
              }`}
            >
              {isCommBlackout ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
              {isCommBlackout ? "NO LINE OF SIGHT — OFFLINE BUFFER ACTIVE" : "ENLACE RADIO LoS ONLINE"}
            </div>

            <button
              onClick={() => triggerEmergency(emergencyActive ? "NONE" : "SOLAR_SPE")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs font-bold border transition ${
                emergencyActive
                  ? "bg-red-600 text-white border-white"
                  : "bg-red-950/80 border-critical text-red-200 hover:bg-red-800"
              }`}
            >
              <Siren className="w-3.5 h-3.5" />
              {emergencyActive ? "CANCELAR EMERGENCIA" : "Simular Emergencia (SEP / Polvo / O₂)"}
            </button>
          </div>
        </div>

        {/* EMERGENCY EVACUATION BANNER */}
        {emergencyActive && nearestShelter && (
          <div className="relative z-10 mt-3 p-3 rounded-xl bg-red-950/90 border-2 border-critical flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="w-6 h-6 text-red-300 animate-bounce" />
              <div>
                <div className="font-mono text-xs font-bold text-red-200 uppercase">
                  ALERTA CRÍTICA ACTIVA ({emergencyType}) — MODO EVACUACIÓN INMEDIATA
                </div>
                <div className="text-xs text-white">
                  Desvío AR proyectado hacia <b>{nearestShelter.label}</b>: <b>{nearestShelter.distanceM} m</b> al rumbo <b>{nearestShelter.bearingDeg}°</b> ({nearestShelter.shieldingPercent}% apantallamiento).
                </div>
              </div>
            </div>
            <span className="font-mono text-xs px-2.5 py-1 rounded bg-slate-950 text-emerald-300 border border-emerald-500">
              VECTOR REFUGIO ACTIVO
            </span>
          </div>
        )}

        {/* HIGH-VISIBILITY PLSS O2, BINGO O2 & TRAVERSE PROGRESS */}
        <div className="relative z-10 mt-3 grid grid-cols-2 md:grid-cols-5 gap-2.5">
          <div className="p-2.5 rounded-xl bg-slate-950/85 border border-slate-800">
            <div className="text-[10px] font-mono text-slate-400">TANQUE O₂ PRIMARIO</div>
            <div className={`text-xl font-mono font-bold ${currentWp.remainingO2Percent < 35 ? "text-critical" : "text-nominal"}`}>
              {currentWp.remainingO2Percent}%
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              {Math.round((currentWp.remainingO2Percent / 100) * suitParams.tankCapacityL)} L restantes
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950/85 border border-slate-800">
            <div className="text-[10px] font-mono text-slate-400">MARGEN BINGO O₂</div>
            <div className={`text-xl font-mono font-bold ${bingoMarginPct <= 5 ? "text-critical" : "text-hudcyan"}`}>
              {bingoMarginPct > 0 ? `+${bingoMarginPct}%` : `${bingoMarginPct}%`}
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              ~{bingoMinutesLeft} min exploración útil
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950/85 border border-slate-800">
            <div className="text-[10px] font-mono text-slate-400">TASA METABÓLICA</div>
            <div className="text-xl font-mono font-bold text-white">
              {currentWp.o2FlowLMin} <span className="text-xs">L/min</span>
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              {currentWp.metabolicRateW} W · Carga {suitParams.payloadMassKg} kg
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950/85 border border-slate-800">
            <div className="text-[10px] font-mono text-slate-400">INCLINÓMETRO & SLIP</div>
            <div className={`text-xl font-mono font-bold ${currentWp.slopeDeg > suitParams.maxSlopeDeg ? "text-critical" : "text-amber-300"}`}>
              {currentWp.slopeDeg}°
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              Slip: {currentWp.slipHazard} · Arena: {Math.round(currentWp.sandTrap * 100)}%
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950/85 border border-slate-800">
            <div className="text-[10px] font-mono text-slate-400">BATERÍA PLSS & POLVO</div>
            <div className="text-xl font-mono font-bold text-emerald-300">
              {currentWp.plssBatteryPercent}%
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              τ={weatherInputs.opticalDepthTau} · Vis {weather.visibilityKm} km
            </div>
          </div>
        </div>

        {/* CARTOGRAPHIC UNCERTAINTY & SAND TRAP ALERTS */}
        <div className="relative z-10 mt-2.5 flex flex-wrap gap-2">
          {currentWp.uncertainty > 0.45 && (
            <div className="flex-1 min-w-[260px] p-2 rounded-lg bg-amber-950/70 border border-caution text-[11px] text-amber-200 flex items-center gap-2 font-mono">
              <AlertTriangle className="w-4 h-4 text-caution shrink-0" />
              ADVERTENCIA INCERTIDUMBRE CARTOGRÁFICA (U={currentWp.uncertainty}): Transición hacia zona fuera del corredor HiRISE 1 m/px (solo MOLA 463 m/px). Micro-rocas &lt;1 m desconocidas.
            </div>
          )}
          {currentWp.sandTrap > 0.5 && (
            <div className="flex-1 min-w-[260px] p-2 rounded-lg bg-orange-950/70 border border-mars text-[11px] text-orange-200 flex items-center gap-2 font-mono">
              <AlertTriangle className="w-4 h-4 text-mars shrink-0" />
              ALERTA TRAMPA DE ARENA SUELTA ({Math.round(currentWp.sandTrap * 100)}%): Factor hundimiento η elevado — gasto metabólico de O₂ incrementado.
            </div>
          )}
        </div>

        {/* Interactive Walk Slider for Field Simulation */}
        <div className="relative z-10 mt-3 bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 flex items-center gap-3">
          <span className="font-mono text-[10px] text-hudcyan shrink-0">POSICIÓN EN RUTA EVA:</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={twinProgress}
            onChange={(e) => setTwinProgress(Number(e.target.value))}
            className="w-full accent-cyan-400"
          />
          <span className="font-mono text-xs text-white w-12 text-right">
            {Math.round(twinProgress * 100)}%
          </span>
        </div>

        {/* MAIN 3-COLUMN AR COCKPIT */}
        <div className="relative z-10 mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* LEFT: FIRST-PERSON SURFACE VIEWER (Orbital vs Rover Surface) + TARGET AR CHECKLIST */}
          <div className="lg:col-span-5 space-y-3">
            <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-mars" />
                  First-Person Surface Viewer (Órbita vs. Rover)
                </span>
                <button
                  onClick={() => setSurfaceSplitMode(!surfaceSplitMode)}
                  className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-hudcyan"
                >
                  {surfaceSplitMode ? "Vista Dividida" : "Solo Superficie"}
                </button>
              </div>

              <div className="flex gap-1.5">
                {target.surface_photos.map((ph, idx) => (
                  <button
                    key={ph.id}
                    onClick={() => setActivePhotoIdx(idx)}
                    className={`flex-1 text-left px-2 py-1 rounded text-[10px] font-mono border truncate ${
                      idx === activePhotoIdx
                        ? "bg-mars/20 border-mars text-orange-200"
                        : "bg-slate-900 border-slate-800 text-slate-400"
                    }`}
                  >
                    {ph.title}
                  </button>
                ))}
              </div>

              {/* Dual Visual Comparison Panel (clean headers/footers outside images) */}
              <div className={`grid gap-2.5 ${surfaceSplitMode ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
                {surfaceSplitMode && (
                  <div className="rounded-lg overflow-hidden border border-slate-700 bg-slate-900 flex flex-col">
                    <div className="px-2.5 py-1 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-[9px] font-mono text-hudcyan">
                      <span>ÓRBITA NASA TREK / MRO</span>
                      <span className="text-slate-400">
                        {target.coordinates.latitude}°, {target.coordinates.longitude}°
                      </span>
                    </div>
                    <div className="relative h-36 bg-slate-950">
                      <img
                        src={activePhoto.orbital_crop_url}
                        alt="Orbital NASA crop"
                        className="w-full h-full object-cover opacity-90"
                      />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <Crosshair className="w-7 h-7 text-hudcyan/80" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Rich Interactive Surface Rover Reference Render */}
                <div className="rounded-lg overflow-hidden border border-mars/60 bg-[#1a0f0a] flex flex-col">
                  <div className="px-2.5 py-1 bg-slate-950 border-b border-slate-800 flex justify-between items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-slate-900 text-[9px] font-mono text-amber-300 border border-amber-500/40 truncate">
                      {activePhoto.georef_status === "EXACT_GEOREF"
                        ? "GEOREF EXACTA"
                        : "REFERENCIA CONTEXTUAL ROVER"}
                    </span>
                    <span className="text-[9px] font-mono text-slate-300 shrink-0">
                      {activePhoto.sol_or_date}
                    </span>
                  </div>
                  <div className={`w-full ${surfaceSplitMode ? "h-28" : "h-36"} bg-[#1a0f0a]`}>
                    <svg viewBox="0 0 260 150" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
                      <defs>
                        <linearGradient id="marsSky" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b2119" />
                          <stop offset="100%" stopColor="#8c4b32" />
                        </linearGradient>
                      </defs>
                      <rect width="260" height="70" fill="url(#marsSky)" />
                      <path d="M0,68 Q65,48 130,62 T260,55 L260,150 L0,150 Z" fill="#6b3724" />
                      {activePhoto.surface_visual_mode === "BOXWORK_PANORAMA" && (
                        <>
                          <path d="M10,140 L70,85 L155,105 L245,78" stroke="#d99a6c" strokeWidth="5" fill="none" />
                          <path d="M35,75 L120,125 L220,145" stroke="#c88355" strokeWidth="4" fill="none" />
                          <path d="M135,70 L90,145" stroke="#e2a878" strokeWidth="4" fill="none" />
                        </>
                      )}
                      {activePhoto.surface_visual_mode === "BOXWORK_NODULES" && (
                        <>
                          <rect x="0" y="65" width="260" height="85" fill="#7c412c" />
                          {[45, 78, 112, 148, 185, 210].map((cx, k) => (
                            <circle key={k} cx={cx} cy={95 + (k % 3) * 14} r={5 + (k % 2) * 2} fill="#d6b89c" stroke="#3a1d12" strokeWidth="1.5" />
                          ))}
                        </>
                      )}
                      {(activePhoto.surface_visual_mode === "LEOPARD_SPOTS" || activePhoto.surface_visual_mode === "CHEYAVA_VEINS") && (
                        <>
                          <path d="M25,130 L110,72 L195,120 L145,145 Z" fill="#8b4232" stroke="#b96852" strokeWidth="1.5" />
                          <path d="M40,120 L175,92 M65,136 L190,108" stroke="#f8fafc" strokeWidth="2.5" opacity="0.85" />
                          {[88, 115, 136, 152].map((cx, k) => (
                            <g key={k}>
                              <circle cx={cx} cy={104 + (k % 2) * 12} r="6.5" fill="#1e293b" />
                              <circle cx={cx} cy={104 + (k % 2) * 12} r="3.2" fill="#e2e8f0" />
                            </g>
                          ))}
                        </>
                      )}
                      {(activePhoto.surface_visual_mode === "MARGIN_SHORELINE" || activePhoto.surface_visual_mode === "RIMFAX_SUBSURFACE") && (
                        <>
                          <path d="M0,95 Q90,82 180,100 T260,88" stroke="#e5c19c" strokeWidth="4" fill="none" />
                          <path d="M0,118 Q100,102 195,122 T260,112" stroke="#38bdf8" strokeWidth="2" strokeDasharray="4 3" fill="none" />
                          <path d="M0,134 Q100,120 195,138 T260,130" stroke="#00f0ff" strokeWidth="1.5" fill="none" />
                        </>
                      )}
                    </svg>
                  </div>
                  <div className="px-2.5 py-1 bg-slate-950/95 border-t border-slate-800 text-[9px] font-mono text-slate-300 truncate">
                    {activePhoto.instrument} · {activePhoto.product_id}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-300">
                <span>{activePhoto.caption}</span>
                <a
                  href={activePhoto.nasa_gallery_url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 inline-flex items-center gap-1 text-hudcyan hover:underline font-mono text-[10px]"
                >
                  Archivo NASA <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* Scientific Target AR Sampling Checklist */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-2">
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <CheckSquare className="w-4 h-4 text-nominal" />
                Lista de Verificación en Campo ({target.target_id})
              </div>
              <div className="space-y-1.5">
                {target.sampling_checklist.map((item, idx) => (
                  <label
                    key={idx}
                    className="flex items-start gap-2 text-[11px] text-slate-300 cursor-pointer p-1.5 rounded hover:bg-slate-900"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(checklistChecked[idx])}
                      onChange={() =>
                        setChecklistChecked((p) => ({ ...p, [idx]: !p[idx] }))
                      }
                      className="mt-0.5 accent-emerald-400"
                    />
                    <span className={checklistChecked[idx] ? "line-through text-slate-500" : ""}>
                      {item}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* CENTER: VERIFIABLE AI SCIENTIFIC ASSISTANT (RAG - 3 MANDATORY BLOCKS) */}
          <div className="lg:col-span-4 bg-slate-950/90 border border-slate-800 rounded-xl p-3 flex flex-col justify-between space-y-3">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Bot className="w-4 h-4 text-hudcyan" />
                  AI Scientific Assistant (RAG Verificable)
                </span>
                <span className="font-mono text-[9px] text-emerald-300 bg-emerald-950 px-1.5 py-0.5 rounded">
                  ZERO HALLUCINATION
                </span>
              </div>

              <div className="flex flex-wrap gap-1">
                {[
                  "¿Evidencia en este sitio?",
                  "¿Por qué evitar arena boxwork?",
                  "¿Estado radiación y refugio?",
                ].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => handleAskRag(preset)}
                    className="text-[10px] font-mono px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300"
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={ragQuery}
                  onChange={(e) => setRagQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAskRag()}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  placeholder="Consulta al asistente científico PDS..."
                />
                <button
                  onClick={() => handleAskRag()}
                  className="px-2.5 py-1.5 rounded-lg bg-hudcyan text-slate-950 font-bold text-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Mandatory 3 Color-Coded RAG Blocks */}
              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1 text-[11px]">
                <div className="p-2.5 rounded-lg bg-cyan-950/50 border-l-4 border-hudcyan">
                  <div className="font-mono text-[10px] font-bold text-hudcyan mb-1">
                    [1] DATOS MEDIDOS POR LA NASA (PDS)
                  </div>
                  <ul className="space-y-1 text-slate-200 list-disc pl-3.5">
                    {ragReply.block1_nasaMeasuredData.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-2.5 rounded-lg bg-amber-950/40 border-l-4 border-caution">
                  <div className="font-mono text-[10px] font-bold text-amber-300 mb-1">
                    [2] PRODUCTOS DERIVADOS Y MODELOS
                  </div>
                  <ul className="space-y-1 text-slate-200 list-disc pl-3.5">
                    {ragReply.block2_derivedModels.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-2.5 rounded-lg bg-emerald-950/40 border-l-4 border-nominal">
                  <div className="font-mono text-[10px] font-bold text-emerald-300 mb-1">
                    [3] INTERPRETACIÓN CIENTÍFICA Y LIMITACIONES
                  </div>
                  <ul className="space-y-1 text-slate-200 list-disc pl-3.5">
                    {ragReply.block3_scientificInterpretationAndLimits.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: OFFLINE-FIRST FIELD LOG + COOPERATIVE SQUAD MINIMAP */}
          <div className="lg:col-span-3 space-y-3">
            {/* Cooperative Squad & Radiation Shelters Minimap */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-white">
                <span className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-hudcyan" /> Escuadrón Cooperativo
                </span>
                <span className="font-mono text-[10px] text-nominal">
                  EVA-2 O₂: {eva2O2Percent}%
                </span>
              </div>
              <div className="relative min-h-[7.25rem] rounded-lg bg-slate-900 border border-slate-800 p-2.5 space-y-2 font-mono text-[10px]">
                <div className="flex justify-between text-slate-400">
                  <span>● EVA-1 (Tú): {currentWp.remainingO2Percent}% O₂</span>
                  <span className="text-hudcyan">
                    ▲ Rover ({suitParams.roverRelayGrid[0]},{suitParams.roverRelayGrid[1]})
                  </span>
                </div>
                {nearestShelter && (
                  <div className="mt-2 p-1.5 rounded bg-emerald-950/60 border border-emerald-700/50 text-emerald-300 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Shield className="w-3 h-3" /> Refugio más cercano
                    </span>
                    <span>
                      {nearestShelter.distanceM} m ({nearestShelter.bearingDeg}°)
                    </span>
                  </div>
                )}
                <div className="mt-2 text-slate-400 flex items-center justify-between">
                  <span>RAD Ref: {target.radiation_reference.surface_dose_rate_usv_h} μSv/h</span>
                  <span className="text-amber-300 flex items-center gap-0.5">
                    <ArrowUpRight className="w-3 h-3" /> Base {currentWp.cumDistanceM}m atrás
                  </span>
                </div>
              </div>
            </div>

            {/* Scientific Field Log (Offline-First Sync) */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">Scientific Field Log</span>
                {pendingOfflineCount > 0 && (
                  <button
                    onClick={syncOfflineLogs}
                    disabled={isCommBlackout}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-mono text-[10px] font-bold"
                  >
                    <RefreshCw className="w-3 h-3" /> Sincronizar ({pendingOfflineCount})
                  </button>
                )}
              </div>

              <form onSubmit={handleSaveFieldLog} className="space-y-1.5 text-[11px]">
                <input
                  type="text"
                  value={logTitle}
                  onChange={(e) => setLogTitle(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white"
                  placeholder="Título observación"
                  required
                />
                <textarea
                  rows={2}
                  value={logDesc}
                  onChange={(e) => setLogDesc(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
                  placeholder="Descripción geológica"
                  required
                />
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="text"
                    value={logSpectro}
                    onChange={(e) => setLogSpectro(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 font-mono text-[10px] text-cyan-200"
                    placeholder="Espectrómetro"
                  />
                  <input
                    type="text"
                    value={logTube}
                    onChange={(e) => setLogTube(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 font-mono text-[10px] text-amber-200"
                    placeholder="ID Tubo"
                  />
                </div>
                <button
                  type="submit"
                  className={`w-full py-1.5 rounded font-bold text-xs flex items-center justify-center gap-1 ${
                    isCommBlackout
                      ? "bg-purple-600 hover:bg-purple-500 text-white"
                      : "bg-nominal hover:bg-emerald-400 text-slate-950"
                  }`}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                  {isCommBlackout
                    ? "Guardar en Buffer OFFLINE_LOCAL_CACHE"
                    : "Registrar y Enviar a Mission Control"}
                </button>
              </form>

              <div className="space-y-1.5 max-h-40 overflow-y-auto pt-1 border-t border-slate-800">
                {fieldLogs.map((l) => (
                  <div
                    key={l.id}
                    className="p-2 rounded bg-slate-900/90 border border-slate-800 text-[10px]"
                  >
                    <div className="flex items-center justify-between font-mono">
                      <span className="text-white font-bold truncate">{l.title}</span>
                      <span
                        className={`px-1 rounded ${
                          l.synced ? "bg-emerald-950 text-nominal" : "bg-purple-950 text-purple-300"
                        }`}
                      >
                        {l.synced ? "SYNC" : "OFFLINE"}
                      </span>
                    </div>
                    <div className="text-slate-400 font-mono mt-0.5">
                      {l.sampleTubeId} · {l.spectrometerReading}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
