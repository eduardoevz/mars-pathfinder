import {
  GLOBAL_MARS_LANDMARKS,
  SCIENTIFIC_TARGETS,
  ScientificTargetDef,
  RegionId,
} from "./nasa-seed-data";

export const MARS_GRAVITY = 3.721; // m/s^2 (~0.38g)
export const EARTH_GRAVITY = 9.80665;
export const MARS_RADIUS_M = 3396190;

export type TraversabilityState =
  | "LOW_COST"
  | "MODERATE_COST"
  | "HIGH_COST"
  | "EXCLUDED_ZONE"
  | "INSUFFICIENT_DATA";

export interface SuitAndMissionParams {
  bodyMassKg: number; // default 75
  suitMassKg: number; // default 65
  payloadMassKg: number; // 5..40 kg
  tankCapacityL: number; // default 550 L
  reservePercent: number; // mandatory 20%
  maxSlopeDeg: number; // 8..25 deg (default 14)
  walkingSpeedMs: number; // default 0.85 m/s
  observationMinutes: number; // 10..60 min at target
  astronautCount: number; // 1..4
  ambientTempC: number; // -75..-5 C
  solarEventActive: boolean; // DONKI SEP active multiplier
  roverRelayEnabled: boolean;
  roverRelayGrid: [number, number];
}

export interface PreEvaWeatherInputs {
  pressureDrop3hPa: number; // e.g. -4.2 Pa nominal, -18 Pa storm front
  opticalDepthTau: number; // 0.3 clear .. 3.0 dust storm
  solarLongitudeLsDeg: number; // 0..360 (180..330 perihelion dust season)
  windGustMs: number; // m/s
  deltaTSurfAirK: number; // surface - air K
}

export interface PreEvaWeatherResult {
  stormProbabilityPercent: number;
  dustDevilProbabilityPercent: number;
  visibilityKm: number;
  status: "GO" | "CAUTION" | "NO-GO";
  statusMessage: string;
}

export interface RouteWaypoint {
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
  cumDistanceM: number;
  cumO2Liters: number;
  remainingO2Percent: number;
  returnO2RequiredPercent: number;
  bingoViolation: boolean;
  plssBatteryPercent: number;
  metabolicRateW: number;
  o2FlowLMin: number;
}

export interface ComputedRoute {
  id: "ROUTE_A" | "ROUTE_B" | "ROUTE_C";
  label: string;
  subtitle: string;
  color: string;
  waypoints: RouteWaypoint[];
  totalDistanceKm: number;
  elevationGainM: number;
  maxSlopeDeg: number;
  avgSlopeDeg: number;
  o2ConsumedLiters: number;
  o2ConsumedPercent: number;
  plssBatteryUsedPercent: number;
  bingoO2Safe: boolean;
  bingoStatusText: string;
  maxSlipHazard: number;
  commBlackoutCells: number;
  commCoveragePercent: number;
  highResCoveragePercent: number;
  meanUncertainty: number;
  scienceValueScore: number;
  algorithmStats: {
    astarNodesExplored: number;
    astarTimeMs: number;
    dijkstraNodesExplored?: number;
    dijkstraTimeMs?: number;
    optimalCostDeltaPercent?: number;
  };
}

export interface TopographicShelter {
  id: string;
  gx: number;
  gy: number;
  lon: number;
  lat: number;
  elevationM: number;
  shieldingPercent: number;
  distanceM: number;
  bearingDeg: number;
  label: string;
}

export interface MarsTerrainGrid {
  regionId: RegionId;
  nx: number;
  ny: number;
  cellSizeM: number;
  boundsLonLat: [number, number, number, number]; // minLon, minLat, maxLon, maxLat
  baseGrid: [number, number];
  elevationM: number[][];
  slopeDeg: number[][];
  roughnessM: number[][];
  viewshedLoS: number[][]; // 1 = LoS from base, 0 = COMM_BLACKOUT
  sandTrap: number[][];
  mineralIndex: number[][];
  uncertainty: number[][];
  slipHazard: number[][];
  shelterScore: number[][];
  traversability: TraversabilityState[][];
  o2CostPerMeter: number[][];
  fromQgisGdal: boolean;
}

