"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  Search,
  Play,
  Pause,
  Ruler,
  RotateCcw,
  RotateCw,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  User,
  Map as MapIcon,
  Home,
  Globe,
  Mountain,
  Eye,
  Sparkles,
  Cloud,
  Zap,
  Radio,
  Columns,
  X,
  Check,
  ExternalLink,
  Layers,
} from "lucide-react";
import {
  GLOBAL_MARS_LANDMARKS,
  SCIENTIFIC_TARGETS,
  TWENTY_MARS_LAYERS,
  GlobalMarsLandmark,
  ScientificTargetDef,
} from "@/lib/nasa-seed-data";
import {
  MarsTerrainGrid,
  RawQgisRegionJson,
  buildTerrainGridFromQgisJson,
  buildLandmarkTerrainGrid,
  computeAllThreeRoutes,
  findNearestTopographicShelters,
  clamp,
  gridToLonLat,
} from "@/lib/mars-core";
import { useDerivedMissionComputation, useMissionStore } from "@/lib/mission-store";

export interface RawGdalSiteEntry extends RawQgisRegionJson {
  id: string;
  name: string;
  target_grid?: [number, number];
  target_id?: string;
}

export interface AllTenSitesGdalPayload {
  generator: string;
  blender_version?: string;
  mars_radius_m: number;
  site_count: number;
  sites: Record<string, RawGdalSiteEntry>;
  blender_mesh_stats?: Record<
    string,
    {
      blender_verts: number;
      blender_faces: number;
      surface_area_3d_km2: number;
      min_elev_m: number;
      max_elev_m: number;
    }
  >;
}

interface ProjectedOverlayPin {
  id: string;
  kind: "TARGET_STAR" | "SHELTER_SHIELD" | "WAYPOINT_PINK" | "ROVER_YELLOW" | "EVA_ASTRONAUT";
  label?: string;
  sublabel?: string;
  x: number;
  y: number;
  visible: boolean;
  lat: number;
  lon: number;
  elevM: number;
}

interface MeasurePoint {
  world: THREE.Vector3;
  lat: number;
  lon: number;
  elevM: number;
  slopeDeg: number;
}

const SHORT_SITE_LABELS: Record<string, string> = {
  JEZERO_CRATER: "1. Jezero",
  GALE_MOUNT_SHARP: "2. Gale / Sharp",
  OLYMPUS_MONS: "3. Olympus Mons",
  VALLES_MARINERIS: "4. Valles Marineris",
  HELLAS_PLANITIA: "5. Hellas Planitia",
  MARS_PATHFINDER_ARES: "6. Ares Vallis",
  VIKING_1: "7. Viking 1",
  INSIGHT_ELYSIUM: "8. InSight Elysium",
  SPIRIT_GUSEV: "9. Cráter Gusev",
  OPPORTUNITY_MERIDIANI: "10. Meridiani",
};

/**
 * Exact surface height & slope sampler from the site's 96x96 GDAL/PyQGIS/Blender DEM.
 * Coordinate convention:
 *  - u in [0, 1] -> West (gx = 0) to East (gx = nx - 1)
 *  - v in [0, 1] -> North (gy = ny - 1, top of orthoimage) to South (gy = 0, bottom of orthoimage)
 * This guarantees 100% pixel-to-vertex registration between the 3D displaced mesh and the
 * 1024x1024 GDAL/HiRISE ortho-textures (`site_<ID>_hirise.jpg` & `site_<ID>_color.jpg`).
 */
function sampleExactSiteSurface(
  u: number,
  v: number,
  grid: MarsTerrainGrid,
  elevStats: { minElev: number; maxElev: number; spanElev: number; worldSpan: number }
): { heightWorld: number; elevM: number; slopeDeg: number; normElev: number } {
  const uu = clamp(u, 0, 1);
  const vv = clamp(v, 0, 1);
  const gx = clamp(uu * (grid.nx - 1), 0, grid.nx - 1);
  const gy = clamp((1 - vv) * (grid.ny - 1), 0, grid.ny - 1);

  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  // Smoothstep weights for C1-continuous bicubic-like terrain surface interpolation
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const ix1 = Math.min(grid.nx - 1, ix + 1);
  const iy1 = Math.min(grid.ny - 1, iy + 1);

  const e00 = grid.elevationM[iy]?.[ix] ?? -2400;
  const e10 = grid.elevationM[iy]?.[ix1] ?? e00;
  const e01 = grid.elevationM[iy1]?.[ix] ?? e00;
  const e11 = grid.elevationM[iy1]?.[ix1] ?? e00;
  const baseElevM =
    e00 * (1 - sx) * (1 - sy) +
    e10 * sx * (1 - sy) +
    e01 * (1 - sx) * sy +
    e11 * sx * sy;

  const s00 = grid.slopeDeg[iy]?.[ix] ?? 8;
  const s10 = grid.slopeDeg[iy]?.[ix1] ?? s00;
  const s01 = grid.slopeDeg[iy1]?.[ix] ?? s00;
  const s11 = grid.slopeDeg[iy1]?.[ix1] ?? s00;
  const baseSlopeDeg =
    s00 * (1 - sx) * (1 - sy) +
    s10 * sx * (1 - sy) +
    s01 * (1 - sx) * sy +
    s11 * sx * sy;

  const normElev = clamp((baseElevM - elevStats.minElev) / elevStats.spanElev, 0, 1);
  const heightWorld = (normElev - 0.38) * elevStats.worldSpan;

  return {
    heightWorld,
    elevM: Math.round(baseElevM),
    slopeDeg: Number(clamp(baseSlopeDeg, 0.5, 68.0).toFixed(1)),
    normElev,
  };
}

/**
 * Smooths a grid polyline in (u, v) space using Chaikin corner-cutting so grid-cell
 * A-Star and Dijkstra paths follow natural topographic contours without jagged 90° staircase corners.
 */
function smoothUVPolyline(pts: Array<[number, number]>, iterations = 2): Array<[number, number]> {
  if (pts.length <= 2) return pts;
  let curr = pts;
  for (let it = 0; it < iterations; it++) {
    const next: Array<[number, number]> = [curr[0]];
    for (let i = 0; i < curr.length - 1; i++) {
      const [u0, v0] = curr[i];
      const [u1, v1] = curr[i + 1];
      next.push([0.75 * u0 + 0.25 * u1, 0.75 * v0 + 0.25 * v1]);
      next.push([0.25 * u0 + 0.75 * u1, 0.25 * v0 + 0.75 * v1]);
    }
    next.push(curr[curr.length - 1]);
    curr = next;
  }
  return curr;
}

