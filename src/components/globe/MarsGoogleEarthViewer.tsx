"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  Compass,
  Globe2,
  Mountain,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sun,
  Crosshair,
  SlidersHorizontal,
  Database,
  ExternalLink,
  RefreshCw,
  Radio,
  Shield,
  AlertTriangle,
  MapPin,
  Eye,
  Sparkles,
  Maximize2,
  Minimize2,
  Navigation,
  Footprints,
  ArrowUp,
  ArrowDown,
  RotateCw,
  Cloud,
  Zap,
  Columns,
  Target,
  Home,
} from "lucide-react";
import {
  GLOBAL_MARS_LANDMARKS,
  ORBITAL_COVERAGE_FOOTPRINTS,
  SCIENTIFIC_TARGETS,
  TWENTY_MARS_LAYERS,
  RegionId,
} from "@/lib/nasa-seed-data";
import {
  ComputedRoute,
  MARS_RADIUS_M,
  MarsTerrainGrid,
  TopographicShelter,
  clamp,
  getSyntheticTargetForLandmark,
  gridToLonLat,
} from "@/lib/mars-core";
import { GlobeBasemapKey, useMissionStore } from "@/lib/mission-store";

interface MarsGoogleEarthViewerProps {
  grid: MarsTerrainGrid;
  routes: [ComputedRoute, ComputedRoute, ComputedRoute];
  activeRoute: ComputedRoute;
  shelters: TopographicShelter[];
}

interface ProjectedPin {
  id: string;
  label: string;
  sublabel: string;
  category: string;
  x: number;
  y: number;
  visible: boolean;
  lat: number;
  lon: number;
  elevationM: number;
  regionId?: RegionId;
  targetId?: string;
  coverageClass: string;
  color: string;
}

interface InspectedCellInfo {
  gx: number;
  gy: number;
  lon: number;
  lat: number;
  elevationM: number;
  slopeDeg: number;
  roughnessM: number;
  sandTrap: number;
  slipHazard: number;
  uncertainty: number;
  hasCommLoS: boolean;
  shelterScore: number;
  o2PerM: number;
}

interface CameraHudTelemetry {
  altitudeKm: number;
  lodZ: number;
  loadedTiles: number;
  focusLat: number;
  focusLon: number;
  focusElevM: number;
  effectiveTiltDeg: number;
}

// 10.0 Three.js units = 3,396.19 km Mars radius -> 1 unit = 339.619 km
const R_GLOBE = 10.0;
const KM_PER_UNIT = MARS_RADIUS_M / 1000 / R_GLOBE; // 339.619 km / unit

function latLonToSphereVec3(latDeg: number, lonDeg: number, radius = R_GLOBE): THREE.Vector3 {
  const theta = ((90 - latDeg) * Math.PI) / 180;
  const phi = ((lonDeg + 180) * Math.PI) / 180;
  const x = -radius * Math.cos(phi) * Math.sin(theta);
  const y = radius * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  return new THREE.Vector3(x, y, z);
}

function sphereVec3ToLatLon(vec: THREE.Vector3): { lat: number; lon: number } {
  const n = vec.clone().normalize();
  const lat = 90 - (Math.acos(clamp(n.y, -1, 1)) * 180) / Math.PI;
  let phi = Math.atan2(n.z, -n.x);
  if (phi < 0) phi += Math.PI * 2;
  const lon = (phi / (Math.PI * 2)) * 360 - 180;
  return { lat: Number(lat.toFixed(3)), lon: Number(lon.toFixed(3)) };
}

function elevationToRadialOffset(elevM: number, exaggeration: number): number {
  return (elevM / MARS_RADIUS_M) * R_GLOBE * exaggeration;
}

function altitudeKmToLodZ(altKm: number): number {
  if (altKm > 5200) return 1;
  if (altKm > 2100) return 2;
  if (altKm > 850) return 3;
  if (altKm > 340) return 4;
  if (altKm > 130) return 5;
  if (altKm > 42) return 6;
  return 7;
}