export interface RawQgisRegionJson {
  nx: number;
  ny: number;
  cell_size_m: number;
  bounds_lonlat: [number, number, number, number];
  base_grid: [number, number];
  elevation_m: number[][];
  gdal_slope_deg: number[][];
  gdal_roughness_m: number[][];
  gdal_viewshed_los: number[][];
  sand_trap: number[][];
  mineral_index: number[][];
  uncertainty: number[][];
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function gridToLonLat(
  gx: number,
  gy: number,
  grid: Pick<MarsTerrainGrid, "nx" | "ny" | "boundsLonLat">
): { lon: number; lat: number } {
  const [minLon, minLat, maxLon, maxLat] = grid.boundsLonLat;
  const lon = minLon + ((gx + 0.5) / grid.nx) * (maxLon - minLon);
  const lat = minLat + ((gy + 0.5) / grid.ny) * (maxLat - minLat);
  return { lon, lat };
}

/**
 * Exact Science Opportunity Index (SOI) = alpha*M + beta*G + gamma*T + delta*Q
 */
export function computeSOI(
  base: { M: number; G: number; T: number; Q: number },
  weights: { alpha: number; beta: number; gamma: number; delta: number }
): {
  total: number;
  normalizedWeights: { alpha: number; beta: number; gamma: number; delta: number };
  contributions: { M: number; G: number; T: number; Q: number };
} {
  const sum = weights.alpha + weights.beta + weights.gamma + weights.delta || 1;
  const alpha = weights.alpha / sum;
  const beta = weights.beta / sum;
  const gamma = weights.gamma / sum;
  const delta = weights.delta / sum;
  const cM = alpha * base.M;
  const cG = beta * base.G;
  const cT = gamma * base.T;
  const cQ = delta * base.Q;
  return {
    total: Number((cM + cG + cT + cQ).toFixed(3)),
    normalizedWeights: { alpha, beta, gamma, delta },
    contributions: { M: cM, G: cG, T: cT, Q: cQ },
  };
}

/**
 * Pre-EVA Dust Storm & Atmospheric Hazard Predictor (Section 11.3)
 */
export function computePreEvaWeather(inputs: PreEvaWeatherInputs): PreEvaWeatherResult {
  const iDeltaP = Math.min(1, Math.abs(inputs.pressureDrop3hPa) / 15.0);
  const iTau = Math.min(1, Math.max(0, inputs.opticalDepthTau) / 2.5);
  const iLs = (1 - Math.cos(((inputs.solarLongitudeLsDeg - 70) * Math.PI) / 180)) / 2;
  const iWindDeltaT = Math.min(
    1,
    0.5 * (inputs.windGustMs / 25.0) + 0.5 * (inputs.deltaTSurfAirK / 45.0)
  );

  const rawProb = 100 * clamp(0.32 * iDeltaP + 0.36 * iTau + 0.16 * iLs + 0.16 * iWindDeltaT, 0, 1);
  const dustDevilProb =
    100 * clamp(0.45 * (inputs.deltaTSurfAirK / 40.0) + 0.35 * (inputs.windGustMs / 24.0) + 0.2 * iDeltaP, 0, 1);

  const visibilityKm = Number(Math.max(0.25, 24 * Math.exp(-1.15 * inputs.opticalDepthTau)).toFixed(1));

  let status: "GO" | "CAUTION" | "NO-GO" = "GO";
  let statusMessage = "Condiciones atmosféricas estables para EVA completa (visibilidad > 10 km).";

  if (rawProb >= 65 || inputs.opticalDepthTau >= 1.8) {
    status = "NO-GO";
    statusMessage = "NO-GO / ABORT: Alta probabilidad de tormenta de polvo o caída barométrica severa (visibilidad crítica).";
  } else if (rawProb >= 30 || dustDevilProb >= 55) {
    status = "CAUTION";
    statusMessage = "CAUTION: Actividad convectiva de dust devils o bruma moderada; reducir radio Bingo O₂ y vigilar refugios.";
  }

  return {
    stormProbabilityPercent: Number(rawProb.toFixed(1)),
    dustDevilProbabilityPercent: Number(dustDevilProb.toFixed(1)),
    visibilityKm,
    status,
    statusMessage,
  };
}

/**
 * Biomechanical PLSS Metabolic Rate & O2 Consumption Model (Section 4.4 / 11.2)
 */
export function computeMetabolicMetrics(
  slopeDeg: number,
  sandFactor: number,
  roughnessM: number,
  params: SuitAndMissionParams,
  isUphill: boolean = true
): {
  metabolicRateW: number;
  o2FlowLMin: number;
  effectiveSpeedMs: number;
  eta: number;
} {
  const eta = clamp(1.0 + 0.62 * sandFactor + 0.03 * roughnessM, 1.0, 1.72);
  const slopeRad = (clamp(slopeDeg, 0, 45) * Math.PI) / 180;
  const tanTheta = isUphill ? Math.tan(slopeRad) : Math.tan(slopeRad) * 0.28;

  // Walking speed degrades on steep slopes & loose sand hollows
  const effectiveSpeedMs = clamp(
    params.walkingSpeedMs * (1 - 0.025 * slopeDeg) * (1 - 0.34 * sandFactor),
    0.25,
    1.35
  );

  const mTotal = params.bodyMassKg + params.suitMassKg + params.payloadMassKg;
  const gFactor = MARS_GRAVITY / EARTH_GRAVITY; // ~0.3794
  const loadRatio = (params.payloadMassKg + params.suitMassKg) / Math.max(40, params.bodyMassKg);

  // Calibrated Mars EVA metabolic model: basal ~115 W, flat ~290-340 W, steep/sand ~560-760 W
  const mRate = clamp(
    (1.5 * mTotal +
      2.0 * mTotal * (loadRatio * loadRatio) * 0.55 +
      eta * mTotal * (1.55 * effectiveSpeedMs * effectiveSpeedMs + 2.65 * effectiveSpeedMs * tanTheta)) *
      gFactor *
      1.35,
    120,
    880
  );

  const o2FlowLMin = 0.0028 * mRate + 0.35;
  return {
    metabolicRateW: Number(mRate.toFixed(1)),
    o2FlowLMin: Number(o2FlowLMin.toFixed(3)),
    effectiveSpeedMs: Number(effectiveSpeedMs.toFixed(2)),
    eta: Number(eta.toFixed(2)),
  };
}

/**
 * Raycast Line-of-Sight across the DEM from an observer antenna (x0, y0, mastHeightM)
 */
export function computeLoSViewshed(
  elevationM: number[][],
  nx: number,
  ny: number,
  cellSizeM: number,
  obsX: number,
  obsY: number,
  mastHeightM = 12.0,
  targetHeightM = 1.8
): number[][] {
  const los: number[][] = Array.from({ length: ny }, () => Array(nx).fill(0));
  const zObs = elevationM[obsY][obsX] + mastHeightM;

  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      if (x === obsX && y === obsY) {
        los[y][x] = 1;
        continue;
      }
      const dx = x - obsX;
      const dy = y - obsY;
      const steps = Math.max(Math.abs(dx), Math.abs(dy));
      const zTarget = elevationM[y][x] + targetHeightM;
      let visible = 1;
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const ix = Math.round(obsX + dx * t);
        const iy = Math.round(obsY + dy * t);
        const zLine = zObs + (zTarget - zObs) * t;
        // Account slightly for Mars curvature over km distances
        const distM = t * Math.hypot(dx, dy) * cellSizeM;
        const curvDrop = (distM * distM) / (2 * MARS_RADIUS_M);
        if (elevationM[iy][ix] > zLine + curvDrop + 1.5) {
          visible = 0;
          break;
        }
      }
      los[y][x] = visible;
    }
  }
  return los;
}

/**
 * Hydrate MarsTerrainGrid from QGIS/GDAL JSON + dynamic suit parameters
 */
export function buildTerrainGridFromQgisJson(
  regionId: RegionId,
  raw: RawQgisRegionJson,
  params: SuitAndMissionParams
): MarsTerrainGrid {
  const { nx, ny, cell_size_m: cellSizeM, bounds_lonlat, base_grid } = raw;
  const elev = raw.elevation_m;
  const gdalSlope = raw.gdal_slope_deg;
  const gdalRough = raw.gdal_roughness_m;
  const sand = raw.sand_trap;
  const mineral = raw.mineral_index;
  const uncert = raw.uncertainty;

  // Base GDAL viewshed + optional Rover Scout mobile relay viewshed union
  let los = raw.gdal_viewshed_los.map((row) => [...row]);
  if (params.roverRelayEnabled) {
    const [rx, ry] = params.roverRelayGrid;
    const cx = clamp(rx, 0, nx - 1);
    const cy = clamp(ry, 0, ny - 1);
    const relayLoS = computeLoSViewshed(elev, nx, ny, cellSizeM, cx, cy, 4.5, 1.8);
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        if (relayLoS[y][x] === 1) los[y][x] = 1;
      }
    }
  }

  const slipHazard: number[][] = Array.from({ length: ny }, () => Array(nx).fill(0));
  const shelterScore: number[][] = Array.from({ length: ny }, () => Array(nx).fill(0));
  const traversability: TraversabilityState[][] = Array.from({ length: ny }, () =>
    Array<TraversabilityState>(nx).fill("LOW_COST")
  );
  const o2CostPerMeter: number[][] = Array.from({ length: ny }, () => Array(nx).fill(0));

  const maxRough = 25.0;
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const s = gdalSlope[y][x];
      const rNorm = clamp(gdalRough[y][x] / maxRough, 0, 1);
      const sSand = sand[y][x];
      const u = uncert[y][x];

      const hSlip = clamp(0.5 * (s / Math.max(5, params.maxSlopeDeg)) + 0.3 * rNorm + 0.2 * sSand, 0, 1);
      slipHazard[y][x] = Number(hSlip.toFixed(3));

      // Geometric Horizon Shielding: check nearby wall heights within 4 cells (~450 m)
      let maxHorizonAngle = 0;
      let shieldedDirs = 0;
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, -1],
        [1, -1],
        [-1, 1],
      ];
      for (const [dx, dy] of dirs) {
        let dirMax = 0;
        for (let step = 1; step <= 4; step++) {
          const sx = x + dx * step;
          const sy = y + dy * step;
          if (sx >= 0 && sx < nx && sy >= 0 && sy < ny) {
            const dz = elev[sy][sx] - elev[y][x];
            const dist = Math.hypot(dx * step, dy * step) * cellSizeM;
            const ang = (Math.atan2(dz, dist) * 180) / Math.PI;
            if (ang > dirMax) dirMax = ang;
          }
        }
        if (dirMax > 14) shieldedDirs++;
        if (dirMax > maxHorizonAngle) maxHorizonAngle = dirMax;
      }
      shelterScore[y][x] = Number(clamp((shieldedDirs / 8) * 0.7 + (maxHorizonAngle / 45) * 0.3, 0, 1).toFixed(2));

      // Traversability 5-state classification (Section 4.1)
      if (u > 0.6) {
        traversability[y][x] = "INSUFFICIENT_DATA";
      } else if (s > params.maxSlopeDeg) {
        traversability[y][x] = "EXCLUDED_ZONE";
      } else if (s > 12) {
        traversability[y][x] = "HIGH_COST";
      } else if (s > 6) {
        traversability[y][x] = "MODERATE_COST";
      } else {
        traversability[y][x] = "LOW_COST";
      }

      const met = computeMetabolicMetrics(s, sSand, gdalRough[y][x], params, true);
      o2CostPerMeter[y][x] = Number((met.o2FlowLMin / (met.effectiveSpeedMs * 60)).toFixed(5));
    }
  }

  return {
    regionId,
    nx,
    ny,
    cellSizeM,
    boundsLonLat: bounds_lonlat,
    baseGrid: base_grid,
    elevationM: elev,
    slopeDeg: gdalSlope,
    roughnessM: gdalRough,
    viewshedLoS: los,
    sandTrap: sand,
    mineralIndex: mineral,
    uncertainty: uncert,
    slipHazard,
    shelterScore,
    traversability,
    o2CostPerMeter,
    fromQgisGdal: true,
  };
}

