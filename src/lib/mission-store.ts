"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  TWENTY_MARS_LAYERS,
  SCIENTIFIC_TARGETS,
  GLOBAL_MARS_LANDMARKS,
  RegionId,
} from "./nasa-seed-data";
import {
  SuitAndMissionParams,
  PreEvaWeatherInputs,
  MarsTerrainGrid,
  RawQgisRegionJson,
  ComputedRoute,
  buildLandmarkTerrainGrid,
  computeAllThreeRoutes,
  computePreEvaWeather,
  getSyntheticTargetForLandmark,
  getTargetById,
} from "./mars-core";

export interface FieldLogEntry {
  id: string;
  timestamp: string;
  targetId: string;
  regionId: RegionId;
  title: string;
  description: string;
  spectrometerReading: string;
  sampleTubeId: string;
  lat: number;
  lon: number;
  elevationM: number;
  synced: boolean;
  savedOffline: boolean;
}

export type ActiveSystemView = "MISSION_CONTROL" | "ASTRONAUT_HUD";
export type MapViewportMode = "GLOBE_3D" | "TERRAIN_3D" | "FIRST_PERSON_3D";
export type GlobeBasemapKey = "viking" | "mola_color" | "thermal" | "geology";

export interface LayerState {
  visible: boolean;
  opacity: number;
}

export interface MissionState {
  // Navigation & Viewports
  activeSystem: ActiveSystemView;
  mapViewportMode: MapViewportMode;
  globeBasemap: GlobeBasemapKey;
  showGlobeCoverageOverlay: boolean;
  globeSolarLs: number;
  globeSunAngleDeg: number;
  flyToRequestCount: number;
  flyToCoords: { lat: number; lon: number; label: string } | null;

  // Region & Target
  activeRegionId: RegionId;
  activeLandmarkId: string;
  activeTargetId: string;
  selectedRouteId: "ROUTE_A" | "ROUTE_B" | "ROUTE_C";

  // 20 Layers + Split Screen Comparator
  layers: Record<string, LayerState>;
  splitCompareEnabled: boolean;
  splitCompareLayerId: string;
  splitSwipePercent: number;
  inspectedProvenanceLayerId: string | null;

  // SOI Weights
  soiWeights: { alpha: number; beta: number; gamma: number; delta: number };

  // Suit, PLSS & Robotic Support
  suitParams: SuitAndMissionParams;

  // Pre-EVA Weather & Emergency
  weatherInputs: PreEvaWeatherInputs;
  emergencyActive: boolean;
  emergencyType: "NONE" | "SOLAR_SPE" | "DUST_GUST" | "LOW_O2";

  // Mission Twin Simulation & Astronaut Position
  twinPlaying: boolean;
  twinSpeed: 1 | 5 | 10;
  twinProgress: number; // 0..1 along selectedRoute
  eva2O2Percent: number;
  offlineOverrideMode: "AUTO" | "FORCE_OFFLINE" | "FORCE_ONLINE";

  // Field Logs (Offline-First Sync)
  fieldLogs: FieldLogEntry[];

  // Guided 10-Step Planner & Rubric Modal
  missionApprovedForHud: boolean;
  plannerStep: number;
  rubricModalOpen: boolean;
  guidedTourStep: number; // 0 = off, 1..6 active tour

  // QGIS Terrain Hydration Cache (not persisted to localStorage to keep storage tiny)
  qgisRawRegions: Record<RegionId, RawQgisRegionJson> | null;
  qgisMetadata: Record<string, unknown> | null;

  // Actions
  setActiveSystem: (sys: ActiveSystemView) => void;
  setMapViewportMode: (mode: MapViewportMode) => void;
  setGlobeBasemap: (key: GlobeBasemapKey) => void;
  setShowGlobeCoverageOverlay: (v: boolean) => void;
  setGlobeSunAngleDeg: (deg: number) => void;
  flyToGlobeLocation: (lat: number, lon: number, label: string, regionId?: RegionId, targetId?: string) => void;

  selectLandmark: (landmarkId: string, preferredMode?: MapViewportMode) => void;
  selectRegion: (regionId: RegionId) => void;
  selectTarget: (targetId: string) => void;
  selectRoute: (routeId: "ROUTE_A" | "ROUTE_B" | "ROUTE_C") => void;

  toggleLayer: (layerId: string) => void;
  setLayerOpacity: (layerId: string, opacity: number) => void;
  setSplitCompare: (enabled: boolean, layerId?: string, swipe?: number) => void;
  setInspectedProvenanceLayer: (layerId: string | null) => void;