export default function MarsCesiumProViewer({
  allSitesPayload,
}: {
  allSitesPayload?: AllTenSitesGdalPayload | null;
}) {
  const { target: storeTarget, weather } = useDerivedMissionComputation();

  const activeLandmarkId = useMissionStore((s) => s.activeLandmarkId);
  const selectLandmark = useMissionStore((s) => s.selectLandmark);
  const selectTarget = useMissionStore((s) => s.selectTarget);
  const selectedRouteId = useMissionStore((s) => s.selectedRouteId);
  const selectRoute = useMissionStore((s) => s.selectRoute);
  const layers = useMissionStore((s) => s.layers);
  const toggleLayer = useMissionStore((s) => s.toggleLayer);
  const suitParams = useMissionStore((s) => s.suitParams);
  const updateSuitParams = useMissionStore((s) => s.updateSuitParams);
  const weatherInputs = useMissionStore((s) => s.weatherInputs);
  const updateWeatherInputs = useMissionStore((s) => s.updateWeatherInputs);
  const emergencyActive = useMissionStore((s) => s.emergencyActive);
  const emergencyType = useMissionStore((s) => s.emergencyType);
  const triggerEmergency = useMissionStore((s) => s.triggerEmergency);
  const splitCompareEnabled = useMissionStore((s) => s.splitCompareEnabled);
  const splitCompareLayerId = useMissionStore((s) => s.splitCompareLayerId);
  const splitSwipePercent = useMissionStore((s) => s.splitSwipePercent);
  const setSplitCompare = useMissionStore((s) => s.setSplitCompare);
  const twinProgress = useMissionStore((s) => s.twinProgress);
  const setTwinProgress = useMissionStore((s) => s.setTwinProgress);
  const twinPlaying = useMissionStore((s) => s.twinPlaying);
  const setTwinPlaying = useMissionStore((s) => s.setTwinPlaying);

  const activeLandmark: GlobalMarsLandmark = useMemo(
    () => GLOBAL_MARS_LANDMARKS.find((l) => l.id === activeLandmarkId) ?? GLOBAL_MARS_LANDMARKS[0],
    [activeLandmarkId]
  );

  // Build the exact 96x96 GDAL/PyQGIS/Blender MarsTerrainGrid for ANY of the 10 mapped Mars sites!
  const siteGrid: MarsTerrainGrid = useMemo(() => {
    const rawSite = allSitesPayload?.sites?.[activeLandmark.id];
    if (rawSite) {
      return buildTerrainGridFromQgisJson(activeLandmark.id as any, rawSite, suitParams);
    }
    return buildLandmarkTerrainGrid(activeLandmark.id, suitParams, null);
  }, [allSitesPayload, activeLandmark.id, suitParams]);

  // Compute elevation statistics and physical 3D world vertical scale for the active site
  const siteElevStats = useMemo(() => {
    let minElev = Infinity;
    let maxElev = -Infinity;
    for (let y = 0; y < siteGrid.ny; y++) {
      for (let x = 0; x < siteGrid.nx; x++) {
        const z = siteGrid.elevationM[y][x];
        if (z < minElev) minElev = z;
        if (z > maxElev) maxElev = z;
      }
    }
    if (!Number.isFinite(minElev)) minElev = activeLandmark.elevation_m - 200;
    if (!Number.isFinite(maxElev)) maxElev = activeLandmark.elevation_m + 200;
    const spanElev = Math.max(40, maxElev - minElev);
    // Scale 3D world height proportionally to physical relief (e.g. InSight ~3.0, Jezero/Gale ~4.2, Olympus/Valles ~6.2)
    const worldSpan = clamp(2.9 + Math.log10(spanElev / 70 + 1) * 2.55, 2.8, 6.4);
    return { minElev, maxElev, spanElev, worldSpan };
  }, [siteGrid, activeLandmark.elevation_m]);

  // Resolve the active ScientificTargetDef for ANY of the 10 sites (3 NASA Rover targets + 8 landmark targets)
  const siteTarget: ScientificTargetDef = useMemo(() => {
    const rawSite = allSitesPayload?.sites?.[activeLandmark.id];
    if (activeLandmark.id === "JEZERO_CRATER") {
      const jezeroTgt =
        SCIENTIFIC_TARGETS.find(
          (t) => t.region_id === "JEZERO_CRATER" && t.target_id === storeTarget.target_id
        ) ?? SCIENTIFIC_TARGETS[0];
      if (jezeroTgt.target_id === "JEZERO-CHEYAVA-2024" && rawSite?.target_grid) {
        return {
          ...jezeroTgt,
          grid_pos: { x: rawSite.target_grid[0], y: rawSite.target_grid[1] },
        };
      }
      if (jezeroTgt.target_id === "JEZERO-MARGIN-CARB") {
        return {
          ...jezeroTgt,
          grid_pos: { x: 46, y: 54 },
        };
      }
      return jezeroTgt;
    }
    if (activeLandmark.id === "GALE_MOUNT_SHARP") {
      const galeTgt =
        SCIENTIFIC_TARGETS.find((t) => t.region_id === "GALE_MOUNT_SHARP") ?? SCIENTIFIC_TARGETS[2];
      return {
        ...galeTgt,
        grid_pos: rawSite?.target_grid
          ? { x: rawSite.target_grid[0], y: rawSite.target_grid[1] }
          : { x: 64, y: 72 },
      };
    }

    const tx = rawSite?.target_grid?.[0] ?? activeLandmark.target_grid_pos?.[0] ?? 29;
    const ty = rawSite?.target_grid?.[1] ?? activeLandmark.target_grid_pos?.[1] ?? 70;
    const ll = gridToLonLat(tx, ty, siteGrid);
    const elevAtTarget =
      siteGrid.elevationM[clamp(ty, 0, siteGrid.ny - 1)]?.[clamp(tx, 0, siteGrid.nx - 1)] ??
      activeLandmark.elevation_m;

    return {
      ...SCIENTIFIC_TARGETS[0],
      target_id: rawSite?.target_id ?? activeLandmark.target_id ?? `${activeLandmark.id}-OBJ`,
      region_id: "JEZERO_CRATER",
      title_es: activeLandmark.name,
      rover_mission: activeLandmark.resolution_summary,
      coordinates: {
        latitude: Number(ll.lat.toFixed(4)),
        longitude: Number(ll.lon.toFixed(4)),
        elevation_m: Math.round(elevAtTarget),
      },
      grid_pos: { x: tx, y: ty },
    };
  }, [activeLandmark, allSitesPayload, storeTarget.target_id, siteGrid]);

  // Compute all 3 real EVA routes (Route A Shortest, Route B Optimal A*/Dijkstra, Route C Science SOI) on this site's DEM
  const siteRoutes = useMemo(
    () => computeAllThreeRoutes(siteGrid, siteTarget, suitParams),
    [siteGrid, siteTarget, suitParams]
  );

  const activeSiteRoute = useMemo(
    () => siteRoutes.find((r) => r.id === selectedRouteId) ?? siteRoutes[1],
    [siteRoutes, selectedRouteId]
  );

  // Compute real Topographic Shelters on this site's DEM
  const siteShelters = useMemo(() => {
    const allCandidates = findNearestTopographicShelters(
      siteGrid,
      siteTarget.grid_pos.x,
      siteTarget.grid_pos.y,
      12
    );
    // Pick 2 well-spaced shelters along the corridor between target and base so their pins are distinct
    const picked: typeof allCandidates = [];
    for (const c of allCandidates) {
      const distTgt = Math.hypot(c.gx - siteTarget.grid_pos.x, c.gy - siteTarget.grid_pos.y);
      if (distTgt < 8) continue;
      if (picked.length === 0) {
        picked.push(c);
      } else {
        const distPrev = Math.hypot(c.gx - picked[0].gx, c.gy - picked[0].gy);
        if (distPrev >= 12) {
          picked.push(c);
          break;
        }
      }
    }
    return picked;
  }, [siteGrid, siteTarget]);

  // View mode inside our standalone Cesium-style viewer
  const [viewMode, setViewMode] = useState<"SITE_3D" | "GLOBE_3D" | "FIRST_PERSON_3D">("SITE_3D");
  const [basemapStyle, setBasemapStyle] = useState<"HIRISE_GRAY" | "VIKING_COLOR" | "MOLA_SHADE">(
    "HIRISE_GRAY"
  );
  const [layersDrawerOpen, setLayersDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [reliefExaggeration, setReliefExaggeration] = useState(1.35);
  const [sunAzimuthDeg, setSunAzimuthDeg] = useState(315);

  // Preload the site's real 1024x1024 GDAL/HiRISE & Viking Color ortho-textures from `/cesium-mars/assets/`
  const loadedImagesRef = useRef<Record<string, HTMLImageElement>>({});
  const [textureVersion, setTextureVersion] = useState(0);

  useEffect(() => {
    const sid = activeLandmark.id;
    const keys: Array<{ key: string; url: string }> = [
      { key: `${sid}_HIRISE_GRAY`, url: `/cesium-mars/assets/site_${sid}_hirise.jpg?v=3` },
      { key: `${sid}_VIKING_COLOR`, url: `/cesium-mars/assets/site_${sid}_color.jpg?v=3` },
    ];
    for (const { key, url } of keys) {
      if (loadedImagesRef.current[key]) continue;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        loadedImagesRef.current[key] = img;
        setTextureVersion((v) => v + 1);
      };
      img.src = url;
    }
  }, [activeLandmark.id]);

  // Camera & telemetry state matching the reference screenshot
  const [camTiltDeg, setCamTiltDeg] = useState(40);
  const [camHeadingDeg, setCamHeadingDeg] = useState(0);
  const [camDistKm, setCamDistKm] = useState(4.59);
  const [cursorTelemetry, setCursorTelemetry] = useState<{
    lat: number;
    lon: number;
    elevAstroM: number;
    demElevM: number;
    slopeDeg: number;
  }>({
    lat: 18.4871,
    lon: 77.3153,
    elevAstroM: 1912,
    demElevM: -2399,
    slopeDeg: 21.0,
  });

  // Update telemetry bar whenever the active site changes
  useEffect(() => {
    const midSample = sampleExactSiteSurface(0.45, 0.35, siteGrid, siteElevStats);
    setCursorTelemetry({
      lat: Number(siteTarget.coordinates.latitude.toFixed(4)),
      lon: Number(siteTarget.coordinates.longitude.toFixed(4)),
      elevAstroM: Math.round(Math.abs(siteTarget.coordinates.elevation_m - siteElevStats.minElev) + 1650),
      demElevM: midSample.elevM,
      slopeDeg: midSample.slopeDeg,
    });
  }, [siteGrid, siteElevStats, siteTarget]);

  // Interactive 3D Measurement tool ("Medir")
  const [measureMode, setMeasureMode] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<MeasurePoint[]>([]);

  // First-person 360° pose when Pegman ("🧍") is active
  const [fpPose, setFpPose] = useState<{ u: number; v: number; yawDeg: number; pitchDeg: number; eyeM: number }>({
    u: 0.56,
    v: 0.42,
    yawDeg: 310,
    pitchDeg: -4,
    eyeM: 1.8,
  });

  // Projected 2D screen pins
  const [overlayPins, setOverlayPins] = useState<ProjectedOverlayPin[]>([]);

  // Playback timer for bottom-left "Ruta B" player
  useEffect(() => {
    if (!twinPlaying) return;
    const timer = setInterval(() => {
      const cur = useMissionStore.getState().twinProgress;
      const next = cur + 0.01;
      if (next >= 1) {
        setTwinProgress(0);
      } else {
        setTwinProgress(next);
      }
    }, 110);
    return () => clearInterval(timer);
  }, [twinPlaying, setTwinProgress]);

  const currentWp = useMemo(() => {
    const wps = activeSiteRoute.waypoints;
    if (!wps.length) return null;
    const idx = clamp(Math.round(twinProgress * (wps.length - 1)), 0, wps.length - 1);
    return wps[idx];
  }, [activeSiteRoute, twinProgress]);

  const o2DisplayPct = currentWp ? Math.round(currentWp.remainingO2Percent) : 100;
  const bingoDisplayPct = currentWp
    ? Math.max(50, Math.round(100 - currentWp.returnO2RequiredPercent))
    : 80;
  const linkOk = currentWp ? currentWp.hasCommLoS : true;

  // Search results for top-left "Buscar en Marte: Olympus Mons, Jezero, 18.4, 77."
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const items = [
      ...SCIENTIFIC_TARGETS.map((t) => ({
        id: t.target_id,
        title: `${t.target_id} — ${t.title_es}`,
        subtitle: `${t.coordinates.latitude.toFixed(2)}° N, ${t.coordinates.longitude.toFixed(2)}° E · ${t.rover_mission}`,
        type: "TARGET" as const,
        landmarkId: t.region_id,
        targetId: t.target_id,
        lat: t.coordinates.latitude,
        lon: t.coordinates.longitude,
      })),
      ...GLOBAL_MARS_LANDMARKS.map((l) => ({
        id: l.id,
        title: l.name,
        subtitle: `${l.lat.toFixed(2)}°, ${l.lon.toFixed(2)}° E · Elev ${l.elevation_m} m · ${l.resolution_summary}`,
        type: "LANDMARK" as const,
        landmarkId: l.id,
        targetId: l.target_id,
        lat: l.lat,
        lon: l.lon,
      })),
    ];
    if (!q) return items.slice(0, 13);
    return items.filter(
      (it) =>
        it.title.toLowerCase().includes(q) ||
        it.subtitle.toLowerCase().includes(q) ||
        it.id.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const handleSelectSite = useCallback(
    (landmarkId: string, targetId?: string) => {
      selectLandmark(landmarkId, "TERRAIN_3D");
      if (targetId && (landmarkId === "JEZERO_CRATER" || landmarkId === "GALE_MOUNT_SHARP")) {
        selectTarget(targetId);
      } else if (landmarkId === "JEZERO_CRATER") {
        selectTarget("JEZERO-CHEYAVA-2024");
      } else if (landmarkId === "GALE_MOUNT_SHARP") {
        selectTarget("GALE-BOXWORK-2025");
      }
      setMeasurePoints([]);
      if (viewMode === "GLOBE_3D") {
        setViewMode("SITE_3D");
      }
    },
    [selectLandmark, selectTarget, viewMode]
  );

  const handleSearchSelect = (item: (typeof searchResults)[number]) => {
    handleSelectSite(item.landmarkId, item.targetId);
    setSearchFocused(false);
    setSearchQuery("");
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchResults.length > 0) {
      handleSearchSelect(searchResults[0]);
      return;
    }
    const parts = searchQuery.split(",").map((s) => parseFloat(s.trim()));
    if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
      let bestLm = GLOBAL_MARS_LANDMARKS[0];
      let bestD = Infinity;
      for (const lm of GLOBAL_MARS_LANDMARKS) {
        const d = Math.hypot(lm.lat - parts[0], lm.lon - parts[1]);
        if (d < bestD) {
          bestD = d;
          bestLm = lm;
        }
      }
      handleSelectSite(bestLm.id, bestLm.target_id);
      setSearchFocused(false);
    }
  };

  const mountRef = useRef<HTMLDivElement>(null);
  const cameraActionsRef = useRef<{
    resetHome?: () => void;
    zoomBy?: (factor: number) => void;
    orbitBy?: (dAzimuthDeg: number, dTiltDeg: number) => void;
    panBy?: (dx: number, dz: number) => void;
    resetNorth?: () => void;
  }>({});

  // Build 1024x1024 ortho-texture from the pre-rendered GDAL/HiRISE/Viking JPG + active scientific layer overlays
  const buildTerrainCanvasTexture = useCallback(() => {
    const size = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return new THREE.CanvasTexture(canvas);

    const sid = activeLandmark.id;
    const preloadedImg =
      basemapStyle === "VIKING_COLOR"
        ? loadedImagesRef.current[`${sid}_VIKING_COLOR`]
        : basemapStyle === "HIRISE_GRAY"
        ? loadedImagesRef.current[`${sid}_HIRISE_GRAY`]
        : undefined;

    const activeSciLayers = TWENTY_MARS_LAYERS.filter(
      (l) => l.id !== "OPTICAL" && l.id !== "TOPOGRAPHY" && layers[l.id]?.visible
    );

    const needPixelPass =
      !preloadedImg ||
      basemapStyle === "MOLA_SHADE" ||
      activeSciLayers.length > 0 ||
      splitCompareEnabled ||
      Math.abs(sunAzimuthDeg - 315) > 3;

    if (preloadedImg) {
      ctx.drawImage(preloadedImg, 0, 0, size, size);
    }

    if (needPixelPass) {
      const img = ctx.getImageData(0, 0, size, size);
      const data = img.data;

      const sunRad = (sunAzimuthDeg * Math.PI) / 180;
      const sunX = Math.cos(sunRad) * 0.78;
      const sunY = Math.sin(sunRad) * 0.78;
      const sunZ = 0.62;

      for (let py = 0; py < size; py++) {
        const v = py / (size - 1);
        const gy = clamp(Math.round((1 - v) * (siteGrid.ny - 1)), 0, siteGrid.ny - 1);
        const gyN = Math.min(siteGrid.ny - 1, gy + 1);
        const gyS = Math.max(0, gy - 1);

        for (let px = 0; px < size; px++) {
          const u = px / (size - 1);
          const gx = clamp(Math.round(u * (siteGrid.nx - 1)), 0, siteGrid.nx - 1);
          const gxE = Math.min(siteGrid.nx - 1, gx + 1);
          const gxW = Math.max(0, gx - 1);

          const p = (py * size + px) * 4;
          let r = data[p];
          let g = data[p + 1];
          let b = data[p + 2];

          const dzdx =
            ((siteGrid.elevationM[gy]?.[gxE] ?? 0) - (siteGrid.elevationM[gy]?.[gxW] ?? 0)) /
            (2 * siteGrid.cellSizeM);
          const dzdy =
            ((siteGrid.elevationM[gyS]?.[gx] ?? 0) - (siteGrid.elevationM[gyN]?.[gx] ?? 0)) /
            (2 * siteGrid.cellSizeM);
          const invLen = 1 / Math.hypot(dzdx * 3.2, dzdy * 3.2, 1);
          const shade = clamp(
            (-dzdx * 3.2 * sunX - dzdy * 3.2 * sunY + sunZ) * invLen,
            0.22,
            1.15
          );

          if (!preloadedImg || basemapStyle === "MOLA_SHADE") {
            const elevM = siteGrid.elevationM[gy]?.[gx] ?? activeLandmark.elevation_m;
            const elevNorm = clamp((elevM - siteElevStats.minElev) / siteElevStats.spanElev, 0, 1);
            if (basemapStyle === "MOLA_SHADE") {
              r = clamp((65 + elevNorm * 185) * shade, 20, 252);
              g = clamp((135 + (1 - Math.abs(elevNorm - 0.5) * 1.9) * 105) * shade, 20, 248);
              b = clamp((230 - elevNorm * 185) * shade, 20, 248);
            } else {
              const baseG = clamp((105 + elevNorm * 65) * shade, 24, 242);
              r = baseG;
              g = baseG;
              b = baseG;
            }
          } else if (Math.abs(sunAzimuthDeg - 315) > 3) {
            const relight = clamp(0.68 + shade * 0.48, 0.45, 1.35);
            r = clamp(r * relight, 16, 250);
            g = clamp(g * relight, 16, 250);
            b = clamp(b * relight, 16, 250);
          }

          // Blend active scientific/EVA layers or Split-Screen comparison
          const inSplitRight = splitCompareEnabled && u * 100 > splitSwipePercent;
          if (inSplitRight) {
            const slopeVal = clamp((siteGrid.slopeDeg[gy]?.[gx] ?? 10) / 28, 0, 1);
            r = clamp(r * 0.45 + slopeVal * 245, 0, 255);
            g = clamp(g * 0.45 + (1 - slopeVal) * 180, 0, 255);
            b = clamp(b * 0.45 + 90, 0, 255);
          } else if (activeSciLayers.length > 0) {
            for (const layer of activeSciLayers) {
              const op = ((layers[layer.id]?.opacity ?? 60) / 100) * 0.45;
              if (layer.id === "SLOPE" || layer.id === "SLIP_HAZARD") {
                const s = clamp((siteGrid.slopeDeg[gy]?.[gx] ?? 8) / 25, 0, 1);
                r = r * (1 - op) + 255 * s * op;
                g = g * (1 - op) + 180 * (1 - s) * op;
              } else if (layer.id === "ASTROBIOLOGY" || layer.id === "MINERALOGY") {
                const m = siteGrid.mineralIndex[gy]?.[gx] ?? 0.5;
                if (m > 0.48) {
                  r = r * (1 - op) + 16 * op;
                  g = g * (1 - op) + 235 * op;
                  b = b * (1 - op) + 195 * op;
                }
              } else if (layer.id === "SAND_TRAPS") {
                const st = siteGrid.sandTrap[gy]?.[gx] ?? 0.2;
                if (st > 0.42) {
                  r = r * (1 - op) + 245 * op;
                  g = g * (1 - op) + 158 * op;
                  b = b * (1 - op) + 11 * op;
                }
              } else if (layer.id === "VIEWSHED_LOS") {
                const los = siteGrid.viewshedLoS[gy]?.[gx] ?? 1;
                if (los === 0) {
                  r = r * (1 - op) + 168 * op;
                  g = g * (1 - op) + 85 * op;
                  b = b * (1 - op) + 247 * op;
                }
              }
            }
          }

          data[p] = r;
          data[p + 1] = g;
          data[p + 2] = b;
          data[p + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    if (splitCompareEnabled) {
      const sx = Math.round((splitSwipePercent / 100) * size);
      ctx.strokeStyle = "#c084fc";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, size);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }, [
    activeLandmark.elevation_m,
    activeLandmark.id,
    basemapStyle,
    layers,
    siteElevStats,
    siteGrid,
    splitCompareEnabled,
    splitSwipePercent,
    sunAzimuthDeg,
    textureVersion,
  ]);

  // Main Three.js WebGL Engine (Exact 3D Site Terrain + Real Routes/Shelters + 360° 1st-Person + Planetary Globe)
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 1280;
    const height = container.clientHeight || 760;

    const scene = new THREE.Scene();
    const dustTau = weatherInputs.opticalDepthTau;
    const skyBg =
      viewMode === "GLOBE_3D"
        ? new THREE.Color(0x05070c)
        : dustTau > 1.5
        ? new THREE.Color(0x3a2519)
        : basemapStyle === "HIRISE_GRAY" && viewMode === "SITE_3D"
        ? new THREE.Color(0x14171f)
        : new THREE.Color(0x1c1411);
    scene.background = skyBg;
    if (viewMode !== "GLOBE_3D") {
      scene.fog = new THREE.FogExp2(skyBg.getHex(), viewMode === "FIRST_PERSON_3D" ? 0.018 : 0.0075);
    }

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.08, 400);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    const ambient = new THREE.AmbientLight(0xffffff, 1.55);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xfff7ed, 0.38);
    dirLight.position.set(-18, 28, -14);
    scene.add(dirLight);

    const PLANE_SIZE = 46;
    const SEGMENTS = 192;

    let terrainMesh: THREE.Mesh | null = null;
    const measureGroup = new THREE.Group();
    scene.add(measureGroup);

    const surfaceHeightAtUV = (u: number, v: number) => {
      const sample = sampleExactSiteSurface(u, v, siteGrid, siteElevStats);
      return sample.heightWorld * reliefExaggeration;
    };

    const uvToWorld = (u: number, v: number, extraY = 0.05) => {
      const x = (u - 0.5) * PLANE_SIZE;
      const z = (v - 0.5) * PLANE_SIZE;
      const y = surfaceHeightAtUV(u, v) + extraY;
      return new THREE.Vector3(x, y, z);
    };

    const worldToUV = (pt: THREE.Vector3) => ({
      u: clamp(pt.x / PLANE_SIZE + 0.5, 0, 1),
      v: clamp(pt.z / PLANE_SIZE + 0.5, 0, 1),
    });

    const gridToUV = (gx: number, gy: number): [number, number] => [
      clamp(gx / Math.max(1, siteGrid.nx - 1), 0.02, 0.98),
      clamp(1 - gy / Math.max(1, siteGrid.ny - 1), 0.02, 0.98),
    ];

    // Convert computed A* / Dijkstra routes (`siteRoutes`) for the active site into surface UV paths
    const [routeA, routeB, routeC] = siteRoutes;
    const rawRouteAUVs = routeA.waypoints.map((wp) => gridToUV(wp.gx, wp.gy));
    const rawRouteBUVs = routeB.waypoints.map((wp) => gridToUV(wp.gx, wp.gy));
    const rawRouteCUVs = routeC.waypoints.map((wp) => gridToUV(wp.gx, wp.gy));

    const routeAUVs = smoothUVPolyline(rawRouteAUVs, 2);
    const routeBUVs = smoothUVPolyline(rawRouteBUVs, 2);
    const routeCUVs = smoothUVPolyline(rawRouteCUVs, 2);

    // Also build a secondary geological scarp/perimeter contour branch (blue cased line on left flank)
    // traced from the site's actual DEM toward the target pin
    const targetUVPos = gridToUV(siteTarget.grid_pos.x, siteTarget.grid_pos.y);
    const flankRawUVs: Array<[number, number]> = [];
    const stepsFlank = 10;
    for (let i = 0; i <= stepsFlank; i++) {
      const t = i / stepsFlank;
      const uBase = 0.03 + (targetUVPos[0] - 0.03) * t;
      const vStart = clamp(targetUVPos[1] + 0.52, 0.15, 0.92);
      const vDirect = vStart + (targetUVPos[1] - vStart) * t;
      // Nudge along local slope/scarp gradient on the real DEM
      let bestV = vDirect;
      let bestSlope = -1;
      for (let dv = -0.08; dv <= 0.08; dv += 0.02) {
        const candV = clamp(vDirect + dv * (1 - t), 0.04, 0.95);
        const s = sampleExactSiteSurface(uBase, candV, siteGrid, siteElevStats).slopeDeg;
        if (s > bestSlope) {
          bestSlope = s;
          bestV = candV;
        }
      }
      flankRawUVs.push([uBase, bestV]);
    }
    const routeCFlankUVs = smoothUVPolyline(flankRawUVs, 2);

    // Purple Dashed LoS / Rover Relay path from initial traverse to midpoint
    const purpleRawUVs = rawRouteBUVs.filter((_, idx) => idx % 3 === 0).slice(0, 7);
    const purpleDashedUVs = smoothUVPolyline(
      purpleRawUVs.length >= 2
        ? purpleRawUVs.map(([u, v]) => [clamp(u - 0.018, 0.02, 0.98), clamp(v + 0.015, 0.02, 0.98)])
        : [
            gridToUV(siteGrid.baseGrid[0], siteGrid.baseGrid[1]),
            targetUVPos,
          ],
      1
    );

    // Compute exact surface positions for Target Star Pin, Cyan Shield Shelters, Pink Science Outcrops, and Yellow Rover
    const shelter1 = siteShelters[0];
    const shelter2 = siteShelters[1];
    const shelter1UV = shelter1
      ? gridToUV(shelter1.gx, shelter1.gy)
      : ([
          clamp(targetUVPos[0] * 0.72 + 0.28 * 0.8, 0.08, 0.92),
          clamp(targetUVPos[1] * 0.72 + 0.28 * 0.8, 0.08, 0.92),
        ] as [number, number]);
    const shelter2UV = shelter2
      ? gridToUV(shelter2.gx, shelter2.gy)
      : ([
          clamp(targetUVPos[0] * 0.45 + 0.55 * 0.8, 0.08, 0.92),
          clamp(targetUVPos[1] * 0.45 + 0.55 * 0.8, 0.08, 0.92),
        ] as [number, number]);

    // Pink science outcrop waypoints along Route C & Route B
    const midIdxC = Math.floor(routeC.waypoints.length * 0.52);
    const earlyIdxB = Math.floor(routeB.waypoints.length * 0.22);
    const wpPink1 = routeC.waypoints[midIdxC] ?? routeB.waypoints[midIdxC];
    const wpPink2 = routeB.waypoints[earlyIdxB];
    const pink1UV = wpPink1 ? gridToUV(wpPink1.gx, wpPink1.gy) : ([0.5, 0.45] as [number, number]);
    const pink2UV = wpPink2 ? gridToUV(wpPink2.gx, wpPink2.gy) : ([0.78, 0.68] as [number, number]);

    // Yellow Rover Scout marker near early segment of Route B
    const roverIdx = Math.floor(routeB.waypoints.length * 0.16);
    const wpRover = routeB.waypoints[roverIdx];
    const roverYellowUV: [number, number] = wpRover
      ? [
          clamp(gridToUV(wpRover.gx, wpRover.gy)[0] - 0.015, 0.04, 0.96),
          clamp(gridToUV(wpRover.gx, wpRover.gy)[1] + 0.025, 0.04, 0.96),
        ]
      : [0.8, 0.72];

    const subdivideUVPath = (pts: Array<[number, number]>, stepsPerSeg = 5) => {
      if (pts.length === 0) return [];
      const out: THREE.Vector3[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const [u0, v0] = pts[i];
        const [u1, v1] = pts[i + 1];
        for (let s = 0; s < stepsPerSeg; s++) {
          const t = s / stepsPerSeg;
          const u = u0 + (u1 - u0) * t;
          const v = v0 + (v1 - v0) * t;
          out.push(uvToWorld(u, v, 0.055));
        }
      }
      const last = pts[pts.length - 1];
      out.push(uvToWorld(last[0], last[1], 0.055));
      return out;
    };

    const drawCasedRibbon = (
      uvPts: Array<[number, number]>,
      innerHex: number,
      outerHex: number,
      innerRadius = 0.058,
      outerRadius = 0.095
    ) => {
      if (uvPts.length < 2) return [];
      const pts = subdivideUVPath(uvPts, 5).map((p) => {
        p.y += 0.04;
        return p;
      });
      if (pts.length < 2) return [];

      const segCount = Math.min(360, pts.length * 2);
      const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.15);

      const outerGeo = new THREE.TubeGeometry(curve, segCount, outerRadius, 6, false);
      const outerMat = new THREE.MeshBasicMaterial({
        color: outerHex,
        toneMapped: false,
        depthTest: true,
        depthWrite: false,
      });
      const outerMesh = new THREE.Mesh(outerGeo, outerMat);
      outerMesh.renderOrder = 1;
      scene.add(outerMesh);

      const innerGeo = new THREE.TubeGeometry(curve, segCount, innerRadius, 6, false);
      const innerMat = new THREE.MeshBasicMaterial({
        color: innerHex,
        toneMapped: false,
        depthTest: true,
        depthWrite: false,
      });
      const innerMesh = new THREE.Mesh(innerGeo, innerMat);
      innerMesh.renderOrder = 2;
      scene.add(innerMesh);

      return pts;
    };

    const drawDashedSurfaceLine = (
      uvPts: Array<[number, number]>,
      colorHex: number,
      dashSize = 0.38,
      gapSize = 0.26
    ) => {
      if (uvPts.length < 2) return;
      const pts = subdivideUVPath(uvPts, 5).map((p) => {
        p.y += 0.065;
        return p;
      });
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineDashedMaterial({
        color: colorHex,
        dashSize,
        gapSize,
        toneMapped: false,
      });
      const line = new THREE.Line(geo, mat);
      line.computeLineDistances();
      scene.add(line);
    };

    let activeRouteWorldPts: THREE.Vector3[] = [];

    if (viewMode === "GLOBE_3D") {
      const R = 10;
      const sphereGeo = new THREE.SphereGeometry(R, 96, 72);
      const loader = new THREE.TextureLoader();
      const texUrl =
        basemapStyle === "MOLA_SHADE"
          ? "/gis/textures/mars_global_mola_color.jpg"
          : "/gis/textures/mars_global_viking_color.jpg";
      const globeTex = loader.load(texUrl);
      globeTex.colorSpace = THREE.SRGBColorSpace;

      const sphereMat = new THREE.MeshStandardMaterial({
        map: globeTex,
        roughness: 0.88,
        metalness: 0.04,
      });
      terrainMesh = new THREE.Mesh(sphereGeo, sphereMat);
      scene.add(terrainMesh);

      const latRad = (activeLandmark.lat * Math.PI) / 180;
      const lonRad = ((activeLandmark.lon + 180) * Math.PI) / 180;
      const dir = new THREE.Vector3(
        -Math.cos(latRad) * Math.cos(lonRad),
        Math.sin(latRad),
        Math.cos(latRad) * Math.sin(lonRad)
      );
      camera.position.copy(dir.multiplyScalar(22));
      controls.target.set(0, 0, 0);
      controls.minDistance = 10.6;
      controls.maxDistance = 42;
      controls.update();
    } else {
      // Displace the 192x192 3D Terrain Mesh using the active site's EXACT GDAL/PyQGIS/Blender DEM
      const geo = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE, SEGMENTS, SEGMENTS);
      geo.rotateX(-Math.PI / 2);
      const posAttr = geo.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const z = posAttr.getZ(i);
        const u = clamp(x / PLANE_SIZE + 0.5, 0, 1);
        const v = clamp(z / PLANE_SIZE + 0.5, 0, 1);
        const y = surfaceHeightAtUV(u, v);
        posAttr.setY(i, y);
      }
      geo.computeVertexNormals();

      const surfTex = buildTerrainCanvasTexture();
      const mat = new THREE.MeshStandardMaterial({
        map: surfTex,
        roughness: 0.94,
        metalness: 0.02,
      });
      terrainMesh = new THREE.Mesh(geo, mat);
      scene.add(terrainMesh);

      // Draw real per-site Cased & Dashed Routes clamped to the 3D surface
      drawCasedRibbon(routeCFlankUVs, 0x0ea5e9, 0x082f49, 0.068, 0.11);
      const ptsC = drawCasedRibbon(routeCUVs, 0x0ea5e9, 0x082f49, 0.068, 0.11);
      const ptsB = drawCasedRibbon(routeBUVs, 0x22c55e, 0x052e16, 0.066, 0.104);
      drawDashedSurfaceLine(routeAUVs, 0xef4444, 0.36, 0.28);
      drawDashedSurfaceLine(purpleDashedUVs, 0xa855f7, 0.3, 0.25);

      activeRouteWorldPts =
        selectedRouteId === "ROUTE_C"
          ? ptsC
          : selectedRouteId === "ROUTE_A"
          ? subdivideUVPath(routeAUVs, 4)
          : ptsB;

      const focusU = clamp(targetUVPos[0] * 0.72 + 0.28 * 0.46, 0.26, 0.58);
      const focusV = clamp(targetUVPos[1] * 0.52 + 0.48 * 0.56, 0.36, 0.52);
      const focusX = (focusU - 0.5) * PLANE_SIZE;
      const focusZ = (focusV - 0.5) * PLANE_SIZE;
      const focusY = surfaceHeightAtUV(focusU, focusV);

      if (viewMode === "SITE_3D") {
        controls.target.set(focusX, focusY, focusZ);
        const tiltRad = (40 * Math.PI) / 180;
        const dist = 24.5;
        camera.position.set(
          controls.target.x,
          controls.target.y + Math.cos(tiltRad) * dist,
          controls.target.z + Math.sin(tiltRad) * dist
        );
        controls.minDistance = 4.2;
        controls.maxDistance = 42;
        controls.maxPolarAngle = (78 * Math.PI) / 180;
        controls.update();
      } else {
        controls.enabled = false;
      }
    }

    // Rebuild 3D measurement line if measurePoints exist
    if (measurePoints.length > 0 && viewMode !== "GLOBE_3D") {
      const mPts = measurePoints.map((m) => m.world.clone().add(new THREE.Vector3(0, 0.08, 0)));
      if (mPts.length >= 2) {
        const lGeo = new THREE.BufferGeometry().setFromPoints(mPts);
        const lMat = new THREE.LineBasicMaterial({ color: 0xfacc15 });
        measureGroup.add(new THREE.Line(lGeo, lMat));
      }
      for (const mp of measurePoints) {
        const sph = new THREE.Mesh(
          new THREE.SphereGeometry(0.14, 14, 14),
          new THREE.MeshBasicMaterial({ color: 0xfacc15 })
        );
        sph.position.copy(mp.world).add(new THREE.Vector3(0, 0.08, 0));
        measureGroup.add(sph);
      }
    }

    cameraActionsRef.current = {
      resetHome: () => {
        if (viewMode === "GLOBE_3D") return;
        setViewMode("SITE_3D");
        const fU = clamp(targetUVPos[0] * 0.72 + 0.28 * 0.46, 0.26, 0.58);
        const fV = clamp(targetUVPos[1] * 0.52 + 0.48 * 0.56, 0.36, 0.52);
        controls.target.set((fU - 0.5) * PLANE_SIZE, surfaceHeightAtUV(fU, fV), (fV - 0.5) * PLANE_SIZE);
        const tiltRad = (40 * Math.PI) / 180;
        const dist = 24.5;
        camera.position.set(
          controls.target.x,
          controls.target.y + Math.cos(tiltRad) * dist,
          controls.target.z + Math.sin(tiltRad) * dist
        );
        controls.update();
      },
      zoomBy: (factor: number) => {
        const offset = camera.position.clone().sub(controls.target);
        offset.multiplyScalar(factor);
        const len = clamp(offset.length(), controls.minDistance, controls.maxDistance);
        offset.setLength(len);
        camera.position.copy(controls.target).add(offset);
        controls.update();
      },
      orbitBy: (dAzimuthDeg: number, dTiltDeg: number) => {
        const offset = camera.position.clone().sub(controls.target);
        const sph = new THREE.Spherical().setFromVector3(offset);
        sph.theta += (dAzimuthDeg * Math.PI) / 180;
        sph.phi = clamp(sph.phi + (dTiltDeg * Math.PI) / 180, 0.08, (76 * Math.PI) / 180);
        offset.setFromSpherical(sph);
        camera.position.copy(controls.target).add(offset);
        controls.update();
      },
      panBy: (dx: number, dz: number) => {
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
        const delta = right.multiplyScalar(dx).add(forward.multiplyScalar(dz));
        controls.target.add(delta);
        camera.position.add(delta);
        controls.update();
      },
      resetNorth: () => {
        const offset = camera.position.clone().sub(controls.target);
        const sph = new THREE.Spherical().setFromVector3(offset);
        sph.theta = 0;
        offset.setFromSpherical(sph);
        camera.position.copy(controls.target).add(offset);
        controls.update();
      },
    };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downXY = { x: 0, y: 0 };
    let fpDragging = false;

    const onPointerDown = (e: PointerEvent) => {
      downXY = { x: e.clientX, y: e.clientY };
      if (viewMode === "FIRST_PERSON_3D") {
        fpDragging = true;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (viewMode === "FIRST_PERSON_3D" && fpDragging) {
        const dx = e.clientX - downXY.x;
        const dy = e.clientY - downXY.y;
        downXY = { x: e.clientX, y: e.clientY };
        setFpPose((p) => ({
          ...p,
          yawDeg: (p.yawDeg - dx * 0.25 + 360) % 360,
          pitchDeg: clamp(p.pitchDeg - dy * 0.2, -55, 45),
        }));
        return;
      }

      if (!terrainMesh || viewMode === "GLOBE_3D") return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(terrainMesh, false);
      if (hits.length > 0) {
        const pt = hits[0].point;
        const { u, v } = worldToUV(pt);
        const gx = u * (siteGrid.nx - 1);
        const gy = (1 - v) * (siteGrid.ny - 1);
        const ll = gridToLonLat(gx, gy, siteGrid);
        const sample = sampleExactSiteSurface(u, v, siteGrid, siteElevStats);
        setCursorTelemetry({
          lat: Number(ll.lat.toFixed(4)),
          lon: Number(ll.lon.toFixed(4)),
          elevAstroM: Math.round(Math.abs(sample.elevM - siteElevStats.minElev) + 1650),
          demElevM: sample.elevM,
          slopeDeg: sample.slopeDeg,
        });
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      fpDragging = false;
      const moved = Math.hypot(e.clientX - downXY.x, e.clientY - downXY.y);
      if (moved > 5 || !terrainMesh || viewMode === "GLOBE_3D") return;

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(terrainMesh, false);
      if (hits.length === 0) return;

      const pt = hits[0].point;
      const { u, v } = worldToUV(pt);
      const ll = gridToLonLat(u * (siteGrid.nx - 1), (1 - v) * (siteGrid.ny - 1), siteGrid);
      const sample = sampleExactSiteSurface(u, v, siteGrid, siteElevStats);

      if (measureMode) {
        setMeasurePoints((prev) =>
          prev.length >= 2
            ? [{ world: pt.clone(), lat: ll.lat, lon: ll.lon, elevM: sample.elevM, slopeDeg: sample.slopeDeg }]
            : [...prev, { world: pt.clone(), lat: ll.lat, lon: ll.lon, elevM: sample.elevM, slopeDeg: sample.slopeDeg }]
        );
      } else if (viewMode === "FIRST_PERSON_3D") {
        setFpPose((p) => ({ ...p, u, v }));
      }
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    let animId = 0;
    let frame = 0;

    const projectWorldToScreen = (worldPos: THREE.Vector3, w: number, h: number) => {
      const p = worldPos.clone().project(camera);
      return {
        x: (p.x * 0.5 + 0.5) * w,
        y: (-p.y * 0.5 + 0.5) * h,
        visible: p.z < 1 && p.x >= -1.05 && p.x <= 1.05 && p.y >= -1.05 && p.y <= 1.05,
      };
    };

    const animate = () => {
      animId = requestAnimationFrame(animate);
      frame++;

      if (viewMode === "FIRST_PERSON_3D") {
        const basePos = uvToWorld(fpPose.u, fpPose.v, fpPose.eyeM * 0.08);
        camera.position.copy(basePos);
        const yawRad = (fpPose.yawDeg * Math.PI) / 180;
        const pitchRad = (fpPose.pitchDeg * Math.PI) / 180;
        const lookDir = new THREE.Vector3(
          Math.sin(yawRad) * Math.cos(pitchRad),
          Math.sin(pitchRad),
          -Math.cos(yawRad) * Math.cos(pitchRad)
        );
        camera.lookAt(basePos.clone().add(lookDir));
      } else {
        controls.update();
      }

      renderer.render(scene, camera);

      if (frame % 3 === 0) {
        const w = renderer.domElement.clientWidth || width;
        const h = renderer.domElement.clientHeight || height;

        if (viewMode === "SITE_3D") {
          const offset = camera.position.clone().sub(controls.target);
          const sph = new THREE.Spherical().setFromVector3(offset);
          const tilt = Math.round((sph.phi * 180) / Math.PI);
          const heading = Math.round(((-sph.theta * 180) / Math.PI + 360) % 360);
          const distKm = Number(((offset.length() / 24.5) * 4.59).toFixed(2));
          setCamTiltDeg(tilt);
          setCamHeadingDeg(heading);
          setCamDistKm(distKm);
        } else if (viewMode === "FIRST_PERSON_3D") {
          setCamTiltDeg(Math.round(90 + fpPose.pitchDeg));
          setCamHeadingDeg(Math.round(fpPose.yawDeg));
          setCamDistKm(Number((fpPose.eyeM / 1000).toFixed(3)));
        }

        if (viewMode !== "GLOBE_3D") {
          const tWorld = uvToWorld(targetUVPos[0], targetUVPos[1], 0.14);
          const s1World = uvToWorld(shelter1UV[0], shelter1UV[1], 0.11);
          const s2World = uvToWorld(shelter2UV[0], shelter2UV[1], 0.11);
          const p1World = uvToWorld(pink1UV[0], pink1UV[1], 0.09);
          const p2World = uvToWorld(pink2UV[0], pink2UV[1], 0.09);
          const ryWorld = uvToWorld(roverYellowUV[0], roverYellowUV[1], 0.09);

          const pTarget = projectWorldToScreen(tWorld, w, h);
          const pS1 = projectWorldToScreen(s1World, w, h);
          const pS2 = projectWorldToScreen(s2World, w, h);
          const pPink1 = projectWorldToScreen(p1World, w, h);
          const pPink2 = projectWorldToScreen(p2World, w, h);
          const pRover = projectWorldToScreen(ryWorld, w, h);

          const pins: ProjectedOverlayPin[] = [
            {
              id: "target-star",
              kind: "TARGET_STAR",
              label: siteTarget.target_id,
              x: pTarget.x,
              y: pTarget.y,
              visible: pTarget.visible,
              lat: siteTarget.coordinates.latitude,
              lon: siteTarget.coordinates.longitude,
              elevM: siteTarget.coordinates.elevation_m,
            },
            {
              id: "shelter-1",
              kind: "SHELTER_SHIELD",
              label: shelter1 ? `Refugio ${shelter1.id}` : "Refugio #1",
              x: pS1.x,
              y: pS1.y,
              visible: pS1.visible,
              lat: shelter1?.lat ?? siteTarget.coordinates.latitude,
              lon: shelter1?.lon ?? siteTarget.coordinates.longitude,
              elevM: shelter1?.elevationM ?? siteTarget.coordinates.elevation_m,
            },
            {
              id: "shelter-2",
              kind: "SHELTER_SHIELD",
              label: shelter2 ? `Refugio ${shelter2.id}` : "Refugio #2",
              x: pS2.x,
              y: pS2.y,
              visible: pS2.visible,
              lat: shelter2?.lat ?? siteTarget.coordinates.latitude,
              lon: shelter2?.lon ?? siteTarget.coordinates.longitude,
              elevM: shelter2?.elevationM ?? siteTarget.coordinates.elevation_m,
            },
            {
              id: "pink-1",
              kind: "WAYPOINT_PINK",
              x: pPink1.x,
              y: pPink1.y,
              visible: pPink1.visible,
              lat: wpPink1?.lat ?? siteTarget.coordinates.latitude,
              lon: wpPink1?.lon ?? siteTarget.coordinates.longitude,
              elevM: wpPink1?.elevationM ?? siteTarget.coordinates.elevation_m,
            },
            {
              id: "pink-2",
              kind: "WAYPOINT_PINK",
              x: pPink2.x,
              y: pPink2.y,
              visible: pPink2.visible,
              lat: wpPink2?.lat ?? siteTarget.coordinates.latitude,
              lon: wpPink2?.lon ?? siteTarget.coordinates.longitude,
              elevM: wpPink2?.elevationM ?? siteTarget.coordinates.elevation_m,
            },
            {
              id: "rover-yellow",
              kind: "ROVER_YELLOW",
              x: pRover.x,
              y: pRover.y,
              visible: pRover.visible,
              lat: wpRover?.lat ?? siteTarget.coordinates.latitude,
              lon: wpRover?.lon ?? siteTarget.coordinates.longitude,
              elevM: wpRover?.elevationM ?? siteTarget.coordinates.elevation_m,
            },
          ];

          if (twinProgress > 0.02 && activeRouteWorldPts.length > 2) {
            const rIdx = clamp(
              Math.round(twinProgress * (activeRouteWorldPts.length - 1)),
              0,
              activeRouteWorldPts.length - 1
            );
            const evaPt = activeRouteWorldPts[rIdx];
            const pEva = projectWorldToScreen(evaPt, w, h);
            pins.push({
              id: "eva-live",
              kind: "EVA_ASTRONAUT",
              label: "EVA-1",
              x: pEva.x,
              y: pEva.y,
              visible: pEva.visible,
              lat: siteTarget.coordinates.latitude,
              lon: siteTarget.coordinates.longitude,
              elevM: siteTarget.coordinates.elevation_m,
            });
          }

          setOverlayPins(pins);
        } else {
          setOverlayPins([]);
        }
      }
    };
    animate();

    const resizeObs = new ResizeObserver(() => {
      if (!container) return;
      const nw = container.clientWidth || width;
      const nh = container.clientHeight || height;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    });
    resizeObs.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      resizeObs.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      controls.dispose();
      renderer.dispose();
    };
  }, [
    activeLandmark,
    basemapStyle,
    buildTerrainCanvasTexture,
    fpPose.eyeM,
    fpPose.pitchDeg,
    fpPose.u,
    fpPose.v,
    fpPose.yawDeg,
    measureMode,
    measurePoints,
    reliefExaggeration,
    selectedRouteId,
    siteElevStats,
    siteGrid,
    siteRoutes,
    siteShelters,
    siteTarget,
    twinProgress,
    viewMode,
    weatherInputs.opticalDepthTau,
  ]);

  // Compute geodesic distance & slope for "Medir" tool using the site's actual cellSizeM
  const measureStats = useMemo(() => {
    if (measurePoints.length < 2) return null;
    const [a, b] = measurePoints;
    const worldDist = a.world.distanceTo(b.world);
    const metersPerWorldUnit = (siteGrid.nx * siteGrid.cellSizeM) / 46;
    const meters = Math.round(worldDist * metersPerWorldUnit);
    const dz = b.elevM - a.elevM;
    const slope = Number(((Math.atan2(Math.abs(dz), Math.max(1, meters)) * 180) / Math.PI).toFixed(1));
    return { meters, dz, slope };
  }, [measurePoints, siteGrid.cellSizeM, siteGrid.nx]);

  const scaleBarLabel = useMemo(() => {
    if (camDistKm < 1.2) return "50 m";
    if (camDistKm < 6.5) return "100 m";
    if (camDistKm < 18) return "500 m";
    return "2 km";
  }, [camDistKm]);

  const activeLayersCount = Object.values(layers).filter((l) => l.visible).length;
  const blenderSiteStats = allSitesPayload?.blender_mesh_stats?.[activeLandmark.id];

  return (
    <div className="relative w-full h-screen bg-[#0d111a] overflow-hidden select-none font-sans text-slate-100">
      {/* Main Full-Viewport 3D WebGL Canvas */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Projected 3D -> 2D Surface Markers matching the Reference Photo */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-10">
        {overlayPins.map(
          (pin) =>
            pin.visible && (
              <div
                key={pin.id}
                style={{
                  left: `${pin.x}px`,
                  top: `${pin.y}px`,
                  transform:
                    pin.kind === "TARGET_STAR" || pin.kind === "SHELTER_SHIELD"
                      ? "translate(-50%, -100%)"
                      : "translate(-50%, -50%)",
                }}
                className="absolute flex flex-col items-center"
              >
                {pin.kind === "TARGET_STAR" && (
                  <div className="flex flex-col items-center">
                    <div
                      className="mb-1 px-2 py-0.5 text-[15px] font-extrabold tracking-wide text-white whitespace-nowrap"
                      style={{
                        textShadow:
                          "0 2px 6px rgba(0,0,0,0.95), 0 0 3px rgba(0,0,0,0.95), 1px 1px 0 #000",
                      }}
                    >
                      {pin.label}
                    </div>
                    <svg width="40" height="50" viewBox="0 0 40 50" className="drop-shadow-[0_4px_8px_rgba(0,0,0,0.75)]">
                      <path
                        d="M20 2 C10 2 2 10 2 20 C2 32 20 47 20 47 C20 47 38 32 38 20 C38 10 30 2 20 2 Z"
                        fill="#ff5722"
                        stroke="#ffffff"
                        strokeWidth="2.5"
                      />
                      <polygon
                        points="20,10 22.6,15.6 28.8,16.4 24.2,20.7 25.4,26.8 20,23.8 14.6,26.8 15.8,20.7 11.2,16.4 17.4,15.6"
                        fill="#ffffff"
                      />
                    </svg>
                  </div>
                )}

                {pin.kind === "SHELTER_SHIELD" && (
                  <svg width="32" height="40" viewBox="0 0 32 40" className="drop-shadow-[0_3px_6px_rgba(0,0,0,0.7)]">
                    <path
                      d="M16 2 C8.5 2 2.5 8 2.5 15.5 C2.5 25 16 37.5 16 37.5 C16 37.5 29.5 25 29.5 15.5 C29.5 8 23.5 2 16 2 Z"
                      fill="#22d3ee"
                      stroke="#ffffff"
                      strokeWidth="2.2"
                    />
                    <path
                      d="M16 8.5 L22 11 V16.2 C22 20.2 19.4 23.4 16 24.6 C12.6 23.4 10 20.2 10 16.2 V11 L16 8.5 Z"
                      fill="#083344"
                      stroke="#ffffff"
                      strokeWidth="1.4"
                    />
                    <path d="M16 11.5 V21.5 M12.5 16 H19.5" stroke="#ffffff" strokeWidth="1.6" />
                  </svg>
                )}

                {pin.kind === "WAYPOINT_PINK" && (
                  <div className="w-4 h-4 rounded-full bg-[#ec4899] border-2 border-white shadow-[0_2px_6px_rgba(0,0,0,0.85)]" />
                )}

                {pin.kind === "ROVER_YELLOW" && (
                  <div className="w-3.5 h-3.5 rounded-full bg-[#eab308] border-2 border-white shadow-[0_2px_6px_rgba(0,0,0,0.85)]" />
                )}

                {pin.kind === "EVA_ASTRONAUT" && (
                  <div className="flex flex-col items-center">
                    <span className="px-1.5 py-0.5 rounded bg-slate-950/90 border border-hudcyan text-[10px] font-mono text-hudcyan mb-1">
                      EVA-1 ({o2DisplayPct}% O₂)
                    </span>
                    <div className="w-4 h-4 rounded-full bg-[#00f0ff] border-2 border-white shadow-[0_0_12px_#00f0ff]" />
                  </div>
                )}
              </div>
            )
        )}
      </div>

      {/* TOP BAR: Search Pill + Compact 10-Site Selector Strip (All 10 Mapped Points Visible on One Line) */}
      <div className="absolute top-2.5 left-3 right-28 z-30 flex flex-col gap-1 pointer-events-none">
        <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto">
          {/* Search Pill ("Buscar en Marte: Olympus Mons, Jezero, 18.4, 77.") */}
          <div className="relative w-[335px] max-w-full shrink-0">
            <form
              onSubmit={handleSearchSubmit}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#181e2c]/92 backdrop-blur-md border border-slate-700/75 shadow-[0_6px_18px_rgba(0,0,0,0.55)]"
            >
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onFocus={() => setSearchFocused(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchFocused(true);
                }}
                placeholder="Buscar en Marte: Olympus Mons, Jezero, 18.4, 77."
                className="w-full bg-transparent text-[12px] text-slate-100 placeholder:text-slate-400 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </form>

            {searchFocused && (
              <div className="absolute left-0 top-10 w-[370px] rounded-2xl bg-[#141925]/96 backdrop-blur-xl border border-slate-700/80 shadow-2xl overflow-hidden max-h-80 overflow-y-auto z-50">
                <div className="px-3.5 py-2 border-b border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>10 PUNTOS MAPEADOS &amp; OBJETIVOS NASA</span>
                  <button
                    onClick={() => setSearchFocused(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    Cerrar ✕
                  </button>
                </div>
                {searchResults.map((item) => (
                  <button
                    key={`${item.type}-${item.id}`}
                    type="button"
                    onClick={() => handleSearchSelect(item)}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-800/80 border-b border-slate-800/50 transition flex items-start justify-between gap-2"
                  >
                    <div>
                      <div className="text-xs font-semibold text-white">{item.title}</div>
                      <div className="text-[10px] font-mono text-slate-400">{item.subtitle}</div>
                    </div>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-hudcyan shrink-0">
                      {item.type === "TARGET" ? "ROVER TARGET" : "SITIO 3D"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {activeLandmark.id === "JEZERO_CRATER" && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#181e2c]/90 backdrop-blur-md border border-slate-700/70 text-[10px] font-mono">
              <button
                onClick={() => selectTarget("JEZERO-CHEYAVA-2024")}
                className={`px-2 py-0.5 rounded-full transition ${
                  siteTarget.target_id === "JEZERO-CHEYAVA-2024"
                    ? "bg-amber-500/25 border border-amber-400 text-amber-200 font-bold"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                Cheyava Falls
              </button>
              <button
                onClick={() => selectTarget("JEZERO-MARGIN-CARB")}
                className={`px-2 py-0.5 rounded-full transition ${
                  siteTarget.target_id === "JEZERO-MARGIN-CARB"
                    ? "bg-amber-500/25 border border-amber-400 text-amber-200 font-bold"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                Margin Carb.
              </button>
            </div>
          )}

          {/* Quick Basemap Switcher Pills */}
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#181e2c]/90 backdrop-blur-md border border-slate-700/70 text-[10px] font-mono">
            <button
              onClick={() => setBasemapStyle("HIRISE_GRAY")}
              className={`px-2 py-0.5 rounded-full transition ${
                basemapStyle === "HIRISE_GRAY"
                  ? "bg-slate-200 text-slate-950 font-bold"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              HiRISE Gris
            </button>
            <button
              onClick={() => setBasemapStyle("VIKING_COLOR")}
              className={`px-2 py-0.5 rounded-full transition ${
                basemapStyle === "VIKING_COLOR"
                  ? "bg-amber-500 text-slate-950 font-bold"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              Viking Color
            </button>
            <button
              onClick={() => setBasemapStyle("MOLA_SHADE")}
              className={`px-2 py-0.5 rounded-full transition ${
                basemapStyle === "MOLA_SHADE"
                  ? "bg-cyan-400 text-slate-950 font-bold"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              MOLA Relieve
            </button>
          </div>

          <button
            onClick={() => setLayersDrawerOpen((v) => !v)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#181e2c]/90 backdrop-blur-md border border-slate-700/70 text-[10px] font-mono text-hudcyan hover:border-hudcyan transition"
          >
            <Layers className="w-3 h-3" />
            20 Capas ({activeLayersCount})
          </button>
        </div>

        {/* 10 Mapped Mars Sites One-Click Bar (Fits All 10 Sites on One Line) */}
        <div className="flex flex-wrap items-center gap-1 px-2 py-1 rounded-full bg-[#181e2c]/90 backdrop-blur-md border border-slate-700/75 shadow-[0_6px_18px_rgba(0,0,0,0.5)] w-fit max-w-full pointer-events-auto">
          {GLOBAL_MARS_LANDMARKS.map((lm) => {
            const isActive = lm.id === activeLandmark.id;
            return (
              <button
                key={lm.id}
                onClick={() => handleSelectSite(lm.id, lm.target_id)}
                title={`${lm.name} (${lm.lat.toFixed(2)}°, ${lm.lon.toFixed(2)}° E · Elev ${lm.elevation_m} m)`}
                className={`px-2 py-0.5 rounded-full text-[10.5px] font-mono whitespace-nowrap transition ${
                  isActive
                    ? "bg-[#ff5722] text-white font-bold shadow-[0_0_8px_rgba(255,87,34,0.55)]"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {SHORT_SITE_LABELS[lm.id] ?? lm.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* RIGHT SIDE: Google Earth / Cesium Navigation HUD (Compass + 40° Tilt Pad + Zoom + Pegman/Map/Home) */}
      <div className="absolute right-4 top-20 z-30 flex flex-col items-center gap-3">
        {/* 1. Circular Compass Rose */}
        <button
          onClick={() => cameraActionsRef.current.resetNorth?.()}
          title="Restablecer Norte (0°)"
          className="relative w-20 h-20 rounded-full bg-[#181e2c]/92 backdrop-blur-md border border-slate-700/75 shadow-[0_6px_20px_rgba(0,0,0,0.6)] flex items-center justify-center group"
        >
          <div
            style={{ transform: `rotate(${-camHeadingDeg}deg)` }}
            className="absolute inset-1 rounded-full transition-transform duration-150"
          >
            <span className="absolute top-0.5 left-1/2 -translate-x-1/2 text-[11px] font-bold text-[#ff5722]">
              N
            </span>
            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-300">
              E
            </span>
            <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-slate-300">
              S
            </span>
            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-300">
              W
            </span>
          </div>
          <div className="w-10 h-10 rounded-full bg-[#0d111a] border border-slate-700/80 flex flex-col items-center justify-center">
            <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[7px] border-b-[#ff5722] mb-0.5" />
            <span className="text-[10px] font-bold text-white leading-none">N</span>
          </div>
        </button>

        {/* 2. 3D Tilt & Orbit D-Pad Card (shows "40°" in center) */}
        <div className="w-24 rounded-2xl bg-[#181e2c]/92 backdrop-blur-md border border-slate-700/75 p-2 shadow-[0_6px_20px_rgba(0,0,0,0.6)] grid grid-cols-3 gap-1 items-center justify-items-center text-slate-200">
          <button
            onClick={() => cameraActionsRef.current.orbitBy?.(-18, 0)}
            title="Girar cámara a la izquierda"
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => cameraActionsRef.current.orbitBy?.(0, -8)}
            title="Inclinar vista arriba"
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => cameraActionsRef.current.orbitBy?.(18, 0)}
            title="Girar cámara a la derecha"
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => cameraActionsRef.current.panBy?.(-1.8, 0)}
            title="Desplazar a la izquierda"
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-bold text-white font-mono">{camTiltDeg}°</span>
          <button
            onClick={() => cameraActionsRef.current.panBy?.(1.8, 0)}
            title="Desplazar a la derecha"
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => cameraActionsRef.current.panBy?.(0, 1.8)}
            title="Avanzar cámara"
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => cameraActionsRef.current.orbitBy?.(0, 8)}
            title="Inclinar hacia el horizonte"
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => cameraActionsRef.current.panBy?.(0, -1.8)}
            title="Retroceder cámara"
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 3. Zoom + / - Vertical Pill */}
        <div className="w-11 rounded-full bg-[#181e2c]/92 backdrop-blur-md border border-slate-700/75 shadow-[0_6px_20px_rgba(0,0,0,0.6)] flex flex-col items-center overflow-hidden">
          <button
            onClick={() => cameraActionsRef.current.zoomBy?.(0.75)}
            title="Acercar (+)"
            className="w-full py-2.5 flex items-center justify-center hover:bg-slate-800 text-slate-200 transition"
          >
            <Plus className="w-4 h-4" />
          </button>
          <div className="w-6 h-px bg-slate-700/80" />
          <button
            onClick={() => cameraActionsRef.current.zoomBy?.(1.32)}
            title="Alejar (−)"
            className="w-full py-2.5 flex items-center justify-center hover:bg-slate-800 text-slate-200 transition"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>

        {/* 4. Pegman (1st-Person 360°) + Map Layers Drawer + Home Vertical Pill */}
        <div className="w-11 rounded-full bg-[#181e2c]/92 backdrop-blur-md border border-slate-700/75 shadow-[0_6px_20px_rgba(0,0,0,0.6)] flex flex-col items-center overflow-hidden">
          <button
            onClick={() =>
              setViewMode((m) => (m === "FIRST_PERSON_3D" ? "SITE_3D" : "FIRST_PERSON_3D"))
            }
            title="Explorar Relieve en 1ª Persona (360° Street View)"
            className={`w-full py-2.5 flex items-center justify-center transition ${
              viewMode === "FIRST_PERSON_3D"
                ? "bg-[#ff5722] text-white"
                : "hover:bg-slate-800 text-slate-200"
            }`}
          >
            <User className="w-4 h-4" />
          </button>
          <div className="w-6 h-px bg-slate-700/80" />
          <button
            onClick={() => setLayersDrawerOpen((v) => !v)}
            title="Abrir Capas NASA/QGIS, Globo 3D y Virtudes del Proyecto"
            className={`w-full py-2.5 flex items-center justify-center transition ${
              layersDrawerOpen
                ? "bg-cyan-500/25 text-hudcyan"
                : "hover:bg-slate-800 text-slate-200"
            }`}
          >
            <MapIcon className="w-4 h-4" />
          </button>
          <div className="w-6 h-px bg-slate-700/80" />
          <button
            onClick={() => cameraActionsRef.current.resetHome?.()}
            title="Restablecer encuadre táctico 40° del punto mapeado"
            className="w-full py-2.5 flex items-center justify-center hover:bg-slate-800 text-slate-200 transition"
          >
            <Home className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Collapsible "Virtudes & 20 Capas NASA/QGIS" Drawer */}
      {layersDrawerOpen && (
        <div className="absolute top-24 left-4 z-30 w-[395px] max-w-[calc(100vw-6rem)] max-h-[calc(100vh-12rem)] overflow-y-auto rounded-2xl bg-[#141925]/95 backdrop-blur-xl border border-slate-700/80 p-4 shadow-2xl space-y-3 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#ff5722]" />
              Virtudes MARS PATHFINDER + 20 Capas NASA/QGIS
            </span>
            <button
              onClick={() => setLayersDrawerOpen(false)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Active Site GDAL + Blender 5.2 Mesh Diagnostics */}
          <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1 font-mono text-[10px]">
            <div className="text-hudcyan font-bold flex items-center justify-between">
              <span>{activeLandmark.name}</span>
              <span>96×96 GDAL + 192×192 3D</span>
            </div>
            <div className="text-slate-300">
              Rango DEM Real: <b>{Math.round(siteElevStats.minElev)} m</b> a{" "}
              <b>{Math.round(siteElevStats.maxElev)} m</b> (Δ{" "}
              <b>{Math.round(siteElevStats.spanElev)} m</b> · celda {siteGrid.cellSizeM} m)
            </div>
            {blenderSiteStats && (
              <div className="text-emerald-400">
                Blender {allSitesPayload?.blender_version || "5.2"}: {blenderSiteStats.blender_faces}{" "}
                caras · Área 3D {blenderSiteStats.surface_area_3d_km2} km²
              </div>
            )}
          </div>

          {/* 3 Modes Switcher */}
          <div>
            <div className="text-[10px] font-mono uppercase text-slate-400 mb-1">
              Modo de Cámara 3D
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => setViewMode("SITE_3D")}
                className={`px-2 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1 ${
                  viewMode === "SITE_3D"
                    ? "bg-[#ff5722]/20 border-[#ff5722] text-white"
                    : "bg-slate-900 border-slate-800 text-slate-300"
                }`}
              >
                <Mountain className="w-3.5 h-3.5" /> Sitio 3D
              </button>
              <button
                onClick={() => setViewMode("FIRST_PERSON_3D")}
                className={`px-2 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1 ${
                  viewMode === "FIRST_PERSON_3D"
                    ? "bg-amber-500/20 border-amber-400 text-amber-200"
                    : "bg-slate-900 border-slate-800 text-slate-300"
                }`}
              >
                <Eye className="w-3.5 h-3.5" /> 1ª Persona
              </button>
              <button
                onClick={() => setViewMode("GLOBE_3D")}
                className={`px-2 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1 ${
                  viewMode === "GLOBE_3D"
                    ? "bg-cyan-500/20 border-hudcyan text-hudcyan"
                    : "bg-slate-900 border-slate-800 text-slate-300"
                }`}
              >
                <Globe className="w-3.5 h-3.5" /> Globo 3D
              </button>
            </div>
          </div>

          {/* Environmental Conditions & Sliders */}
          <div className="space-y-2 pt-1 border-t border-slate-800">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span>Exageración Relieve 3D: {reliefExaggeration.toFixed(2)}×</span>
              <input
                type="range"
                min={0.6}
                max={3.0}
                step={0.1}
                value={reliefExaggeration}
                onChange={(e) => setReliefExaggeration(Number(e.target.value))}
                className="w-28 accent-[#ff5722]"
              />
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span>Azimut Solar: {sunAzimuthDeg}°</span>
              <input
                type="range"
                min={0}
                max={360}
                value={sunAzimuthDeg}
                onChange={(e) => setSunAzimuthDeg(Number(e.target.value))}
                className="w-28 accent-amber-400"
              />
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <button
                onClick={() => {
                  const cur = weatherInputs.opticalDepthTau;
                  const next = cur < 1.0 ? 1.8 : 0.45;
                  updateWeatherInputs({ opticalDepthTau: next });
                }}
                className={`flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-mono ${
                  weatherInputs.opticalDepthTau > 1.0
                    ? "bg-amber-950 border-amber-400 text-amber-200"
                    : "bg-slate-900 border-slate-700 text-slate-300"
                }`}
              >
                <Cloud className="w-3 h-3" /> Polvo τ={weatherInputs.opticalDepthTau.toFixed(1)}
              </button>
              <button
                onClick={() =>
                  triggerEmergency(
                    emergencyActive && emergencyType === "SOLAR_SPE" ? "NONE" : "SOLAR_SPE"
                  )
                }
                className={`flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-mono ${
                  emergencyActive && emergencyType === "SOLAR_SPE"
                    ? "bg-rose-950 border-rose-400 text-rose-200"
                    : "bg-slate-900 border-slate-700 text-slate-300"
                }`}
              >
                <Zap className="w-3 h-3" /> Evento SEP
              </button>
              <button
                onClick={() =>
                  updateSuitParams({ roverRelayEnabled: !suitParams.roverRelayEnabled })
                }
                className={`flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-mono ${
                  suitParams.roverRelayEnabled
                    ? "bg-cyan-950 border-hudcyan text-hudcyan"
                    : "bg-slate-900 border-slate-700 text-slate-300"
                }`}
              >
                <Radio className="w-3 h-3" /> Rover LoS {suitParams.roverRelayEnabled ? "ON" : "OFF"}
              </button>
              <button
                onClick={() => setSplitCompare(!splitCompareEnabled)}
                className={`flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-mono ${
                  splitCompareEnabled
                    ? "bg-purple-950 border-purple-400 text-purple-200"
                    : "bg-slate-900 border-slate-700 text-slate-300"
                }`}
              >
                <Columns className="w-3 h-3" /> Split-Screen
              </button>
            </div>
          </div>

          {/* 20 Cartographic Layers Quick Toggles */}
          <div className="pt-1 border-t border-slate-800">
            <div className="text-[10px] font-mono uppercase text-slate-400 mb-1.5">
              Capas Cartográficas Activas ({activeLayersCount}/20)
            </div>
            <div className="grid grid-cols-2 gap-1 max-h-44 overflow-y-auto pr-1">
              {TWENTY_MARS_LAYERS.map((layer) => {
                const vis = Boolean(layers[layer.id]?.visible);
                return (
                  <button
                    key={layer.id}
                    onClick={() => toggleLayer(layer.id)}
                    className={`text-left px-2 py-1 rounded border text-[10px] flex items-center justify-between gap-1 ${
                      vis
                        ? "bg-cyan-950/70 border-hudcyan/60 text-white"
                        : "bg-slate-900/60 border-slate-800 text-slate-400"
                    }`}
                  >
                    <span className="truncate">[{layer.code}] {layer.name_es}</span>
                    {vis && <Check className="w-3 h-3 text-hudcyan shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Interactive Measurement Banner when "Medir" is active */}
      {measureMode && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-full bg-[#181e2c]/95 backdrop-blur-md border border-yellow-400/70 shadow-2xl flex items-center gap-3 text-xs font-mono">
          <Ruler className="w-4 h-4 text-yellow-400" />
          {measureStats ? (
            <span className="text-yellow-200">
              Distancia: <b>{measureStats.meters} m</b> · ΔElev: <b>{measureStats.dz} m</b> · Pendiente:{" "}
              <b>{measureStats.slope}°</b>
            </span>
          ) : (
            <span className="text-slate-200">
              Haz clic en 2 puntos del terreno 3D para medir distancia y pendiente ({measurePoints.length}/2)
            </span>
          )}
          <button
            onClick={() => setMeasurePoints([])}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]"
          >
            Limpiar
          </button>
          <button
            onClick={() => {
              setMeasureMode(false);
              setMeasurePoints([]);
            }}
            className="text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* First-Person 360° Street View Helper Pill when active */}
      {viewMode === "FIRST_PERSON_3D" && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-full bg-[#181e2c]/95 backdrop-blur-md border border-[#ff5722]/80 shadow-2xl flex items-center gap-3 text-xs font-mono">
          <span className="text-[#ff5722] font-bold">
            1ª PERSONA 360° ({activeLandmark.name.split("(")[0].trim()})
          </span>
          <span className="text-slate-300">Arrastra para mirar · Clic en el suelo para caminar</span>
          <button
            onClick={() => setFpPose((p) => ({ ...p, eyeM: p.eyeM < 3 ? 4.5 : 1.8 }))}
            className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700"
          >
            Visor {fpPose.eyeM}m
          </button>
          <button
            onClick={() => setViewMode("SITE_3D")}
            className="px-2 py-0.5 rounded bg-[#ff5722] text-white font-bold"
          >
            Salir a Vista 3D
          </button>
        </div>
      )}

      {/* BOTTOM-LEFT: Route Player Pill ("▶ Ruta B ───●──────── O2 100% Bingo 80% LINK GO") */}
      <div className="absolute bottom-14 left-4 z-30 flex items-center gap-3 px-3 py-2 rounded-full bg-[#181e2c]/92 backdrop-blur-md border border-slate-700/75 shadow-[0_8px_24px_rgba(0,0,0,0.65)]">
        <button
          onClick={() => setTwinPlaying(!twinPlaying)}
          title={twinPlaying ? "Pausar simulación EVA" : "Simular recorrido EVA sobre el terreno 3D"}
          className="w-8 h-8 rounded-full bg-[#ff5722] hover:bg-[#f4511e] text-white flex items-center justify-center shadow-md transition shrink-0"
        >
          {twinPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>

        <button
          onClick={() => {
            const nextId =
              selectedRouteId === "ROUTE_B"
                ? "ROUTE_C"
                : selectedRouteId === "ROUTE_C"
                ? "ROUTE_A"
                : "ROUTE_B";
            selectRoute(nextId);
          }}
          title="Clic para alternar Ruta A / Ruta B / Ruta C"
          className="text-xs font-mono font-bold text-[#22c55e] hover:underline whitespace-nowrap"
        >
          {selectedRouteId === "ROUTE_A"
            ? "Ruta A"
            : selectedRouteId === "ROUTE_C"
            ? "Ruta C"
            : "Ruta B"}
        </button>

        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={twinProgress}
          onChange={(e) => setTwinProgress(Number(e.target.value))}
          aria-label="Progreso en ruta EVA"
          className="w-32 sm:w-40 accent-[#ff5722] h-1.5 bg-slate-700 rounded-lg cursor-pointer"
        />

        <div className="flex items-center gap-2.5 text-xs font-mono font-semibold pr-1">
          <span className="text-[#00f0ff]">O2 {o2DisplayPct}%</span>
          <span className="text-[#22c55e]">Bingo {bingoDisplayPct}%</span>
          <span className={linkOk ? "text-[#22c55e]" : "text-purple-400"}>
            {linkOk ? "LINK" : "NO-LOS"}
          </span>
          <span
            className={
              weather.status === "GO"
                ? "text-[#22c55e]"
                : weather.status === "CAUTION"
                ? "text-amber-400"
                : "text-red-400"
            }
          >
            {weather.status}
          </span>
        </div>
      </div>

      {/* BOTTOM-RIGHT: Measure Button ("📏 Medir") */}
      <div className="absolute bottom-14 right-4 z-30 flex items-center gap-2">
        <button
          onClick={() => {
            setMeasureMode((m) => !m);
            setMeasurePoints([]);
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-md border shadow-[0_8px_24px_rgba(0,0,0,0.65)] text-xs font-semibold transition ${
            measureMode
              ? "bg-yellow-500/25 border-yellow-400 text-yellow-200"
              : "bg-[#181e2c]/92 border-slate-700/75 text-slate-200 hover:text-white"
          }`}
        >
          <Ruler className="w-3.5 h-3.5" />
          Medir
        </button>
      </div>

      {/* BOTTOM FULL-WIDTH GOOGLE EARTH / CESIUM STATUS & PROVENANCE BAR (Strictly 2 Lines) */}
      <div className="absolute bottom-0 inset-x-0 z-30 bg-[#0d111a]/95 backdrop-blur-md border-t border-slate-800/80 px-4 py-1 flex flex-col gap-0.5 font-mono text-[11px] text-slate-300">
        <div className="flex items-center justify-between gap-2 whitespace-nowrap overflow-hidden">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-14 h-1.5 border-b border-l border-r border-slate-300" />
              <span>{scaleBarLabel}</span>
            </div>

            <span>
              {Math.abs(cursorTelemetry.lat).toFixed(4)}°{" "}
              {cursorTelemetry.lat >= 0 ? "N" : "S"}{" "}
              {Math.abs(cursorTelemetry.lon).toFixed(4)}°{" "}
              {cursorTelemetry.lon >= 0 ? "E" : "W"}
            </span>

            <span>elev {cursorTelemetry.elevAstroM} m</span>

            <span className="text-[#38bdf8] font-semibold">
              DEM 30 m: {cursorTelemetry.demElevM} m · S {cursorTelemetry.slopeDeg.toFixed(1)}°
            </span>

            <span>cámara {camDistKm.toFixed(2)} km</span>
            <span>rumbo {camHeadingDeg}°</span>
          </div>

          <span className="hidden lg:inline text-[10px] text-emerald-400">
            GDAL 3.13 + Blender 5.2 ({siteGrid.nx}×{siteGrid.ny} DEM · {activeSiteRoute.totalDistanceKm} km)
          </span>
        </div>

        <div className="text-[10px] text-slate-400 flex items-center justify-between whitespace-nowrap overflow-hidden">
          <span className="truncate pr-4">
            Imagen: NASA/JPL/USGS — Viking MDIM2.1 vía NASA Mars Trek · {activeLandmark.name} ({activeLandmark.resolution_summary})
          </span>
          <a
            href="/"
            className="text-slate-400 hover:text-hudcyan inline-flex items-center gap-1 shrink-0"
          >
            Volver a Suite Principal <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
