"use client";

import React from "react";
import {
  Award,
  X,
  PlayCircle,
  ExternalLink,
  Globe2,
  ShieldCheck,
  Cpu,
  BookOpen,
} from "lucide-react";
import { NASA_INSTRUMENT_CATALOG } from "@/lib/nasa-seed-data";
import { useMissionStore } from "@/lib/mission-store";

const GUIDED_TOUR_STEPS = [
  {
    step: 1,
    title: "Paso 1 · Reto 2025 (Monte Sharp Boxwork)",
    desc: "Vuelo orbital en la esfera 3D hacia Gale Crater (GALE-BOXWORK-2025) y cita oficial del reto.",
  },
  {
    step: 2,
    title: "Paso 2 · 20 Capas & QGIS 3D",
    desc: "Descenso a la superficie 3D extruida combinando capas ópticas, espectrales CRISM, THEMIS y obstáculos.",
  },
  {
    step: 3,
    title: "Paso 3 · Predictor Pre-EVA de Polvo",
    desc: "Simulación de caída barométrica ΔP y aumento de τ activando estado CAUTION.",
  },
  {
    step: 4,
    title: "Paso 4 · Ruta A vs. Ruta B (Ahorro O₂)",
    desc: "Comparativa en la Margin Unit de Jezero: Ruta A insegura por Bingo O₂ vs. Ruta B óptima.",
  },
  {
    step: 5,
    title: "Paso 5 · Simulador Mission Twin",
    desc: "Ejecución en vivo a 5× observando descarga metabólica de O₂ y batería PLSS.",
  },
  {
    step: 6,
    title: "Paso 6 · Astronaut HUD + Sombra Radio",
    desc: "Cambio al visor AR en Neretva Vallis, consulta RAG y registro de muestra Offline.",
  },
];