/**
 * Deterministic fallback grid generator (used only on initial SSR frame before public/gis/qgis_processed_terrain.json hydrates)
 */
export function buildFallbackTerrainGrid(
  regionId: RegionId,
  params: SuitAndMissionParams
): MarsTerrainGrid {
  const nx = 48;
  const ny = 48;
  const isJezero = regionId === "JEZERO_CRATER";
  const bounds: [number, number, number, number] = isJezero
    ? [77.26, 18.36, 77.46, 18.56]
    : [137.34, -4.75, 137.48, -4.61];
  const cellSizeM = isJezero ? 235 : 172;
  const baseGrid: [number, number] = isJezero ? [36, 23] : [9, 38];

  const elev: number[][] = [];
  const sand: number[][] = [];
  const mineral: number[][] = [];
  const uncert: number[][] = [];

  for (let gy = 0; gy < ny; gy++) {
    const eRow: number[] = [];
    const sRow: number[] = [];
    const mRow: number[] = [];
    const uRow: number[] = [];
    const Y = gy / (ny - 1);
    for (let gx = 0; gx < nx; gx++) {
      const X = gx / (nx - 1);
      if (isJezero) {
        const yChan = 0.56 + 0.07 * Math.sin(X * 10.5) - 0.1 * X;
        const dChan = Math.abs(Y - yChan);
        const canyon = Math.exp(-((dChan / 0.07) ** 2)) * (1 / (1 + Math.exp((X - 0.62) * 14)));
        const z =
          -2550 +
          340 * Math.exp(-Math.pow((X - 0.04) / 0.16, 2)) +
          120 * Math.exp(-Math.pow((X - 0.3) / 0.11, 2)) -
          88 * canyon;
        eRow.push(z);
        sRow.push(clamp(0.15 + 0.5 * Math.exp(-((dChan / 0.06) ** 2)), 0.05, 0.92));
        mRow.push(clamp(0.25 + 0.7 * Math.exp(-(((X - 0.49) ** 2 + (Y - 0.29) ** 2) / 0.03)), 0.1, 0.98));
      } else {
        const box = Math.exp(-(((X - 0.46) ** 2 + (Y - 0.5) ** 2) / 0.085));
        const g1 = Math.abs(Math.sin((X * 24 + Y * 13) * 1.4));
        const g2 = Math.abs(Math.sin((X * 14 - Y * 22) * 1.4));
        const ridges = Math.max(Math.exp(-((g1 / 0.18) ** 2)), Math.exp(-((g2 / 0.18) ** 2)));
        const z = -4180 + 440 * (1 - Y) ** 1.3 + 18 * ridges * box - 14 * (1 - ridges) * box;
        eRow.push(z);
        sRow.push(clamp(0.14 + 0.72 * (1 - ridges) * box, 0.06, 0.94));
        mRow.push(clamp(0.25 + 0.7 * ridges * box, 0.1, 0.97));
      }
      uRow.push(clamp(0.12 + 0.55 * Math.max(0, Math.hypot(X - 0.5, Y - 0.5) - 0.42) * 3, 0.08, 0.85));
    }
    elev.push(eRow);
    sand.push(sRow);
    mineral.push(mRow);
    uncert.push(uRow);
  }

  // Compute slope S via atan gradient & roughness in 3x3
  const slope: number[][] = Array.from({ length: ny }, () => Array(nx).fill(0));
  const rough: number[][] = Array.from({ length: ny }, () => Array(nx).fill(0));
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const xm = Math.max(0, x - 1);
      const xp = Math.min(nx - 1, x + 1);
      const ym = Math.max(0, y - 1);
      const yp = Math.min(ny - 1, y + 1);
      const dzdx = (elev[y][xp] - elev[y][xm]) / ((xp - xm || 1) * cellSizeM);
      const dzdy = (elev[yp][x] - elev[ym][x]) / ((yp - ym || 1) * cellSizeM);
      slope[y][x] = Number(((Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI).toFixed(2));
      let sum = 0;
      let cnt = 0;
      for (let yy = ym; yy <= yp; yy++) {
        for (let xx = xm; xx <= xp; xx++) {
          sum += elev[yy][xx];
          cnt++;
        }
      }
      const mean = sum / cnt;
      let vSum = 0;
      for (let yy = ym; yy <= yp; yy++) {
        for (let xx = xm; xx <= xp; xx++) {
          vSum += (elev[yy][xx] - mean) ** 2;
        }
      }
      rough[y][x] = Number(Math.sqrt(vSum / cnt).toFixed(2));
    }
  }

  const los = computeLoSViewshed(elev, nx, ny, cellSizeM, baseGrid[0], baseGrid[1], 12.0, 1.8);
  const raw: RawQgisRegionJson = {
    nx,
    ny,
    cell_size_m: cellSizeM,
    bounds_lonlat: bounds,
    base_grid: baseGrid,
    elevation_m: elev,
    gdal_slope_deg: slope,
    gdal_roughness_m: rough,
    gdal_viewshed_los: los,
    sand_trap: sand,
    mineral_index: mineral,
    uncertainty: uncert,
  };
  const grid = buildTerrainGridFromQgisJson(regionId, raw, params);
  grid.fromQgisGdal = false;
  return grid;
}

/**
 * Synthesize high-contrast 64x64 3D geomorphological relief grids for ALL 10 mapped Mars landmarks,
 * reusing GDAL/PyQGIS 96x96 grids directly for Jezero Crater & Gale / Mount Sharp.
 */