function sampleMolaElevationFromBuffer(
  latDeg: number,
  lonDeg: number,
  buf: Uint8ClampedArray | null,
  w: number,
  h: number
): number {
  if (!buf || w === 0 || h === 0) return -2500;
  const wrappedLon = ((((lonDeg + 180) % 360) + 360) % 360) / 360;
  const vNorm = clamp((90 - latDeg) / 180, 0, 1);

  const fx = wrappedLon * (w - 1);
  const fy = vNorm * (h - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = (x0 + 1) % w;
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;

  const p00 = buf[(y0 * w + x0) * 4];
  const p10 = buf[(y0 * w + x1) * 4];
  const p01 = buf[(y1 * w + x0) * 4];
  const p11 = buf[(y1 * w + x1) * 4];

  const top = p00 + (p10 - p00) * tx;
  const bot = p01 + (p11 - p01) * tx;
  const val = top + (bot - top) * ty;
  return -8200 + (val / 255) * (21229 - -8200);
}

function sampleLocalGridElevation(
  latDeg: number,
  lonDeg: number,
  grid: MarsTerrainGrid
): number | null {
  const [minLon, minLat, maxLon, maxLat] = grid.boundsLonLat;
  if (lonDeg < minLon || lonDeg > maxLon || latDeg < minLat || latDeg > maxLat) {
    return null;
  }
  const fx = clamp(((lonDeg - minLon) / (maxLon - minLon)) * (grid.nx - 1), 0, grid.nx - 1);
  const fy = clamp(((latDeg - minLat) / (maxLat - minLat)) * (grid.ny - 1), 0, grid.ny - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(grid.nx - 1, x0 + 1);
  const y1 = Math.min(grid.ny - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const e00 = grid.elevationM[y0][x0];
  const e10 = grid.elevationM[y0][x1];
  const e01 = grid.elevationM[y1][x0];
  const e11 = grid.elevationM[y1][x1];
  const top = e00 + (e10 - e00) * tx;
  const bot = e01 + (e11 - e01) * tx;
  return top + (bot - top) * ty;
}

function getGridMinElevation(grid: MarsTerrainGrid): number {
  let minE = Infinity;
  for (let y = 0; y < grid.ny; y++) {
    const row = grid.elevationM[y];
    for (let x = 0; x < grid.nx; x++) {
      if (row[x] < minE) minE = row[x];
    }
  }
  return Number.isFinite(minE) ? minE : -2500;
}

function sampleAnchoredSurfaceElevation(
  latDeg: number,
  lonDeg: number,
  grid: MarsTerrainGrid,
  molaBuf: Uint8ClampedArray | null,
  molaW: number,
  molaH: number
): number {
  const molaElev = sampleMolaElevationFromBuffer(latDeg, lonDeg, molaBuf, molaW, molaH);
  const [minLon, minLat, maxLon, maxLat] = grid.boundsLonLat;
  if (lonDeg < minLon || lonDeg > maxLon || latDeg < minLat || latDeg > maxLat) {
    return molaElev;
  }
  const fx = clamp(((lonDeg - minLon) / (maxLon - minLon)) * (grid.nx - 1), 0, grid.nx - 1);
  const fy = clamp(((latDeg - minLat) / (maxLat - minLat)) * (grid.ny - 1), 0, grid.ny - 1);
  const borderDist = Math.min(fx, grid.nx - 1 - fx, fy, grid.ny - 1 - fy);
  const blendW = clamp(borderDist / 4, 0, 1);
  const localE = sampleLocalGridElevation(latDeg, lonDeg, grid) ?? molaElev;
  const minE = getGridMinElevation(grid);
  return molaElev + Math.max(0, localE - minE) * 2.4 * blendW;
}

function buildSphericalTileGeometry(
  z: number,
  tx: number,
  ty: number,
  exaggeration: number,
  molaBuf: Uint8ClampedArray | null,
  molaW: number,
  molaH: number,
  seg = 20,
  biasOverride?: number
): THREE.BufferGeometry {
  const cols = 1 << (z + 1);
  const rows = 1 << z;
  const lonMin = -180 + (tx / cols) * 360;
  const lonMax = -180 + ((tx + 1) / cols) * 360;
  const latMax = 90 - (ty / rows) * 180;
  const latMin = 90 - ((ty + 1) / rows) * 180;

  const vertsPerSide = seg + 1;
  const count = vertsPerSide * vertsPerSide;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const indices: number[] = [];

  // Tiny radial micro-bias prevents Z-fighting cleanly
  const bias = biasOverride !== undefined ? biasOverride : 0.00012 * z;

  for (let iv = 0; iv <= seg; iv++) {
    const v = iv / seg;
    const lat = latMin + v * (latMax - latMin);
    for (let iu = 0; iu <= seg; iu++) {
      const u = iu / seg;
      const lon = lonMin + u * (lonMax - lonMin);
      const elevM = sampleMolaElevationFromBuffer(lat, lon, molaBuf, molaW, molaH);
      const r = R_GLOBE + elevationToRadialOffset(elevM, exaggeration) + bias;
      const p = latLonToSphereVec3(lat, lon, r);
      const idx = iv * vertsPerSide + iu;
      positions[idx * 3] = p.x;
      positions[idx * 3 + 1] = p.y;
      positions[idx * 3 + 2] = p.z;

      const eE = sampleMolaElevationFromBuffer(lat, lon + 0.08, molaBuf, molaW, molaH);
      const eW = sampleMolaElevationFromBuffer(lat, lon - 0.08, molaBuf, molaW, molaH);
      const eN = sampleMolaElevationFromBuffer(Math.min(89.9, lat + 0.08), lon, molaBuf, molaW, molaH);
      const eS = sampleMolaElevationFromBuffer(Math.max(-89.9, lat - 0.08), lon, molaBuf, molaW, molaH);
      const up = p.clone().normalize();
      const east =
        Math.hypot(up.z, up.x) > 1e-5
          ? new THREE.Vector3(up.z, 0, -up.x).normalize()
          : new THREE.Vector3(0, 0, -1);
      const north = new THREE.Vector3().crossVectors(up, east).normalize();
      const nVec = up
        .addScaledVector(east, -(eE - eW) * 0.00018 * exaggeration)
        .addScaledVector(north, -(eN - eS) * 0.00018 * exaggeration)
        .normalize();
      normals[idx * 3] = nVec.x;
      normals[idx * 3 + 1] = nVec.y;
      normals[idx * 3 + 2] = nVec.z;

      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = v;
    }
  }

  for (let iv = 0; iv < seg; iv++) {
    for (let iu = 0; iu < seg; iu++) {
      const a = iv * vertsPerSide + iu;
      const b = a + 1;
      const c = (iv + 1) * vertsPerSide + iu;
      const d = c + 1;
      // +East x +North = Outward normal (FrontSide)
      indices.push(a, b, d, a, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

function createMartianMicroDetailBumpTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  if (ctx) {
    const img = ctx.createImageData(256, 256);
    const d = img.data;
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const u = (x / 256) * Math.PI * 2;
        const v = (y / 256) * Math.PI * 2;
        const ridge =
          Math.sin(u * 6 + Math.cos(v * 5)) * 0.45 +
          Math.cos(v * 11 - Math.sin(u * 9)) * 0.3 +
          Math.sin((u + v) * 23) * 0.15 +
          Math.cos((u * 31 - v * 29)) * 0.1;
        const val = clamp(Math.round(128 + ridge * 58), 0, 255);
        const idx = (y * 256 + x) * 4;
        d[idx] = val;
        d[idx + 1] = val;
        d[idx + 2] = val;
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  return tex;
}

function buildRegionalQgisPatchGeometry(
  grid: MarsTerrainGrid,
  exaggeration: number,
  molaBuf: Uint8ClampedArray | null,
  molaW: number,
  molaH: number
): THREE.BufferGeometry {
  const { nx, ny, boundsLonLat } = grid;
  const [minLon, minLat, maxLon, maxLat] = boundsLonLat;
  const minElev = getGridMinElevation(grid);
  const count = nx * ny;
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const indices: number[] = [];

  for (let iv = 0; iv < ny; iv++) {
    const v = iv / (ny - 1);
    const lat = minLat + v * (maxLat - minLat);
    for (let iu = 0; iu < nx; iu++) {
      const u = iu / (nx - 1);
      const lon = minLon + u * (maxLon - minLon);
      const localElev = grid.elevationM[iv][iu];
      const molaElev = sampleMolaElevationFromBuffer(lat, lon, molaBuf, molaW, molaH);
      // Smoothly stitch outer 4-cell rim directly into surrounding global MOLA crust
      const borderDist = Math.min(iu, nx - 1 - iu, iv, ny - 1 - iv);
      const blendW = clamp(borderDist / 4, 0, 1);
      const elevM = molaElev + Math.max(0, localElev - minElev) * 2.4 * blendW;
      const bias = borderDist === 0 ? 0.00025 : 0.00068;
      const r = R_GLOBE + elevationToRadialOffset(elevM, exaggeration) + bias;
      const p = latLonToSphereVec3(lat, lon, r);
      const idx = iv * nx + iu;
      positions[idx * 3] = p.x;
      positions[idx * 3 + 1] = p.y;
      positions[idx * 3 + 2] = p.z;
      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = v;
    }
  }

  for (let iv = 0; iv < ny - 1; iv++) {
    for (let iu = 0; iu < nx - 1; iu++) {
      const a = iv * nx + iu;
      const b = a + 1;
      const c = (iv + 1) * nx + iu;
      const d = c + 1;
      indices.push(a, b, d, a, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function colorRampTerrain(
  grid: MarsTerrainGrid,
  x: number,
  y: number,
  layers: Record<string, { visible: boolean; opacity: number }>,
  onlyLayerId?: string,
  elevRange?: [number, number]
): [number, number, number] {
  const elev = grid.elevationM[y][x];
  const slope = grid.slopeDeg[y][x];
  const rough = grid.roughnessM[y][x];
  const sand = grid.sandTrap[y][x];
  const mineral = grid.mineralIndex[y][x];
  const uncert = grid.uncertainty[y][x];
  const slip = grid.slipHazard[y][x];
  const los = grid.viewshedLoS[y][x];
  const shelter = grid.shelterScore[y][x];
  const o2 = grid.o2CostPerMeter[y][x];

  const nx = grid.nx;
  const ny = grid.ny;
  const dzdx = grid.elevationM[y][Math.min(nx - 1, x + 1)] - grid.elevationM[y][Math.max(0, x - 1)];
  const dzdy = grid.elevationM[Math.min(ny - 1, y + 1)][x] - grid.elevationM[Math.max(0, y - 1)][x];
  const shade = Math.max(0.45, Math.min(1.25, 0.88 - dzdx * 0.004 + dzdy * 0.004));

  const rid = String(grid.regionId);
  const isJezero = rid === "JEZERO_CRATER";
  const isOlympus = rid === "OLYMPUS_MONS";
  const isHellas = rid === "HELLAS_PLANITIA";
  let r = isOlympus
    ? 148 - sand * 38 + mineral * 20
    : isHellas
      ? 186 - sand * 42 + mineral * 16
      : isJezero
        ? 168 - sand * 52 + mineral * 22
        : 176 - sand * 46 + mineral * 18;
  let g = isOlympus
    ? 82 - sand * 26 + mineral * 16
    : isHellas
      ? 116 - sand * 30 + mineral * 20
      : isJezero
        ? 98 - sand * 36 + mineral * 18
        : 104 - sand * 32 + mineral * 24;
  let b = isOlympus
    ? 60 - sand * 18 + mineral * 22
    : isHellas
      ? 82 - sand * 18 + mineral * 18
      : isJezero
        ? 68 - sand * 20 + mineral * 28
        : 72 - sand * 20 + mineral * 14;

  const optVisible = onlyLayerId ? onlyLayerId === "OPTICAL" : layers.OPTICAL?.visible ?? true;
  if (!optVisible) {
    r = 38;
    g = 46;
    b = 64;
  } else {
    r *= shade;
    g *= shade;
    b *= shade;
  }

  const blend = (cr: number, cg: number, cb: number, alpha: number) => {
    const a = Math.max(0, Math.min(1, alpha));
    r = r * (1 - a) + cr * a;
    g = g * (1 - a) + cg * a;
    b = b * (1 - a) + cb * a;
  };

  const isOn = (id: string) =>
    onlyLayerId ? onlyLayerId === id : Boolean(layers[id]?.visible);
  const opOf = (id: string) =>
    onlyLayerId === id ? 0.85 : (layers[id]?.opacity ?? 60) / 100;

  if (isOn("TOPOGRAPHY")) {
    const minE = elevRange ? elevRange[0] : isJezero ? -2650 : -4250;
    const maxE = elevRange ? Math.max(elevRange[0] + 40, elevRange[1]) : isJezero ? -2150 : -3550;
    const t = Math.max(0, Math.min(1, (elev - minE) / (maxE - minE)));
    const tr = t < 0.5 ? 30 + t * 2 * 180 : 210 + (t - 0.5) * 2 * 45;
    const tg = t < 0.5 ? 110 + t * 2 * 120 : 230 - (t - 0.5) * 2 * 120;
    const tb = t < 0.5 ? 235 - t * 2 * 120 : 115 - (t - 0.5) * 2 * 80;
    blend(tr, tg, tb, opOf("TOPOGRAPHY") * 0.65);
  }

  if (isOn("SPECTRAL")) {
    const m = Math.max(0, Math.min(1, mineral));
    blend(170 * m + 40, 65 * m + 30, 245 * m + 70, opOf("SPECTRAL") * 0.7 * m);
  }

  if (isOn("CHEMICAL") && mineral > 0.45) {
    blend(16, 232, 188, opOf("CHEMICAL") * Math.min(1, (mineral - 0.4) * 1.45));
  }

  if (isOn("THERMAL")) {
    const ti = 1 - sand;
    blend(255 * ti, 145 * ti + 30, 230 * (1 - ti), opOf("THERMAL") * 0.68);
  }

  if (isOn("GEOLOGICAL")) {
    const unit = Math.sin(x * 0.22) * Math.cos(y * 0.22);
    blend(unit > 0 ? 225 : 95, 110 + mineral * 95, 175, opOf("GEOLOGICAL") * 0.45);
  }

  if (isOn("DUST_RISK") && sand > 0.3) {
    blend(245, 158, 11, opOf("DUST_RISK") * Math.min(0.85, sand));
  }

  if (isOn("RADIATION")) {
    const rad = Math.min(1, Math.max(0, (elev + 4500) / 14000));
    blend(192, 64, 245, opOf("RADIATION") * (0.25 + 0.55 * rad));
  }

  if (isOn("SLOPE")) {
    const t = Math.min(1, slope / 22);
    const sr = t < 0.4 ? 16 + t * 550 : 239;
    const sg = t < 0.4 ? 185 : Math.max(50, 190 - (t - 0.4) * 260);
    const sb = t < 0.4 ? 129 - t * 200 : 68;
    blend(sr, sg, sb, opOf("SLOPE") * 0.72);
  }

  if (isOn("ROUGHNESS")) {
    const t = Math.min(1, rough / 14);
    blend(251, 113 - t * 70, 133 - t * 60, opOf("ROUGHNESS") * 0.68 * t);
  }

  if (isOn("BOULDERS_SAND") && sand > 0.42) {
    blend(245, 165, 25, opOf("BOULDERS_SAND") * Math.min(1, (sand - 0.35) * 1.6));
  }

  if (isOn("SLIP_HAZARD") && slip > 0.45) {
    blend(239, 45, 45, opOf("SLIP_HAZARD") * Math.min(1, slip));
  }

  if (isOn("O2_COST")) {
    const t = Math.max(0, Math.min(1, (o2 - 0.018) / 0.045));
    blend(255 * t, 220 * (1 - t * 0.7), 240 * (1 - t), opOf("O2_COST") * 0.7);
  }

  if (isOn("COMM_LOS")) {
    if (los === 0) {
      blend(125, 22, 168, opOf("COMM_LOS") * 0.72);
    } else {
      blend(0, 220, 255, opOf("COMM_LOS") * 0.12);
    }
  }

  if (isOn("SHELTERS") && shelter >= 0.36) {
    blend(16, 225, 145, opOf("SHELTERS") * 0.72);
  }

  if (isOn("UNCERTAINTY") && uncert > 0.45) {
    blend(129, 140, 248, opOf("UNCERTAINTY") * Math.min(0.85, uncert));
  }

  const spanE = elevRange ? Math.max(40, elevRange[1] - elevRange[0]) : 600;
  const cStep = spanE > 1500 ? Math.max(100, Math.round(spanE / 14 / 50) * 50) : 25;
  const cMod = ((elev % cStep) + cStep) % cStep;
  if (cMod < cStep * 0.085) {
    blend(255, 255, 255, isOn("TOPOGRAPHY") ? 0.32 : 0.14);
  }

  return [
    Math.max(0, Math.min(255, Math.round(r))),
    Math.max(0, Math.min(255, Math.round(g))),
    Math.max(0, Math.min(255, Math.round(b))),
  ];
}

function buildTerrainContours3D(
  grid: MarsTerrainGrid,
  worldW: number,
  worldD: number,
  minZ: number,
  maxZ: number,
  elevScale: number,
  yBias = 0.05,
  levelsCount = 12
): THREE.LineSegments {
  const { nx, ny, elevationM } = grid;
  const pts: number[] = [];
  const span = Math.max(40, maxZ - minZ);

  const worldCoord = (fx: number, fy: number, elev: number): [number, number, number] => [
    (fx / (nx - 1) - 0.5) * worldW,
    (elev - minZ) * elevScale + yBias,
    (0.5 - fy / (ny - 1)) * worldD,
  ];

  for (let l = 1; l < levelsCount; l++) {
    const thr = minZ + (l / levelsCount) * span;
    for (let y = 0; y < ny - 1; y++) {
      for (let x = 0; x < nx - 1; x++) {
        const z00 = elevationM[y][x];
        const z10 = elevationM[y][x + 1];
        const z11 = elevationM[y + 1][x + 1];
        const z01 = elevationM[y + 1][x];
        const cross: Array<[number, number, number]> = [];
        if ((z00 < thr) !== (z10 < thr)) {
          const t = (thr - z00) / (z10 - z00 || 1e-6);
          cross.push(worldCoord(x + t, y, thr));
        }
        if ((z10 < thr) !== (z11 < thr)) {
          const t = (thr - z10) / (z11 - z10 || 1e-6);
          cross.push(worldCoord(x + 1, y + t, thr));
        }
        if ((z11 < thr) !== (z01 < thr)) {
          const t = (thr - z11) / (z01 - z11 || 1e-6);
          cross.push(worldCoord(x + 1 - t, y + 1, thr));
        }
        if ((z01 < thr) !== (z00 < thr)) {
          const t = (thr - z01) / (z00 - z01 || 1e-6);
          cross.push(worldCoord(x, y + 1 - t, thr));
        }
        if (cross.length >= 2) {
          pts.push(cross[0][0], cross[0][1], cross[0][2], cross[1][0], cross[1][1], cross[1][2]);
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.42,
    })
  );
}

export default function MarsGoogleEarthViewer({
  grid,
  routes,
  activeRoute,
  shelters,
}: MarsGoogleEarthViewerProps) {
  const mapViewportMode = useMissionStore((s) => s.mapViewportMode);
  const setMapViewportMode = useMissionStore((s) => s.setMapViewportMode);
  const globeBasemap = useMissionStore((s) => s.globeBasemap);
  const setGlobeBasemap = useMissionStore((s) => s.setGlobeBasemap);
  const showGlobeCoverageOverlay = useMissionStore((s) => s.showGlobeCoverageOverlay);
  const setShowGlobeCoverageOverlay = useMissionStore((s) => s.setShowGlobeCoverageOverlay);
  const globeSunAngleDeg = useMissionStore((s) => s.globeSunAngleDeg);
  const setGlobeSunAngleDeg = useMissionStore((s) => s.setGlobeSunAngleDeg);
  const flyToCoords = useMissionStore((s) => s.flyToCoords);
  const flyToRequestCount = useMissionStore((s) => s.flyToRequestCount);
  const flyToGlobeLocation = useMissionStore((s) => s.flyToGlobeLocation);
  const activeRegionId = useMissionStore((s) => s.activeRegionId);
  const activeLandmarkId = useMissionStore((s) => s.activeLandmarkId);
  const activeTargetId = useMissionStore((s) => s.activeTargetId);
  const selectLandmark = useMissionStore((s) => s.selectLandmark);
  const layers = useMissionStore((s) => s.layers);
  const toggleLayer = useMissionStore((s) => s.toggleLayer);
  const splitCompareEnabled = useMissionStore((s) => s.splitCompareEnabled);
  const splitCompareLayerId = useMissionStore((s) => s.splitCompareLayerId);
  const splitSwipePercent = useMissionStore((s) => s.splitSwipePercent);
  const setSplitCompare = useMissionStore((s) => s.setSplitCompare);
  const twinProgress = useMissionStore((s) => s.twinProgress);
  const setTwinProgress = useMissionStore((s) => s.setTwinProgress);
  const suitParams = useMissionStore((s) => s.suitParams);
  const updateSuitParams = useMissionStore((s) => s.updateSuitParams);
  const weatherInputs = useMissionStore((s) => s.weatherInputs);
  const updateWeatherInputs = useMissionStore((s) => s.updateWeatherInputs);
  const emergencyActive = useMissionStore((s) => s.emergencyActive);
  const emergencyType = useMissionStore((s) => s.emergencyType);
  const triggerEmergency = useMissionStore((s) => s.triggerEmergency);

  const activeLandmark = useMemo(
    () => GLOBAL_MARS_LANDMARKS.find((l) => l.id === activeLandmarkId) ?? GLOBAL_MARS_LANDMARKS[0],
    [activeLandmarkId]
  );
  const activeSiteTarget = useMemo(
    () =>
      activeLandmarkId === "JEZERO_CRATER" || activeLandmarkId === "GALE_MOUNT_SHARP"
        ? SCIENTIFIC_TARGETS.find((st) => st.target_id === activeTargetId) || SCIENTIFIC_TARGETS[0]
        : getSyntheticTargetForLandmark(activeLandmarkId),
    [activeLandmarkId, activeTargetId]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [expandedViewport, setExpandedViewport] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [tiltDeg, setTiltDeg] = useState(0);
  const [autoTiltEnabled, setAutoTiltEnabled] = useState(true);
  const [reliefExaggeration, setReliefExaggeration] = useState(3.0);

  const [fpGridPos, setFpGridPos] = useState<[number, number]>(() => [
    grid.baseGrid[0],
    grid.baseGrid[1],
  ]);
  const [fpYawDeg, setFpYawDeg] = useState<number>(35);
  const [fpPitchDeg, setFpPitchDeg] = useState<number>(-4);
  const [fpEyeHeightM, setFpEyeHeightM] = useState<number>(1.8);

  const [cursorMarsInfo, setCursorMarsInfo] = useState<{
    lat: number;
    lon: number;
    elevM: number;
    coverageLabel: string;
    uncertainty: number;
  } | null>(null);
  const [cameraHud, setCameraHud] = useState<CameraHudTelemetry>({
    altitudeKm: 5900,
    lodZ: 1,
    loadedTiles: 0,
    focusLat: 12,
    focusLon: 96,
    focusElevM: -2500,
    effectiveTiltDeg: 0,
  });

  const [siteCardCollapsed, setSiteCardCollapsed] = useState(false);
  const [inspectedCell, setInspectedCell] = useState<InspectedCellInfo | null>(null);
  const [qgisPanelOpen, setQgisPanelOpen] = useState(false);
  const [qgisStatus, setQgisStatus] = useState<Record<string, unknown> | null>(null);
  const [qgisLoading, setQgisLoading] = useState(false);
  const [molaReadyTick, setMolaReadyTick] = useState(0);
  const [contoursByRegion, setContoursByRegion] = useState<
    Record<string, Array<Array<[number, number]>>>
  >({});

  // Sync first-person astronaut pose toward active target whenever user selects a new site
  useEffect(() => {
    setInspectedCell(null);
    const gx0 = grid.baseGrid[0];
    const gy0 = grid.baseGrid[1];
    const tx = (activeSiteTarget.grid_pos.x / 96) * grid.nx;
    const ty = (activeSiteTarget.grid_pos.y / 96) * grid.ny;
    const yawDeg = ((Math.atan2(tx - gx0, ty - gy0) * 180) / Math.PI + 360) % 360;
    setFpGridPos([gx0, gy0]);
    setFpYawDeg(Math.round(yawDeg));
    setFpPitchDeg(-2);
    fpPoseRef.current = {
      gx: gx0,
      gy: gy0,
      yawDeg,
      pitchDeg: -2,
      eyeHeightM: fpPoseRef.current.eyeHeightM,
    };
  }, [activeLandmarkId, activeLandmark, activeSiteTarget, grid.baseGrid, grid.nx, grid.ny]);

  // Live mutable refs so the main WebGL scene never tears down on slider/state changes
  const fpPoseRef = useRef({
    gx: grid.baseGrid[0],
    gy: grid.baseGrid[1],
    yawDeg: 35,
    pitchDeg: -4,
    eyeHeightM: 1.8,
  });
  const fpActionRef = useRef<{
    moveStep?: (fwd: number, strafe?: number) => void;
    turnBy?: (dYaw: number, dPitch?: number) => void;
    lookAtGrid?: (tx: number, ty: number) => void;
    jumpToGrid?: (gx: number, gy: number, lookAtTarget?: [number, number]) => void;
  }>({});
  const globeCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const globeControlsRef = useRef<OrbitControls | null>(null);
  const globeFlyAnimRef = useRef<{
    active: boolean;
    startDir: THREE.Vector3;
    endDir: THREE.Vector3;
    startAlt: number;
    endAlt: number;
    hopArc: number;
    t: number;
    onComplete?: () => void;
  } | null>(null);
  const terrainCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const terrainControlsRef = useRef<OrbitControls | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const marsGlobeMeshRef = useRef<THREE.Mesh | null>(null);
  const coverageSphereRef = useRef<THREE.Mesh | null>(null);
  const tileGroupRef = useRef<THREE.Group | null>(null);
  const qgisRegionGroupRef = useRef<THREE.Group | null>(null);
  const qgisPatchMeshRef = useRef<THREE.Mesh | null>(null);
  const astroMarkerRef = useRef<THREE.Mesh | null>(null);

  // Offscreen CPU heightmap + global texture canvas buffers for instant sampling & procedural fallback
  const molaSamplerRef = useRef<{ buf: Uint8ClampedArray | null; w: number; h: number }>({
    buf: null,
    w: 0,
    h: 0,
  });
  const globalBasemapCanvasRef = useRef<Record<string, HTMLCanvasElement>>({});
  const tileTextureCacheRef = useRef<Map<string, THREE.Texture>>(new Map());
  const tileMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const activeTileWindowRef = useRef<string>("");

  const stateRefs = useRef({
    grid,
    routes,
    activeRoute,
    shelters,
    layers,
    activeRegionId,
    activeLandmarkId,
    activeTargetId,
    twinProgress,
    suitParams,
    globeBasemap,
    showGlobeCoverageOverlay,
    globeSunAngleDeg,
    autoRotate,
    tiltDeg,
    autoTiltEnabled,
    reliefExaggeration,
    weatherTau: weatherInputs.opticalDepthTau,
  });
  stateRefs.current = {
    grid,
    routes,
    activeRoute,
    shelters,
    layers,
    activeRegionId,
    activeLandmarkId,
    activeTargetId,
    twinProgress,
    suitParams,
    globeBasemap,
    showGlobeCoverageOverlay,
    globeSunAngleDeg,
    autoRotate,
    tiltDeg,
    autoTiltEnabled,
    reliefExaggeration,
    weatherTau: weatherInputs.opticalDepthTau,
  };

  const [projectedPins, setProjectedPins] = useState<ProjectedPin[]>([]);

  // Preload MOLA global DEM (2048x1024) + global basemap canvases for instant tile fallback & relief sampling
  useEffect(() => {
    const demImg = new Image();
    demImg.crossOrigin = "anonymous";
    demImg.onload = () => {
      const c = document.createElement("canvas");
      c.width = demImg.width;
      c.height = demImg.height;
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.drawImage(demImg, 0, 0);
        const imgData = ctx.getImageData(0, 0, c.width, c.height);
        molaSamplerRef.current = { buf: imgData.data, w: c.width, h: c.height };
        setMolaReadyTick((n) => n + 1);
      }
    };
    demImg.src = "/gis/textures/mars_mola_dem_2048.png";

    const mapPaths: Record<GlobeBasemapKey, string> = {
      viking: "/gis/textures/mars_viking_global_2048.jpg",
      mola_color: "/gis/textures/mars_mola_clrshade_2048.jpg",
      thermal: "/gis/textures/mars_thermal_global_2048.jpg",
      geology: "/gis/textures/mars_geology_global_2048.jpg",
    };
    (Object.keys(mapPaths) as GlobeBasemapKey[]).forEach((k) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => {
        const c = document.createElement("canvas");
        c.width = im.width;
        c.height = im.height;
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.drawImage(im, 0, 0);
          globalBasemapCanvasRef.current[k] = c;
        }
      };
      im.src = mapPaths[k];
    });
  }, []);

  // Load 25m QGIS GDAL Contours GeoJSON for Jezero & Gale once per region
  useEffect(() => {
    if (contoursByRegion[activeRegionId]) return;
    const url =
      activeRegionId === "JEZERO_CRATER"
        ? "/gis/jezero_crater_contours.geojson"
        : "/gis/gale_mount_sharp_contours.geojson";
    fetch(url)
      .then((r) => r.json())
      .then((fc) => {
        const lines: Array<Array<[number, number]>> = [];
        const feats = Array.isArray(fc?.features) ? fc.features : [];
        for (let i = 0; i < feats.length; i += 2) {
          const coords = feats[i]?.geometry?.coordinates;
          if (Array.isArray(coords) && coords.length >= 2) {
            lines.push(coords as Array<[number, number]>);
          }
        }
        setContoursByRegion((prev) => ({ ...prev, [activeRegionId]: lines }));
      })
      .catch(() => {
        setContoursByRegion((prev) => ({ ...prev, [activeRegionId]: [] }));
      });
  }, [activeRegionId, contoursByRegion]);

  const fetchQgisStatus = useCallback(async () => {
    setQgisLoading(true);
    try {
      const res = await fetch("/api/qgis-mcp");
      const json = await res.json();
      setQgisStatus(json);
    } catch {
      setQgisStatus({ ok: false, error: "API offline" });
    } finally {
      setQgisLoading(false);
    }
  }, []);

  const triggerQgisAction = useCallback(
    async (tool: string, args: Record<string, unknown> = {}) => {
      setQgisLoading(true);
      try {
        const res = await fetch("/api/qgis-mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool, arguments: args }),
        });
        const json = await res.json();
        setQgisStatus(json);
      } finally {
        setQgisLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchQgisStatus();
  }, [fetchQgisStatus]);

  // Smooth Google-Earth spherical arc Fly-To trigger
  useEffect(() => {
    if (mapViewportMode !== "GLOBE_3D" || !flyToCoords || !globeCameraRef.current) return;
    const cam = globeCameraRef.current;
    const startPos = cam.position.clone();
    const startDir = startPos.clone().normalize();
    const { lat: sLat, lon: sLon } = sphereVec3ToLatLon(startDir);
    const sSurfaceR =
      R_GLOBE +
      elevationToRadialOffset(
        sampleAnchoredSurfaceElevation(
          sLat,
          sLon,
          stateRefs.current.grid,
          molaSamplerRef.current.buf,
          molaSamplerRef.current.w,
          molaSamplerRef.current.h
        ),
        stateRefs.current.reliefExaggeration
      );

    const endDir = latLonToSphereVec3(flyToCoords.lat, flyToCoords.lon, 1.0).normalize();
    const angDist = startDir.angleTo(endDir);

    const isCloseSite =
      flyToCoords.label.toLowerCase().includes("jezero") ||
      flyToCoords.label.toLowerCase().includes("gale") ||
      flyToCoords.label.toLowerCase().includes("boxwork") ||
      flyToCoords.label.toLowerCase().includes("cheyava") ||
      flyToCoords.label.toLowerCase().includes("margin");
    const isMegaLandmark =
      flyToCoords.label.toLowerCase().includes("olympus") ||
      flyToCoords.label.toLowerCase().includes("valles");

    // Descend right above local relief (~12.2 km for craters/targets, ~145 km for giant volcanoes)
    const endAlt = isCloseSite ? 0.036 : isMegaLandmark ? 0.42 : 0.24;

    globeFlyAnimRef.current = {
      active: true,
      startDir,
      endDir,
      startAlt: Math.max(0.02, startPos.length() - sSurfaceR),
      endAlt,
      hopArc: angDist > 0.75 ? Math.min(4.8, angDist * 2.8) : 0,
      t: 0,
    };
  }, [flyToRequestCount, flyToCoords, mapViewportMode]);

  // Helper: synthesize crisp local tile texture if network is offline or basemap is thermal/geology
  const buildFallbackTileTexture = useCallback(
    (basemap: GlobeBasemapKey, z: number, tx: number, ty: number): THREE.Texture => {
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 256;
      const ctx = c.getContext("2d");
      if (ctx) {
        const cols = 1 << (z + 1);
        const rows = 1 << z;
        const src =
          globalBasemapCanvasRef.current[basemap] || globalBasemapCanvasRef.current.viking;
        if (src) {
          const sx = (tx / cols) * src.width;
          const sy = (ty / rows) * src.height;
          const sw = Math.max(1, src.width / cols);
          const sh = Math.max(1, src.height / rows);
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(src, sx, sy, sw, sh, 0, 0, 256, 256);
        } else {
          ctx.fillStyle = "#6c3e2c";
          ctx.fillRect(0, 0, 256, 256);
        }

        // Overlay high-frequency MOLA slope shading so close-up zoom always has crisp terrain grain
        const { buf, w, h } = molaSamplerRef.current;
        if (buf && w > 0 && h > 0 && z >= 4) {
          const lonMin = -180 + (tx / cols) * 360;
          const lonSpan = 360 / cols;
          const latMax = 90 - (ty / rows) * 180;
          const latSpan = 180 / rows;
          const imgData = ctx.getImageData(0, 0, 256, 256);
          const d = imgData.data;
          for (let py = 0; py < 256; py += 2) {
            const lat = latMax - (py / 256) * latSpan;
            for (let px = 0; px < 256; px += 2) {
              const lon = lonMin + (px / 256) * lonSpan;
              const e0 = sampleMolaElevationFromBuffer(lat, lon, buf, w, h);
              const eX = sampleMolaElevationFromBuffer(lat, lon + lonSpan / 64, buf, w, h);
              const eY = sampleMolaElevationFromBuffer(lat - latSpan / 64, lon, buf, w, h);
              const shade = clamp(1.0 + ((eX - e0) - (eY - e0)) * 0.0025, 0.72, 1.28);
              // Subtle deterministic crater/regolith grain at LOD z>=5
              const grain =
                1 +
                (Math.sin(lon * 190 + lat * 130) * Math.cos(lat * 270 - lon * 110)) *
                  (z >= 6 ? 0.08 : 0.04);
              const mult = shade * grain;
              for (let dy = 0; dy < 2; dy++) {
                for (let dx = 0; dx < 2; dx++) {
                  const idx = ((py + dy) * 256 + (px + dx)) * 4;
                  d[idx] = clamp(Math.round(d[idx] * mult), 0, 255);
                  d[idx + 1] = clamp(Math.round(d[idx + 1] * mult), 0, 255);
                  d[idx + 2] = clamp(Math.round(d[idx + 2] * mult), 0, 255);
                }
              }
            }
          }
          ctx.putImageData(imgData, 0, 0);
        }
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      return tex;
    },
    []
  );

  // Build dynamic regional QGIS terrain canvas texture (all 20 layers + Split-Screen)
  const terrainTextureCanvas = useMemo(() => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = grid.nx * 4;
    canvas.height = grid.ny * 4;
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;

    let minE = Infinity;
    let maxE = -Infinity;
    for (let y = 0; y < grid.ny; y++) {
      for (let x = 0; x < grid.nx; x++) {
        const e = grid.elevationM[y][x];
        if (e < minE) minE = e;
        if (e > maxE) maxE = e;
      }
    }
    const elevRange: [number, number] = [minE, maxE];

    const img = ctx.createImageData(grid.nx, grid.ny);
    const splitCol = Math.round((splitSwipePercent / 100) * grid.nx);

    for (let y = 0; y < grid.ny; y++) {
      for (let x = 0; x < grid.nx; x++) {
        const gy = grid.ny - 1 - y;
        const useSplit = splitCompareEnabled && x >= splitCol;
        const [r, g, b] = colorRampTerrain(
          grid,
          x,
          gy,
          layers,
          useSplit ? splitCompareLayerId : undefined,
          elevRange
        );
        const idx = (y * grid.nx + x) * 4;
        img.data[idx] = r;
        img.data[idx + 1] = g;
        img.data[idx + 2] = b;
        img.data[idx + 3] = 255;
      }
    }

    const tmp = document.createElement("canvas");
    tmp.width = grid.nx;
    tmp.height = grid.ny;
    tmp.getContext("2d")?.putImageData(img, 0, 0);

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);

    if (splitCompareEnabled) {
      const divX = (splitSwipePercent / 100) * canvas.width;
      ctx.strokeStyle = "#00F0FF";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(divX, 0);
      ctx.lineTo(divX, canvas.height);
      ctx.stroke();
    }
    return canvas;
  }, [grid, layers, splitCompareEnabled, splitCompareLayerId, splitSwipePercent]);

  // =========================================================================
  // GOOGLE EARTH CONTINUOUS 3D MARS GLOBE (LOD WMTS STREAMING + 3D QGIS PATCH)
  // =========================================================================
  useEffect(() => {
    if (mapViewportMode !== "GLOBE_3D") return;
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 860;
    const height = container.clientHeight || 560;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04060b);

    // orbitCam stays strictly nadir under OrbitControls; renderCam renders centered Horizon Tilt
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.0008, 220);
    const renderCam = new THREE.PerspectiveCamera(40, width / height, 0.0008, 220);
    const initialCam = latLonToSphereVec3(8, 102, 26.8); // Facing Jezero (77°E) & Gale (137°E)
    camera.position.copy(initialCam);
    renderCam.position.copy(initialCam);
    globeCameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      logarithmicDepthBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.minDistance = R_GLOBE + 0.004;
    controls.maxDistance = 42.0;
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 1.0;
    globeControlsRef.current = controls;

    // Starfield
    const starCount = 2200;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 65 + Math.random() * 80;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      starPos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      starPos[i * 3 + 2] = r * Math.cos(ph);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    scene.add(
      new THREE.Points(
        starGeo,
        new THREE.PointsMaterial({ color: 0xdbeafe, size: 0.16, transparent: true, opacity: 0.78 })
      )
    );

    // Three-part Illumination: Hemisphere + Solar Directional + Camera Fill Headlamp (never pitch dark)
    scene.add(new THREE.HemisphereLight(0xffead8, 0x4b3127, 1.05));
    const headlamp = new THREE.DirectionalLight(0xfff5ea, 1.1);
    headlamp.position.copy(camera.position);
    scene.add(headlamp);

    const sun = new THREE.DirectionalLight(0xffe9d2, 1.55);
    sun.position.copy(latLonToSphereVec3(22, stateRefs.current.globeSunAngleDeg, 80));
    scene.add(sun);
    sunLightRef.current = sun;

    // Base Global Texture
    const loader = new THREE.TextureLoader();
    const basemapPathMap: Record<GlobeBasemapKey, string> = {
      viking: "/gis/textures/mars_viking_global_2048.jpg",
      mola_color: "/gis/textures/mars_mola_clrshade_2048.jpg",
      thermal: "/gis/textures/mars_thermal_global_2048.jpg",
      geology: "/gis/textures/mars_geology_global_2048.jpg",
    };

    const baseTex = loader.load(basemapPathMap[stateRefs.current.globeBasemap]);
    baseTex.colorSpace = THREE.SRGBColorSpace;
    const demTex = loader.load("/gis/textures/mars_mola_dem_2048.png");
    const covTex = loader.load("/gis/textures/mars_coverage_global_2048.png");
    covTex.colorSpace = THREE.SRGBColorSpace;
    const microBumpTex = createMartianMicroDetailBumpTexture();

    // Main Mars Base Sphere (CPU-displaced by MOLA DEM so it matches LOD tiles seamlessly)
    const sphereGeo = new THREE.SphereGeometry(R_GLOBE, 144, 96);
    const baseDirs = new Float32Array(sphereGeo.attributes.position.array.length);
    const posArr = sphereGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < posArr.length; i += 3) {
      const v = new THREE.Vector3(posArr[i], posArr[i + 1], posArr[i + 2]).normalize();
      baseDirs[i] = v.x;
      baseDirs[i + 1] = v.y;
      baseDirs[i + 2] = v.z;
    }
    sphereGeo.userData.unitDirs = baseDirs;

    const sphereMat = new THREE.MeshStandardMaterial({
      map: baseTex,
      bumpMap: demTex,
      bumpScale: 0.04,
      roughness: 0.88,
      metalness: 0.04,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2,
    });
    const marsMesh = new THREE.Mesh(sphereGeo, sphereMat);
    scene.add(marsMesh);
    marsGlobeMeshRef.current = marsMesh;

    // Group for streamed NASA Mars Trek WMTS tiles (z=2..7)
    const tileGroup = new THREE.Group();
    scene.add(tileGroup);
    tileGroupRef.current = tileGroup;

    // Group for high-resolution embedded QGIS 3D terrain, 25m contours, routes, & beacons
    const qgisGroup = new THREE.Group();
    scene.add(qgisGroup);
    qgisRegionGroupRef.current = qgisGroup;

    // High-Res Coverage Overlay Sphere (auto-fades on surface approach)
    const covGeo = new THREE.SphereGeometry(R_GLOBE + 0.015, 96, 64);
    const covMat = new THREE.MeshBasicMaterial({
      map: covTex,
      transparent: true,
      opacity: stateRefs.current.showGlobeCoverageOverlay ? 0.52 : 0.0,
      depthWrite: false,
    });
    const covMesh = new THREE.Mesh(covGeo, covMat);
    covMesh.visible = stateRefs.current.showGlobeCoverageOverlay;
    scene.add(covMesh);
    coverageSphereRef.current = covMesh;

    // Subtle Lat/Lon Graticule
    const graticuleGroup = new THREE.Group();
    const gridMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.12,
    });
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts: THREE.Vector3[] = [];
      for (let lon = -180; lon <= 180; lon += 4) {
        pts.push(latLonToSphereVec3(lat, lon, R_GLOBE + 0.018));
      }
      graticuleGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }
    for (let lon = -180; lon < 180; lon += 30) {
      const pts: THREE.Vector3[] = [];
      for (let lat = -88; lat <= 88; lat += 4) {
        pts.push(latLonToSphereVec3(lat, lon, R_GLOBE + 0.018));
      }
      graticuleGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }
    scene.add(graticuleGroup);

    // Martian Atmospheric Fresnel Halo (logarithmicDepthBuffer compatible)
    const atmoGeo = new THREE.SphereGeometry(R_GLOBE * 1.075, 64, 48);
    const atmoMat = new THREE.ShaderMaterial({
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
          #include <logdepthbuf_vertex>
        }
      `,
      fragmentShader: `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        varying vec3 vNormal;
        varying vec3 vViewDir;
        uniform float uDust;
        void main() {
          #include <logdepthbuf_fragment>
          float rim = 1.0 - max(0.0, dot(vNormal, vViewDir));
          float glow = pow(rim, 3.4) * (0.62 + uDust * 0.4);
          vec3 col = mix(vec3(0.95, 0.46, 0.24), vec3(0.96, 0.68, 0.35), uDust);
          gl_FragColor = vec4(col, glow * 0.8);
        }
      `,
      uniforms: {
        uDust: { value: Math.min(1, stateRefs.current.weatherTau / 2.2) },
      },
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
    scene.add(atmoMesh);

    // Glowing Footprint Borders for High-Res PDS Regions
    ORBITAL_COVERAGE_FOOTPRINTS.forEach((fp) => {
      const pts = [
        latLonToSphereVec3(fp.minLat, fp.minLon, R_GLOBE + 0.025),
        latLonToSphereVec3(fp.minLat, fp.maxLon, R_GLOBE + 0.025),
        latLonToSphereVec3(fp.maxLat, fp.maxLon, R_GLOBE + 0.025),
        latLonToSphereVec3(fp.maxLat, fp.minLon, R_GLOBE + 0.025),
        latLonToSphereVec3(fp.minLat, fp.minLon, R_GLOBE + 0.025),
      ];
      scene.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: fp.color, transparent: true, opacity: 0.78 })
        )
      );
    });

    // Global landmark surface beacons (scaled dynamically with altitude in animate)
    const landmarkBeacons: Array<{
      mesh: THREE.Mesh;
      lm: (typeof GLOBAL_MARS_LANDMARKS)[number];
    }> = [];
    GLOBAL_MARS_LANDMARKS.forEach((lm) => {
      const pos = latLonToSphereVec3(lm.lat, lm.lon, R_GLOBE + 0.032);
      const isMain = lm.category === "ACTIVE_REGION";
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(isMain ? 0.085 : 0.055, 16, 16),
        new THREE.MeshBasicMaterial({
          color: isMain ? 0x00f0ff : lm.category === "HISTORIC_MISSION" ? 0xf59e0b : 0xff5722,
        })
      );
      mesh.position.copy(pos);
      scene.add(mesh);
      landmarkBeacons.push({ mesh, lm });
    });

    // Live Raycaster: Pointer hover, Click cell inspection, Double-click Fly-To Zoom
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let pointerDownXY = { x: 0, y: 0 };

    const onPointerDown = (ev: PointerEvent) => {
      pointerDownXY = { x: ev.clientX, y: ev.clientY };
    };

    const getGlobeHitLatLon = (ev: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, renderCam);
      const targets: THREE.Object3D[] = [];
      if (qgisPatchMeshRef.current) targets.push(qgisPatchMeshRef.current);
      tileMeshesRef.current.forEach((m) => targets.push(m));
      targets.push(marsMesh);
      const hits = raycaster.intersectObjects(targets, false);
      if (hits.length === 0) return null;
      return { hit: hits[0], ...sphereVec3ToLatLon(hits[0].point) };
    };

    const onPointerMove = (ev: PointerEvent) => {
      const info = getGlobeHitLatLon(ev);
      if (!info) return;
      const { lat, lon } = info;
      const fp = ORBITAL_COVERAGE_FOOTPRINTS.find(
        (f) => lon >= f.minLon && lon <= f.maxLon && lat >= f.minLat && lat <= f.maxLat
      );
      const localE = sampleLocalGridElevation(lat, lon, stateRefs.current.grid);
      const elevM =
        localE ??
        sampleMolaElevationFromBuffer(
          lat,
          lon,
          molaSamplerRef.current.buf,
          molaSamplerRef.current.w,
          molaSamplerRef.current.h
        );
      setCursorMarsInfo({
        lat,
        lon,
        elevM: Math.round(elevM),
        coverageLabel:
          localE !== null
            ? "QGIS HiRISE DEM + 20 Capas Activas"
            : fp
            ? `${fp.instrument} (${fp.resolution})`
            : "NASA Trek Viking 232m / MOLA 463m",
        uncertainty: localE !== null ? 0.08 : fp ? fp.uncertainty : 0.72,
      });
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);

    const onPointerUpClick = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - pointerDownXY.x, ev.clientY - pointerDownXY.y) > 5) return;
      if (!qgisPatchMeshRef.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, renderCam);
      const hits = raycaster.intersectObject(qgisPatchMeshRef.current, false);
      if (hits.length > 0 && hits[0].uv) {
        const g = stateRefs.current.grid;
        const gx = clamp(Math.round(hits[0].uv.x * (g.nx - 1)), 0, g.nx - 1);
        const gy = clamp(Math.round(hits[0].uv.y * (g.ny - 1)), 0, g.ny - 1);
        const { lon, lat } = gridToLonLat(gx, gy, g);
        setInspectedCell({
          gx,
          gy,
          lon: Number(lon.toFixed(4)),
          lat: Number(lat.toFixed(4)),
          elevationM: Math.round(g.elevationM[gy][gx]),
          slopeDeg: g.slopeDeg[gy][gx],
          roughnessM: g.roughnessM[gy][gx],
          sandTrap: g.sandTrap[gy][gx],
          slipHazard: g.slipHazard[gy][gx],
          uncertainty: g.uncertainty[gy][gx],
          hasCommLoS: g.viewshedLoS[gy][gx] === 1,
          shelterScore: g.shelterScore[gy][gx],
          o2PerM: g.o2CostPerMeter[gy][gx],
        });
      }
    };
    renderer.domElement.addEventListener("pointerup", onPointerUpClick);

    const onDoubleClick = (ev: MouseEvent) => {
      const info = getGlobeHitLatLon(ev);
      if (!info) return;
      const { lat, lon } = info;
      const startPos = camera.position.clone();
      const startDir = startPos.clone().normalize();
      const { lat: sLat, lon: sLon } = sphereVec3ToLatLon(startDir);
      const sSurfaceR =
        R_GLOBE +
        elevationToRadialOffset(
          sampleMolaElevationFromBuffer(
            sLat,
            sLon,
            molaSamplerRef.current.buf,
            molaSamplerRef.current.w,
            molaSamplerRef.current.h
          ),
          stateRefs.current.reliefExaggeration
        );
      const curAlt = Math.max(0.015, startPos.length() - sSurfaceR);
      const endDir = latLonToSphereVec3(lat, lon, 1.0).normalize();
      let bestLm: (typeof GLOBAL_MARS_LANDMARKS)[number] | null = null;
      let bestDist = 3.5;
      for (const lm of GLOBAL_MARS_LANDMARKS) {
        const dLon = ((lon - lm.lon + 540) % 360) - 180;
        const d = Math.hypot(lat - lm.lat, dLon);
        if (d < bestDist) {
          bestDist = d;
          bestLm = lm;
        }
      }
      if (bestLm) selectLandmark(bestLm.id);

      globeFlyAnimRef.current = {
        active: true,
        startDir,
        endDir,
        startAlt: curAlt,
        endAlt: Math.max(0.045, curAlt * 0.28),
        hopArc: 0,
        t: 0,
      };
    };
    renderer.domElement.addEventListener("dblclick", onDoubleClick);

    // Progressive NASA Mars Trek WMTS Tile Window Synchronizer (Multi-Tier LOD Pyramid)
    let tileDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    let currentLodZ = 1;
    const syncTilesForView = (lodZ: number, focusLat: number, focusLon: number) => {
      const basemap = stateRefs.current.globeBasemap;
      if (lodZ < 2) {
        // Clear close-up tiles when far out in orbit so base sphere renders globally
        activeTileWindowRef.current = "";
        if (tileMeshesRef.current.size > 0) {
          tileMeshesRef.current.forEach((m) => {
            tileGroup.remove(m);
            m.geometry.dispose();
            (m.material as THREE.Material).dispose();
          });
          tileMeshesRef.current.clear();
        }
        return;
      }

      const fineCols = 1 << (lodZ + 1);
      const fineRows = 1 << lodZ;
      const wrappedLon = (((focusLon + 180) % 360) + 360) % 360;
      const fineTx = clamp(Math.floor((wrappedLon / 360) * fineCols), 0, fineCols - 1);
      const fineTy = clamp(Math.floor(((90 - focusLat) / 180) * fineRows), 0, fineRows - 1);

      const windowKey = `${basemap}_${lodZ}_${fineTx}_${fineTy}_${stateRefs.current.reliefExaggeration}`;
      if (activeTileWindowRef.current === windowKey) return;
      activeTileWindowRef.current = windowKey;

      type TileTier = {
        role: "bg" | "mid" | "fg";
        z: number;
        rx: number;
        ry: number;
        seg: number;
        bias: number;
        bumpMap: THREE.Texture;
        bumpScale: number;
        polyFactor: number;
      };

      const tiers: TileTier[] =
        lodZ === 2
          ? [
              {
                role: "fg",
                z: 2,
                rx: 2,
                ry: 1,
                seg: 20,
                bias: 0.0003,
                bumpMap: demTex,
                bumpScale: 0.015,
                polyFactor: -4,
              },
            ]
          : lodZ === 3
          ? [
              {
                role: "fg",
                z: 3,
                rx: 2,
                ry: 2,
                seg: 20,
                bias: 0.00045,
                bumpMap: demTex,
                bumpScale: 0.015,
                polyFactor: -6,
              },
            ]
          : lodZ === 4
          ? [
              {
                role: "bg",
                z: 2,
                rx: 1,
                ry: 1,
                seg: 20,
                bias: -0.008,
                bumpMap: demTex,
                bumpScale: 0.015,
                polyFactor: 2,
              },
              {
                role: "fg",
                z: 4,
                rx: 2,
                ry: 2,
                seg: 22,
                bias: 0.00012,
                bumpMap: demTex,
                bumpScale: 0.015,
                polyFactor: -8,
              },
            ]
          : lodZ === 5
          ? [
              {
                role: "bg",
                z: 3,
                rx: 1,
                ry: 1,
                seg: 22,
                bias: -0.008,
                bumpMap: demTex,
                bumpScale: 0.015,
                polyFactor: 2,
              },
              {
                role: "fg",
                z: 5,
                rx: 2,
                ry: 2,
                seg: 24,
                bias: 0.00012,
                bumpMap: microBumpTex,
                bumpScale: 0.0022,
                polyFactor: -10,
              },
            ]
          : [
              {
                role: "bg",
                z: 3,
                rx: 1,
                ry: 1,
                seg: 22,
                bias: -0.009,
                bumpMap: demTex,
                bumpScale: 0.015,
                polyFactor: 2,
              },
              {
                role: "mid",
                z: lodZ - 2,
                rx: 1,
                ry: 1,
                seg: 24,
                bias: -0.0018,
                bumpMap: demTex,
                bumpScale: 0.012,
                polyFactor: -4,
              },
              {
                role: "fg",
                z: lodZ,
                rx: 2,
                ry: 2,
                seg: lodZ >= 7 ? 28 : 26,
                bias: 0.00012,
                bumpMap: microBumpTex,
                bumpScale: 0.0022,
                polyFactor: -lodZ * 2,
              },
            ];

      const desiredKeys = new Set<string>();
      const needed: Array<{
        meshKey: string;
        texKey: string;
        tx: number;
        ty: number;
        tier: TileTier;
      }> = [];

      for (const tier of tiers) {
        const cols = 1 << (tier.z + 1);
        const rows = 1 << tier.z;
        const centerTx = clamp(Math.floor((wrappedLon / 360) * cols), 0, cols - 1);
        const centerTy = clamp(Math.floor(((90 - focusLat) / 180) * rows), 0, rows - 1);

        for (let dy = -tier.ry; dy <= tier.ry; dy++) {
          const ty = centerTy + dy;
          if (ty < 0 || ty >= rows) continue;
          for (let dx = -tier.rx; dx <= tier.rx; dx++) {
            const tx = (((centerTx + dx) % cols) + cols) % cols;
            const texKey = `${basemap}_${tier.z}_${ty}_${tx}`;
            const meshKey = `${tier.role}_${texKey}`;
            desiredKeys.add(meshKey);
            if (!tileMeshesRef.current.has(meshKey)) {
              needed.push({ meshKey, texKey, tx, ty, tier });
            }
          }
        }
      }

      // Prune out-of-window tiles
      tileMeshesRef.current.forEach((mesh, k) => {
        if (!desiredKeys.has(k)) {
          tileGroup.remove(mesh);
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
          tileMeshesRef.current.delete(k);
        }
      });

      const { buf, w, h } = molaSamplerRef.current;
      const exag = stateRefs.current.reliefExaggeration;

      for (const item of needed) {
        const geo = buildSphericalTileGeometry(
          item.tier.z,
          item.tx,
          item.ty,
          exag,
          buf,
          w,
          h,
          item.tier.seg,
          item.tier.bias
        );
        const cachedTex = tileTextureCacheRef.current.get(item.texKey);
        const immediateTex =
          cachedTex || buildFallbackTileTexture(basemap, item.tier.z, item.tx, item.ty);

        const mat = new THREE.MeshStandardMaterial({
          map: immediateTex,
          bumpMap: item.tier.bumpMap,
          bumpScale: item.tier.bumpScale,
          roughness: 0.88,
          metalness: 0.04,
          polygonOffset: true,
          polygonOffsetFactor: item.tier.polyFactor,
          polygonOffsetUnits: item.tier.polyFactor,
        });
        const mesh = new THREE.Mesh(geo, mat);
        tileGroup.add(mesh);
        tileMeshesRef.current.set(item.meshKey, mesh);

        // Stream real NASA Mars Trek WMTS JPEG tile in background for Viking / MOLA Color
        if (!cachedTex && (basemap === "viking" || basemap === "mola_color")) {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            const realTex = new THREE.Texture(img);
            realTex.colorSpace = THREE.SRGBColorSpace;
            realTex.anisotropy = 4;
            realTex.needsUpdate = true;
            if (tileTextureCacheRef.current.size > 320) {
              const oldestKey = tileTextureCacheRef.current.keys().next().value;
              if (oldestKey) {
                tileTextureCacheRef.current.get(oldestKey)?.dispose();
                tileTextureCacheRef.current.delete(oldestKey);
              }
            }
            tileTextureCacheRef.current.set(item.texKey, realTex);
            const liveMesh = tileMeshesRef.current.get(item.meshKey);
            if (liveMesh) {
              const liveMat = liveMesh.material as THREE.MeshStandardMaterial;
              liveMat.map = realTex;
              liveMat.needsUpdate = true;
            }
          };
          img.src = `/api/mars-tiles?layer=${basemap}&z=${item.tier.z}&y=${item.ty}&x=${item.tx}`;
        } else if (!cachedTex) {
          tileTextureCacheRef.current.set(item.texKey, immediateTex);
        }
      }
    };

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 860;
      const h = container.clientHeight || 560;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderCam.aspect = w / h;
      renderCam.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObs = new ResizeObserver(onResize);
    resizeObs.observe(container);

    let animId = 0;
    let frame = 0;
    let lastAutoRegionCheck = "";
    const lookRaycaster = new THREE.Raycaster();
    const centerNDC = new THREE.Vector2(0, 0);

    const animate = () => {
      animId = requestAnimationFrame(animate);
      frame++;

      const exag = stateRefs.current.reliefExaggeration;
      const { buf, w: mw, h: mh } = molaSamplerRef.current;

      // Compute surface radius directly under orbitCam (anchored consistently to local relief)
      const camSub = sphereVec3ToLatLon(camera.position);
      const camElevM = sampleAnchoredSurfaceElevation(
        camSub.lat,
        camSub.lon,
        stateRefs.current.grid,
        buf,
        mw,
        mh
      );
      const localSurfaceR = R_GLOBE + elevationToRadialOffset(camElevM, exag);

      // Update Fly-To spherical arc animation (disable damping during flight so arrival is exact)
      const isFlying = Boolean(globeFlyAnimRef.current?.active);
      controls.enableDamping = !isFlying;
      if (isFlying && globeFlyAnimRef.current) {
        const anim = globeFlyAnimRef.current;
        anim.t = Math.min(1, anim.t + 0.055);
        const ease = 1 - Math.pow(1 - anim.t, 3);
        const dir = new THREE.Vector3().lerpVectors(anim.startDir, anim.endDir, ease).normalize();
        const hop = Math.sin(ease * Math.PI) * anim.hopArc;
        const alt = THREE.MathUtils.lerp(anim.startAlt, anim.endAlt, ease) + hop;
        const dSub = sphereVec3ToLatLon(dir);
        const dElev = sampleAnchoredSurfaceElevation(
          dSub.lat,
          dSub.lon,
          stateRefs.current.grid,
          buf,
          mw,
          mh
        );
        const targetR = R_GLOBE + elevationToRadialOffset(dElev, exag) + Math.max(0.0045, alt);
        camera.position.copy(dir.multiplyScalar(targetR));
        if (anim.t >= 1) {
          anim.active = false;
          anim.onComplete?.();
        }
      } else if (stateRefs.current.autoRotate) {
        const angle = 0.0016;
        const x = camera.position.x;
        const z = camera.position.z;
        camera.position.x = x * Math.cos(angle) - z * Math.sin(angle);
        camera.position.z = x * Math.sin(angle) + z * Math.cos(angle);
      }

      // Logarithmic altitude-scaled OrbitControls so mouse wheel & drag work down to crater floor
      const camDist = camera.position.length();
      const hAboveSurface = Math.max(0.004, camDist - localSurfaceR);
      controls.minDistance = localSurfaceR + 0.004;
      controls.zoomSpeed = clamp(3.5 * (hAboveSurface / camDist), 0.002, 2.2);
      controls.rotateSpeed = clamp(0.68 * (hAboveSurface / R_GLOBE), 0.0005, 0.65);

      controls.update();

      // Recompute post-update surface radius right beneath camera so target stays dead-center
      const postSub = sphereVec3ToLatLon(camera.position);
      const postElevM = sampleAnchoredSurfaceElevation(
        postSub.lat,
        postSub.lon,
        stateRefs.current.grid,
        buf,
        mw,
        mh
      );
      const postSurfaceR = R_GLOBE + elevationToRadialOffset(postElevM, exag);

      // Safety floor clamp after damping
      if (camera.position.length() < postSurfaceR + 0.004) {
        camera.position.normalize().multiplyScalar(postSurfaceR + 0.004);
      }

      const hFinal = Math.max(0.004, camera.position.length() - postSurfaceR);
      const altKm = Math.max(0.8, hFinal * KM_PER_UNIT);

      // Apply centered Google-Earth Horizon Tilt around groundTarget using renderCam (zero lateral drift)
      const desiredTilt = stateRefs.current.autoTiltEnabled
        ? altKm < 280
          ? clamp((1 - altKm / 280) * 35, 0, 35)
          : 0
        : stateRefs.current.tiltDeg;

      const camDir = camera.position.clone().normalize();
      if (desiredTilt > 0.2) {
        const tiltRad = (desiredTilt * Math.PI) / 180;
        const groundTarget = camDir.clone().multiplyScalar(postSurfaceR);
        const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
        renderCam.position
          .copy(groundTarget)
          .addScaledVector(camDir, Math.max(0.004, hFinal * Math.cos(tiltRad)))
          .addScaledVector(camUp, -hFinal * Math.sin(tiltRad));
        const minRenderR = postSurfaceR + 0.003;
        if (renderCam.position.length() < minRenderR) {
          renderCam.position.normalize().multiplyScalar(minRenderR);
        }
        renderCam.up.copy(camUp);
        renderCam.lookAt(groundTarget);
      } else {
        renderCam.position.copy(camera.position);
        renderCam.quaternion.copy(camera.quaternion);
        renderCam.up.copy(camera.up);
      }
      renderCam.updateMatrixWorld();

      // Hide coarse global base sphere once fine & wide-parent LOD pyramid is mounted
      marsMesh.visible = currentLodZ < 4 || tileMeshesRef.current.size < 16;

      // Keep headlamp aligned with renderCam + fade coverage & atmosphere close to ground
      headlamp.position.copy(renderCam.position);
      if (coverageSphereRef.current) {
        const covMatLive = coverageSphereRef.current.material as THREE.MeshBasicMaterial;
        const fadeFactor = clamp((altKm - 140) / 750, 0, 1);
        covMatLive.opacity = stateRefs.current.showGlobeCoverageOverlay ? 0.52 * fadeFactor : 0;
        coverageSphereRef.current.visible =
          stateRefs.current.showGlobeCoverageOverlay && fadeFactor > 0.02;
      }
      atmoMesh.visible = altKm > 90;

      const beaconScale = clamp(altKm / 4200, 0.015, 1.0);
      for (const b of landmarkBeacons) {
        b.mesh.visible = altKm > 65;
        b.mesh.scale.setScalar(beaconScale);
        const surfR =
          R_GLOBE +
          ((b.lm.elevation_m / 1000) / 3396.19) * stateRefs.current.reliefExaggeration +
          0.025 * beaconScale;
        b.mesh.position.copy(latLonToSphereVec3(b.lm.lat, b.lm.lon, surfR));
      }

      renderer.render(scene, renderCam);

      // Every 6 frames: determine exact screen-center focus point, trigger LOD tile stream, auto-select active crater, & update HUD
      if (frame % 6 === 0) {
        lookRaycaster.setFromCamera(centerNDC, renderCam);
        const focusHits = lookRaycaster.intersectObject(marsMesh, false);
        const focusLL =
          focusHits.length > 0 ? sphereVec3ToLatLon(focusHits[0].point) : postSub;

        const lodZ = altitudeKmToLodZ(altKm);
        currentLodZ = lodZ;
        const focusElevM =
          sampleLocalGridElevation(focusLL.lat, focusLL.lon, stateRefs.current.grid) ??
          sampleMolaElevationFromBuffer(focusLL.lat, focusLL.lon, buf, mw, mh);

        if (tileDebounceTimer) clearTimeout(tileDebounceTimer);
        tileDebounceTimer = setTimeout(() => {
          syncTilesForView(lodZ, focusLL.lat, focusLL.lon);
        }, 45);

        // Auto-activate nearest mapped Mars landmark when manually zooming into it (< 260 km)
        if (!globeFlyAnimRef.current?.active && altKm < 260) {
          let bestLm: (typeof GLOBAL_MARS_LANDMARKS)[number] | null = null;
          let bestDist = 1.6;
          for (const lm of GLOBAL_MARS_LANDMARKS) {
            const dLon = ((focusLL.lon - lm.lon + 540) % 360) - 180;
            const d = Math.hypot(focusLL.lat - lm.lat, dLon);
            if (d < bestDist) {
              bestDist = d;
              bestLm = lm;
            }
          }
          if (bestLm && stateRefs.current.activeLandmarkId !== bestLm.id && lastAutoRegionCheck !== bestLm.id) {
            lastAutoRegionCheck = bestLm.id;
            selectLandmark(bestLm.id);
          }
        } else if (altKm > 400) {
          lastAutoRegionCheck = "";
        }

        setCameraHud({
          altitudeKm: Math.round(altKm * 10) / 10,
          lodZ,
          loadedTiles: tileMeshesRef.current.size,
          focusLat: focusLL.lat,
          focusLon: focusLL.lon,
          focusElevM: Math.round(focusElevM),
          effectiveTiltDeg: Math.round(desiredTilt),
        });
      }

      // Projected 2D HTML landmarks every 2 frames
      // Projected 2D HTML landmarks every 2 frames with screen-space collision avoidance
      if (frame % 2 === 0) {
        const w = renderer.domElement.clientWidth;
        const h = renderer.domElement.clientHeight;
        const rCamDir = renderCam.position.clone().normalize();
        const rawPins: ProjectedPin[] = GLOBAL_MARS_LANDMARKS.map((lm) => {
          const surfR =
            R_GLOBE +
            ((lm.elevation_m / 1000) / 3396.19) * stateRefs.current.reliefExaggeration +
            clamp(altKm / 4200, 0.015, 1.0) * 0.04;
          const world = latLonToSphereVec3(lm.lat, lm.lon, surfR);
          const dot = world.clone().normalize().dot(rCamDir);
          const proj = world.clone().project(renderCam);
          // Hide far global labels when deeply zoomed into local terrain unless it's the active site
          const showAtAlt =
            altKm > 320 || lm.id === stateRefs.current.activeLandmarkId;
          const x = (proj.x * 0.5 + 0.5) * w;
          const y = (-proj.y * 0.5 + 0.5) * h;
          const inCardClearZone = x < 268 && y < 130;
          const inRightNavZone = x > w - 64 && y < 220;
          return {
            id: lm.id,
            label: lm.name,
            sublabel: lm.resolution_summary,
            category: lm.category,
            x,
            y,
            visible:
              showAtAlt &&
              dot > (altKm > 800 ? 0.14 : 0.92) &&
              proj.z < 1 &&
              proj.x >= -1.02 &&
              proj.x <= 1.02 &&
              proj.y >= -1.02 &&
              proj.y <= 1.02 &&
              !inCardClearZone &&
              !inRightNavZone,
            lat: lm.lat,
            lon: lm.lon,
            elevationM: lm.elevation_m,
            regionId: lm.region_id,
            targetId: lm.target_id,
            coverageClass: lm.coverage_class,
            color:
              lm.category === "ACTIVE_REGION"
                ? "#00F0FF"
                : lm.category === "HISTORIC_MISSION"
                ? "#F59E0B"
                : "#FF5722",
          };
        });

        const priorityRank = (p: ProjectedPin) =>
          p.id === stateRefs.current.activeLandmarkId
            ? 0
            : p.category === "ACTIVE_REGION"
            ? 1
            : p.category === "PLANETARY_LANDMARK"
            ? 2
            : 3;

        const accepted: ProjectedPin[] = [];
        for (const p of [...rawPins].sort((a, b) => priorityRank(a) - priorityRank(b))) {
          if (!p.visible) continue;
          const overlaps = accepted.some(
            (q) => Math.abs(p.x - q.x) < 115 && Math.abs(p.y - q.y) < 28
          );
          if (overlaps) {
            p.visible = false;
          } else {
            accepted.push(p);
          }
        }
        setProjectedPins(rawPins);
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      if (tileDebounceTimer) clearTimeout(tileDebounceTimer);
      resizeObs.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUpClick);
      renderer.domElement.removeEventListener("dblclick", onDoubleClick);
      tileMeshesRef.current.forEach((m) => {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
      tileMeshesRef.current.clear();
      microBumpTex.dispose();
      qgisPatchMeshRef.current = null;
      astroMarkerRef.current = null;
      controls.dispose();
      renderer.dispose();
    };
  }, [mapViewportMode, selectLandmark, buildFallbackTileTexture]);

  // Dynamically displace Base Mars Sphere & active LOD tiles when MOLA loads or exaggeration changes
  useEffect(() => {
    if (mapViewportMode !== "GLOBE_3D") return;
    const { buf, w, h } = molaSamplerRef.current;
    if (marsGlobeMeshRef.current && buf && w > 0 && h > 0) {
      const geo = marsGlobeMeshRef.current.geometry as THREE.BufferGeometry;
      const dirs = geo.userData.unitDirs as Float32Array | undefined;
      const posAttr = geo.attributes.position as THREE.BufferAttribute;
      if (dirs && posAttr) {
        const tmp = new THREE.Vector3();
        for (let i = 0; i < posAttr.count; i++) {
          tmp.set(dirs[i * 3], dirs[i * 3 + 1], dirs[i * 3 + 2]);
          const { lat, lon } = sphereVec3ToLatLon(tmp);
          const elevM = sampleMolaElevationFromBuffer(lat, lon, buf, w, h);
          const r = R_GLOBE + elevationToRadialOffset(elevM, reliefExaggeration);
          posAttr.setXYZ(i, tmp.x * r, tmp.y * r, tmp.z * r);
        }
        posAttr.needsUpdate = true;
        geo.computeVertexNormals();
      }
    }
    // Force LOD tile window refresh with updated relief exaggeration
    activeTileWindowRef.current = "";
    if (tileGroupRef.current && tileMeshesRef.current.size > 0) {
      tileMeshesRef.current.forEach((m) => {
        tileGroupRef.current?.remove(m);
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
      tileMeshesRef.current.clear();
    }
  }, [mapViewportMode, molaReadyTick, reliefExaggeration]);

  // Swap Global Basemap, Sun Angle, and Coverage Visibility without tearing down WebGL
  useEffect(() => {
    if (mapViewportMode !== "GLOBE_3D") return;
    if (marsGlobeMeshRef.current) {
      const mat = marsGlobeMeshRef.current.material as THREE.MeshStandardMaterial;
      const basemapPathMap: Record<GlobeBasemapKey, string> = {
        viking: "/gis/textures/mars_viking_global_2048.jpg",
        mola_color: "/gis/textures/mars_mola_clrshade_2048.jpg",
        thermal: "/gis/textures/mars_thermal_global_2048.jpg",
        geology: "/gis/textures/mars_geology_global_2048.jpg",
      };
      const tex = new THREE.TextureLoader().load(basemapPathMap[globeBasemap]);
      tex.colorSpace = THREE.SRGBColorSpace;
      mat.map = tex;
      mat.needsUpdate = true;
    }
    activeTileWindowRef.current = "";
    if (tileGroupRef.current && tileMeshesRef.current.size > 0) {
      tileMeshesRef.current.forEach((m) => {
        tileGroupRef.current?.remove(m);
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
      tileMeshesRef.current.clear();
    }
    if (sunLightRef.current) {
      sunLightRef.current.position.copy(latLonToSphereVec3(22, globeSunAngleDeg, 80));
    }
    if (coverageSphereRef.current) {
      coverageSphereRef.current.visible = showGlobeCoverageOverlay;
    }
  }, [mapViewportMode, globeBasemap, showGlobeCoverageOverlay, globeSunAngleDeg]);

  // Mount & Update High-Res 96x96 QGIS 3D Terrain, 25m Contours, Routes A/B/C, Targets & Shelters ON THE GLOBE
  useEffect(() => {
    if (mapViewportMode !== "GLOBE_3D") return;
    const group = qgisRegionGroupRef.current;
    if (!group || !terrainTextureCanvas) return;

    // Cleanly dispose previous regional patch & vector children
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
      const mat = (child as THREE.Mesh).material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
    }
    qgisPatchMeshRef.current = null;
    astroMarkerRef.current = null;

    const { buf, w, h } = molaSamplerRef.current;
    const patchGeo = buildRegionalQgisPatchGeometry(grid, reliefExaggeration, buf, w, h);
    const patchTex = new THREE.CanvasTexture(terrainTextureCanvas);
    patchTex.colorSpace = THREE.SRGBColorSpace;
    patchTex.anisotropy = 4;
    const patchMat = new THREE.MeshStandardMaterial({
      map: patchTex,
      roughness: 0.86,
      metalness: 0.04,
      polygonOffset: true,
      polygonOffsetFactor: -22,
      polygonOffsetUnits: -22,
    });
    const patchMesh = new THREE.Mesh(patchGeo, patchMat);
    group.add(patchMesh);
    qgisPatchMeshRef.current = patchMesh;

    const minElev = getGridMinElevation(grid);
    const gridToSphere = (gx: number, gy: number, biasM = 45): THREE.Vector3 => {
      const ix = clamp(Math.round(gx), 0, grid.nx - 1);
      const iy = clamp(Math.round(gy), 0, grid.ny - 1);
      const { lon, lat } = gridToLonLat(gx, gy, grid);
      const borderDist = Math.min(ix, grid.nx - 1 - ix, iy, grid.ny - 1 - iy);
      const blendW = clamp(borderDist / 4, 0, 1);
      const localElev = grid.elevationM[iy][ix];
      const molaElev = sampleMolaElevationFromBuffer(lat, lon, buf, w, h);
      const elevM = molaElev + Math.max(0, localElev - minElev) * 2.4 * blendW;
      const r =
        R_GLOBE +
        elevationToRadialOffset(elevM, reliefExaggeration) +
        0.00075 +
        (biasM / MARS_RADIUS_M) * R_GLOBE * reliefExaggeration;
      return latLonToSphereVec3(lat, lon, r);
    };

    const lonLatToSphereOnGrid = (lon: number, lat: number, extraRadial = 0.00088): THREE.Vector3 => {
      const elevM = sampleAnchoredSurfaceElevation(lat, lon, grid, buf, w, h);
      return latLonToSphereVec3(
        lat,
        lon,
        R_GLOBE + elevationToRadialOffset(elevM, reliefExaggeration) + extraRadial
      );
    };

    // 25m QGIS GDAL Contours directly projected on the curved Martian terrain
    const regionContours = contoursByRegion[grid.regionId];
    if (regionContours && regionContours.length > 0 && (layers.TOPOGRAPHY?.visible || layers.OPTICAL?.visible)) {
      const segPts: number[] = [];
      for (const line of regionContours) {
        for (let i = 0; i < line.length - 1; i++) {
          const p1 = lonLatToSphereOnGrid(line[i][0], line[i][1], 0.00088);
          const p2 = lonLatToSphereOnGrid(line[i + 1][0], line[i + 1][1], 0.00088);
          segPts.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
        }
      }
      if (segPts.length > 0) {
        const cGeo = new THREE.BufferGeometry();
        cGeo.setAttribute("position", new THREE.Float32BufferAttribute(segPts, 3));
        group.add(
          new THREE.LineSegments(
            cGeo,
            new THREE.LineBasicMaterial({
              color: 0xe0f2fe,
              transparent: true,
              opacity: layers.TOPOGRAPHY?.visible ? 0.35 : 0.16,
            })
          )
        );
      }
    }

    // Bingo O2 safe perimeter
    if (layers.BINGO_O2?.visible) {
      const [bx, by] = grid.baseGrid;
      const safeRadiusCells = Math.min(
        grid.nx * 0.44,
        (suitParams.tankCapacityL * (1 - suitParams.reservePercent / 100)) / 18
      );
      const pts: THREE.Vector3[] = [];
      for (let a = 0; a <= 64; a++) {
        const ang = (a / 64) * Math.PI * 2;
        const px = clamp(bx + Math.cos(ang) * safeRadiusCells, 0, grid.nx - 1);
        const py = clamp(by + Math.sin(ang) * safeRadiusCells, 0, grid.ny - 1);
        pts.push(gridToSphere(px, py, 60));
      }
      group.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.9 })
        )
      );
    }

    // EVA Routes A, B, C as curved 3D ribbons on Mars surface
    routes.forEach((rt) => {
      const pts = rt.waypoints.map((wp) =>
        gridToSphere(wp.gx, wp.gy, rt.id === activeRoute.id ? 95 : 55)
      );
      if (pts.length > 1) {
        const curve = new THREE.CatmullRomCurve3(pts);
        const tube = new THREE.TubeGeometry(
          curve,
          Math.max(24, pts.length * 2),
          rt.id === activeRoute.id ? 0.00034 : 0.00018,
          6,
          false
        );
        group.add(
          new THREE.Mesh(
            tube,
            new THREE.MeshBasicMaterial({
              color: rt.color,
              transparent: true,
              opacity: rt.id === activeRoute.id ? 0.98 : 0.5,
            })
          )
        );
      }
    });

    // Base Habitat + Antenna Mast aligned along outward sphere normal
    const basePos = gridToSphere(grid.baseGrid[0], grid.baseGrid[1], 10);
    const upNorm = basePos.clone().normalize();
    const orientToNormal = (obj: THREE.Object3D, p: THREE.Vector3, heightOffset: number) => {
      const n = p.clone().normalize();
      obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      obj.position.copy(p).addScaledVector(n, heightOffset);
    };

    const habMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0007, 0.00085, 0.00085, 16),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, emissive: 0x00f0ff, emissiveIntensity: 0.3 })
    );
    orientToNormal(habMesh, basePos, 0.00042);
    group.add(habMesh);

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.00009, 0.00009, 0.0022, 8),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff })
    );
    orientToNormal(mast, basePos, 0.0011);
    group.add(mast);

    // Scientific Targets for active region or active planetary landmark
    const globeTargets =
      SCIENTIFIC_TARGETS.some((t) => t.region_id === grid.regionId)
        ? SCIENTIFIC_TARGETS.filter((t) => t.region_id === grid.regionId)
        : [activeSiteTarget];
    globeTargets.forEach((t) => {
      const gx = (t.grid_pos.x / 96) * grid.nx;
      const gy = (t.grid_pos.y / 96) * grid.ny;
      const pos = gridToSphere(gx, gy, 150);
      const isSel = t.target_id === activeTargetId || globeTargets.length === 1;
      const beacon = new THREE.Mesh(
        new THREE.OctahedronGeometry(isSel ? 0.00075 : 0.00052, 0),
        new THREE.MeshStandardMaterial({
          color: isSel ? 0xfacc15 : 0xff5722,
          emissive: isSel ? 0xf59e0b : 0xff5722,
          emissiveIntensity: 0.55,
        })
      );
      beacon.position.copy(pos).addScaledVector(upNorm, 0.0005);
      group.add(beacon);
    });

    // Topographic Shelters
    if (layers.SHELTERS?.visible) {
      shelters.forEach((sh) => {
        const pos = gridToSphere(sh.gx, sh.gy, 40);
        const shield = new THREE.Mesh(
          new THREE.ConeGeometry(0.00045, 0.00085, 4),
          new THREE.MeshBasicMaterial({ color: 0x10b981 })
        );
        orientToNormal(shield, pos, 0.00042);
        group.add(shield);
      });
    }

    // Rover Scout Marker
    const [rx, ry] = suitParams.roverRelayGrid;
    const roverPos = gridToSphere(rx, ry, 55);
    const roverMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.00085, 0.00045, 0.00065),
      new THREE.MeshStandardMaterial({
        color: suitParams.roverRelayEnabled ? 0x00f0ff : 0x94a3b8,
        emissive: suitParams.roverRelayEnabled ? 0x00f0ff : 0x000000,
        emissiveIntensity: 0.45,
      })
    );
    orientToNormal(roverMesh, roverPos, 0.00025);
    group.add(roverMesh);

    // EVA-1 Astronaut Avatar
    const astroMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.00065, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x00f0ff,
        emissiveIntensity: 0.9,
      })
    );
    group.add(astroMesh);
    astroMarkerRef.current = astroMesh;
  }, [
    mapViewportMode,
    grid,
    terrainTextureCanvas,
    routes,
    activeRoute,
    shelters,
    activeTargetId,
    activeSiteTarget,
    suitParams,
    layers,
    reliefExaggeration,
    molaReadyTick,
    contoursByRegion,
  ]);

  // Reposition EVA-1 Astronaut smoothly along activeRoute without rebuilding QGIS terrain mesh
  useEffect(() => {
    if (mapViewportMode !== "GLOBE_3D" || !astroMarkerRef.current) return;
    const { buf, w, h } = molaSamplerRef.current;
    const wpIdx = clamp(
      Math.round(twinProgress * (activeRoute.waypoints.length - 1)),
      0,
      Math.max(0, activeRoute.waypoints.length - 1)
    );
    const wp = activeRoute.waypoints[wpIdx];
    if (!wp) return;
    const { lon, lat } = gridToLonLat(wp.gx, wp.gy, grid);
    const elevM = sampleAnchoredSurfaceElevation(lat, lon, grid, buf, w, h);
    const r =
      R_GLOBE +
      elevationToRadialOffset(elevM, reliefExaggeration) +
      0.001 +
      (90 / MARS_RADIUS_M) * R_GLOBE * reliefExaggeration;
    astroMarkerRef.current.position.copy(latLonToSphereVec3(lat, lon, r));
  }, [mapViewportMode, twinProgress, activeRoute, grid, reliefExaggeration]);

  // =========================================================================
  // PRIMARY SITE VIEW: 3D SITE RELIEF MAP ("Mapa 3D del Lugar")
  // =========================================================================
  useEffect(() => {
    if (mapViewportMode !== "TERRAIN_3D") return;
    const container = containerRef.current;
    if (!container || !terrainTextureCanvas) return;

    const width = container.clientWidth || 860;
    const height = container.clientHeight || 560;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070a12);
    const tau = clamp(weatherInputs.opticalDepthTau, 0.2, 2.8);
    const stormRatio = clamp((tau - 0.65) / 1.8, 0, 1);
    const fogColor = new THREE.Color(0x160f0d).lerp(new THREE.Color(0x522a16), stormRatio);
    scene.fog = new THREE.FogExp2(fogColor.getHex(), clamp(0.008 + tau * 0.011, 0.008, 0.044));

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 200);
    camera.position.set(0, 14, 17);
    terrainCameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minDistance = 4.5;
    controls.maxDistance = 36;
    terrainControlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0x8892b0, 0.92));
    const dir = new THREE.DirectionalLight(0xffe6cc, clamp(1.95 - stormRatio * 0.6, 1.0, 2.0));
    const sunRad = (globeSunAngleDeg * Math.PI) / 180;
    dir.position.set(Math.cos(sunRad) * 20, 22, Math.sin(sunRad) * 16);
    scene.add(dir);

    const { nx, ny } = grid;
    const worldW = 20;
    const worldD = 20;

    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        if (grid.elevationM[y][x] < minZ) minZ = grid.elevationM[y][x];
        if (grid.elevationM[y][x] > maxZ) maxZ = grid.elevationM[y][x];
      }
    }
    const zSpan = Math.max(40, maxZ - minZ);
    const elevScale = (4.2 / zSpan) * clamp(reliefExaggeration / 2.2, 0.55, 2.8);

    const gridToWorld = (gx: number, gy: number, yOffset = 0.08): THREE.Vector3 => {
      const ix = clamp(Math.round(gx), 0, nx - 1);
      const iy = clamp(Math.round(gy), 0, ny - 1);
      const wx = ((gx / (nx - 1)) - 0.5) * worldW;
      const wz = (0.5 - gy / (ny - 1)) * worldD;
      const wy = (grid.elevationM[iy][ix] - minZ) * elevScale + yOffset;
      return new THREE.Vector3(wx, wy, wz);
    };

    const planeGeo = new THREE.PlaneGeometry(worldW, worldD, nx - 1, ny - 1);
    planeGeo.rotateX(-Math.PI / 2);
    const posAttr = planeGeo.attributes.position as THREE.BufferAttribute;
    for (let vy = 0; vy < ny; vy++) {
      for (let vx = 0; vx < nx; vx++) {
        const gy = ny - 1 - vy;
        const idx = vy * nx + vx;
        const h = (grid.elevationM[gy][vx] - minZ) * elevScale;
        posAttr.setY(idx, h);
      }
    }
    planeGeo.computeVertexNormals();

    const tex = new THREE.CanvasTexture(terrainTextureCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const terrainMesh = new THREE.Mesh(
      planeGeo,
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05 })
    );
    scene.add(terrainMesh);

    if (layers.TOPOGRAPHY?.visible) {
      scene.add(buildTerrainContours3D(grid, worldW, worldD, minZ, maxZ, elevScale, 0.045, 12));
    }

    const gridHelper = new THREE.GridHelper(worldW, 16, 0x1e293b, 0x0f172a);
    gridHelper.position.y = -0.1;
    scene.add(gridHelper);

    if (layers.BINGO_O2?.visible) {
      const [bx, by] = grid.baseGrid;
      const safeRadiusCells = Math.min(
        nx * 0.45,
        (suitParams.tankCapacityL * (1 - suitParams.reservePercent / 100)) / 18
      );
      const pts: THREE.Vector3[] = [];
      for (let a = 0; a <= 64; a++) {
        const ang = (a / 64) * Math.PI * 2;
        pts.push(
          gridToWorld(
            clamp(bx + Math.cos(ang) * safeRadiusCells, 0, nx - 1),
            clamp(by + Math.sin(ang) * safeRadiusCells, 0, ny - 1),
            0.14
          )
        );
      }
      scene.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.85 })
        )
      );
    }

    routes.forEach((rt) => {
      const pts = rt.waypoints.map((w) =>
        gridToWorld(w.gx, w.gy, rt.id === activeRoute.id ? 0.2 : 0.12)
      );
      if (pts.length > 1) {
        const curve = new THREE.CatmullRomCurve3(pts);
        const tube = new THREE.TubeGeometry(
          curve,
          Math.max(24, pts.length * 2),
          rt.id === activeRoute.id ? 0.095 : 0.05,
          6,
          false
        );
        scene.add(
          new THREE.Mesh(
            tube,
            new THREE.MeshBasicMaterial({
              color: rt.color,
              transparent: true,
              opacity: rt.id === activeRoute.id ? 0.98 : 0.45,
            })
          )
        );
      }
    });

    const basePos = gridToWorld(grid.baseGrid[0], grid.baseGrid[1], 0);
    const habMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.34, 0.35, 16),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, emissive: 0x00f0ff, emissiveIntensity: 0.25 })
    );
    habMesh.position.copy(basePos).add(new THREE.Vector3(0, 0.18, 0));
    scene.add(habMesh);

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff })
    );
    mast.position.copy(basePos).add(new THREE.Vector3(0, 0.65, 0));
    scene.add(mast);

    const siteTargets =
      SCIENTIFIC_TARGETS.some((t) => t.region_id === grid.regionId)
        ? SCIENTIFIC_TARGETS.filter((t) => t.region_id === grid.regionId)
        : [activeSiteTarget];
    const spinningBeacons: THREE.Mesh[] = [];
    siteTargets.forEach((t) => {
      const gx = (t.grid_pos.x / 96) * nx;
      const gy = (t.grid_pos.y / 96) * ny;
      const isSel = t.target_id === activeTargetId || siteTargets.length === 1;
      const tPos = gridToWorld(gx, gy, 0.45);
      const beacon = new THREE.Mesh(
        new THREE.OctahedronGeometry(isSel ? 0.32 : 0.22, 0),
        new THREE.MeshStandardMaterial({
          color: isSel ? 0xfacc15 : 0xff5722,
          emissive: isSel ? 0xf59e0b : 0xff5722,
          emissiveIntensity: 0.6,
        })
      );
      beacon.position.copy(tPos);
      scene.add(beacon);
      spinningBeacons.push(beacon);

      if (isSel) {
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.12, 3.2, 10),
          new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.22 })
        );
        beam.position.copy(tPos).add(new THREE.Vector3(0, 1.6, 0));
        scene.add(beam);
      }
    });

    if (layers.SHELTERS?.visible) {
      shelters.forEach((sh) => {
        const shield = new THREE.Mesh(
          new THREE.ConeGeometry(0.18, 0.32, 4),
          new THREE.MeshBasicMaterial({ color: 0x10b981 })
        );
        shield.position.copy(gridToWorld(sh.gx, sh.gy, 0.26));
        scene.add(shield);
      });
    }

    const [rx, ry] = suitParams.roverRelayGrid;
    const roverMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.18, 0.24),
      new THREE.MeshStandardMaterial({
        color: suitParams.roverRelayEnabled ? 0x00f0ff : 0x94a3b8,
        emissive: suitParams.roverRelayEnabled ? 0x00f0ff : 0x000000,
        emissiveIntensity: 0.4,
      })
    );
    roverMesh.position.copy(gridToWorld(rx, ry, 0.22));
    scene.add(roverMesh);

    const wpIdx = clamp(
      Math.round(twinProgress * (activeRoute.waypoints.length - 1)),
      0,
      Math.max(0, activeRoute.waypoints.length - 1)
    );
    const wp = activeRoute.waypoints[wpIdx];
    if (wp) {
      const astroMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x00f0ff, emissiveIntensity: 0.85 })
      );
      astroMesh.position.copy(gridToWorld(wp.gx, wp.gy, 0.34));
      scene.add(astroMesh);
    }

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const onPointerClick = (ev: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObject(terrainMesh, false);
      if (hits.length > 0) {
        const pt = hits[0].point;
        const gx = clamp(Math.round(((pt.x / worldW) + 0.5) * (nx - 1)), 0, nx - 1);
        const gy = clamp(Math.round((0.5 - pt.z / worldD) * (ny - 1)), 0, ny - 1);
        const { lon, lat } = gridToLonLat(gx, gy, grid);
        setFpGridPos([gx, gy]);
        fpPoseRef.current.gx = gx;
        fpPoseRef.current.gy = gy;
        setInspectedCell({
          gx,
          gy,
          lon: Number(lon.toFixed(4)),
          lat: Number(lat.toFixed(4)),
          elevationM: Math.round(grid.elevationM[gy][gx]),
          slopeDeg: grid.slopeDeg[gy][gx],
          roughnessM: grid.roughnessM[gy][gx],
          sandTrap: grid.sandTrap[gy][gx],
          slipHazard: grid.slipHazard[gy][gx],
          uncertainty: grid.uncertainty[gy][gx],
          hasCommLoS: grid.viewshedLoS[gy][gx] === 1,
          shelterScore: grid.shelterScore[gy][gx],
          o2PerM: grid.o2CostPerMeter[gy][gx],
        });
      }
    };
    renderer.domElement.addEventListener("click", onPointerClick);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 860;
      const h = container.clientHeight || 560;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObs = new ResizeObserver(onResize);
    resizeObs.observe(container);

    let animId = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      spinningBeacons.forEach((b) => {
        b.rotation.y += 0.015;
      });
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      resizeObs.disconnect();
      renderer.domElement.removeEventListener("click", onPointerClick);
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
          else mesh.material.dispose();
        }
      });
      tex.dispose();
      controls.dispose();
      renderer.dispose();
    };
  }, [
    mapViewportMode,
    grid,
    terrainTextureCanvas,
    routes,
    activeRoute,
    shelters,
    activeTargetId,
    activeSiteTarget,
    twinProgress,
    suitParams,
    layers.BINGO_O2?.visible,
    layers.SHELTERS?.visible,
    layers.TOPOGRAPHY?.visible,
    reliefExaggeration,
    weatherInputs.opticalDepthTau,
    globeSunAngleDeg,
  ]);

  // =========================================================================
  // FIRST-PERSON 360° SURFACE EXPLORER ("Relieve en 1ª Persona (360°)")
  // =========================================================================
  useEffect(() => {
    if (mapViewportMode !== "FIRST_PERSON_3D") return;
    const container = containerRef.current;
    if (!container || !terrainTextureCanvas) return;

    const width = container.clientWidth || 860;
    const height = container.clientHeight || 560;

    const scene = new THREE.Scene();
    const tau = clamp(weatherInputs.opticalDepthTau, 0.2, 2.9);
    const stormRatio = clamp((tau - 0.55) / 1.85, 0, 1);
    const skyColor = new THREE.Color(0x9a5539).lerp(new THREE.Color(0x7d451e), stormRatio);
    scene.background = skyColor;
    scene.fog = new THREE.FogExp2(skyColor.getHex(), clamp(0.015 + tau * 0.032, 0.015, 0.11));

    const camera = new THREE.PerspectiveCamera(68, width / height, 0.03, 220);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // Martian atmospheric gradient sky dome (butterscotch horizon -> dusty dusk zenith)
    const skyDomeGeo = new THREE.SphereGeometry(140, 24, 16);
    const skyPos = skyDomeGeo.attributes.position as THREE.BufferAttribute;
    const skyCols = new Float32Array(skyPos.count * 3);
    const horizC = new THREE.Color(0xb86b45).lerp(new THREE.Color(0x8e5124), stormRatio);
    const zenithC = new THREE.Color(0x281c26).lerp(new THREE.Color(0x52311a), stormRatio);
    for (let i = 0; i < skyPos.count; i++) {
      const nyNorm = clamp((skyPos.getY(i) + 12) / 110, 0, 1);
      const mix = horizC.clone().lerp(zenithC, Math.pow(nyNorm, 0.65));
      skyCols[i * 3] = mix.r;
      skyCols[i * 3 + 1] = mix.g;
      skyCols[i * 3 + 2] = mix.b;
    }
    skyDomeGeo.setAttribute("color", new THREE.BufferAttribute(skyCols, 3));
    const skyDome = new THREE.Mesh(
      skyDomeGeo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.BackSide,
        fog: false,
        depthWrite: false,
      })
    );
    scene.add(skyDome);

    // Lighting + visible Martian sun disc
    const sunRad = (globeSunAngleDeg * Math.PI) / 180;
    scene.add(new THREE.HemisphereLight(0xd99b72, 0x261510, 0.95));
    const dir = new THREE.DirectionalLight(0xffdfc4, clamp(2.15 - stormRatio * 0.85, 0.95, 2.2));
    dir.position.set(Math.cos(sunRad) * 65, 42, Math.sin(sunRad) * 55);
    scene.add(dir);

    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(3.4, 24),
      new THREE.MeshBasicMaterial({
        color: stormRatio > 0.65 ? 0xfdba74 : 0xffedd5,
        transparent: true,
        opacity: clamp(0.85 - stormRatio * 0.5, 0.25, 0.9),
        fog: false,
      })
    );
    sunDisc.position.copy(dir.position).normalize().multiplyScalar(118);
    sunDisc.lookAt(0, 0, 0);
    scene.add(sunDisc);

    const { nx, ny } = grid;
    const worldW = 36;
    const worldD = 36;

    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        if (grid.elevationM[y][x] < minZ) minZ = grid.elevationM[y][x];
        if (grid.elevationM[y][x] > maxZ) maxZ = grid.elevationM[y][x];
      }
    }
    const zSpan = Math.max(40, maxZ - minZ);
    const elevScale = (5.8 / zSpan) * clamp(reliefExaggeration / 2.2, 0.65, 2.8);

    const sampleElevAtGrid = (gx: number, gy: number): number => {
      const cx = clamp(gx, 0, nx - 1);
      const cy = clamp(gy, 0, ny - 1);
      const x0 = Math.floor(cx);
      const y0 = Math.floor(cy);
      const x1 = Math.min(nx - 1, x0 + 1);
      const y1 = Math.min(ny - 1, y0 + 1);
      const tx = cx - x0;
      const ty = cy - y0;
      const e00 = grid.elevationM[y0][x0];
      const e10 = grid.elevationM[y0][x1];
      const e01 = grid.elevationM[y1][x0];
      const e11 = grid.elevationM[y1][x1];
      return (e00 * (1 - tx) + e10 * tx) * (1 - ty) + (e01 * (1 - tx) + e11 * tx) * ty;
    };

    const gridToWorld = (gx: number, gy: number, yOffset = 0): THREE.Vector3 => {
      const wx = ((gx / (nx - 1)) - 0.5) * worldW;
      const wz = (0.5 - gy / (ny - 1)) * worldD;
      const wy = (sampleElevAtGrid(gx, gy) - minZ) * elevScale + yOffset;
      return new THREE.Vector3(wx, wy, wz);
    };

    const planeGeo = new THREE.PlaneGeometry(worldW, worldD, nx - 1, ny - 1);
    planeGeo.rotateX(-Math.PI / 2);
    const posAttr = planeGeo.attributes.position as THREE.BufferAttribute;
    for (let vy = 0; vy < ny; vy++) {
      for (let vx = 0; vx < nx; vx++) {
        const gy = ny - 1 - vy;
        const idx = vy * nx + vx;
        const h = (grid.elevationM[gy][vx] - minZ) * elevScale;
        posAttr.setY(idx, h);
      }
    }
    planeGeo.computeVertexNormals();

    const tex = new THREE.CanvasTexture(terrainTextureCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const microBumpTex = createMartianMicroDetailBumpTexture();
    microBumpTex.repeat.set(18, 18);

    const terrainMesh = new THREE.Mesh(
      planeGeo,
      new THREE.MeshStandardMaterial({
        map: tex,
        bumpMap: microBumpTex,
        bumpScale: 0.055,
        roughness: 0.9,
        metalness: 0.03,
      })
    );
    scene.add(terrainMesh);

    // 3D Elevation Contour Lines draping over the surface relief
    if (layers.TOPOGRAPHY?.visible) {
      scene.add(buildTerrainContours3D(grid, worldW, worldD, minZ, maxZ, elevScale, 0.035, 14));
    }

    // Instanced 3D Basalt Boulders & Outcrops scattered deterministically by roughness/sand
    const rockGeo = new THREE.DodecahedronGeometry(0.14, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x5c3a2c,
      roughness: 0.94,
      flatShading: true,
    });
    const rockTransforms: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();
    for (let y = 1; y < ny - 1; y += 2) {
      for (let x = 1; x < nx - 1; x += 2) {
        const roughVal = grid.roughnessM[y][x];
        const sandVal = grid.sandTrap[y][x];
        const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
        const score = roughVal * 0.14 + (1 - sandVal) * 0.25;
        if ((hash % 100) / 100 < Math.min(0.45, score * 0.42)) {
          const jx = x + ((hash % 17) / 17 - 0.5) * 1.4;
          const jy = y + (((hash >> 4) % 17) / 17 - 0.5) * 1.4;
          const s = 0.55 + ((hash >> 8) % 100) / 85;
          const rp = gridToWorld(jx, jy, 0.02 * s);
          dummy.position.copy(rp);
          dummy.rotation.set(((hash >> 2) % 360) * 0.01, (hash % 360) * 0.017, 0);
          dummy.scale.set(s * 1.1, s * 0.68, s);
          dummy.updateMatrix();
          rockTransforms.push(dummy.matrix.clone());
          if (rockTransforms.length >= 180) break;
        }
      }
      if (rockTransforms.length >= 180) break;
    }
    if (rockTransforms.length > 0) {
      const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockTransforms.length);
      rockTransforms.forEach((m, i) => rockInst.setMatrixAt(i, m));
      rockInst.instanceMatrix.needsUpdate = true;
      scene.add(rockInst);
    }

    // Bingo O2 perimeter ring
    if (layers.BINGO_O2?.visible) {
      const [bx, by] = grid.baseGrid;
      const safeRadiusCells = Math.min(
        nx * 0.45,
        (suitParams.tankCapacityL * (1 - suitParams.reservePercent / 100)) / 18
      );
      const pts: THREE.Vector3[] = [];
      for (let a = 0; a <= 64; a++) {
        const ang = (a / 64) * Math.PI * 2;
        pts.push(
          gridToWorld(
            clamp(bx + Math.cos(ang) * safeRadiusCells, 0, nx - 1),
            clamp(by + Math.sin(ang) * safeRadiusCells, 0, ny - 1),
            0.09
          )
        );
      }
      scene.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.85 })
        )
      );
    }

    // EVA Routes A, B, C ribbons along the 1st-person relief
    routes.forEach((rt) => {
      const pts = rt.waypoints.map((w) =>
        gridToWorld(w.gx, w.gy, rt.id === activeRoute.id ? 0.09 : 0.05)
      );
      if (pts.length > 1) {
        const curve = new THREE.CatmullRomCurve3(pts);
        const tube = new THREE.TubeGeometry(
          curve,
          Math.max(24, pts.length * 2),
          rt.id === activeRoute.id ? 0.07 : 0.035,
          6,
          false
        );
        scene.add(
          new THREE.Mesh(
            tube,
            new THREE.MeshBasicMaterial({
              color: rt.color,
              transparent: true,
              opacity: rt.id === activeRoute.id ? 0.95 : 0.4,
            })
          )
        );
      }
    });

    // Habitat / Lander module + tall comms mast
    const basePos = gridToWorld(grid.baseGrid[0], grid.baseGrid[1], 0);
    const habBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.52, 0.48, 16),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, emissive: 0x0ea5e9, emissiveIntensity: 0.25 })
    );
    habBody.position.copy(basePos).add(new THREE.Vector3(0, 0.24, 0));
    scene.add(habBody);

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.04, 1.35, 8),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff })
    );
    mast.position.copy(basePos).add(new THREE.Vector3(0, 0.92, 0));
    scene.add(mast);

    // Scientific Target Beacon(s) + Tall Skyward Orbital Pillar
    const fpTargets =
      SCIENTIFIC_TARGETS.some((t) => t.region_id === grid.regionId)
        ? SCIENTIFIC_TARGETS.filter((t) => t.region_id === grid.regionId)
        : [activeSiteTarget];
    const spinningBeacons: THREE.Mesh[] = [];
    fpTargets.forEach((t) => {
      const gx = (t.grid_pos.x / 96) * nx;
      const gy = (t.grid_pos.y / 96) * ny;
      const isSel = t.target_id === activeTargetId || fpTargets.length === 1;
      const tPos = gridToWorld(gx, gy, 0.55);
      const beacon = new THREE.Mesh(
        new THREE.OctahedronGeometry(isSel ? 0.36 : 0.24, 0),
        new THREE.MeshStandardMaterial({
          color: isSel ? 0xfacc15 : 0xff5722,
          emissive: isSel ? 0xf59e0b : 0xff5722,
          emissiveIntensity: 0.7,
        })
      );
      beacon.position.copy(tPos);
      scene.add(beacon);
      spinningBeacons.push(beacon);

      if (isSel) {
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.22, 12, 12),
          new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.24 })
        );
        beam.position.copy(tPos).add(new THREE.Vector3(0, 6, 0));
        scene.add(beam);
      }
    });

    // Topographic Shelters
    if (layers.SHELTERS?.visible) {
      shelters.forEach((sh) => {
        const shield = new THREE.Mesh(
          new THREE.ConeGeometry(0.24, 0.46, 4),
          new THREE.MeshBasicMaterial({ color: 0x10b981 })
        );
        shield.position.copy(gridToWorld(sh.gx, sh.gy, 0.26));
        scene.add(shield);
      });
    }

    // Rover Scout Relay
    const [rx, ry] = suitParams.roverRelayGrid;
    const roverPos = gridToWorld(rx, ry, 0.16);
    const roverMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.24, 0.34),
      new THREE.MeshStandardMaterial({
        color: suitParams.roverRelayEnabled ? 0x00f0ff : 0x94a3b8,
        emissive: suitParams.roverRelayEnabled ? 0x00f0ff : 0x000000,
        emissiveIntensity: 0.45,
      })
    );
    roverMesh.position.copy(roverPos);
    scene.add(roverMesh);

    const roverMast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.65, 8),
      new THREE.MeshBasicMaterial({ color: suitParams.roverRelayEnabled ? 0x00f0ff : 0x64748b })
    );
    roverMast.position.copy(roverPos).add(new THREE.Vector3(0, 0.42, 0));
    scene.add(roverMast);

    // Smooth Navigation State (60fps pointer look, WASD/arrows, & click-to-walk)
    let walkTarget: { gx: number; gy: number } | null = null;
    const pressedKeys = new Set<string>();
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let lastX = 0;
    let lastY = 0;
    let totalDragDist = 0;

    const syncHudNow = () => {
      const p = fpPoseRef.current;
      setFpGridPos([Math.round(p.gx), Math.round(p.gy)]);
      setFpYawDeg(Math.round(((p.yawDeg % 360) + 360) % 360));
      setFpPitchDeg(Math.round(p.pitchDeg));
    };

    fpActionRef.current = {
      moveStep: (fwd: number, strafe = 0) => {
        const p = fpPoseRef.current;
        const rad = (p.yawDeg * Math.PI) / 180;
        const stepCells = Math.max(1.2, nx * 0.045);
        p.gx = clamp(
          p.gx + (Math.sin(rad) * fwd + Math.cos(rad) * strafe) * stepCells,
          0.5,
          nx - 1.5
        );
        p.gy = clamp(
          p.gy + (Math.cos(rad) * fwd - Math.sin(rad) * strafe) * stepCells,
          0.5,
          ny - 1.5
        );
        walkTarget = null;
        syncHudNow();
      },
      turnBy: (dYaw: number, dPitch = 0) => {
        const p = fpPoseRef.current;
        p.yawDeg = (p.yawDeg + dYaw + 360) % 360;
        p.pitchDeg = clamp(p.pitchDeg + dPitch, -62, 68);
        syncHudNow();
      },
      lookAtGrid: (tx: number, ty: number) => {
        const p = fpPoseRef.current;
        p.yawDeg = ((Math.atan2(tx - p.gx, ty - p.gy) * 180) / Math.PI + 360) % 360;
        p.pitchDeg = -2;
        syncHudNow();
      },
      jumpToGrid: (gx: number, gy: number, lookAtTarget?: [number, number]) => {
        const p = fpPoseRef.current;
        p.gx = clamp(gx, 0.5, nx - 1.5);
        p.gy = clamp(gy, 0.5, ny - 1.5);
        walkTarget = null;
        if (lookAtTarget) {
          p.yawDeg =
            ((Math.atan2(lookAtTarget[0] - p.gx, lookAtTarget[1] - p.gy) * 180) / Math.PI + 360) %
            360;
          p.pitchDeg = -2;
        }
        syncHudNow();
      },
    };

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
      totalDragDist = 0;
      renderer.domElement.setPointerCapture?.(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      totalDragDist += Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY) > 0 ? Math.hypot(dx, dy) : 0;
      fpPoseRef.current.yawDeg = (fpPoseRef.current.yawDeg - dx * 0.28 + 360) % 360;
      fpPoseRef.current.pitchDeg = clamp(fpPoseRef.current.pitchDeg + dy * 0.22, -62, 68);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isDragging) return;
      isDragging = false;
      renderer.domElement.releasePointerCapture?.(e.pointerId);
      if (totalDragDist < 6) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObject(terrainMesh, false);
        if (hits.length > 0) {
          const pt = hits[0].point;
          const gx = clamp(((pt.x / worldW) + 0.5) * (nx - 1), 0.5, nx - 1.5);
          const gy = clamp((0.5 - pt.z / worldD) * (ny - 1), 0.5, ny - 1.5);
          const ix = clamp(Math.round(gx), 0, nx - 1);
          const iy = clamp(Math.round(gy), 0, ny - 1);
          walkTarget = { gx, gy };
          const { lon, lat } = gridToLonLat(ix, iy, grid);
          setInspectedCell({
            gx: ix,
            gy: iy,
            lon: Number(lon.toFixed(4)),
            lat: Number(lat.toFixed(4)),
            elevationM: Math.round(grid.elevationM[iy][ix]),
            slopeDeg: grid.slopeDeg[iy][ix],
            roughnessM: grid.roughnessM[iy][ix],
            sandTrap: grid.sandTrap[iy][ix],
            slipHazard: grid.slipHazard[iy][ix],
            uncertainty: grid.uncertainty[iy][ix],
            hasCommLoS: grid.viewshedLoS[iy][ix] === 1,
            shelterScore: grid.shelterScore[iy][ix],
            o2PerM: grid.o2CostPerMeter[iy][ix],
          });
        }
      } else {
        syncHudNow();
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      camera.fov = clamp(camera.fov + e.deltaY * 0.03, 35, 82);
      camera.updateProjectionMatrix();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", "q", "e"].includes(k)) {
        pressedKeys.add(k);
        if (k.startsWith("arrow")) e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      pressedKeys.delete(e.key.toLowerCase());
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 860;
      const h = container.clientHeight || 560;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObs = new ResizeObserver(onResize);
    resizeObs.observe(container);

    let animId = 0;
    let lastTime = performance.now();
    let lastHudSync = 0;

    const animate = (now: number) => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min(0.06, (now - lastTime) / 1000);
      lastTime = now;

      const p = fpPoseRef.current;

      // Keyboard movement / rotation
      const moveSpeed = Math.max(4.5, nx * 0.14) * dt;
      const rotSpeed = 68 * dt;
      let fwd = 0;
      let strafe = 0;
      if (pressedKeys.has("w") || pressedKeys.has("arrowup")) fwd += 1;
      if (pressedKeys.has("s") || pressedKeys.has("arrowdown")) fwd -= 1;
      if (pressedKeys.has("d")) strafe += 1;
      if (pressedKeys.has("a")) strafe -= 1;
      if (pressedKeys.has("arrowleft") || pressedKeys.has("q")) p.yawDeg = (p.yawDeg - rotSpeed + 360) % 360;
      if (pressedKeys.has("arrowright") || pressedKeys.has("e")) p.yawDeg = (p.yawDeg + rotSpeed + 360) % 360;

      if (fwd !== 0 || strafe !== 0) {
        const rad = (p.yawDeg * Math.PI) / 180;
        p.gx = clamp(p.gx + (Math.sin(rad) * fwd + Math.cos(rad) * strafe) * moveSpeed, 0.5, nx - 1.5);
        p.gy = clamp(p.gy + (Math.cos(rad) * fwd - Math.sin(rad) * strafe) * moveSpeed, 0.5, ny - 1.5);
        walkTarget = null;
      } else if (walkTarget) {
        const dx = walkTarget.gx - p.gx;
        const dy = walkTarget.gy - p.gy;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.15) {
          p.gx = walkTarget.gx;
          p.gy = walkTarget.gy;
          walkTarget = null;
          syncHudNow();
        } else {
          const step = Math.min(dist, Math.max(8, nx * 0.22) * dt);
          p.gx += (dx / dist) * step;
          p.gy += (dy / dist) * step;
        }
      }

      const eyeOffset = p.eyeHeightM >= 3 ? 0.68 : 0.26;
      const camPos = gridToWorld(p.gx, p.gy, eyeOffset);
      camera.position.copy(camPos);

      const yawRad = (p.yawDeg * Math.PI) / 180;
      const pitchRad = (p.pitchDeg * Math.PI) / 180;
      const cosP = Math.cos(pitchRad);
      const lookDir = new THREE.Vector3(
        Math.sin(yawRad) * cosP,
        Math.sin(pitchRad),
        -Math.cos(yawRad) * cosP
      );
      camera.lookAt(camPos.clone().add(lookDir));

      spinningBeacons.forEach((b) => {
        b.rotation.y += 0.018;
      });

      if (now - lastHudSync > 130 && (pressedKeys.size > 0 || walkTarget !== null)) {
        lastHudSync = now;
        syncHudNow();
      }

      renderer.render(scene, camera);
    };
    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      resizeObs.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      fpActionRef.current = {};
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
          else mesh.material.dispose();
        }
      });
      tex.dispose();
      microBumpTex.dispose();
      renderer.dispose();
    };
  }, [
    mapViewportMode,
    grid,
    terrainTextureCanvas,
    routes,
    activeRoute,
    shelters,
    activeTargetId,
    activeSiteTarget,
    suitParams,
    layers.BINGO_O2?.visible,
    layers.SHELTERS?.visible,
    layers.TOPOGRAPHY?.visible,
    reliefExaggeration,
    weatherInputs.opticalDepthTau,
    globeSunAngleDeg,
  ]);

  // Keep eye height ref synced without rebuilding FIRST_PERSON_3D scene
  useEffect(() => {
    fpPoseRef.current.eyeHeightM = fpEyeHeightM;
  }, [fpEyeHeightM]);

  // Logarithmic Altitude-Based Zoom In / Zoom Out buttons
  const handleZoomStep = (altitudeScaleFactor: number) => {
    const cam = mapViewportMode === "GLOBE_3D" ? globeCameraRef.current : terrainCameraRef.current;
    if (!cam) return;
    if (mapViewportMode === "GLOBE_3D") {
      const sub = sphereVec3ToLatLon(cam.position);
      const elevM = sampleMolaElevationFromBuffer(
        sub.lat,
        sub.lon,
        molaSamplerRef.current.buf,
        molaSamplerRef.current.w,
        molaSamplerRef.current.h
      );
      const localR = R_GLOBE + elevationToRadialOffset(elevM, reliefExaggeration);
      const currentAlt = Math.max(0.004, cam.position.length() - localR);
      const nextAlt = clamp(currentAlt * altitudeScaleFactor, 0.0045, 32.0);
      cam.position.normalize().multiplyScalar(localR + nextAlt);
    } else {
      cam.position.multiplyScalar(altitudeScaleFactor);
    }
  };

  const handleOrbitOverview = () => {
    if (mapViewportMode === "GLOBE_3D" && globeCameraRef.current) {
      const cam = globeCameraRef.current;
      const startPos = cam.position.clone();
      const startDir = startPos.clone().normalize();
      const endDir = latLonToSphereVec3(8, 102, 1.0).normalize();
      globeFlyAnimRef.current = {
        active: true,
        startDir,
        endDir,
        startAlt: Math.max(0.02, startPos.length() - R_GLOBE),
        endAlt: 16.8, // ~5,700 km global orbital view
        hopArc: 0,
        t: 0,
      };
    } else if (terrainCameraRef.current && terrainControlsRef.current) {
      terrainCameraRef.current.position.set(0, 14, 17);
      terrainControlsRef.current.target.set(0, 0, 0);
      terrainControlsRef.current.update();
    }
  };

  const handleDescendOnGlobe = () => {
    const lat = activeLandmark.lat;
    const lon = activeLandmark.lon;
    const label = activeLandmark.name;
    const rId = activeLandmark.region_id;
    const tId = rId ? activeSiteTarget.target_id : undefined;
    if (mapViewportMode !== "GLOBE_3D") {
      setMapViewportMode("GLOBE_3D");
      setTimeout(() => {
        flyToGlobeLocation(lat, lon, label, rId, tId);
      }, 60);
    } else {
      flyToGlobeLocation(lat, lon, label, rId, tId);
    }
  };

  const activeLayersCount = Object.values(layers).filter((l) => l.visible).length;

  const LAYER_CHIPS: Array<{ id: string; label: string; activeClass: string }> = [
    { id: "TOPOGRAPHY", label: "Relieve + Curvas", activeClass: "bg-cyan-950/90 border-cyan-400 text-cyan-200" },
    { id: "OPTICAL", label: "Óptico Base", activeClass: "bg-amber-950/80 border-amber-400 text-amber-200" },
    { id: "SLOPE", label: "Pendientes", activeClass: "bg-orange-950/85 border-orange-400 text-orange-200" },
    { id: "ROUGHNESS", label: "Rugosidad", activeClass: "bg-rose-950/85 border-rose-400 text-rose-200" },
    { id: "THERMAL", label: "Térmico THEMIS", activeClass: "bg-red-950/85 border-red-400 text-red-200" },
    { id: "SPECTRAL", label: "Mineral CRISM", activeClass: "bg-violet-950/85 border-violet-400 text-violet-200" },
    { id: "CHEMICAL", label: "Astrobiología", activeClass: "bg-teal-950/85 border-teal-400 text-teal-200" },
    { id: "GEOLOGICAL", label: "Geología", activeClass: "bg-fuchsia-950/85 border-fuchsia-400 text-fuchsia-200" },
    { id: "BOULDERS_SAND", label: "Rocas/Arena", activeClass: "bg-yellow-950/85 border-yellow-400 text-yellow-200" },
    { id: "SLIP_HAZARD", label: "Riesgo Caída", activeClass: "bg-red-950/90 border-red-500 text-red-200" },
    { id: "O2_COST", label: "Costo O₂", activeClass: "bg-pink-950/85 border-pink-400 text-pink-200" },
    { id: "BINGO_O2", label: "Radio Bingo O₂", activeClass: "bg-emerald-950/85 border-emerald-400 text-emerald-200" },
    { id: "COMM_LOS", label: "Vistas RF LoS", activeClass: "bg-purple-950/85 border-purple-400 text-purple-200" },
    { id: "SHELTERS", label: "Refugios", activeClass: "bg-emerald-950/90 border-emerald-500 text-emerald-200" },
    { id: "UNCERTAINTY", label: "Incertidumbre", activeClass: "bg-indigo-950/85 border-indigo-400 text-indigo-200" },
  ];

  const fpIx = clamp(Math.round(fpGridPos[0]), 0, grid.nx - 1);
  const fpIy = clamp(Math.round(fpGridPos[1]), 0, grid.ny - 1);
  const fpElevM = Math.round(grid.elevationM[fpIy][fpIx]);
  const fpSlopeDeg = grid.slopeDeg[fpIy][fpIx];
  const fpHasLoS = grid.viewshedLoS[fpIy][fpIx] === 1;
  const compassDirs = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  const fpCompassLabel = compassDirs[Math.round(((fpYawDeg % 360) + 360) % 360 / 45) % 8];
  const targetGridX = (activeSiteTarget.grid_pos.x / 96) * grid.nx;
  const targetGridY = (activeSiteTarget.grid_pos.y / 96) * grid.ny;

  return (
    <div className="relative flex flex-col rounded-xl border border-slate-800 bg-[#07090E] overflow-hidden shadow-2xl">
      {/* Row 1: Top Mode Switcher & Global Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-950/95 border-b border-slate-800 z-20">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap rounded-lg bg-slate-900 p-0.5 border border-slate-800 gap-0.5">
            <button
              onClick={() => setMapViewportMode("TERRAIN_3D")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                mapViewportMode === "TERRAIN_3D"
                  ? "bg-hudcyan text-slate-950 shadow"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <Mountain className="w-3.5 h-3.5" />
              Mapa 3D del Lugar
            </button>
            <button
              onClick={() => setMapViewportMode("FIRST_PERSON_3D")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                mapViewportMode === "FIRST_PERSON_3D"
                  ? "bg-amber-400 text-slate-950 shadow"
                  : "text-amber-200/90 hover:text-white hover:bg-slate-800/80"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Relieve en 1ª Persona (360°)
            </button>
            <button
              onClick={() => setMapViewportMode("GLOBE_3D")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                mapViewportMode === "GLOBE_3D"
                  ? "bg-mars text-white shadow"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <Globe2 className="w-3.5 h-3.5" />
              Globo Marte 3D (Google Earth)
            </button>
          </div>

          {mapViewportMode === "GLOBE_3D" ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                value={globeBasemap}
                onChange={(e) => setGlobeBasemap(e.target.value as GlobeBasemapKey)}
                className="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded-md px-2 py-1.5"
                title="Capa Global NASA sobre la Esfera 3D"
              >
                <option value="viking">NASA Viking MDIM 2.1 Color (232m · LOD z=1..7)</option>
                <option value="mola_color">NASA MOLA Topografía Color (463m · LOD z=1..7)</option>
                <option value="thermal">Inercia Térmica Global (THEMIS Proxy)</option>
                <option value="geology">Unidades Geológicas Globales</option>
              </select>
              <button
                onClick={() => setShowGlobeCoverageOverlay(!showGlobeCoverageOverlay)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs border transition ${
                  showGlobeCoverageOverlay
                    ? "bg-cyan-950/70 border-hudcyan/60 text-hudcyan"
                    : "bg-slate-900 border-slate-700 text-slate-400"
                }`}
                title="Mostrar polígonos HiRISE/CRISM vs cobertura global MOLA"
              >
                <Layers className="w-3.5 h-3.5" />
                Cobertura PDS
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="px-2.5 py-1 rounded-md bg-cyan-950/70 border border-hudcyan/50 text-xs font-semibold text-hudcyan">
                {activeLandmark.name} · {activeLandmark.elevation_m > 0 ? `+${activeLandmark.elevation_m}` : activeLandmark.elevation_m} m
              </span>
              {mapViewportMode === "TERRAIN_3D" ? (
                <button
                  onClick={() => setMapViewportMode("FIRST_PERSON_3D")}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500/20 hover:bg-amber-400 hover:text-slate-950 border border-amber-400/60 text-amber-200 transition"
                >
                  <Footprints className="w-3.5 h-3.5" />
                  Explorar en 1ª Persona
                </button>
              ) : (
                <button
                  onClick={() => setMapViewportMode("TERRAIN_3D")}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-800 hover:bg-hudcyan hover:text-slate-950 border border-slate-600 text-slate-200 transition"
                >
                  <Mountain className="w-3.5 h-3.5" />
                  Volver al Mapa 3D
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Controls: Expand Viewport, GDAL status, & QGIS Desktop MCP Bridge */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setExpandedViewport(!expandedViewport)}
            className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-semibold bg-slate-900 border border-slate-700 text-slate-200 hover:border-hudcyan transition"
            title="Expandir visor estilo Google Earth Pro"
          >
            {expandedViewport ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span className="hidden xl:inline">{expandedViewport ? "Compactar" : "Expandir Visor"}</span>
          </button>
          <span className="hidden lg:inline-flex items-center gap-1 text-[11px] font-mono text-slate-400 bg-slate-900 px-2 py-1 rounded border border-slate-800">
            {grid.fromQgisGdal ? (
              <span className="text-nominal">● GDAL 3.13 / QGIS 3.44</span>
            ) : (
              <span className="text-amber-300">● Relieve 3D MOLA/HiRISE</span>
            )}
            <span>· {activeLayersCount}/20</span>
          </span>
          <button
            onClick={() => setQgisPanelOpen(!qgisPanelOpen)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold border transition ${
              qgisPanelOpen
                ? "bg-emerald-950 border-nominal text-nominal"
                : "bg-slate-900 border-emerald-700/50 text-emerald-300 hover:bg-emerald-950/60"
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            QGIS Desktop MCP
          </button>
        </div>
      </div>

      {/* Row 2: 10 Mapped Mars Landmarks Selector Bar ("Puntos Mapeados en Marte") */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950/90 border-b border-slate-800/90 overflow-x-auto z-20">
        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 shrink-0 flex items-center gap-1 pr-1">
          <MapPin className="w-3 h-3 text-mars" /> 10 Puntos Mapeados:
        </span>
        {GLOBAL_MARS_LANDMARKS.map((lm) => {
          const isAct = lm.id === activeLandmarkId;
          const shortName = lm.name.split("(")[0].trim();
          return (
            <div
              key={lm.id}
              className={`inline-flex items-center shrink-0 rounded-md border text-[11px] transition ${
                isAct
                  ? "bg-cyan-950/85 border-hudcyan text-hudcyan shadow-sm"
                  : "bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-600"
              }`}
            >
              <button
                onClick={() => selectLandmark(lm.id)}
                className="px-2 py-1 font-medium flex items-center gap-1 whitespace-nowrap"
                title={`Abrir Mapa 3D / 1ª Persona de ${lm.name} — ${lm.terrain_feature_es ?? lm.summary}`}
              >
                <span className="text-[10px]">{lm.category === "ACTIVE_REGION" ? "★" : "•"}</span>
                <span>{shortName}</span>
                <span className="text-[9px] font-mono opacity-75">
                  {lm.elevation_m > 0 ? `+${lm.elevation_m}m` : `${lm.elevation_m}m`}
                </span>
              </button>
              <button
                onClick={() => {
                  selectLandmark(lm.id, "GLOBE_3D");
                }}
                className="px-1.5 py-1 border-l border-slate-800/80 text-slate-400 hover:text-amber-300 transition"
                title={`Ubicar ${shortName} en Globo Marte 3D`}
              >
                <Globe2 className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Row 3: Interactive 3D Map Layers & Dynamic Conditions Bar */}
      <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 bg-[#0A0F18] border-b border-slate-800 z-20">
        <span className="text-[10px] font-mono uppercase tracking-wider text-hudcyan mr-1 flex items-center gap-1">
          <Layers className="w-3 h-3" /> Capas &amp; Condiciones:
        </span>
        {LAYER_CHIPS.map((chip) => {
          const active = Boolean(layers[chip.id]?.visible);
          return (
            <button
              key={chip.id}
              onClick={() => toggleLayer(chip.id)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium border transition ${
                active
                  ? chip.activeClass
                  : "bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
              }`}
            >
              {chip.label}
            </button>
          );
        })}

        <span className="mx-1 h-4 w-px bg-slate-800" />

        {/* Dynamic Environmental & Operational Conditions */}
        <button
          onClick={() => {
            const cur = weatherInputs.opticalDepthTau;
            const nextTau = cur < 0.9 ? 1.3 : cur < 1.9 ? 2.4 : 0.45;
            updateWeatherInputs({
              opticalDepthTau: nextTau,
              windGustMs: nextTau > 1.8 ? 24 : nextTau > 1.0 ? 17.5 : 8.5,
            });
          }}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border transition ${
            weatherInputs.opticalDepthTau >= 1.8
              ? "bg-red-950/90 border-red-400 text-red-200"
              : weatherInputs.opticalDepthTau >= 1.0
                ? "bg-amber-950/90 border-amber-400 text-amber-200"
                : "bg-slate-900 border-slate-700 text-slate-300 hover:border-amber-400/60"
          }`}
          title="Ciclar opacidad atmosférica marciana τ (Despejado 0.45 -> Bruma 1.3 -> Tormenta Polvo 2.4)"
        >
          <Cloud className="w-3 h-3" />
          Tormenta Polvo (τ={weatherInputs.opticalDepthTau.toFixed(1)})
        </button>

        <button
          onClick={() =>
            triggerEmergency(
              emergencyActive && emergencyType === "SOLAR_SPE" ? "NONE" : "SOLAR_SPE"
            )
          }
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border transition ${
            emergencyActive && emergencyType === "SOLAR_SPE"
              ? "bg-rose-950 border-rose-400 text-rose-200 animate-pulse"
              : "bg-slate-900 border-slate-700 text-slate-300 hover:border-rose-400/60"
          }`}
          title="Simular Evento de Partículas Solares (SEP)"
        >
          <Zap className="w-3 h-3" />
          Evento Solar SEP
        </button>

        <button
          onClick={() =>
            updateSuitParams({ roverRelayEnabled: !suitParams.roverRelayEnabled })
          }
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border transition ${
            suitParams.roverRelayEnabled
              ? "bg-cyan-950/90 border-hudcyan text-hudcyan"
              : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200"
          }`}
          title="Activar/Desactivar Rover Repetidor RF LoS"
        >
          <Radio className="w-3 h-3" />
          Rover LoS {suitParams.roverRelayEnabled ? "ON" : "OFF"}
        </button>

        <button
          onClick={() => setSplitCompare(!splitCompareEnabled)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border transition ${
            splitCompareEnabled
              ? "bg-purple-950 border-purple-400 text-purple-200"
              : "bg-slate-900 border-slate-700 text-slate-300 hover:border-purple-400/60"
          }`}
          title="Comparar dos capas cartográficas lado a lado en el relieve 3D"
        >
          <Columns className="w-3 h-3" />
          Split-Screen
        </button>
      </div>

      {/* Row 4: Camera, Illumination & Split-Screen Bar (Outside WebGL Canvas) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-1.5 bg-[#090E16] border-b border-slate-800 text-[10px] font-mono z-20">
        <div className="flex items-center gap-2">
          <span className="text-slate-300 whitespace-nowrap">Relieve 3D:</span>
          <input
            type="range"
            min={1}
            max={6}
            step={0.5}
            value={reliefExaggeration}
            onChange={(e) => setReliefExaggeration(Number(e.target.value))}
            className="w-20 accent-orange-400 h-1"
            aria-label="Exageración Relieve 3D"
          />
          <span className="text-orange-300 w-7">{reliefExaggeration.toFixed(1)}×</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-slate-300 whitespace-nowrap">
            <Sun className="w-3 h-3 text-amber-400" /> Sol:
          </span>
          <input
            type="range"
            min={0}
            max={360}
            value={globeSunAngleDeg}
            onChange={(e) => setGlobeSunAngleDeg(Number(e.target.value))}
            className="w-24 accent-amber-400 h-1"
            aria-label="Sol Marciano"
          />
          <span className="text-amber-300 w-8">{globeSunAngleDeg}°</span>
        </div>

        {mapViewportMode === "GLOBE_3D" && (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-300 whitespace-nowrap">Tilt 3D:</span>
              <button
                onClick={() => setAutoTiltEnabled(!autoTiltEnabled)}
                className={`text-[9px] px-1.5 py-0.5 rounded border ${
                  autoTiltEnabled
                    ? "border-hudcyan text-hudcyan bg-cyan-950/60"
                    : "border-slate-700 text-slate-400"
                }`}
              >
                Auto
              </button>
              <input
                type="range"
                min={0}
                max={65}
                value={autoTiltEnabled ? cameraHud.effectiveTiltDeg : tiltDeg}
                onChange={(e) => {
                  setAutoTiltEnabled(false);
                  setTiltDeg(Number(e.target.value));
                }}
                className="w-20 accent-cyan-400 h-1"
                aria-label="Inclinación Tilt 3D"
              />
              <span className="text-cyan-300 w-6">
                {autoTiltEnabled ? `${cameraHud.effectiveTiltDeg}°` : `${tiltDeg}°`}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={handleOrbitOverview}
                className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 transition"
              >
                Órbita Global
              </button>
              <button
                onClick={handleDescendOnGlobe}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-hudcyan text-slate-950 font-bold hover:bg-cyan-300 transition"
              >
                <Sparkles className="w-3 h-3" />
                Acercar a {activeLandmark.name.split("(")[0].trim()}
              </button>
            </div>
          </>
        )}

        {splitCompareEnabled && (
          <div className="flex flex-wrap items-center gap-2 pl-2 border-l border-purple-500/40">
            <span className="text-purple-300 font-semibold">Split-Screen:</span>
            <select
              value={splitCompareLayerId}
              onChange={(e) => setSplitCompare(true, e.target.value, splitSwipePercent)}
              className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-slate-200"
            >
              {TWENTY_MARS_LAYERS.map((l) => (
                <option key={l.id} value={l.id}>
                  [{l.code}] {l.name}
                </option>
              ))}
            </select>
            <input
              type="range"
              min={10}
              max={90}
              value={splitSwipePercent}
              onChange={(e) =>
                setSplitCompare(true, splitCompareLayerId, Number(e.target.value))
              }
              className="w-20 accent-purple-400 h-1"
              aria-label="Cortina Split-Screen"
            />
            <span className="text-purple-200">{splitSwipePercent}%</span>
            <button
              onClick={() => setSplitCompare(false)}
              className="text-red-400 hover:underline"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>

      {/* Main WebGL Viewport */}
      <div
        className={`relative w-full ${
          expandedViewport ? "h-[74vh] min-h-[560px]" : "h-[480px] md:h-[540px]"
        } bg-space select-none transition-all duration-200`}
      >
        <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {/* Subtle First-Person AR Visor Center Reticle */}
        {mapViewportMode === "FIRST_PERSON_3D" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10">
            <div className="relative w-12 h-12 rounded-full border border-hudcyan/35 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-300/80" />
            </div>
          </div>
        )}

        {/* Projected 2D Google-Earth Labels over 3D Sphere */}
        {mapViewportMode === "GLOBE_3D" && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden z-10">
            {projectedPins.map(
              (pin) =>
                pin.visible && (
                  <button
                    key={pin.id}
                    onClick={() => {
                      selectLandmark(pin.id, "TERRAIN_3D");
                    }}
                    style={{
                      left: `${pin.x}px`,
                      top: `${pin.y}px`,
                      transform: "translate(-50%, -100%)",
                    }}
                    className="pointer-events-auto absolute group flex flex-col items-center"
                    title={`Abrir Mapa 3D de ${pin.label}`}
                  >
                    <div
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold whitespace-nowrap border shadow-lg transition backdrop-blur-sm ${
                        pin.id === activeLandmarkId
                          ? "bg-cyan-950/90 border-hudcyan text-hudcyan scale-105"
                          : "bg-slate-950/85 border-slate-700 text-slate-200 group-hover:border-white"
                      }`}
                    >
                      {pin.category === "ACTIVE_REGION" ? "★ " : "• "}
                      {pin.label.split("(")[0].trim()}
                    </div>
                    <div className="w-0.5 h-2.5" style={{ backgroundColor: pin.color }} />
                  </button>
                )
            )}
          </div>
        )}

        {/* Compact Collapsible Site Context Card (Top-Left, non-intrusive) */}
        <div className="absolute top-3 left-3 z-20 w-[245px] max-w-[65vw]">
          <div className="bg-slate-950/90 backdrop-blur-md border border-slate-800 rounded-lg px-2.5 py-2 shadow-xl text-xs">
            <div className="flex items-center justify-between gap-1.5">
              <span className="font-bold text-white flex items-center gap-1 truncate text-[11px]">
                {mapViewportMode === "FIRST_PERSON_3D" ? (
                  <Eye className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                ) : mapViewportMode === "TERRAIN_3D" ? (
                  <Mountain className="w-3.5 h-3.5 text-hudcyan shrink-0" />
                ) : (
                  <MapPin className="w-3.5 h-3.5 text-mars shrink-0" />
                )}
                <span className="truncate">{activeLandmark.name.split("(")[0].trim()}</span>
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <span
                  className={`text-[9px] font-mono px-1 py-0.5 rounded border ${
                    activeLandmark.coverage_class === "HIGH_RES_PDS"
                      ? "bg-cyan-950 text-hudcyan border-hudcyan/40"
                      : "bg-amber-950 text-amber-300 border-amber-500/40"
                  }`}
                >
                  {activeLandmark.coverage_class === "HIGH_RES_PDS" ? "HiRISE" : "MOLA"}
                </span>
                <button
                  onClick={() => setSiteCardCollapsed((v) => !v)}
                  className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-800"
                  title={siteCardCollapsed ? "Expandir tarjeta del sitio" : "Contraer tarjeta del sitio"}
                >
                  {siteCardCollapsed ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
                </button>
              </div>
            </div>

            {!siteCardCollapsed && (
              <div className="mt-1.5 space-y-1.5">
                <div className="text-[10px] font-medium text-amber-200/95 leading-snug">
                  {activeLandmark.terrain_feature_es ?? activeLandmark.summary}
                </div>

                {mapViewportMode === "GLOBE_3D" && (
                  <>
                    <div className="text-[10px] font-mono text-slate-400">
                      {activeLandmark.lat.toFixed(2)}°, {activeLandmark.lon.toFixed(2)}° · Elev:{" "}
                      {activeLandmark.elevation_m} m
                    </div>
                    <button
                      onClick={() => selectLandmark(activeLandmark.id, "TERRAIN_3D")}
                      className="w-full flex items-center justify-center gap-1 py-1 rounded bg-hudcyan text-slate-950 font-bold text-[10px] hover:bg-cyan-300 transition"
                    >
                      <Mountain className="w-3 h-3" />
                      Abrir Mapa 3D del Lugar
                    </button>
                  </>
                )}

                {mapViewportMode === "FIRST_PERSON_3D" && (
                  <div className="space-y-1.5 text-[10px] font-mono text-slate-300">
                    <div className="grid grid-cols-2 gap-1 bg-slate-900/90 p-1.5 rounded border border-slate-800">
                      <span>Rumbo: <b className="text-hudcyan">{fpYawDeg}° {fpCompassLabel}</b></span>
                      <span>Pitch: <b className="text-slate-100">{fpPitchDeg}°</b></span>
                      <span>Elev: <b className="text-amber-300">{fpElevM} m</b></span>
                      <span>Pendiente: <b className={fpSlopeDeg > suitParams.maxSlopeDeg ? "text-red-400" : "text-emerald-300"}>{fpSlopeDeg}°</b></span>
                    </div>
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-slate-400">Visor:</span>
                      <div className="inline-flex rounded bg-slate-900 border border-slate-700 p-0.5">
                        <button
                          onClick={() => setFpEyeHeightM(1.8)}
                          className={`px-1.5 py-0.5 rounded text-[9px] ${fpEyeHeightM < 3 ? "bg-amber-400 text-slate-950 font-bold" : "text-slate-300"}`}
                        >
                          1.8m EVA
                        </button>
                        <button
                          onClick={() => setFpEyeHeightM(4.5)}
                          className={`px-1.5 py-0.5 rounded text-[9px] ${fpEyeHeightM >= 3 ? "bg-hudcyan text-slate-950 font-bold" : "text-slate-300"}`}
                        >
                          4.5m Mástil
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {mapViewportMode === "TERRAIN_3D" && (
                  <>
                    <div className="text-[10px] font-mono text-slate-400">
                      Malla {grid.nx}×{grid.ny} ({grid.cellSizeM}m/celda) · {activeLandmark.resolution_summary}
                    </div>
                    <button
                      onClick={() => setMapViewportMode("FIRST_PERSON_3D")}
                      className="w-full flex items-center justify-center gap-1 py-1 rounded bg-amber-400/20 hover:bg-amber-400 hover:text-slate-950 border border-amber-400/60 text-amber-200 font-semibold text-[10px] transition"
                    >
                      <Eye className="w-3 h-3" />
                      Explorar en 1ª Persona
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* First-Person 360° On-Screen Navigation Pad & Quick Waypoints */}
        {mapViewportMode === "FIRST_PERSON_3D" && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-center justify-center gap-1.5 bg-slate-950/92 backdrop-blur-md border border-amber-400/40 rounded-xl px-2.5 py-1.5 shadow-2xl max-w-[95%]">
            <button
              onClick={() => fpActionRef.current.turnBy?.(-22, 0)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-200"
              title="Girar vista a la izquierda (Tecla Q / ←)"
            >
              <RotateCcw className="w-3 h-3 text-hudcyan" /> Girar Izq
            </button>
            <button
              onClick={() => fpActionRef.current.moveStep?.(1, 0)}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-400/20 hover:bg-amber-400 hover:text-slate-950 border border-amber-400/60 text-[11px] font-semibold text-amber-200 transition"
              title="Avanzar caminando sobre el relieve (W / ↑)"
            >
              <ArrowUp className="w-3.5 h-3.5" /> Avanzar
            </button>
            <button
              onClick={() => fpActionRef.current.moveStep?.(-1, 0)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-200"
              title="Retroceder (S / ↓)"
            >
              <ArrowDown className="w-3.5 h-3.5" /> Retroceder
            </button>
            <button
              onClick={() => fpActionRef.current.turnBy?.(22, 0)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-200"
              title="Girar vista a la derecha (Tecla E / →)"
            >
              Girar Der <RotateCw className="w-3 h-3 text-hudcyan" />
            </button>

            <span className="h-4 w-px bg-slate-700 mx-0.5 hidden sm:inline-block" />

            <button
              onClick={() => fpActionRef.current.lookAtGrid?.(targetGridX, targetGridY)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-yellow-500/40 text-[10px] font-mono text-yellow-300"
            >
              <Target className="w-3 h-3" /> Mirar Objetivo
            </button>
            <button
              onClick={() =>
                fpActionRef.current.jumpToGrid?.(grid.baseGrid[0], grid.baseGrid[1], [
                  targetGridX,
                  targetGridY,
                ])
              }
              className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-hudcyan/40 text-[10px] font-mono text-hudcyan"
            >
              <Home className="w-3 h-3" /> Base
            </button>
            <button
              onClick={() => {
                const nextP = twinProgress >= 0.96 ? 0.1 : Number((twinProgress + 0.15).toFixed(2));
                setTwinProgress(nextP);
                const idx = clamp(
                  Math.round(nextP * (activeRoute.waypoints.length - 1)),
                  0,
                  Math.max(0, activeRoute.waypoints.length - 1)
                );
                const wp = activeRoute.waypoints[idx];
                if (wp) {
                  fpActionRef.current.jumpToGrid?.(wp.gx, wp.gy, [targetGridX, targetGridY]);
                }
              }}
              className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-950/80 hover:bg-emerald-700 border border-emerald-500/50 text-[10px] font-mono text-emerald-200"
            >
              <Footprints className="w-3 h-3" /> Avanzar Ruta EVA
            </button>
            {shelters[0] && (
              <button
                onClick={() =>
                  fpActionRef.current.jumpToGrid?.(shelters[0].gx, shelters[0].gy, [
                    targetGridX,
                    targetGridY,
                  ])
                }
                className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-emerald-500/40 text-[10px] font-mono text-emerald-300"
              >
                <Shield className="w-3 h-3" /> Refugio
              </button>
            )}
          </div>
        )}

        {/* Cell Inspector Popup (shown only when a relief cell is clicked and QGIS drawer is closed) */}
        {inspectedCell && !qgisPanelOpen && (
          <div className="absolute top-3 right-14 z-20 w-72 max-w-[calc(100%-4.5rem)] bg-slate-950/95 backdrop-blur-md border border-hudcyan/50 rounded-lg p-2.5 text-[11px] shadow-2xl">
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono font-bold text-hudcyan flex items-center gap-1">
                <Crosshair className="w-3 h-3" /> Celda [{inspectedCell.gx}, {inspectedCell.gy}]
              </span>
              <button
                onClick={() => setInspectedCell(null)}
                className="text-slate-400 hover:text-white text-[10px]"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1 font-mono text-[10px] text-slate-300">
              <span>Lat/Lon: {inspectedCell.lat}°, {inspectedCell.lon}°</span>
              <span>Elevación: {inspectedCell.elevationM} m</span>
              <span>Pendiente S: {inspectedCell.slopeDeg}°</span>
              <span>Rugosidad R: {inspectedCell.roughnessM} m</span>
              <span>Arena suelta: {(inspectedCell.sandTrap * 100).toFixed(0)}%</span>
              <span>Slip H_slip: {inspectedCell.slipHazard}</span>
              <span className={inspectedCell.hasCommLoS ? "text-nominal" : "text-critical"}>
                Radio: {inspectedCell.hasCommLoS ? "LoS OK" : "COMM_BLACKOUT"}
              </span>
              <span className={inspectedCell.uncertainty > 0.6 ? "text-caution" : "text-slate-300"}>
                Incertid. U: {inspectedCell.uncertainty}
              </span>
            </div>
            <div className="mt-2 flex flex-col gap-1">
              {mapViewportMode !== "FIRST_PERSON_3D" && (
                <button
                  onClick={() => {
                    setFpGridPos([inspectedCell.gx, inspectedCell.gy]);
                    fpPoseRef.current.gx = inspectedCell.gx;
                    fpPoseRef.current.gy = inspectedCell.gy;
                    fpPoseRef.current.yawDeg =
                      ((Math.atan2(targetGridX - inspectedCell.gx, targetGridY - inspectedCell.gy) *
                        180) /
                        Math.PI +
                        360) %
                      360;
                    setMapViewportMode("FIRST_PERSON_3D");
                  }}
                  className="w-full py-1 rounded bg-amber-500/20 hover:bg-amber-400 hover:text-slate-950 border border-amber-400/60 text-amber-200 font-mono text-[10px] font-bold transition flex items-center justify-center gap-1"
                >
                  <Eye className="w-3 h-3" /> Entrar en 1ª Persona en este Punto
                </button>
              )}
              <button
                onClick={() =>
                  updateSuitParams({
                    roverRelayEnabled: true,
                    roverRelayGrid: [inspectedCell.gx, inspectedCell.gy],
                  })
                }
                className="w-full py-1 rounded bg-cyan-950 hover:bg-hudcyan hover:text-slate-950 border border-hudcyan/50 text-hudcyan font-mono text-[10px] transition flex items-center justify-center gap-1"
              >
                <Radio className="w-3 h-3" /> Mover Rover Repetidor LoS aquí
              </button>
            </div>
          </div>
        )}

        {/* Right Floating Google-Earth / Site Navigation Controls */}
        <div className="absolute top-3 right-3 z-20 flex flex-col gap-1.5 bg-slate-950/85 backdrop-blur-md border border-slate-800 rounded-lg p-1.5 shadow-xl">
          <button
            onClick={() =>
              mapViewportMode === "FIRST_PERSON_3D"
                ? fpActionRef.current.lookAtGrid?.(targetGridX, targetGridY)
                : handleOrbitOverview()
            }
            title={
              mapViewportMode === "FIRST_PERSON_3D"
                ? "Orientar cámara hacia Objetivo"
                : "Restablecer Vista Orbital"
            }
            className="p-2 rounded hover:bg-slate-800 text-hudcyan transition"
          >
            <Compass className="w-4 h-4" />
          </button>
          {mapViewportMode !== "FIRST_PERSON_3D" && (
            <>
              <button
                onClick={() => handleZoomStep(0.65)}
                title="Acercar Zoom (Hacia Superficie)"
                className="p-2 rounded hover:bg-slate-800 text-slate-200 transition"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleZoomStep(1.55)}
                title="Alejar Zoom (Hacia Órbita)"
                className="p-2 rounded hover:bg-slate-800 text-slate-200 transition"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            onClick={() =>
              setMapViewportMode(mapViewportMode === "FIRST_PERSON_3D" ? "TERRAIN_3D" : "FIRST_PERSON_3D")
            }
            title={
              mapViewportMode === "FIRST_PERSON_3D"
                ? "Cambiar a Mapa 3D del Lugar"
                : "Entrar en Relieve en 1ª Persona (360°)"
            }
            className={`p-2 rounded transition ${
              mapViewportMode === "FIRST_PERSON_3D"
                ? "bg-amber-400 text-slate-950"
                : "hover:bg-amber-500/20 text-amber-300"
            }`}
          >
            {mapViewportMode === "FIRST_PERSON_3D" ? <Mountain className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          {mapViewportMode === "GLOBE_3D" && (
            <>
              <button
                onClick={() => setAutoRotate(!autoRotate)}
                title="Rotación Planetaria Continua"
                className={`p-2 rounded transition ${
                  autoRotate ? "bg-mars text-white" : "hover:bg-slate-800 text-slate-300"
                }`}
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={() =>
                  triggerQgisAction("qgis_zoom_to_coords", {
                    lon: cameraHud.focusLon,
                    lat: cameraHud.focusLat,
                    span_deg: clamp((cameraHud.altitudeKm / 3396) * 20, 0.14, 18),
                  })
                }
                title="Sincronizar esta vista en QGIS Desktop"
                className="p-2 rounded hover:bg-emerald-950 text-emerald-300 transition"
              >
                <Navigation className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Live QGIS Desktop & MCP Drawer */}
        {qgisPanelOpen && (
          <div className="absolute top-3 right-14 z-30 w-80 sm:w-96 bg-slate-950/95 backdrop-blur-lg border border-emerald-500/60 rounded-xl p-3.5 text-xs shadow-2xl">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                <Database className="w-4 h-4" /> QGIS Desktop 3.44.15 &amp; MCP Bridge
              </span>
              <button
                onClick={() => setQgisPanelOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2 text-[11px]">
              <div className="p-2 rounded bg-slate-900 border border-slate-800 font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Proyecto QGIS:</span>
                  <span className="text-nominal">
                    {qgisStatus?.master_project_exists ? "mars_pathfinder_master.qgs" : "Listo"}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-slate-400">Plugin Socket :9876:</span>
                  <span
                    className={
                      qgisStatus?.qgis_desktop_live ? "text-nominal font-bold" : "text-amber-300"
                    }
                  >
                    {qgisStatus?.qgis_desktop_live
                      ? "CONECTADO EN VIVO"
                      : "Standby (reinicia QGIS para socket vivo)"}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-slate-400">Streaming Tiles NASA:</span>
                  <span className="text-cyan-300">LOD z={cameraHud.lodZ} ({cameraHud.loadedTiles} activos)</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  disabled={qgisLoading}
                  onClick={() => triggerQgisAction("qgis_open_project", { region: activeRegionId })}
                  className="flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold disabled:opacity-50"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Abrir en QGIS
                </button>
                <button
                  disabled={qgisLoading}
                  onClick={() =>
                    triggerQgisAction("qgis_zoom_to_coords", {
                      lon: activeLandmark.lon,
                      lat: activeLandmark.lat,
                      span_deg: clamp((cameraHud.altitudeKm / 3396) * 20, 0.14, 24),
                    })
                  }
                  className="flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-cyan-950 hover:bg-hudcyan hover:text-slate-950 border border-hudcyan/50 text-hudcyan font-semibold disabled:opacity-50"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  Sincronizar Vista
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  disabled={qgisLoading}
                  onClick={() => triggerQgisAction("qgis_run_mars_pipeline")}
                  className="flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 font-semibold disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${qgisLoading ? "animate-spin" : ""}`} />
                  Re-procesar GDAL
                </button>
                <button
                  disabled={qgisLoading}
                  onClick={fetchQgisStatus}
                  className="py-1.5 px-2 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 font-mono text-[10px]"
                >
                  Refrescar :9876
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Telemetry Bar */}
        <div className="absolute bottom-0 inset-x-0 z-20 flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-slate-950/92 backdrop-blur-md border-t border-slate-800 text-[11px] font-mono">
          {mapViewportMode === "GLOBE_3D" ? (
            <>
              <div className="flex flex-wrap items-center gap-3 text-slate-300">
                <span className="text-hudcyan flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  ALT {cameraHud.altitudeKm.toLocaleString()} km · LOD z={cameraHud.lodZ}
                  <span className="text-emerald-300 ml-1">({cameraHud.loadedTiles} tiles NASA)</span>
                </span>
                <span className="text-slate-300">
                  {cursorMarsInfo
                    ? `LAT ${cursorMarsInfo.lat.toFixed(2)}° · LON ${cursorMarsInfo.lon.toFixed(2)}° E · ELEV ${cursorMarsInfo.elevM} m`
                    : `FOCO ${cameraHud.focusLat.toFixed(2)}°, ${cameraHud.focusLon.toFixed(2)}° E · ELEV ${cameraHud.focusElevM} m`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {cursorMarsInfo && (
                  <>
                    <span className="text-slate-400 hidden sm:inline">
                      Fuente: <span className="text-white">{cursorMarsInfo.coverageLabel}</span>
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                        cursorMarsInfo.uncertainty > 0.6
                          ? "bg-amber-950 text-amber-300 border border-amber-500/40"
                          : "bg-emerald-950 text-emerald-300 border border-emerald-500/40"
                      }`}
                    >
                      {cursorMarsInfo.uncertainty > 0.6
                        ? `U=${cursorMarsInfo.uncertainty} (MOLA/Viking)`
                        : `U=${cursorMarsInfo.uncertainty} (PDS / QGIS)`}
                    </span>
                  </>
                )}
              </div>
            </>
          ) : mapViewportMode === "FIRST_PERSON_3D" ? (
            <>
              <div className="flex flex-wrap items-center gap-3 text-slate-300">
                <span className="text-amber-300 font-semibold flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" /> 1ª PERSONA (360°): {activeLandmark.name}
                </span>
                <span className="text-cyan-300">
                  Celda [{fpIx}, {fpIy}] · Rumbo {fpYawDeg}° {fpCompassLabel} · Elev {fpElevM} m
                </span>
                <span className="text-slate-400 hidden lg:inline">
                  Arrastra para mirar 360° · Clic en suelo para caminar · WASD / Flechas
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <span className={fpHasLoS ? "text-nominal" : "text-purple-300"}>
                  LoS: {fpHasLoS ? "OK" : "BLOQUEADA"}
                </span>
                <span className="text-amber-300">Pendiente: {fpSlopeDeg}°</span>
                <span className="text-nominal flex items-center gap-1">
                  <Shield className="w-3 h-3" /> {shelters.length} refugios
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 text-slate-300">
                <span className="text-hudcyan">
                  MAPA 3D DEL LUGAR: {activeLandmark.name}
                </span>
                <span className="text-slate-400 hidden sm:inline">
                  {grid.fromQgisGdal ? "Grilla QGIS/GDAL" : "Malla 3D MOLA/HiRISE"} {grid.nx}×{grid.ny} ({grid.cellSizeM} m/celda)
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="flex items-center gap-1 text-nominal">
                  <Shield className="w-3 h-3" /> Refugios: {shelters.length}
                </span>
                <span className="flex items-center gap-1 text-amber-300">
                  <AlertTriangle className="w-3 h-3" /> S_max: {suitParams.maxSlopeDeg}°
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Slim Legend & Interaction Strip outside WebGL Canvas */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-[#080C14] border-t border-slate-800 text-[10px] font-mono">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-slate-400 uppercase tracking-wider">Capas QGIS 3D:</span>
          <span className="text-red-400">━━ Ruta A (Corta)</span>
          <span className="text-emerald-400">━━ Ruta B (Óptima O₂)</span>
          <span className="text-cyan-300">━━ Ruta C (Ciencia)</span>
          <span className="text-purple-400">■ Sombra Radio LoS</span>
          <span className="text-emerald-300">▲ Refugio Radiación</span>
          <span className="text-yellow-300">◆ Objetivo NASA</span>
        </div>
        <span className="text-slate-400 hidden xl:inline">
          Clic en relieve 3D: inspeccionar celda / mover rover · Doble clic en globo: abrir sitio
        </span>
      </div>
    </div>
  );
}