export default function NasaRubricModal() {
  const open = useMissionStore((s) => s.rubricModalOpen);
  const setOpen = useMissionStore((s) => s.setRubricModalOpen);
  const guidedTourStep = useMissionStore((s) => s.guidedTourStep);
  const runGuidedTourStep = useMissionStore((s) => s.runGuidedTourStep);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="bg-slate-950 border border-slate-700 rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Award className="w-5 h-5 text-mars" />
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">
                NASA Space Apps Challenge 2026 — Centro de Rúbrica, Impacto y Tour Guiado
              </h2>
              <p className="text-[11px] font-mono text-hudcyan">
                EXPLORE WITH PURPOSE. DISCOVER BEYOND THE KNOWN. · FROM DATA TO DISCOVERY
              </p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-6 text-xs">
          {/* 1. Guided Pitch Mode (1-Click 6-Step Tour) */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <PlayCircle className="w-4 h-4 text-mars" />
                Recorrido Guiado de Demostración (Modo Pitch 3 Minutos)
              </h3>
              {guidedTourStep > 0 && (
                <button
                  onClick={() => runGuidedTourStep(0)}
                  className="font-mono text-[10px] text-slate-400 hover:text-white"
                >
                  Reiniciar Tour
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {GUIDED_TOUR_STEPS.map((st) => (
                <button
                  key={st.step}
                  onClick={() => {
                    runGuidedTourStep(st.step);
                    setOpen(false);
                  }}
                  className={`text-left p-3 rounded-xl border transition ${
                    guidedTourStep === st.step
                      ? "bg-orange-950/60 border-mars text-white"
                      : "bg-slate-900/90 border-slate-800 hover:border-hudcyan text-slate-200"
                  }`}
                >
                  <div className="font-mono text-[11px] font-bold text-hudcyan">{st.title}</div>
                  <div className="text-[11px] text-slate-300 mt-1 leading-snug">{st.desc}</div>
                </button>
              ))}
            </div>
          </section>

          {/* 2. Impact & Beneficiaries Matrix (Criterion 4) */}
          <section className="space-y-2.5">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Globe2 className="w-4 h-4 text-nominal" />
              Matriz de Impacto Potencial y Beneficiarios (Criterio 4)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                <div className="font-bold text-hudcyan">
                  1. Exploración Humana en Marte (Artemis / Moon-to-Mars / NASA SUITS)
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Unifica por primera vez en un banco de pruebas determinista la ciencia planetaria, el gasto metabólico de O₂ bajo 0.38 g, la frontera Bingo O₂, el raycasting de sombra de radio y los refugios topográficos.
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-900 border border-emerald-800/50 space-y-1.5">
                <div className="font-bold text-nominal">
                  2. Campañas Terrestres en Análogos Volcánicos (Nicaragua y Centroamérica)
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Aplicable directamente hoy en expediciones geocientíficas y búsqueda/rescate en terrenos volcánicos extremos de Nicaragua (Caldera del Volcán Masaya, Volcán Momotombo y Cerro Negro), donde los basaltos abrasivos, laderas de ceniza suelta y cortes topográficos de señal replican cráteres marcianos.
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                <div className="font-bold text-amber-300">
                  3. Comunidad Académica y Ciencia Abierta STEAM
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Democratiza los archivos fragmentados del Planetary Data System (PDS) conectando mosaicos globales de NASA Mars Trek con proyectos reales editables en QGIS Desktop 3.44.15 y hallazgos recientes 2024–2026 de Curiosity y Perseverance.
                </p>
              </div>
            </div>
          </section>

          {/* 3. Scientific Limitations & AI Transparency (Criterion 1, 3 & Section 8) */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-nominal" />
                5 Limitaciones Científicas Respetadas (Cero Afirmaciones Falsas)
              </h3>
              <ul className="space-y-1.5 text-[11px] text-slate-300 list-disc pl-4">
                <li><b>Consumo O₂ PLSS:</b> Modelo biomecánico paramétrico de planificación (g=3.721 m/s²), no telemetría médica certificada de vuelo.</li>
                <li><b>Predictor de Tormentas:</b> Clasificador físico Pre-EVA (ΔP, τ, Ls, viento) basado en MEDA/REMS; no sustituye un GCM global.</li>
                <li><b>Radiación RAD:</b> Separa estrictamente las mediciones históricas directas en Gale de la extrapolación de referencia usada en Jezero.</li>
                <li><b>Biofirmas (Cheyava Falls):</b> Distingue detecciones geoquímicas de vivianita/greigita y orgánicos de la confirmación definitiva de vida.</li>
                <li><b>Resolución Orbital vs. Humana:</b> Incluso HiRISE (0.25 m/px) no resuelve clastos de 5 cm; por ello penalizamos las celdas con U &gt; 0.6.</li>
              </ul>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-hudcyan" />
                Declaración Transparente de Uso de IA (Apartado 8)
              </h3>
              <ul className="space-y-1.5 text-[11px] text-slate-300 list-disc pl-4">
                <li><b>Asistente Científico RAG Verificable:</b> Consulta exclusivamente los expedientes PDS precargados y exige separación en 3 bloques (Datos Medidos, Productos Derivados, Interpretación/Limitaciones).</li>
                <li><b>White-Box AI Determinista:</b> Enrutamiento A*/Dijkstra, índice SOI, gasto metabólico PLSS y riesgo de tormentas operan con fórmulas matemáticas abiertas y auditables.</li>
                <li><b>Uso de IA en Desarrollo:</b> Asistencia generativa en estructuración técnica, arquitectura Next.js/Three.js y puente Python MCP para QGIS Desktop bajo validación humana y pruebas GDAL/TypeScript.</li>
              </ul>
            </div>
          </section>

          {/* 4. Official Catalog of 17 NASA Instruments & Sources */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-hudcyan" />
              Catálogo Oficial de Datos e Instrumentos NASA Integrados (17 Fuentes)
            </h3>
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-900 text-slate-400 font-mono text-[10px]">
                  <tr>
                    <th className="p-2">Misión</th>
                    <th className="p-2">Instrumento</th>
                    <th className="p-2">Tipo de Dato</th>
                    <th className="p-2">Aplicación en MARS PATHFINDER</th>
                    <th className="p-2">Enlace</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {NASA_INSTRUMENT_CATALOG.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/50">
                      <td className="p-2 font-semibold text-white">{row.mission}</td>
                      <td className="p-2 font-mono text-hudcyan">{row.instrument}</td>
                      <td className="p-2 text-slate-300">{row.dataType}</td>
                      <td className="p-2 text-slate-400">{row.role}</td>
                      <td className="p-2">
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-mars hover:underline inline-flex items-center gap-0.5 font-mono text-[10px]"
                        >
                          PDS <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