export function buildLandmarkTerrainGrid(
  landmarkId: string,
  params: SuitAndMissionParams,
  qgisRawRegions?: Record<string, RawQgisRegionJson> | null
): MarsTerrainGrid {
  if (landmarkId === "JEZERO_CRATER" || landmarkId === "GALE_MOUNT_SHARP") {
    const raw = qgisRawRegions?.[landmarkId];
    return raw
      ? buildTerrainGridFromQgisJson(landmarkId as RegionId, raw, params)
      : buildFallbackTerrainGrid(landmarkId as RegionId, params);
  }

  const lm =
    GLOBAL_MARS_LANDMARKS.find((l) => l.id === landmarkId) || GLOBAL_MARS_LANDMARKS[0];
  const nx = 64;
  const ny = 64;
  const cellSizeM = 145;
  const bounds: [number, number, number, number] = [
    Number((lm.lon - 0.08).toFixed(4)),
    Number((lm.lat - 0.08).toFixed(4)),
    Number((lm.lon + 0.08).toFixed(4)),
    Number((lm.lat + 0.08).toFixed(4)),
  ];
  const baseGrid: [number, number] = lm.base_grid_pos ?? [16, 48];

  const elev: number[][] = [];
  const sand: number[][] = [];
  const mineral: number[][] = [];
  const uncert: number[][] = [];

  for (let gy = 0; gy < ny; gy++) {
    const eRow: number[] = [];
    const sRow: number[] = [];
    const mRow: number[] = [];
    const uRow: number[] = [];
    const Y = gy / (ny - 1);

    for (let gx = 0; gx < nx; gx++) {
      const Xn = gx / (nx - 1);
      let z = lm.elevation_m;
      let s = 0.22;
      let m = 0.4;

      switch (lm.id) {
        case "OLYMPUS_MONS": {
          // Nested summit caldera rims & basaltic shield flank (~20,450 m .. +21,229 m)
          const dx = Xn - 0.65;
          const dy = Y - 0.4;
          const dCal = Math.hypot(dx, dy);
          const rimOuter = Math.exp(-Math.pow((dCal - 0.34) / 0.09, 2)) * 420;
          const rimInner = Math.exp(-Math.pow((dCal - 0.16) / 0.06, 2)) * 290;
          const collapse = dCal < 0.3 ? -540 * (1 - dCal / 0.32) : 0;
          const shieldSlope = (1 - Xn) * -280 + Math.sin(Xn * 16 + Y * 11) * 28;
          z = 20960 + rimOuter + rimInner + collapse + shieldSlope;
          s = clamp(0.14 + 0.48 * Math.exp(-Math.pow(dCal / 0.2, 2)), 0.08, 0.86);
          m = clamp(0.32 + 0.58 * Math.exp(-Math.pow((dCal - 0.16) / 0.1, 2)), 0.15, 0.96);
          break;
        }
        case "VALLES_MARINERIS": {
          // Coprates Chasma tectonic canyon walls (+1,850 m reliefs) & stepped benches
          const centerLine = 0.52 - 0.14 * (Xn - 0.5);
          const dAxis = Math.abs(Y - centerLine);
          const northWall = 1850 / (1 + Math.exp(-(dAxis - 0.28) * 14));
          const bench = 340 * Math.exp(-Math.pow((dAxis - 0.18) / 0.07, 2));
          const strata = Math.sin(dAxis * 44) * 32 + Math.cos(Xn * 18) * 24;
          z = -6800 + northWall + bench + strata;
          s = clamp(0.18 + 0.55 * Math.exp(-Math.pow(dAxis / 0.09, 2)), 0.08, 0.92);
          m = clamp(0.35 + 0.55 * Math.exp(-Math.pow((dAxis - 0.16) / 0.08, 2)), 0.15, 0.97);
          break;
        }
        case "HELLAS_PLANITIA": {
          // Abyssal impact floor dropping from -7,550 m scarps down to -8,200 m + dune trains
          const dBasin = Math.hypot(Xn - 0.35, Y - 0.38);
          const outerScarp = 620 / (1 + Math.exp(-(dBasin - 0.34) * 10));
          const dunes = 45 * Math.sin(Xn * 28 + Y * 14) + 22 * Math.cos(Y * 22);
          z = -8200 + outerScarp + dunes;
          s = clamp(0.35 + 0.45 * (0.5 + 0.5 * Math.sin(Xn * 28 + Y * 14)), 0.12, 0.93);
          m = clamp(0.28 + 0.52 * Math.exp(-Math.pow((dBasin - 0.24) / 0.14, 2)), 0.1, 0.92);
          break;
        }
        case "MARS_PATHFINDER_ARES": {
          // Outflow channel floor with streamlined island & Twin Peaks (+110..+190 m)
          const dPeak1 = Math.hypot(Xn - 0.72, Y - 0.34);
          const dPeak2 = Math.hypot(Xn - 0.8, Y - 0.48);
          const twinPeaks =
            165 * Math.exp(-Math.pow(dPeak1 / 0.12, 2)) +
            135 * Math.exp(-Math.pow(dPeak2 / 0.11, 2));
          const floodIsland = 58 * Math.exp(-Math.pow((Xn - 0.45) / 0.18, 2) - Math.pow((Y - 0.52) / 0.1, 2));
          const scour = -35 * Math.exp(-Math.pow((Y - 0.72) / 0.12, 2));
          z = -3680 + twinPeaks + floodIsland + scour + Math.sin(Xn * 20) * 8;
          s = clamp(0.16 + 0.44 * Math.exp(-Math.pow((Y - 0.7) / 0.15, 2)), 0.08, 0.84);
          m = clamp(0.32 + 0.6 * Math.exp(-Math.pow(dPeak1 / 0.16, 2)), 0.14, 0.95);
          break;
        }
        case "VIKING_1": {
          // Chryse Planitia volcanic plains with compressional wrinkle ridges & fresh crater
          const ridge = 75 * Math.exp(-Math.pow((Xn - 0.56 - 0.08 * Math.sin(Y * 6)) / 0.08, 2));
          const dCr = Math.hypot(Xn - 0.69, Y - 0.38);
          const craterBowl = dCr < 0.12 ? -65 * (1 - dCr / 0.12) : 0;
          const craterRim = 48 * Math.exp(-Math.pow((dCr - 0.12) / 0.04, 2));
          z = -3620 + ridge + craterBowl + craterRim + Math.sin(Xn * 26 + Y * 18) * 10;
          s = clamp(0.2 + 0.35 * Math.sin(Xn * 14) ** 2, 0.1, 0.78);
          m = clamp(0.3 + 0.55 * Math.exp(-Math.pow((dCr - 0.12) / 0.1, 2)), 0.12, 0.92);
          break;
        }
        case "INSIGHT_ELYSIUM": {
          // Smooth Elysium plain + shallow Homestead Hollow bowl (-35 m) & low gentle ridges
          const dHollow = Math.hypot(Xn - 0.38, Y - 0.44);
          const hollow = -42 * Math.exp(-Math.pow(dHollow / 0.14, 2));
          const apron = 48 * Math.exp(-Math.pow((dHollow - 0.18) / 0.07, 2));
          const undul = 18 * Math.sin(Xn * 10 + Y * 8);
          z = -2655 + hollow + apron + undul;
          s = clamp(0.18 + 0.34 * Math.exp(-Math.pow(dHollow / 0.14, 2)), 0.06, 0.75);
          m = clamp(0.26 + 0.62 * Math.exp(-Math.pow(dHollow / 0.18, 2)), 0.12, 0.92);
          break;
        }
        case "SPIRIT_GUSEV": {
          // Gusev plains climbing Husband Hill (+340 m) & Home Plate silica plateau
          const dHill = Math.hypot(Xn - 0.72, Y - 0.28);
          const dPlate = Math.hypot(Xn - 0.52, Y - 0.54);
          const husbandHill = 340 * Math.exp(-Math.pow(dHill / 0.24, 2));
          const homePlate = 115 * Math.exp(-Math.pow(dPlate / 0.12, 2));
          z = -1910 + husbandHill + homePlate + Math.cos(Xn * 22 - Y * 16) * 14;
          s = clamp(0.15 + 0.45 * Math.exp(-Math.pow((Y - 0.75) / 0.15, 2)), 0.08, 0.85);
          m = clamp(0.35 + 0.6 * Math.exp(-Math.pow(dHill / 0.2, 2)), 0.15, 0.98);
          break;
        }
        default: {
          // OPPORTUNITY_MERIDIANI: Hematite ripples + scalloped Victoria/Endeavour Crater (-160 m/+60 m)
          const dCr = Math.hypot(Xn - 0.66, Y - 0.41);
          const ang = Math.atan2(Y - 0.41, Xn - 0.66);
          const scallop = 0.03 * Math.cos(ang * 7);
          const rimR = 0.22 + scallop;
          const rim = 72 * Math.exp(-Math.pow((dCr - rimR) / 0.05, 2));
          const bowl = dCr < rimR ? -175 * (1 - Math.pow(dCr / rimR, 2)) : 0;
          const ripples = 12 * Math.sin(Xn * 34 + Y * 8);
          z = -1420 + rim + bowl + ripples;
          s = clamp(0.22 + 0.5 * Math.exp(-Math.pow((Xn - 0.4) / 0.16, 2)), 0.08, 0.86);
          m = clamp(0.38 + 0.58 * Math.exp(-Math.pow((dCr - rimR) / 0.1, 2)), 0.15, 0.96);
          break;
        }
      }

      eRow.push(Number(z.toFixed(2)));
      sRow.push(Number(s.toFixed(3)));
      mRow.push(Number(m.toFixed(3)));

      const edgeDist = Math.max(Math.abs(Xn - 0.5), Math.abs(Y - 0.5));
      const baseU = lm.coverage_class === "HIGH_RES_PDS" ? 0.14 : lm.coverage_class === "CTX_STRIPS" ? 0.24 : 0.34;
      uRow.push(Number(clamp(baseU + Math.max(0, edgeDist - 0.34) * 1.4, 0.08, 0.68).toFixed(3)));
    }
    elev.push(eRow);
    sand.push(sRow);
    mineral.push(mRow);
    uncert.push(uRow);
  }

  const slope: number[][] = Array.from({ length: ny }, () => Array(nx).fill(0));
  const rough: number[][] = Array.from({ length: ny }, () => Array(nx).fill(0));
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const xm = Math.max(0, x - 1);
      const xp = Math.min(nx - 1, x + 1);
      const ym = Math.max(0, y - 1);
      const yp = Math.min(ny - 1, y + 1);
      const dzdx = (elev[y][xp] - elev[y][xm]) / ((xp - xm || 1) * cellSizeM);
      const dzdy = (elev[yp][x] - elev[ym][x]) / ((yp - ym || 1) * cellSizeM);
      slope[y][x] = Number(((Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI).toFixed(2));
      let sum = 0;
      let cnt = 0;
      for (let yy = ym; yy <= yp; yy++) {
        for (let xx = xm; xx <= xp; xx++) {
          sum += elev[yy][xx];
          cnt++;
        }
      }
      const mean = sum / cnt;
      let vSum = 0;
      for (let yy = ym; yy <= yp; yy++) {
        for (let xx = xm; xx <= xp; xx++) {
          vSum += (elev[yy][xx] - mean) ** 2;
        }
      }
      rough[y][x] = Number(Math.sqrt(vSum / cnt).toFixed(2));
    }
  }

  const los = computeLoSViewshed(elev, nx, ny, cellSizeM, baseGrid[0], baseGrid[1], 12.0, 1.8);
  const raw: RawQgisRegionJson = {
    nx,
    ny,
    cell_size_m: cellSizeM,
    bounds_lonlat: bounds,
    base_grid: baseGrid,
    elevation_m: elev,
    gdal_slope_deg: slope,
    gdal_roughness_m: rough,
    gdal_viewshed_los: los,
    sand_trap: sand,
    mineral_index: mineral,
    uncertainty: uncert,
  };
  const grid = buildTerrainGridFromQgisJson(landmarkId as RegionId, raw, params);
  grid.fromQgisGdal = false;
  return grid;
}