  setSoiWeight: (key: "alpha" | "beta" | "gamma" | "delta", value: number) => void;
  updateSuitParams: (patch: Partial<SuitAndMissionParams>) => void;
  updateWeatherInputs: (patch: Partial<PreEvaWeatherInputs>) => void;

  triggerEmergency: (type: "NONE" | "SOLAR_SPE" | "DUST_GUST" | "LOW_O2") => void;
  setTwinPlaying: (playing: boolean) => void;
  setTwinSpeed: (speed: 1 | 5 | 10) => void;
  setTwinProgress: (progress: number) => void;
  setOfflineOverrideMode: (mode: "AUTO" | "FORCE_OFFLINE" | "FORCE_ONLINE") => void;

  addFieldLog: (entry: Omit<FieldLogEntry, "id" | "timestamp">) => void;
  syncOfflineLogs: () => void;

  setPlannerStep: (step: number) => void;
  approveMissionForHud: () => void;
  setRubricModalOpen: (open: boolean) => void;
  runGuidedTourStep: (step: number) => void;

  setQgisTerrainData: (
    regions: Record<RegionId, RawQgisRegionJson>,
    meta: Record<string, unknown>
  ) => void;
}

const defaultLayers: Record<string, LayerState> = {};
for (const l of TWENTY_MARS_LAYERS) {
  defaultLayers[l.id] = { visible: l.defaultVisible, opacity: l.defaultOpacity };
}

const defaultTarget = SCIENTIFIC_TARGETS[0]; // GALE-BOXWORK-2025

// Cross-tab BroadcastChannel for Mission Control <-> Astronaut HUD real-time sync
let syncChannel: BroadcastChannel | null = null;
if (typeof window !== "undefined" && "BroadcastChannel" in window) {
  syncChannel = new BroadcastChannel("mars_pathfinder_sync_v1");
}

function broadcastStatePatch(patch: Partial<MissionState>) {
  if (syncChannel) {
    try {
      syncChannel.postMessage({ type: "STATE_SYNC", patch });
    } catch {
      // ignore serialization edge cases
    }
  }
}

function toPreEvaWeatherInputs(
  raw: (typeof SCIENTIFIC_TARGETS)[number]["pre_eva_weather_default"]
): PreEvaWeatherInputs {
  return {
    pressureDrop3hPa: raw.pressure_drop_3h_pa,
    opticalDepthTau: raw.optical_depth_tau,
    solarLongitudeLsDeg: raw.solar_longitude_ls_deg,
    windGustMs: raw.wind_gust_ms,
    deltaTSurfAirK: raw.delta_t_surf_air_k,
  };
}