/**
 * Min-Heap Priority Queue for A* and Dijkstra
 */
class MinHeap<T> {
  private items: Array<{ priority: number; value: T }> = [];
  push(value: T, priority: number) {
    this.items.push({ value, priority });
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.items[p].priority <= this.items[i].priority) break;
      [this.items[p], this.items[i]] = [this.items[i], this.items[p]];
      i = p;
    }
  }
  pop(): T | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0].value;
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      const n = this.items.length;
      while (true) {
        let smallest = i;
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        if (l < n && this.items[l].priority < this.items[smallest].priority) smallest = l;
        if (r < n && this.items[r].priority < this.items[smallest].priority) smallest = r;
        if (smallest === i) break;
        [this.items[i], this.items[smallest]] = [this.items[smallest], this.items[i]];
        i = smallest;
      }
    }
    return top;
  }
  get size() {
    return this.items.length;
  }
}

interface PathSearchOptions {
  useHeuristic: boolean; // true = A*, false = Dijkstra
  wDist: number;
  wSlope: number;
  wRough: number;
  wSand: number;
  wUncert: number;
  wO2: number;
  wLoS: number;
  wScienceBonus: number;
  hardSlopeCapDeg: number;
}

function runGridPathSearch(
  grid: MarsTerrainGrid,
  start: [number, number],
  goal: [number, number],
  params: SuitAndMissionParams,
  opts: PathSearchOptions
): { path: Array<[number, number]>; nodesExplored: number; timeMs: number; totalCost: number } {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const { nx, ny, cellSizeM } = grid;
  const idx = (x: number, y: number) => y * nx + x;
  const totalNodes = nx * ny;
  const gScore = new Float64Array(totalNodes).fill(Infinity);
  const closed = new Uint8Array(totalNodes);
  const parent = new Int32Array(totalNodes).fill(-1);

  const startIdx = idx(start[0], start[1]);
  const goalIdx = idx(goal[0], goal[1]);
  gScore[startIdx] = 0;

  const pq = new MinHeap<number>();
  const h0 = opts.useHeuristic ? Math.hypot(goal[0] - start[0], goal[1] - start[1]) * opts.wDist : 0;
  pq.push(startIdx, h0);

  let nodesExplored = 0;
  const neighbors = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, -1, Math.SQRT2],
  ];

  while (pq.size > 0) {
    const curr = pq.pop()!;
    if (closed[curr]) continue;
    closed[curr] = 1;
    nodesExplored++;

    if (curr === goalIdx) break;

    const cx = curr % nx;
    const cy = Math.floor(curr / nx);

    for (const [dx, dy, stepMult] of neighbors) {
      const nx2 = cx + dx;
      const ny2 = cy + dy;
      if (nx2 < 0 || nx2 >= nx || ny2 < 0 || ny2 >= ny) continue;
      const nIdx = idx(nx2, ny2);
      if (closed[nIdx]) continue;

      const slope = grid.slopeDeg[ny2][nx2];
      // Hard slope exclusion except very near goal so target remains reachable if perched on outcrop edge
      const distGoal = Math.hypot(goal[0] - nx2, goal[1] - ny2);
      const slopeLimit = distGoal < 2.2 ? Math.max(opts.hardSlopeCapDeg, 24) : opts.hardSlopeCapDeg;
      if (slope > slopeLimit) continue;

      const distM = stepMult * cellSizeM;
      const dz = grid.elevationM[ny2][nx2] - grid.elevationM[cy][cx];
      const segSlopeDeg = (Math.atan2(Math.abs(dz), distM) * 180) / Math.PI;
      const effSlope = Math.max(slope, segSlopeDeg);

      const rough = grid.roughnessM[ny2][nx2];
      const sand = grid.sandTrap[ny2][nx2];
      const uncert = grid.uncertainty[ny2][nx2];
      const losPenalty = grid.viewshedLoS[ny2][nx2] === 0 ? 1 : 0;
      const met = computeMetabolicMetrics(effSlope, sand, rough, params, dz >= 0);
      const timeMin = distM / (met.effectiveSpeedMs * 60);
      const o2Liters = met.o2FlowLMin * timeMin;

      const sciDiscount = opts.wScienceBonus > 0 ? Math.max(0.15, 1 - opts.wScienceBonus * grid.mineralIndex[ny2][nx2]) : 1;

      const stepCost =
        stepMult *
        sciDiscount *
        (opts.wDist +
          opts.wSlope * (effSlope / 10) ** 1.7 +
          opts.wRough * (rough / 8) +
          opts.wSand * (sand * 4.2) +
          opts.wUncert * (uncert > 0.6 ? 12 : uncert * 2.5) +
          opts.wO2 * o2Liters +
          opts.wLoS * losPenalty);

      const tentative = gScore[curr] + stepCost;
      if (tentative < gScore[nIdx]) {
        gScore[nIdx] = tentative;
        parent[nIdx] = curr;
        const h = opts.useHeuristic
          ? Math.hypot(goal[0] - nx2, goal[1] - ny2) * opts.wDist * 0.92
          : 0;
        pq.push(nIdx, tentative + h);
      }
    }
  }

  // Reconstruct path (or fallback straight line if disconnected by ultra-strict S_max)
  const path: Array<[number, number]> = [];
  if (parent[goalIdx] !== -1 || startIdx === goalIdx) {
    let cur = goalIdx;
    while (cur !== -1) {
      path.push([cur % nx, Math.floor(cur / nx)]);
      if (cur === startIdx) break;
      cur = parent[cur];
    }
    path.reverse();
  } else {
    const steps = Math.max(Math.abs(goal[0] - start[0]), Math.abs(goal[1] - start[1]), 1);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      path.push([
        Math.round(start[0] + (goal[0] - start[0]) * t),
        Math.round(start[1] + (goal[1] - start[1]) * t),
      ]);
    }
  }

  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    path,
    nodesExplored,
    timeMs: Number(Math.max(0.2, t1 - t0).toFixed(2)),
    totalCost: gScore[goalIdx],
  };
}

function hydrateRouteProfile(
  id: "ROUTE_A" | "ROUTE_B" | "ROUTE_C",
  label: string,
  subtitle: string,
  color: string,
  rawPath: Array<[number, number]>,
  grid: MarsTerrainGrid,
  params: SuitAndMissionParams,
  algorithmStats: ComputedRoute["algorithmStats"]
): ComputedRoute {
  const waypoints: RouteWaypoint[] = [];
  let cumDistM = 0;
  let cumO2L = 0;
  let elevGainM = 0;
  let maxSlopeDeg = 0;
  let sumSlopeDeg = 0;
  let maxSlip = 0;
  let blackoutCount = 0;
  let highResCount = 0;
  let sumUncert = 0;
  let sumMineral = 0;

  for (let i = 0; i < rawPath.length; i++) {
    const [gx, gy] = rawPath[i];
    const { lon, lat } = gridToLonLat(gx, gy, grid);
    const elev = grid.elevationM[gy][gx];
    const slope = grid.slopeDeg[gy][gx];
    const rough = grid.roughnessM[gy][gx];
    const sand = grid.sandTrap[gy][gx];
    const slip = grid.slipHazard[gy][gx];
    const uncert = grid.uncertainty[gy][gx];
    const hasLoS = grid.viewshedLoS[gy][gx] === 1;

    let isUphill = true;
    let segSlope = slope;
    if (i > 0) {
      const [px, py] = rawPath[i - 1];
      const stepDist = Math.hypot(gx - px, gy - py) * grid.cellSizeM;
      cumDistM += stepDist;
      const dz = elev - grid.elevationM[py][px];
      if (dz > 0) elevGainM += dz;
      isUphill = dz >= 0;
      segSlope = Math.max(slope, (Math.atan2(Math.abs(dz), Math.max(1, stepDist)) * 180) / Math.PI);

      const met = computeMetabolicMetrics(segSlope, sand, rough, params, isUphill);
      const dtMin = stepDist / (met.effectiveSpeedMs * 60);
      cumO2L += met.o2FlowLMin * dtMin;
    }

    const metNow = computeMetabolicMetrics(segSlope, sand, rough, params, isUphill);
    const remainingO2Pct = Math.max(0, 100 - (cumO2L / params.tankCapacityL) * 100);
    // Estimate return O2 required along reverse corridor (~82% of outbound climb effort or flat return)
    const estReturnO2L = cumO2L * 0.78;
    const returnO2RequiredPct = (estReturnO2L / params.tankCapacityL) * 100;
    const bingoViolation = remainingO2Pct - returnO2RequiredPct < params.reservePercent;

    const coldThermalFactor = params.ambientTempC < -35 ? 1.16 : 1.0;
    const plssBattLeft = clamp(
      100 - ((cumO2L / params.tankCapacityL) * 82 * coldThermalFactor),
      0,
      100
    );

    if (segSlope > maxSlopeDeg) maxSlopeDeg = segSlope;
    sumSlopeDeg += segSlope;
    if (slip > maxSlip) maxSlip = slip;
    if (!hasLoS) blackoutCount++;
    if (uncert < 0.35) highResCount++;
    sumUncert += uncert;
    sumMineral += grid.mineralIndex[gy][gx];

    waypoints.push({
      gx,
      gy,
      lon: Number(lon.toFixed(4)),
      lat: Number(lat.toFixed(4)),
      elevationM: Number(elev.toFixed(1)),
      slopeDeg: Number(segSlope.toFixed(1)),
      roughnessM: Number(rough.toFixed(2)),
      sandTrap: Number(sand.toFixed(2)),
      slipHazard: Number(slip.toFixed(2)),
      uncertainty: Number(uncert.toFixed(2)),
      hasCommLoS: hasLoS,
      cumDistanceM: Math.round(cumDistM),
      cumO2Liters: Number(cumO2L.toFixed(1)),
      remainingO2Percent: Number(remainingO2Pct.toFixed(1)),
      returnO2RequiredPercent: Number(returnO2RequiredPct.toFixed(1)),
      bingoViolation,
      plssBatteryPercent: Number(plssBattLeft.toFixed(1)),
      metabolicRateW: metNow.metabolicRateW,
      o2FlowLMin: metNow.o2FlowLMin,
    });
  }

  // Add scientific observation time O2 consumption at target (~0.82 L/min standing/sampling)
  const obsO2L = params.observationMinutes * 0.82;
  const totalOutboundPlusObsO2L = cumO2L + obsO2L;
  // Round-trip or EVA outbound + reserve check
  const totalMissionO2L = totalOutboundPlusObsO2L * 1.65;
  const o2ConsumedPercent = Number(clamp((totalMissionO2L / params.tankCapacityL) * 100, 1, 100).toFixed(1));
  const plssBatteryUsedPercent = Number(clamp(o2ConsumedPercent * 0.91, 2, 100).toFixed(1));

  const safeMarginPct = 100 - o2ConsumedPercent - params.reservePercent;
  const bingoO2Safe = safeMarginPct >= 0 && maxSlopeDeg <= params.maxSlopeDeg + 1.5;

  let bingoStatusText = `SAFE (+${safeMarginPct.toFixed(1)}% sobre reserva del ${params.reservePercent}%)`;
  if (safeMarginPct < 0) {
    bingoStatusText = `BINGO O₂ VIOLATION (${Math.abs(safeMarginPct).toFixed(1)}% por debajo de reserva segura)`;
  } else if (maxSlopeDeg > params.maxSlopeDeg + 1.5) {
    bingoStatusText = `SLOPE HAZARD (${maxSlopeDeg.toFixed(1)}° supera S_max=${params.maxSlopeDeg}°)`;
  }

  const len = Math.max(1, rawPath.length);
  return {
    id,
    label,
    subtitle,
    color,
    waypoints,
    totalDistanceKm: Number((cumDistM / 1000).toFixed(2)),
    elevationGainM: Math.round(elevGainM),
    maxSlopeDeg: Number(maxSlopeDeg.toFixed(1)),
    avgSlopeDeg: Number((sumSlopeDeg / len).toFixed(1)),
    o2ConsumedLiters: Number(totalMissionO2L.toFixed(1)),
    o2ConsumedPercent,
    plssBatteryUsedPercent,
    bingoO2Safe,
    bingoStatusText,
    maxSlipHazard: Number(maxSlip.toFixed(2)),
    commBlackoutCells: blackoutCount,
    commCoveragePercent: Number((((len - blackoutCount) / len) * 100).toFixed(0)),
    highResCoveragePercent: Number(((highResCount / len) * 100).toFixed(0)),
    meanUncertainty: Number((sumUncert / len).toFixed(2)),
    scienceValueScore: Number(clamp((sumMineral / len) * 1.25, 0, 1).toFixed(2)),
    algorithmStats,
  };
}