export const useMissionStore = create<MissionState>()(
  persist(
    (set, get) => ({
      activeSystem: "MISSION_CONTROL",
      mapViewportMode: "GLOBE_3D",
      globeBasemap: "viking",
      showGlobeCoverageOverlay: true,
      globeSolarLs: 142,
      globeSunAngleDeg: 100,
      flyToRequestCount: 0,
      flyToCoords: null,

      activeRegionId: defaultTarget.region_id,
      activeLandmarkId: defaultTarget.region_id,
      activeTargetId: defaultTarget.target_id,
      selectedRouteId: "ROUTE_B",

      layers: defaultLayers,
      splitCompareEnabled: false,
      splitCompareLayerId: "TOPOGRAPHY",
      splitSwipePercent: 50,
      inspectedProvenanceLayerId: null,

      soiWeights: { alpha: 0.3, beta: 0.3, gamma: 0.25, delta: 0.15 },

      suitParams: {
        bodyMassKg: 75,
        suitMassKg: 65,
        payloadMassKg: 18,
        tankCapacityL: 550,
        reservePercent: 20,
        maxSlopeDeg: 14,
        walkingSpeedMs: 0.85,
        observationMinutes: 25,
        astronautCount: 2,
        ambientTempC: -28,
        solarEventActive: false,
        roverRelayEnabled: false,
        roverRelayGrid: [38, 48],
      },

      weatherInputs: toPreEvaWeatherInputs(defaultTarget.pre_eva_weather_default),
      emergencyActive: false,
      emergencyType: "NONE",

      twinPlaying: false,
      twinSpeed: 1,
      twinProgress: 0.32,
      eva2O2Percent: 81.4,
      offlineOverrideMode: "AUTO",

      fieldLogs: [
        {
          id: "LOG-INIT-01",
          timestamp: "2026-11-14T16:10:00Z",
          targetId: "JEZERO-CHEYAVA-2024",
          regionId: "JEZERO_CRATER",
          title: "Calibración Inicial Espectrómetro — Bright Angel Bench",
          description:
            "Lectura de referencia sobre matriz de lutita rojiza antes de aproximación a afloramiento Cheyava Falls.",
          spectrometerReading: "CaSO4·2H2O + Fe-Fosfato (Vivianita ref.)",
          sampleTubeId: "TUBE-EVA-024",
          lat: 18.445,
          lon: 77.312,
          elevationM: -2505,
          synced: true,
          savedOffline: false,
        },
      ],

      missionApprovedForHud: false,
      plannerStep: 1,
      rubricModalOpen: false,
      guidedTourStep: 0,

      qgisRawRegions: null,
      qgisMetadata: null,

      setActiveSystem: (sys) => {
        set({ activeSystem: sys });
        broadcastStatePatch({ activeSystem: sys });
      },
      setMapViewportMode: (mode) => {
        set({ mapViewportMode: mode });
      },
      setGlobeBasemap: (key) => set({ globeBasemap: key }),
      setShowGlobeCoverageOverlay: (v) => set({ showGlobeCoverageOverlay: v }),
      setGlobeSunAngleDeg: (deg) => set({ globeSunAngleDeg: deg }),

      flyToGlobeLocation: (lat, lon, label, regionId, targetId) => {
        const next: Partial<MissionState> = {
          flyToCoords: { lat, lon, label },
          flyToRequestCount: get().flyToRequestCount + 1,
        };
        if (regionId) {
          next.activeRegionId = regionId;
          next.activeLandmarkId = regionId;
        }
        if (targetId) {
          const t = getTargetById(targetId);
          next.activeTargetId = t.target_id;
          next.activeRegionId = t.region_id;
          next.activeLandmarkId = t.region_id;
          next.weatherInputs = toPreEvaWeatherInputs(t.pre_eva_weather_default);
        }
        set(next);
      },

      selectLandmark: (landmarkId, preferredMode) => {
        const lm =
          GLOBAL_MARS_LANDMARKS.find((l) => l.id === landmarkId) ?? GLOBAL_MARS_LANDMARKS[0];
        const nextMode: MapViewportMode =
          preferredMode ??
          (get().mapViewportMode === "FIRST_PERSON_3D" ? "FIRST_PERSON_3D" : "TERRAIN_3D");

        if (lm.region_id) {
          const matchingTarget =
            SCIENTIFIC_TARGETS.find((t) => t.region_id === lm.region_id) || SCIENTIFIC_TARGETS[0];
          const mappedWeather = toPreEvaWeatherInputs(matchingTarget.pre_eva_weather_default);
          set({
            activeLandmarkId: lm.id,
            activeRegionId: lm.region_id,
            activeTargetId: matchingTarget.target_id,
            weatherInputs: mappedWeather,
            twinProgress: 0.15,
            mapViewportMode: nextMode,
            flyToCoords: { lat: lm.lat, lon: lm.lon, label: lm.name },
            flyToRequestCount: get().flyToRequestCount + 1,
            suitParams: {
              ...get().suitParams,
              roverRelayGrid: lm.region_id === "JEZERO_CRATER" ? [38, 48] : [32, 62],
            },
          });
          broadcastStatePatch({
            activeLandmarkId: lm.id,
            activeRegionId: lm.region_id,
            activeTargetId: matchingTarget.target_id,
            weatherInputs: mappedWeather,
          });
        } else {
          const synTarget = getSyntheticTargetForLandmark(lm.id);
          const mappedWeather = toPreEvaWeatherInputs(synTarget.pre_eva_weather_default);
          set({
            activeLandmarkId: lm.id,
            activeTargetId: synTarget.target_id,
            weatherInputs: mappedWeather,
            twinProgress: 0.15,
            mapViewportMode: nextMode,
            flyToCoords: { lat: lm.lat, lon: lm.lon, label: lm.name },
            flyToRequestCount: get().flyToRequestCount + 1,
            suitParams: {
              ...get().suitParams,
              roverRelayGrid: [26, 30],
            },
          });
          broadcastStatePatch({
            activeLandmarkId: lm.id,
            activeTargetId: synTarget.target_id,
            weatherInputs: mappedWeather,
          });
        }
      },

      selectRegion: (regionId) => {
        const matchingTarget =
          SCIENTIFIC_TARGETS.find((t) => t.region_id === regionId) || SCIENTIFIC_TARGETS[0];
        const mappedWeather = toPreEvaWeatherInputs(matchingTarget.pre_eva_weather_default);
        set({
          activeRegionId: regionId,
          activeLandmarkId: regionId,
          activeTargetId: matchingTarget.target_id,
          weatherInputs: mappedWeather,
          twinProgress: 0.15,
          suitParams: {
            ...get().suitParams,
            roverRelayGrid: regionId === "JEZERO_CRATER" ? [38, 48] : [32, 62],
          },
        });
        broadcastStatePatch({
          activeRegionId: regionId,
          activeLandmarkId: regionId,
          activeTargetId: matchingTarget.target_id,
          weatherInputs: mappedWeather,
        });
      },

      selectTarget: (targetId) => {
        const t = getTargetById(targetId);
        const mappedWeather = toPreEvaWeatherInputs(t.pre_eva_weather_default);
        set({
          activeTargetId: t.target_id,
          activeRegionId: t.region_id,
          activeLandmarkId: t.region_id,
          weatherInputs: mappedWeather,
          twinProgress: 0.25,
          suitParams: {
            ...get().suitParams,
            roverRelayGrid: t.region_id === "JEZERO_CRATER" ? [38, 48] : [32, 62],
          },
        });
        broadcastStatePatch({
          activeTargetId: t.target_id,
          activeRegionId: t.region_id,
          activeLandmarkId: t.region_id,
          weatherInputs: mappedWeather,
        });
      },

      selectRoute: (routeId) => {
        set({ selectedRouteId: routeId });
        broadcastStatePatch({ selectedRouteId: routeId });
      },

      toggleLayer: (layerId) =>
        set((s) => ({
          layers: {
            ...s.layers,
            [layerId]: {
              ...s.layers[layerId],
              visible: !s.layers[layerId]?.visible,
            },
          },
        })),

      setLayerOpacity: (layerId, opacity) =>
        set((s) => ({
          layers: {
            ...s.layers,
            [layerId]: {
              ...s.layers[layerId],
              opacity,
            },
          },
        })),

      setSplitCompare: (enabled, layerId, swipe) =>
        set((s) => ({
          splitCompareEnabled: enabled,
          splitCompareLayerId: layerId ?? s.splitCompareLayerId,
          splitSwipePercent: swipe ?? s.splitSwipePercent,
        })),

      setInspectedProvenanceLayer: (layerId) => set({ inspectedProvenanceLayerId: layerId }),

      setSoiWeight: (key, value) =>
        set((s) => ({
          soiWeights: { ...s.soiWeights, [key]: value },
        })),

      updateSuitParams: (patch) => {
        const next = { ...get().suitParams, ...patch };
        set({ suitParams: next });
        broadcastStatePatch({ suitParams: next });
      },

      updateWeatherInputs: (patch) => {
        const next = { ...get().weatherInputs, ...patch };
        set({ weatherInputs: next });
        broadcastStatePatch({ weatherInputs: next });
      },

      triggerEmergency: (type) => {
        const active = type !== "NONE";
        set({ emergencyActive: active, emergencyType: type });
        broadcastStatePatch({ emergencyActive: active, emergencyType: type });
      },

      setTwinPlaying: (playing) => set({ twinPlaying: playing }),
      setTwinSpeed: (speed) => set({ twinSpeed: speed }),
      setTwinProgress: (progress) => {
        const clamped = Math.max(0, Math.min(1, progress));
        set({ twinProgress: clamped });
        broadcastStatePatch({ twinProgress: clamped });
      },
      setOfflineOverrideMode: (mode) => set({ offlineOverrideMode: mode }),

      addFieldLog: (entry) => {
        const newLog: FieldLogEntry = {
          ...entry,
          id: `LOG-${Date.now().toString(36).toUpperCase()}`,
          timestamp: new Date().toISOString(),
        };
        const updated = [newLog, ...get().fieldLogs];
        set({ fieldLogs: updated });
        broadcastStatePatch({ fieldLogs: updated });
      },

      syncOfflineLogs: () => {
        const updated = get().fieldLogs.map((l) => ({ ...l, synced: true }));
        set({ fieldLogs: updated });
        broadcastStatePatch({ fieldLogs: updated });
      },

      setPlannerStep: (step) => set({ plannerStep: step }),

      approveMissionForHud: () => {
        set({ missionApprovedForHud: true, activeSystem: "ASTRONAUT_HUD" });
        broadcastStatePatch({ missionApprovedForHud: true });
      },

      setRubricModalOpen: (open) => set({ rubricModalOpen: open }),

      runGuidedTourStep: (step) => {
        set({ guidedTourStep: step });
        if (step === 1) {
          const gale = getTargetById("GALE-BOXWORK-2025");
          set({
            activeSystem: "MISSION_CONTROL",
            mapViewportMode: "GLOBE_3D",
            activeRegionId: gale.region_id,
            activeTargetId: gale.target_id,
            weatherInputs: toPreEvaWeatherInputs(gale.pre_eva_weather_default),
            flyToCoords: {
              lat: gale.coordinates.latitude,
              lon: gale.coordinates.longitude,
              label: gale.title_es,
            },
            flyToRequestCount: get().flyToRequestCount + 1,
          });
        } else if (step === 2) {
          set((s) => ({
            activeSystem: "MISSION_CONTROL",
            mapViewportMode: "TERRAIN_3D",
            layers: {
              ...s.layers,
              OPTICAL: { visible: true, opacity: 100 },
              SPECTRAL: { visible: true, opacity: 65 },
              THERMAL: { visible: true, opacity: 55 },
              BOULDERS_SAND: { visible: true, opacity: 75 },
            },
          }));
        } else if (step === 3) {
          set({
            activeSystem: "MISSION_CONTROL",
            mapViewportMode: "TERRAIN_3D",
            weatherInputs: {
              pressureDrop3hPa: -11.5,
              opticalDepthTau: 1.05,
              solarLongitudeLsDeg: 225,
              windGustMs: 17.5,
              deltaTSurfAirK: 34,
            },
          });
        } else if (step === 4) {
          const margin = getTargetById("JEZERO-MARGIN-CARB");
          set({
            activeSystem: "MISSION_CONTROL",
            mapViewportMode: "TERRAIN_3D",
            activeRegionId: margin.region_id,
            activeTargetId: margin.target_id,
            selectedRouteId: "ROUTE_B",
          });
        } else if (step === 5) {
          set({
            activeSystem: "MISSION_CONTROL",
            mapViewportMode: "TERRAIN_3D",
            twinPlaying: true,
            twinSpeed: 5,
            twinProgress: 0.45,
          });
        } else if (step === 6) {
          const cheyava = getTargetById("JEZERO-CHEYAVA-2024");
          set({
            activeSystem: "ASTRONAUT_HUD",
            activeRegionId: cheyava.region_id,
            activeTargetId: cheyava.target_id,
            selectedRouteId: "ROUTE_B",
            twinProgress: 0.92,
            twinPlaying: false,
            offlineOverrideMode: "AUTO",
          });
        }
      },

      setQgisTerrainData: (regions, meta) =>
        set({ qgisRawRegions: regions, qgisMetadata: meta }),
    }),
    {
      name: "mars_pathfinder_storage_v1",
      partialize: (state) => ({
        activeRegionId: state.activeRegionId,
        activeTargetId: state.activeTargetId,
        selectedRouteId: state.selectedRouteId,
        soiWeights: state.soiWeights,
        suitParams: state.suitParams,
        weatherInputs: state.weatherInputs,
        fieldLogs: state.fieldLogs,
        missionApprovedForHud: state.missionApprovedForHud,
      }),
    }
  )
);