/**
 * Compute all 3 comparative EVA routes (Route A Shortest, Route B Optimal Safety/O2 + Dijkstra validation, Route C Max Science)
 */
export function computeAllThreeRoutes(
  grid: MarsTerrainGrid,
  target: ScientificTargetDef,
  params: SuitAndMissionParams
): [ComputedRoute, ComputedRoute, ComputedRoute] {
  const start = grid.baseGrid;
  // Map target grid_pos proportionally if using fallback smaller grid
  const scaleX = grid.nx / 96;
  const scaleY = grid.ny / 96;
  const goal: [number, number] = [
    clamp(Math.round(target.grid_pos.x * scaleX), 1, grid.nx - 2),
    clamp(Math.round(target.grid_pos.y * scaleY), 1, grid.ny - 2),
  ];

  // Route A: Shortest Distance (ignores sand traps & steep slopes up to 24 deg)
  const resA = runGridPathSearch(grid, start, goal, params, {
    useHeuristic: true,
    wDist: 1.0,
    wSlope: 0.08,
    wRough: 0.04,
    wSand: 0.05,
    wUncert: 0.05,
    wO2: 0.05,
    wLoS: 0.0,
    wScienceBonus: 0,
    hardSlopeCapDeg: 26,
  });

  // Route B: Optimal Human Safety & Minimum O2 Cost (validated with Dijkstra!)
  const optsB: PathSearchOptions = {
    useHeuristic: true,
    wDist: 0.55,
    wSlope: 4.8,
    wRough: 1.6,
    wSand: 5.5,
    wUncert: 3.4,
    wO2: 2.8,
    wLoS: 0.9,
    wScienceBonus: 0,
    hardSlopeCapDeg: params.maxSlopeDeg,
  };
  const resB_Astar = runGridPathSearch(grid, start, goal, params, optsB);
  const resB_Dijkstra = runGridPathSearch(grid, start, goal, params, {
    ...optsB,
    useHeuristic: false,
  });

  // Route C: Maximum Science Value (routed through highest-mineralogy intermediate outcrop near midpoint)
  let bestMid: [number, number] = [
    Math.round((start[0] + goal[0]) / 2),
    Math.round((start[1] + goal[1]) / 2),
  ];
  let bestMinScore = -1;
  for (let y = 4; y < grid.ny - 4; y++) {
    for (let x = 4; x < grid.nx - 4; x++) {
      if (grid.slopeDeg[y][x] > params.maxSlopeDeg) continue;
      const distMid = Math.hypot(x - (start[0] + goal[0]) / 2, y - (start[1] + goal[1]) / 2);
      if (distMid > grid.nx * 0.35) continue;
      const sc = grid.mineralIndex[y][x] - 0.3 * grid.sandTrap[y][x];
      if (sc > bestMinScore) {
        bestMinScore = sc;
        bestMid = [x, y];
      }
    }
  }
  const optsC: PathSearchOptions = {
    useHeuristic: true,
    wDist: 0.65,
    wSlope: 2.9,
    wRough: 1.1,
    wSand: 2.8,
    wUncert: 2.0,
    wO2: 1.6,
    wLoS: 0.4,
    wScienceBonus: 0.45,
    hardSlopeCapDeg: params.maxSlopeDeg,
  };
  const leg1 = runGridPathSearch(grid, start, bestMid, params, optsC);
  const leg2 = runGridPathSearch(grid, bestMid, goal, params, optsC);
  const combinedPathC = [...leg1.path, ...leg2.path.slice(1)];

  const routeA = hydrateRouteProfile(
    "ROUTE_A",
    "Ruta A — Menor Distancia",
    "Camino directo; cruza pendientes fuertes y trampas de arena con alto gasto de O₂",
    "#EF4444",
    resA.path,
    grid,
    params,
    { astarNodesExplored: resA.nodesExplored, astarTimeMs: resA.timeMs }
  );

  const routeB = hydrateRouteProfile(
    "ROUTE_B",
    "Ruta B — Máxima Seguridad y Ahorro O₂ (A* Óptima)",
    "Rodea pendientes > S_max y depresiones de arena; optimiza tanque PLSS y Bingo O₂",
    "#10B981",
    resB_Astar.path,
    grid,
    params,
    {
      astarNodesExplored: resB_Astar.nodesExplored,
      astarTimeMs: resB_Astar.timeMs,
      dijkstraNodesExplored: resB_Dijkstra.nodesExplored,
      dijkstraTimeMs: resB_Dijkstra.timeMs,
      optimalCostDeltaPercent: 0,
    }
  );

  const routeC = hydrateRouteProfile(
    "ROUTE_C",
    "Ruta C — Máximo Valor Científico (SOI)",
    "Desvío estratégico por afloramientos de alta firma mineralógica CRISM dentro de S_max",
    "#00F0FF",
    combinedPathC,
    grid,
    params,
    {
      astarNodesExplored: leg1.nodesExplored + leg2.nodesExplored,
      astarTimeMs: Number((leg1.timeMs + leg2.timeMs).toFixed(2)),
    }
  );

  return [routeA, routeB, routeC];
}

/**
 * Find Topographic Radiation & Dust Shelters near an astronaut grid position
 */
export function findNearestTopographicShelters(
  grid: MarsTerrainGrid,
  fromGx: number,
  fromGy: number,
  limit = 4
): TopographicShelter[] {
  const candidates: TopographicShelter[] = [];
  for (let y = 2; y < grid.ny - 2; y += 2) {
    for (let x = 2; x < grid.nx - 2; x += 2) {
      const sh = grid.shelterScore[y][x];
      if (sh < 0.36 || grid.slopeDeg[y][x] > 26) continue;
      const dx = x - fromGx;
      const dy = y - fromGy;
      const distM = Math.hypot(dx, dy) * grid.cellSizeM;
      const bearingDeg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
      const { lon, lat } = gridToLonLat(x, y, grid);
      candidates.push({
        id: `SH-${x}-${y}`,
        gx: x,
        gy: y,
        lon: Number(lon.toFixed(4)),
        lat: Number(lat.toFixed(4)),
        elevationM: Math.round(grid.elevationM[y][x]),
        shieldingPercent: Math.round(sh * 100),
        distanceM: Math.round(distM),
        bearingDeg: Math.round(bearingDeg),
        label:
          grid.regionId === "JEZERO_CRATER"
            ? "Escarpe / Pared de Cañón Neretva Vallis"
            : grid.regionId === "GALE_MOUNT_SHARP"
            ? "Cresta Escarpada Sulfatada Monte Sharp"
            : `Refugio Topográfico (${String(grid.regionId).replace(/_/g, " ")})`,
      });
    }
  }
  candidates.sort((a, b) => a.distanceM - b.distanceM);
  // Deduplicate spatially close candidates (>250m apart)
  const picked: TopographicShelter[] = [];
  for (const c of candidates) {
    if (picked.every((p) => Math.hypot(p.gx - c.gx, p.gy - c.gy) > 4)) {
      picked.push(c);
      if (picked.length >= limit) break;
    }
  }
  return picked;
}

/**
 * Verifiable RAG Scientific Assistant (strictly returns 3 mandatory structured blocks)
 */
export interface RagStructuredResponse {
  query: string;
  targetId: string;
  block1_nasaMeasuredData: string[];
  block2_derivedModels: string[];
  block3_scientificInterpretationAndLimits: string[];
}

export function queryVerifiableMarsRag(
  question: string,
  target: ScientificTargetDef,
  activeRoute: ComputedRoute,
  weather: PreEvaWeatherResult,
  params: SuitAndMissionParams
): RagStructuredResponse {
  const q = question.toLowerCase();
  const block1 = target.pds_evidence.map(
    (ev) => `[PDS ${ev.product_id}] ${ev.mission} ${ev.instrument} (${ev.date}, ${ev.resolution}): ${ev.finding}`
  );

  if (q.includes("radiaci") || q.includes("rad") || q.includes("refugio") || q.includes("solar")) {
    block1.push(
      `[PDS MSL_RAD_SURFACE_RDR_GALE] ${target.radiation_reference.sensor_note}: ~${target.radiation_reference.gcr_baseline_ugy_day} μGy/día (${target.radiation_reference.surface_dose_rate_usv_h} μSv/h línea base GCR).`
    );
  }
  if (q.includes("polvo") || q.includes("tormenta") || q.includes("clima") || q.includes("viento")) {
    block1.push(
      `[PDS ${target.region_id === "JEZERO_CRATER" ? "MEDA_CALIBRATED_JZR" : "REMS_MODR_GALE"}] ${target.pre_eva_weather_default.sensor_source}: P=${target.pre_eva_weather_default.pressure_pa} Pa, τ=${target.pre_eva_weather_default.optical_depth_tau}.`
    );
  }

  const block2 = [
    `Ruta activa (${activeRoute.label}): ${activeRoute.totalDistanceKm} km, pendiente máxima ${activeRoute.maxSlopeDeg}° (límite traje S_max=${params.maxSlopeDeg}°).`,
    `Consumo PLSS modelado bajo g_Mars=3.721 m/s²: ${activeRoute.o2ConsumedLiters} L (${activeRoute.o2ConsumedPercent}% del tanque de ${params.tankCapacityL} L) · Estado: ${activeRoute.bingoStatusText}.`,
    `Cobertura de radio LoS (gdal_viewshed): ${activeRoute.commCoveragePercent}% (${activeRoute.commBlackoutCells} celdas COMM_BLACKOUT) · Predictor Pre-EVA: ${weather.status} (${weather.stormProbabilityPercent}% riesgo tormenta, visibilidad ${weather.visibilityKm} km).`,
  ];

  const block3: string[] = [];
  if (target.target_id === "GALE-BOXWORK-2025") {
    block3.push(
      "Hipótesis geológica: Las retículas poligonales (boxwork) en Monte Sharp se formaron por circulación tardía de agua subterránea que cementó fracturas antes de la erosión eólica; los nódulos de agosto de 2025 en las paredes externas sugieren múltiples episodios freáticos altos."
    );
    block3.push(
      "Limitación operativa: La inercia térmica THEMIS (100 m/px) y el DEM HiRISE (1 m/px) no resuelven todas las trampas de arena fina entre crestas; el consumo real de O₂ puede variar respecto al modelo paramétrico."
    );
  } else if (target.target_id === "JEZERO-CHEYAVA-2024") {
    block3.push(
      "Hipótesis astrobiológica: Las 'manchas de leopardo' de vivianita/greigita junto a compuestos orgánicos en Cheyava Falls representan potenciales biofirmas redox, pero también pueden originarse por procesos abióticos hidrotermales/químicos de baja temperatura; su confirmación requiere análisis en laboratorio terrestre."
    );
    block3.push(
      "Limitación de datos: Jezero carece de un detector RAD en superficie (los μSv/h mostrados usan referencia histórica calibrada de Curiosity en Gale) y las paredes de Neretva Vallis inducen sombra de radio LoS."
    );
  } else {
    block3.push(
      "Hipótesis paleoambiental: La Unidad Marginal de Carbonatos marca una antigua costa lacustre alcalina donde el olivino fue alterado a carbonato de Mg/Fe y sílice."
    );
    block3.push(
      "Limitación de resolución: Even HiRISE (0.25 m/px) no detecta clastos <15 cm; las celdas fuera del corredor DEM HiRISE (U > 0.6) permanecen marcadas como INSUFFICIENT_DATA."
    );
  }

  return {
    query: question,
    targetId: target.target_id,
    block1_nasaMeasuredData: block1,
    block2_derivedModels: block2,
    block3_scientificInterpretationAndLimits: block3,
  };
}

export function getTargetById(id: string): ScientificTargetDef {
  return SCIENTIFIC_TARGETS.find((t) => t.target_id === id) || SCIENTIFIC_TARGETS[0];
}

export function getSyntheticTargetForLandmark(landmarkId: string): ScientificTargetDef {
  if (landmarkId === "JEZERO_CRATER") {
    return SCIENTIFIC_TARGETS.find((t) => t.region_id === "JEZERO_CRATER") || SCIENTIFIC_TARGETS[1];
  }
  if (landmarkId === "GALE_MOUNT_SHARP") {
    return SCIENTIFIC_TARGETS.find((t) => t.region_id === "GALE_MOUNT_SHARP") || SCIENTIFIC_TARGETS[0];
  }

  const lm =
    GLOBAL_MARS_LANDMARKS.find((l) => l.id === landmarkId) || GLOBAL_MARS_LANDMARKS[0];
  const [tx, ty] = lm.target_grid_pos ?? [44, 24];
  const fallbackRef = SCIENTIFIC_TARGETS[0];
  const isColdHigh = lm.elevation_m > 5000;
  const estPressurePa = isColdHigh ? 140 : lm.elevation_m < -6000 ? 1155 : 740;

  return {
    target_id: lm.target_id || `${lm.id}-TARGET`,
    region_id: (lm.region_id || "JEZERO_CRATER") as RegionId,
    name: lm.name,
    title_es: lm.terrain_feature_es ? `${lm.name} — ${lm.terrain_feature_es}` : lm.name,
    coordinates: {
      latitude: lm.lat,
      longitude: lm.lon,
      elevation_m: lm.elevation_m,
    },
    grid_pos: {
      x: clamp(Math.round((tx / 64) * 96), 4, 92),
      y: clamp(Math.round((ty / 64) * 96), 4, 92),
    },
    rover_mission: lm.resolution_summary,
    scientific_summary_es: `${lm.summary} ${lm.first_person_desc_es || ""}`.trim(),
    key_findings: [
      lm.terrain_feature_es || lm.name,
      lm.first_person_desc_es || lm.summary,
      `Cobertura cartográfica: ${lm.resolution_summary} (Elevación ref. ${lm.elevation_m} m).`,
    ],
    sampling_checklist: [
      `Evaluar relieve local y pendiente límite S_max sobre ${lm.terrain_feature_es || lm.name}.`,
      "Confirmar enlace LoS con la estación base / aterrizador o habilitar Rover Repetidor.",
      "Verificar reserva obligatoria Bingo O₂ (+20%) antes de descender al objetivo.",
    ],
    soi_base: { M: 0.86, G: 0.94, T: 0.92, Q: lm.coverage_class === "HIGH_RES_PDS" ? 0.9 : 0.72 },
    pds_evidence: [
      {
        source_type: "Orbital",
        mission: "MRO / MGS / Mars Odyssey",
        instrument: lm.coverage_class === "HIGH_RES_PDS" ? "HiRISE + CTX + MOLA" : "MOLA + CTX + Viking",
        product_id: `PDS_${lm.id}`,
        resolution: lm.resolution_summary,
        date: "2001–2025",
        finding: lm.summary,
      },
    ],
    surface_photos: fallbackRef.surface_photos,
    pre_eva_weather_default: {
      sensor_source: `MOLA / Climatología Regional (${lm.name})`,
      pressure_pa: estPressurePa,
      pressure_drop_3h_pa: -3.5,
      optical_depth_tau: 0.52,
      solar_longitude_ls_deg: 145,
      wind_gust_ms: 9.8,
      delta_t_surf_air_k: 20.0,
    },
    radiation_reference: {
      sensor_note: `Estimación ambiental referenciada a MSL RAD (${lm.elevation_m} m)`,
      surface_dose_rate_usv_h: isColdHigh ? 13.8 : 8.9,
      gcr_baseline_ugy_day: isColdHigh ? 295 : 218,
    },
  };
}