// Subscribe to BroadcastChannel updates from sibling tabs
if (syncChannel) {
  syncChannel.onmessage = (ev) => {
    if (ev.data?.type === "STATE_SYNC" && ev.data?.patch) {
      useMissionStore.setState(ev.data.patch);
    }
  };
}

/**
 * Pure selector helper to derive active terrain grid, 3 computed routes, and weather verdict
 */
export function useDerivedMissionComputation(): {
  grid: MarsTerrainGrid;
  target: ReturnType<typeof getTargetById>;
  routes: [ComputedRoute, ComputedRoute, ComputedRoute];
  activeRoute: ComputedRoute;
  weather: ReturnType<typeof computePreEvaWeather>;
} {
  const activeRegionId = useMissionStore((s) => s.activeRegionId);
  const activeLandmarkId = useMissionStore((s) => s.activeLandmarkId);
  const activeTargetId = useMissionStore((s) => s.activeTargetId);
  const selectedRouteId = useMissionStore((s) => s.selectedRouteId);
  const suitParams = useMissionStore((s) => s.suitParams);
  const weatherInputs = useMissionStore((s) => s.weatherInputs);
  const qgisRawRegions = useMissionStore((s) => s.qgisRawRegions);

  const landmarkId = activeLandmarkId || activeRegionId;
  const target =
    landmarkId === "JEZERO_CRATER" || landmarkId === "GALE_MOUNT_SHARP"
      ? getTargetById(activeTargetId)
      : getSyntheticTargetForLandmark(landmarkId);
  const grid = buildLandmarkTerrainGrid(landmarkId, suitParams, qgisRawRegions);

  const routes = computeAllThreeRoutes(grid, target, suitParams);
  const activeRoute = routes.find((r) => r.id === selectedRouteId) || routes[1];
  const weather = computePreEvaWeather(weatherInputs);

  return { grid, target, routes, activeRoute, weather };
}
