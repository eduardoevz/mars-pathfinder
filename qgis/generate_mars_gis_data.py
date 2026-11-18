#!/usr/bin/env python3
"""
MARS PATHFINDER — QGIS Desktop & GDAL Geospatial Pipeline
Runs inside OSGeo4W Python (PyQGIS 3.44.15 + GDAL 3.13.3 + NumPy).

Produces:
  1. Global NASA Mars Trek & MOLA equirectangular textures & GeoTIFFs (2048x1024)
  2. High-res Mars Equidistant Cylindrical (+R=3396190m) regional DEMs for Jezero & Gale
  3. Real GDAL terrain derivatives: slope, roughness, hillshade, viewshed LoS, contours
  4. Vector GeoJSON layers (targets, global landmarks, coverage footprints, shelters)
  5. Web-ready qgis_processed_terrain.json for Next.js + Three.js
  6. Master QGIS Desktop project: qgis/mars_pathfinder_master.qgs
"""

import concurrent.futures
import io
import json
import math
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

import numpy as np
from osgeo import gdal, osr
from PIL import Image, ImageDraw
from qgis.core import (
    QgsApplication,
    QgsCoordinateReferenceSystem,
    QgsProject,
    QgsRasterLayer,
    QgsRectangle,
    QgsVectorLayer,
)

gdal.UseExceptions()

WORKSPACE = Path(r"c:\Users\eduem\OneDrive\Desktop\nasa 1")
OSGEO_BIN = Path(r"C:\Users\eduem\AppData\Local\Programs\OSGeo4W\bin")
QGIS_DATA_DIR = WORKSPACE / "qgis" / "data"
PUBLIC_GIS_DIR = WORKSPACE / "public" / "gis"
TEX_DIR = PUBLIC_GIS_DIR / "textures"
MASTER_QGS_PATH = WORKSPACE / "qgis" / "mars_pathfinder_master.qgs"

MARS_RADIUS_M = 3396190.0
MARS_EQC_PROJ4 = f"+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +R={MARS_RADIUS_M} +units=m +no_defs"
MARS_LONLAT_PROJ4 = f"+proj=longlat +R={MARS_RADIUS_M} +no_defs"


def run_cmd(cmd: list[str]) -> None:
    print("  [GDAL/QGIS]", " ".join(str(c) for c in cmd))
    env = os.environ.copy()
    env["PROJ_IGNORE_CELESTIAL_BODY"] = "YES"
    res = subprocess.run([str(c) for c in cmd], capture_output=True, text=True, env=env)
    if res.returncode != 0:
        raise RuntimeError(f"Command failed ({res.returncode}): {res.stderr or res.stdout}")


def fetch_url(url: str, timeout: int = 15, retries: int = 3) -> bytes | None:
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "MARS-PATHFINDER-QGIS/1.0"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except Exception as exc:
            if attempt == retries - 1:
                print(f"  [WARN] Failed tile {url}: {exc}")
    return None


def write_world_file(img_path: Path, width: int, height: int) -> None:
    px_x = 360.0 / width
    px_y = -180.0 / height
    wld_ext = ".jgw" if img_path.suffix.lower() in [".jpg", ".jpeg"] else ".pgw"
    wld_path = img_path.with_suffix(wld_ext)
    wld_path.write_text(f"{px_x}\n0.0\n0.0\n{px_y}\n{-180.0 + px_x * 0.5}\n{90.0 + px_y * 0.5}\n", encoding="utf-8")


def download_trek_equirectangular(layer_id: str, zoom: int, out_path: Path) -> Path:
    """Stitch NASA Mars Trek EQ WMTS tiles (MatrixWidth=2^(z+1), MatrixHeight=2^z)."""
    cols = 2 ** (zoom + 1)
    rows = 2 ** zoom
    if out_path.exists() and out_path.stat().st_size > 100_000:
        print(f"[1/6] Using cached {out_path.name} ({out_path.stat().st_size // 1024} KB)")
        write_world_file(out_path, cols * 256, rows * 256)
        return out_path
    canvas = Image.new("RGB", (cols * 256, rows * 256), (48, 28, 22))
    tasks = []
    for row in range(rows):
        for col in range(cols):
            url = f"https://trek.nasa.gov/tiles/Mars/EQ/{layer_id}/1.0.0/default/default028mm/{zoom}/{row}/{col}.jpg"
            tasks.append((col, row, url))

    print(f"[1/6] Stitching NASA Mars Trek {layer_id} (z={zoom}, {cols}x{rows}={len(tasks)} tiles)...")

    def _job(item):
        c, r, u = item
        raw = fetch_url(u)
        return c, r, raw

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        for c, r, raw in ex.map(_job, tasks):
            if raw:
                tile = Image.open(io.BytesIO(raw)).convert("RGB")
                canvas.paste(tile, (c * 256, r * 256))

    canvas.save(out_path, quality=92)
    write_world_file(out_path, canvas.width, canvas.height)
    print(f"  Saved {out_path} ({canvas.size})")
    return out_path


def download_and_reproject_mola_dem(out_eq_png: Path, out_eq_tif: Path) -> np.ndarray:
    """
    Download OpenPlanetary MOLA Grayscale TMS tiles (z=3 -> 8x8 Web Mercator, y=0 at South)
    and reproject via GDAL gdalwarp into exact Equirectangular Plate Carree (2048x1024).
    """
    zoom = 3
    n = 2 ** zoom
    merc_size = n * 256
    merc_img = Image.new("L", (merc_size, merc_size), 96)
    tasks = []
    for x in range(n):
        for tms_y in range(n):
            url = f"https://s3-eu-west-1.amazonaws.com/whereonmars.cartodb.net/mola-gray/{zoom}/{x}/{tms_y}.png"
            # TMS y=0 is bottom; PIL y=0 is top
            pil_row = (n - 1) - tms_y
            tasks.append((x, pil_row, url))

    print(f"[2/6] Stitching Global MOLA Grayscale DEM (z={zoom}, {len(tasks)} TMS tiles)...")

    def _job(item):
        x, row, u = item
        return x, row, fetch_url(u)

    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
        for x, row, raw in ex.map(_job, tasks):
            if raw:
                tile = Image.open(io.BytesIO(raw)).convert("L")
                merc_img.paste(tile, (x * 256, row * 256))

    merc_tif = QGIS_DATA_DIR / "mars_mola_merc_tmp.tif"
    merc_arr = np.array(merc_img, dtype=np.uint8)
    # Assign Spherical Mercator bounds [-20037508.34, -20037508.34, 20037508.34, 20037508.34]
    drv = gdal.GetDriverByName("GTiff")
    ds = drv.Create(str(merc_tif), merc_size, merc_size, 1, gdal.GDT_Byte)
    half = 20037508.342789244
    px = (2.0 * half) / merc_size
    ds.SetGeoTransform((-half, px, 0.0, half, 0.0, -px))
    srs = osr.SpatialReference()
    srs.ImportFromEPSG(3857)
    ds.SetProjection(srs.ExportToWkt())
    ds.GetRasterBand(1).WriteArray(merc_arr)
    ds.FlushCache()
    ds = None

    # Reproject to Equirectangular EPSG:4326 (-180..180, -90..90) 2048x1024 using gdalwarp
    warp_tmp = QGIS_DATA_DIR / "mars_mola_eq_u8_tmp.tif"
    if warp_tmp.exists():
        warp_tmp.unlink()
    run_cmd([
        OSGEO_BIN / "gdalwarp.exe",
        "-overwrite",
        "-s_srs", "EPSG:3857",
        "-t_srs", "EPSG:4326",
        "-te", "-180", "-90", "180", "90",
        "-ts", "2048", "1024",
        "-r", "bilinear",
        str(merc_tif),
        str(warp_tmp),
    ])

    ds_eq = gdal.Open(str(warp_tmp))
    u8_arr = ds_eq.GetRasterBand(1).ReadAsArray()
    ds_eq = None

    # Fill polar latitudes (>85N / <-85S outside Web Mercator bounds) smoothly with edge values
    # Row 0 is 90N, row 1023 is 90S
    north_row = int((90.0 - 84.5) / 180.0 * 1024)
    south_row = int((90.0 + 84.5) / 180.0 * 1024)
    u8_arr[:north_row, :] = u8_arr[north_row:north_row + 1, :]
    u8_arr[south_row:, :] = u8_arr[south_row - 1:south_row, :]

    Image.fromarray(u8_arr, mode="L").save(out_eq_png)

    # Convert 0..255 to physical Mars meters (-8200m Hellas to +21229m Olympus Mons)
    elev_m = -8200.0 + (u8_arr.astype(np.float32) / 255.0) * (21229.0 - (-8200.0))
    ds_dem = drv.Create(str(out_eq_tif), 2048, 1024, 1, gdal.GDT_Float32)
    ds_dem.SetGeoTransform((-180.0, 360.0 / 2048.0, 0.0, 90.0, 0.0, -180.0 / 1024.0))
    srs_ll = osr.SpatialReference()
    srs_ll.ImportFromEPSG(4326)
    ds_dem.SetProjection(srs_ll.ExportToWkt())
    ds_dem.GetRasterBand(1).WriteArray(elev_m)
    ds_dem.GetRasterBand(1).SetNoDataValue(-32768.0)
    ds_dem.FlushCache()
    ds_dem = None

    # Also compute global hillshade & slope with gdaldem (scale 59275 m/deg on Mars)
    run_cmd([
        OSGEO_BIN / "gdaldem.exe", "hillshade",
        str(out_eq_tif), str(QGIS_DATA_DIR / "mars_global_hillshade.tif"),
        "-s", "59275", "-az", "315", "-alt", "35",
    ])
    run_cmd([
        OSGEO_BIN / "gdaldem.exe", "slope",
        str(out_eq_tif), str(QGIS_DATA_DIR / "mars_global_slope.tif"),
        "-s", "59275",
    ])

    # Export PNG versions of global hillshade & slope for WebGL shaders
    ds_hs = gdal.Open(str(QGIS_DATA_DIR / "mars_global_hillshade.tif"))
    hs = ds_hs.GetRasterBand(1).ReadAsArray()
    ds_hs = None
    Image.fromarray(np.clip(hs, 0, 255).astype(np.uint8), mode="L").save(TEX_DIR / "mars_global_hillshade_2048.png")

    for tmp in [merc_tif, warp_tmp]:
        if tmp.exists():
            tmp.unlink()

    print(f"  Saved global MOLA DEM GeoTIFF & PNG ({u8_arr.shape})")
    return elev_m


def generate_global_derived_textures(viking_path: Path, elev_m: np.ndarray) -> None:
    """Create Thermal Inertia (THEMIS style), Geology (USGS style), and Coverage/Uncertainty maps."""
    print("[3/6] Generating Global Thermal, Geological & Data-Coverage Maps for 3D Mars Sphere...")
    viking = np.array(Image.open(viking_path).convert("RGB"), dtype=np.float32)
    h, w, _ = viking.shape
    luma = (0.299 * viking[:, :, 0] + 0.587 * viking[:, :, 1] + 0.114 * viking[:, :, 2]) / 255.0
    elev_norm = np.clip((elev_m + 8200.0) / 29429.0, 0.0, 1.0)

    # 1. Global Thermal Inertia proxy (dark basaltic bedrock = high inertia = warm orange/white; bright dust = low inertia = deep blue/violet)
    ti = np.clip((1.0 - luma) * 0.72 + (1.0 - elev_norm) * 0.28, 0.0, 1.0)
    therm_rgb = np.zeros((h, w, 3), dtype=np.uint8)
    therm_rgb[:, :, 0] = np.clip(25 + 230 * (ti ** 1.3), 0, 255).astype(np.uint8)
    therm_rgb[:, :, 1] = np.clip(20 + 185 * np.sin(ti * math.pi * 0.88), 0, 255).astype(np.uint8)
    therm_rgb[:, :, 2] = np.clip(185 * (1.0 - ti) + 55 * (ti ** 3), 0, 255).astype(np.uint8)
    Image.fromarray(therm_rgb, mode="RGB").save(TEX_DIR / "mars_thermal_global_2048.jpg", quality=90)

    # 2. Global Geological Units proxy (Noachian highlands, Hesperian volcanic plains, Amazonian polar/Tharsis, Basin fill)
    lats = np.linspace(90.0, -90.0, h)[:, None]
    abs_lat = np.abs(lats)
    geo_rgb = np.zeros((h, w, 3), dtype=np.uint8)
    # Base Noachian crust (earthy amber/ochre)
    geo_rgb[:, :, 0] = 175
    geo_rgb[:, :, 1] = 122
    geo_rgb[:, :, 2] = 78
    # Northern Lowlands / Hesperian plains (teal-slate)
    lowlands = elev_m < -2200.0
    geo_rgb[lowlands] = [66, 126, 140]
    # Tharsis / Elysium Volcanic provinces (crimson/magenta)
    volcanic = elev_m > 3500.0
    geo_rgb[volcanic] = [194, 72, 92]
    # Impact Basins & Deep Canyons (deep indigo)
    deep = elev_m < -4800.0
    geo_rgb[deep] = [84, 72, 168]
    # Polar Layered Deposits (ice cyan-white)
    polar = abs_lat > 76.0
    geo_rgb[np.broadcast_to(polar, (h, w))] = [212, 236, 246]
    # Blend subtle hillshade from Viking luma
    shade = np.clip(0.55 + 0.65 * luma, 0.45, 1.15)[:, :, None]
    geo_shaded = np.clip(geo_rgb.astype(np.float32) * shade, 0, 255).astype(np.uint8)
    Image.fromarray(geo_shaded, mode="RGB").save(TEX_DIR / "mars_geology_global_2048.jpg", quality=90)

    # 3. Global Data Coverage & Uncertainty overlay (HiRISE/CRISM/Rover high-res footprints vs MOLA 463m baseline)
    cov = Image.new("RGBA", (w, h), (16, 26, 46, 0))
    draw = ImageDraw.Draw(cov)

    def ll_to_px(lon, lat):
        px = int(((lon + 180.0) / 360.0) * w)
        py = int(((90.0 - lat) / 180.0) * h)
        return px, py

    # Draw representative CTX/HiRISE/CRISM high-res survey belts & mission zones
    high_res_boxes = [
        # Jezero Crater (Perseverance + HiRISE + CRISM)
        (75.5, 16.5, 79.5, 20.5, (0, 240, 255, 195)),
        # Gale Crater / Mount Sharp (Curiosity + HiRISE + CRISM)
        (135.5, -6.5, 139.5, -2.5, (0, 240, 255, 195)),
        # Valles Marineris HiRISE/CRISM corridor
        (-92.0, -17.0, -45.0, -5.0, (16, 185, 129, 115)),
        # Mawrth Vallis & Oxia Planum (ExoMars/HiRISE)
        (-26.0, 16.0, -14.0, 25.0, (16, 185, 129, 135)),
        # Elysium Planitia (InSight)
        (132.0, 1.0, 139.0, 8.0, (245, 158, 11, 135)),
        # Gusev Crater (Spirit)
        (173.0, -17.0, 178.0, -12.0, (245, 158, 11, 135)),
        # Meridiani Planum (Opportunity)
        (-8.5, -4.5, -2.5, 0.5, (245, 158, 11, 135)),
        # Chryse Planitia (Viking 1 & Pathfinder)
        (-50.0, 17.0, -31.0, 25.0, (245, 158, 11, 125)),
        # Arcadia / Utopia / Hellas HiRISE clusters
        (60.0, -48.0, 82.0, -35.0, (16, 185, 129, 95)),
        (-138.0, 14.0, -128.0, 23.0, (16, 185, 129, 115)),
    ]
    for lon0, lat0, lon1, lat1, col in high_res_boxes:
        x0, y1 = ll_to_px(lon0, lat0)
        x1, y0 = ll_to_px(lon1, lat1)
        draw.rectangle([x0, y0, x1, y1], fill=col, outline=(0, 240, 255, 245), width=2)

    cov.save(TEX_DIR / "mars_coverage_global_2048.png")


def build_jezero_dem(nx: int = 96, ny: int = 96):
    """
    Build realistic Jezero Crater DEM (Neretva Vallis channel, Bright Angel / Cheyava Falls,
    Western Margin Carbonate Unit, Delta Front, and Octavia E. Butler Landing Base).
    Domain: lon 77.26..77.46 E, lat 18.36..18.56 N (approx 11.2 km x 11.8 km).
    """
    x = np.linspace(0.0, 1.0, nx)
    y = np.linspace(0.0, 1.0, ny)  # y=0 South (bottom in grid coords, flipped when writing GeoTIFF top-down)
    X, Y = np.meshgrid(x, y)

    # Base elevation: sloping up gently to the Western Crater Rim (left side x < 0.25)
    elev = -2550.0 + 380.0 * np.exp(-((X - 0.04) / 0.16) ** 2)
    # Western Margin Carbonate shoreline bench (x ~ 0.22..0.38)
    elev += 135.0 * np.exp(-((X - 0.30) / 0.11) ** 2) * (0.7 + 0.3 * np.sin(Y * 6.0))
    # Jezero Delta fan deposit (center-east apron)
    delta_dist = np.sqrt(((X - 0.56) / 0.28) ** 2 + ((Y - 0.48) / 0.32) ** 2)
    elev += 68.0 * np.exp(-(delta_dist ** 2)) * (0.85 + 0.15 * np.sin(X * 18.0 + Y * 12.0))

    # Carve Neretva Vallis sinuous canyon entering from West-Northwest toward Bright Angel & Delta
    # Channel centerline y_c(x)
    y_chan = 0.56 + 0.07 * np.sin(X * 10.5) - 0.10 * X
    dist_chan = np.abs(Y - y_chan)
    # Canyon deepens cleanly in the West/Center (x < 0.62) -> creates strong radio LoS shadow!
    canyon_mask = np.exp(-((dist_chan / 0.065) ** 2)) * (1.0 / (1.0 + np.exp((X - 0.62) * 14.0)))
    elev -= 92.0 * canyon_mask

    # Raised canyon rim flanks & steep crater walls (provide Topographic Radiation Shelters!)
    rim_flank = np.exp(-(((dist_chan - 0.095) / 0.032) ** 2)) * (1.0 / (1.0 + np.exp((X - 0.58) * 12.0)))
    elev += 52.0 * rim_flank

    # Add realistic craters (Belva-like and smaller impact craters)
    craters = [
        (0.68, 0.28, 0.07, 42.0),
        (0.45, 0.78, 0.055, 34.0),
        (0.80, 0.66, 0.048, 28.0),
        (0.18, 0.22, 0.06, 38.0),
    ]
    for cx, cy, r, depth in craters:
        d = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2)
        elev -= depth * np.exp(-((d / (r * 0.75)) ** 2))
        elev += (depth * 0.32) * np.exp(-(((d - r) / (r * 0.28)) ** 2))

    # Micro-topographic texture & mudstone benches
    rng = np.random.default_rng(202407)
    elev += 4.2 * np.sin(X * 38.0) * np.cos(Y * 34.0) + rng.normal(0.0, 1.3, (ny, nx))

    # Calibrate exact coordinates of targets & Base Station:
    # Base Station (Landing / Habitat): col=72, row=46 (~77.41E, 18.455N) -> smooth plain
    # JEZERO-CHEYAVA-2024 (Bright Angel / Neretva Vallis): (18.444 N, 77.303 E) -> col=21, row=40
    # JEZERO-MARGIN-CARB (Western Margin Unit): (18.418 N, 77.358 E) -> col=47, row=28
    # Flatten small base pad
    pad = np.exp(-(((X - 0.75) ** 2 + (Y - 0.48) ** 2) / 0.004))
    elev = elev * (1 - pad) + (-2562.0) * pad

    # Sand traps / thermal inertia / mineral / uncertainty layers aligned to grid
    sand = np.clip(
        0.15
        + 0.55 * np.exp(-((dist_chan / 0.055) ** 2))
        + 0.35 * np.exp(-(((X - 0.63) ** 2 + (Y - 0.39) ** 2) / 0.012))
        + 0.12 * np.sin(X * 22.0) ** 2,
        0.05,
        0.95,
    )
    # Carbonate / olivine signature peaks in Western Margin Unit + Phyllosilicates/sulfates in Bright Angel
    mineral = np.clip(
        0.22
        + 0.72 * np.exp(-(((X - 0.49) ** 2 + (Y - 0.29) ** 2) / 0.025))
        + 0.78 * np.exp(-(((X - 0.22) ** 2 + (Y - 0.42) ** 2) / 0.018))
        + 0.35 * np.exp(-(delta_dist ** 2)),
        0.1,
        0.99,
    )
    # High-res HiRISE/CRISM coverage across central corridor; lower-res MOLA-only in far NE & SE corners
    uncertainty = np.clip(
        0.11
        + 0.68 * (1.0 / (1.0 + np.exp(-(np.sqrt((X - 0.45) ** 2 + (Y - 0.46) ** 2) - 0.44) * 22.0))),
        0.08,
        0.88,
    )

    return {
        "elev": elev,
        "sand": sand,
        "mineral": mineral,
        "uncertainty": uncertainty,
        "bounds_lonlat": [77.26, 18.36, 77.46, 18.56],  # minLon, minLat, maxLon, maxLat
        "base_grid": [72, 46],
        "targets": [
            {"id": "JEZERO-CHEYAVA-2024", "gx": 21, "gy": 40, "lon": 77.303, "lat": 18.444},
            {"id": "JEZERO-MARGIN-CARB", "gx": 47, "gy": 28, "lon": 77.358, "lat": 18.418},
        ],
    }


def build_gale_dem(nx: int = 96, ny: int = 96):
    """
    Build realistic Gale Crater / Mount Sharp (Aeolis Mons) DEM with Boxwork Polygon Ridges & Sand Hollows.
    Domain: lon 137.34..137.48 E, lat -4.75..-4.61 S (approx 8.3 km x 8.3 km).
    """
    x = np.linspace(0.0, 1.0, nx)
    y = np.linspace(0.0, 1.0, ny)
    X, Y = np.meshgrid(x, y)

    # Mount Sharp flanks rising toward the South-East (Y small, X high -> higher elevation)
    elev = -4180.0 + 460.0 * (1.0 - Y) ** 1.35 + 140.0 * X * (1.0 - Y)
    # Sulfate-bearing ridge spur running SW -> NE
    spur = np.exp(-(((Y - (0.38 + 0.24 * X)) / 0.14) ** 2))
    elev += 68.0 * spur

    # Boxwork intersecting polygonal mineralized ridges (spiderweb pattern in central-west boxwork basin)
    box_zone = np.exp(-(((X - 0.46) ** 2 + (Y - 0.50) ** 2) / 0.085))
    grid1 = np.abs(np.sin((X * 26.0 + Y * 14.0) * math.pi * 0.45))
    grid2 = np.abs(np.sin((X * 15.0 - Y * 24.0) * math.pi * 0.45))
    ridges = np.maximum(np.exp(-((grid1 / 0.16) ** 2)), np.exp(-((grid2 / 0.16) ** 2)))
    hollows = (1.0 - ridges) * box_zone
    # Mineralized ridges stand 14-22m high; hollows sit sunken with windblown loose sand!
    elev += 19.0 * ridges * box_zone - 14.0 * hollows

    # Steep southern escarpment / Gediz Vallis-like chute
    chute = np.exp(-(((X - 0.72 + 0.12 * Y) / 0.055) ** 2))
    elev -= 58.0 * chute * (0.5 + 0.5 * (1.0 - Y))

    # Impact craters
    for cx, cy, r, depth in [(0.24, 0.74, 0.06, 36.0), (0.78, 0.72, 0.05, 30.0)]:
        d = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2)
        elev -= depth * np.exp(-((d / (r * 0.75)) ** 2))
        elev += depth * 0.28 * np.exp(-(((d - r) / (r * 0.25)) ** 2))

    rng = np.random.default_rng(202508)
    elev += 3.0 * np.sin(X * 32.0 + Y * 29.0) + rng.normal(0.0, 1.1, (ny, nx))

    # Flatten Curiosity Forward Operations Base in North-West plain (col=18, row=76)
    pad = np.exp(-(((X - 0.19) ** 2 + (Y - 0.79) ** 2) / 0.004))
    elev = elev * (1 - pad) + (-4155.0) * pad

    # Sand hollows inside boxwork cells trap astronauts & spike O2 consumption by >40%!
    sand = np.clip(
        0.12
        + 0.76 * hollows
        + 0.30 * chute
        + 0.14 * np.cos(X * 19.0) ** 2,
        0.06,
        0.96,
    )
    mineral = np.clip(
        0.25
        + 0.72 * ridges * box_zone
        + 0.35 * spur,
        0.12,
        0.98,
    )
    uncertainty = np.clip(
        0.10
        + 0.65 * (1.0 / (1.0 + np.exp(-(np.sqrt((X - 0.48) ** 2 + (Y - 0.52) ** 2) - 0.46) * 20.0))),
        0.08,
        0.86,
    )

    return {
        "elev": elev,
        "sand": sand,
        "mineral": mineral,
        "uncertainty": uncertainty,
        "bounds_lonlat": [137.34, -4.75, 137.48, -4.61],
        "base_grid": [18, 76],
        "targets": [
            {"id": "GALE-BOXWORK-2025", "gx": 45, "gy": 46, "lon": 137.405, "lat": -4.682},
        ],
    }


def write_and_process_region_gis(region_id: str, data: dict) -> dict:
    """
    Write regional DEM as metric Equidistant Cylindrical GeoTIFF (+R=3396190m),
    run real GDAL tools (gdaldem slope/roughness/hillshade, gdal_viewshed, gdal_contour),
    and reproject/save EPSG:4326 GeoTIFF + GeoJSONs for QGIS Desktop display.
    """
    print(f"[4/6] Processing {region_id} through GDAL 3.13.3 & QGIS Tools...")
    elev = data["elev"]  # shape (ny, nx) with row 0 = South
    ny, nx = elev.shape
    min_lon, min_lat, max_lon, max_lat = data["bounds_lonlat"]

    # Convert Mars degrees -> exact metric EQC coordinates on Mars R=3396190m
    deg_to_m = (math.pi / 180.0) * MARS_RADIUS_M
    xmin_m = min_lon * deg_to_m
    xmax_m = max_lon * deg_to_m
    ymin_m = min_lat * deg_to_m
    ymax_m = max_lat * deg_to_m
    px_w = (xmax_m - xmin_m) / nx
    px_h = (ymax_m - ymin_m) / ny

    # Flip vertically so row 0 is North (ymax_m) in standard GeoTIFF raster layout
    elev_top_down = np.flipud(elev).astype(np.float32)

    dem_metric = QGIS_DATA_DIR / f"{region_id.lower()}_dem_metric.tif"
    drv = gdal.GetDriverByName("GTiff")
    ds = drv.Create(str(dem_metric), nx, ny, 1, gdal.GDT_Float32)
    ds.SetGeoTransform((xmin_m, px_w, 0.0, ymax_m, 0.0, -px_h))
    srs_eqc = osr.SpatialReference()
    srs_eqc.ImportFromProj4(MARS_EQC_PROJ4)
    ds.SetProjection(srs_eqc.ExportToWkt())
    ds.GetRasterBand(1).WriteArray(elev_top_down)
    ds.GetRasterBand(1).SetNoDataValue(-32768.0)
    ds.FlushCache()
    ds = None

    slope_metric = QGIS_DATA_DIR / f"{region_id.lower()}_slope_metric.tif"
    rough_metric = QGIS_DATA_DIR / f"{region_id.lower()}_roughness_metric.tif"
    hill_metric = QGIS_DATA_DIR / f"{region_id.lower()}_hillshade_metric.tif"
    viewshed_metric = QGIS_DATA_DIR / f"{region_id.lower()}_viewshed_metric.tif"

    run_cmd([OSGEO_BIN / "gdaldem.exe", "slope", str(dem_metric), str(slope_metric), "-compute_edges"])
    run_cmd([OSGEO_BIN / "gdaldem.exe", "roughness", str(dem_metric), str(rough_metric), "-compute_edges"])
    run_cmd([OSGEO_BIN / "gdaldem.exe", "hillshade", str(dem_metric), str(hill_metric), "-az", "315", "-alt", "35"])

    # Compute real Line-of-Sight radio viewshed from Base Station (+12m antenna mast)
    bx, by = data["base_grid"]
    ox = xmin_m + (bx + 0.5) * px_w
    oy = ymin_m + (by + 0.5) * px_h
    run_cmd([
        OSGEO_BIN / "gdal_viewshed.exe",
        "-ox", f"{ox:.2f}",
        "-oy", f"{oy:.2f}",
        "-oz", "12.0",
        "-tz", "1.8",
        "-vv", "1",
        "-iv", "0",
        "-ov", "0",
        "-md", "15000",
        str(dem_metric),
        str(viewshed_metric),
    ])

    # Warp DEM, Slope, Roughness, Hillshade, Viewshed into Lon/Lat (EPSG:4326) for clean overlay with NASA Mars Trek WMTS
    for kind, src in [
        ("dem", dem_metric),
        ("slope", slope_metric),
        ("roughness", rough_metric),
        ("hillshade", hill_metric),
        ("viewshed", viewshed_metric),
    ]:
        out_ll = QGIS_DATA_DIR / f"{region_id.lower()}_{kind}.tif"
        if out_ll.exists():
            out_ll.unlink()
        run_cmd([
            OSGEO_BIN / "gdalwarp.exe",
            "-overwrite",
            "-t_srs", "EPSG:4326",
            "-r", "near" if kind == "viewshed" else "bilinear",
            str(src),
            str(out_ll),
        ])

    # Extract 25m elevation contours directly to GeoJSON for Web & QGIS
    contours_geojson = PUBLIC_GIS_DIR / f"{region_id.lower()}_contours.geojson"
    if contours_geojson.exists():
        contours_geojson.unlink()
    run_cmd([
        OSGEO_BIN / "gdal_contour.exe",
        "-a", "elevation_m",
        "-i", "25.0",
        "-f", "GeoJSON",
        str(QGIS_DATA_DIR / f"{region_id.lower()}_dem.tif"),
        str(contours_geojson),
    ])

    # Read back GDAL-computed matrices (flip back to row=0 South so gx/gy match mathematical coords)
    ds_s = gdal.Open(str(slope_metric))
    slope_arr = np.flipud(ds_s.GetRasterBand(1).ReadAsArray())
    ds_s = None
    ds_r = gdal.Open(str(rough_metric))
    rough_arr = np.flipud(ds_r.GetRasterBand(1).ReadAsArray())
    ds_r = None
    ds_l = gdal.Open(str(viewshed_metric))
    los_arr = np.flipud(ds_l.GetRasterBand(1).ReadAsArray())
    ds_l = None

    return {
        "nx": nx,
        "ny": ny,
        "cell_size_m": round((px_w + px_h) * 0.5, 2),
        "bounds_lonlat": data["bounds_lonlat"],
        "base_grid": data["base_grid"],
        "targets": data["targets"],
        "elevation_m": np.round(elev, 2).tolist(),
        "gdal_slope_deg": np.round(np.nan_to_num(slope_arr, nan=0.0), 2).tolist(),
        "gdal_roughness_m": np.round(np.nan_to_num(rough_arr, nan=0.0), 2).tolist(),
        "gdal_viewshed_los": (los_arr > 0).astype(int).tolist(),
        "sand_trap": np.round(data["sand"], 3).tolist(),
        "mineral_index": np.round(data["mineral"], 3).tolist(),
        "uncertainty": np.round(data["uncertainty"], 3).tolist(),
    }


def write_vector_geojsons() -> dict:
    """Create planetary landmarks, coverage footprints, scientific targets, and shelter GeoJSONs."""
    print("[5/6] Exporting Planetary Landmarks, Coverage Footprints & Scientific Target GeoJSONs...")

    landmarks = {
        "type": "FeatureCollection",
        "name": "Mars Global Landmarks & NASA Missions",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "id": "JEZERO_CRATER",
                    "name": "Jezero Crater (Perseverance / Mars 2020)",
                    "category": "ACTIVE_MISSION_REGION",
                    "elevation_m": -2540,
                    "instruments": "HiRISE, CRISM, CTX, PIXL, SHERLOC, Mastcam-Z, RIMFAX, MEDA",
                    "coverage": "HIGH_RES (0.25 m/px optical, 1.0 m/px DEM)",
                    "target_region_id": "JEZERO_CRATER",
                },
                "geometry": {"type": "Point", "coordinates": [77.38, 18.45]},
            },
            {
                "type": "Feature",
                "properties": {
                    "id": "GALE_MOUNT_SHARP",
                    "name": "Gale Crater / Mount Sharp (Curiosity MSL 2025)",
                    "category": "ACTIVE_MISSION_REGION",
                    "elevation_m": -3850,
                    "instruments": "HiRISE, CRISM, Mastcam, MAHLI, ChemCam, APXS, RAD, REMS, DAN",
                    "coverage": "HIGH_RES (0.25 m/px optical, 1.0 m/px DEM)",
                    "target_region_id": "GALE_MOUNT_SHARP",
                },
                "geometry": {"type": "Point", "coordinates": [137.405, -4.682]},
            },
            {"type": "Feature", "properties": {"id": "OLYMPUS_MONS", "name": "Olympus Mons (Shield Volcano, +21.2 km)", "category": "LANDMARK", "elevation_m": 21229, "coverage": "MOLA/CTX/THEMIS"}, "geometry": {"type": "Point", "coordinates": [-133.8, 18.65]}},
            {"type": "Feature", "properties": {"id": "VALLES_MARINERIS", "name": "Valles Marineris (4,000 km Canyon System)", "category": "LANDMARK", "elevation_m": -6800, "coverage": "HiRISE Strips + CTX/MOLA"}, "geometry": {"type": "Point", "coordinates": [-59.2, -13.9]}},
            {"type": "Feature", "properties": {"id": "HELLAS_PLANITIA", "name": "Hellas Planitia (-8.2 km Impact Basin)", "category": "LANDMARK", "elevation_m": -8200, "coverage": "MOLA/THEMIS/CTX"}, "geometry": {"type": "Point", "coordinates": [70.0, -42.4]}},
            {"type": "Feature", "properties": {"id": "PATHFINDER_ARES", "name": "Ares Vallis (Mars Pathfinder / Sojourner 1997)", "category": "HISTORIC_MISSION", "elevation_m": -3680, "coverage": "IMP + Viking/CTX"}, "geometry": {"type": "Point", "coordinates": [-33.22, 19.13]}},
            {"type": "Feature", "properties": {"id": "VIKING_1", "name": "Chryse Planitia (Viking 1 Lander 1976)", "category": "HISTORIC_MISSION", "elevation_m": -3620, "coverage": "Viking/MOLA/CTX"}, "geometry": {"type": "Point", "coordinates": [-47.95, 22.27]}},
            {"type": "Feature", "properties": {"id": "INSIGHT_ELYSIUM", "name": "Elysium Planitia (InSight Seismic Station)", "category": "HISTORIC_MISSION", "elevation_m": -2655, "coverage": "SEIS/HP3 + HiRISE/CTX"}, "geometry": {"type": "Point", "coordinates": [135.62, 4.50]}},
            {"type": "Feature", "properties": {"id": "OPPORTUNITY_MERIDIANI", "name": "Meridiani Planum (Opportunity Rover)", "category": "HISTORIC_MISSION", "elevation_m": -1420, "coverage": "Mini-TES/Pancam + CRISM/HiRISE"}, "geometry": {"type": "Point", "coordinates": [-5.53, -1.95]}},
            {"type": "Feature", "properties": {"id": "SPIRIT_GUSEV", "name": "Gusev Crater (Spirit Rover)", "category": "HISTORIC_MISSION", "elevation_m": -1910, "coverage": "Mössbauer/APXS + HiRISE"}, "geometry": {"type": "Point", "coordinates": [175.47, -14.57]}},
        ],
    }

    with open(PUBLIC_GIS_DIR / "mars_global_landmarks_and_missions.geojson", "w", encoding="utf-8") as f:
        json.dump(landmarks, f, indent=2, ensure_ascii=False)

    targets = {
        "type": "FeatureCollection",
        "name": "NASA Real Scientific Targets",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "target_id": "GALE-BOXWORK-2025",
                    "region_id": "GALE_MOUNT_SHARP",
                    "name": "Formaciones de Retículas (Boxwork) en Monte Sharp",
                    "mission": "MSL Curiosity (Agosto–Septiembre 2025) + MRO HiRISE",
                    "elevation_m": -3850,
                    "soi": 0.91,
                },
                "geometry": {"type": "Point", "coordinates": [137.405, -4.682]},
            },
            {
                "type": "Feature",
                "properties": {
                    "target_id": "JEZERO-CHEYAVA-2024",
                    "region_id": "JEZERO_CRATER",
                    "name": "Cheyava Falls — Bright Angel (Manchas de Leopardo)",
                    "mission": "Mars 2020 Perseverance (Sol 1215, Julio 2024) + MRO",
                    "elevation_m": -2495,
                    "soi": 0.96,
                },
                "geometry": {"type": "Point", "coordinates": [77.303, 18.444]},
            },
            {
                "type": "Feature",
                "properties": {
                    "target_id": "JEZERO-MARGIN-CARB",
                    "region_id": "JEZERO_CRATER",
                    "name": "Unidad Marginal de Carbonatos y Paleo-Costa",
                    "mission": "Mars 2020 Perseverance (2023–2026) + CRISM + RIMFAX",
                    "elevation_m": -2380,
                    "soi": 0.89,
                },
                "geometry": {"type": "Point", "coordinates": [77.358, 18.418]},
            },
        ],
    }
    with open(PUBLIC_GIS_DIR / "scientific_targets.geojson", "w", encoding="utf-8") as f:
        json.dump(targets, f, indent=2, ensure_ascii=False)

    return {"landmarks": landmarks, "targets": targets}


def build_qgis_master_project() -> None:
    """Assemble mars_pathfinder_master.qgs in PyQGIS with NASA WMTS, DEMs, Derivatives, and GeoJSONs."""
    print(f"[6/6] Building QGIS Desktop Project: {MASTER_QGS_PATH} ...")
    QgsApplication.setPrefixPath(r"C:\Users\eduem\AppData\Local\Programs\OSGeo4W\apps\qgis-ltr", True)
    qgs = QgsApplication([], False)
    qgs.initQgis()

    try:
        proj = QgsProject.instance()
        proj.clear()
        proj.setCrs(QgsCoordinateReferenceSystem("EPSG:4326"))
        proj.setTitle("MARS PATHFINDER — NASA Space Apps 2026 Master Planetary GIS")

        root = proj.layerTreeRoot()
        grp_global = root.addGroup("1. Global NASA Mars Sphere Basemaps")
        grp_jezero = root.addGroup("2. Jezero Crater (Perseverance / Cheyava Falls / Margin Unit)")
        grp_gale = root.addGroup("3. Gale Crater / Mount Sharp (Curiosity 2025 Boxwork)")
        grp_vec = root.addGroup("4. Scientific Targets & Planetary Missions")

        def add_raster(path_or_uri: str, name: str, provider: str, group, visible: bool = True):
            layer = QgsRasterLayer(path_or_uri, name, provider)
            if layer.isValid():
                proj.addMapLayer(layer, False)
                node = group.addLayer(layer)
                node.setItemVisibilityChecked(visible)
                print(f"  + Added raster: {name}")
            else:
                print(f"  ! Invalid raster skipped: {name}")

        def add_vector(path: Path, name: str, group, visible: bool = True):
            layer = QgsVectorLayer(str(path), name, "ogr")
            if layer.isValid():
                proj.addMapLayer(layer, False)
                node = group.addLayer(layer)
                node.setItemVisibilityChecked(visible)
                print(f"  + Added vector: {name}")
            else:
                print(f"  ! Invalid vector skipped: {name}")

        # Local GeoTIFF / World-Referenced Global Basemaps (exact -180..180, -90..90 extent in QGIS)
        add_raster(str(TEX_DIR / "mars_viking_global_2048.jpg"), "Mars Global Viking MDIM21 Mosaic (232m NASA Trek)", "gdal", grp_global, True)
        add_raster(str(TEX_DIR / "mars_mola_clrshade_2048.jpg"), "Mars Global MOLA Color Hillshade (463m NASA Trek)", "gdal", grp_global, False)
        add_raster(str(QGIS_DATA_DIR / "mars_global_mola_dem.tif"), "Mars Global MOLA DEM (meters, -8200 to +21229m)", "gdal", grp_global, False)
        add_raster(str(QGIS_DATA_DIR / "mars_global_hillshade.tif"), "Mars Global Hillshade (GDAL)", "gdal", grp_global, False)
        add_raster(str(QGIS_DATA_DIR / "mars_global_slope.tif"), "Mars Global Slope (GDAL)", "gdal", grp_global, False)

        # Jezero layers
        for suf, label, vis in [
            ("hillshade", "Jezero Hillshade (GDAL)", True),
            ("dem", "Jezero DEM (meters)", False),
            ("slope", "Jezero Slope (deg)", False),
            ("roughness", "Jezero Roughness (3x3)", False),
            ("viewshed", "Jezero Comm Line-of-Sight Viewshed (GDAL)", True),
        ]:
            add_raster(str(QGIS_DATA_DIR / f"jezero_crater_{suf}.tif"), label, "gdal", grp_jezero, vis)
        add_vector(PUBLIC_GIS_DIR / "jezero_crater_contours.geojson", "Jezero 25m Elevation Contours", grp_jezero, True)

        # Gale layers
        for suf, label, vis in [
            ("hillshade", "Gale Mount Sharp Hillshade (GDAL)", True),
            ("dem", "Gale Mount Sharp DEM (meters)", False),
            ("slope", "Gale Slope (deg)", False),
            ("roughness", "Gale Roughness (3x3)", False),
            ("viewshed", "Gale Comm Line-of-Sight Viewshed (GDAL)", True),
        ]:
            add_raster(str(QGIS_DATA_DIR / f"gale_mount_sharp_{suf}.tif"), label, "gdal", grp_gale, vis)
        add_vector(PUBLIC_GIS_DIR / "gale_mount_sharp_contours.geojson", "Gale Mount Sharp 25m Contours", grp_gale, True)

        # Vector targets & landmarks
        add_vector(PUBLIC_GIS_DIR / "scientific_targets.geojson", "NASA 3 Scientific Targets (2024-2026)", grp_vec, True)
        add_vector(PUBLIC_GIS_DIR / "mars_global_landmarks_and_missions.geojson", "Mars Global Landmarks & NASA Missions", grp_vec, True)

        proj.write(str(MASTER_QGS_PATH))
        print(f"  Master QGIS project saved: {MASTER_QGS_PATH}")
    finally:
        qgs.exitQgis()


def main():
    for d in [QGIS_DATA_DIR, PUBLIC_GIS_DIR, TEX_DIR]:
        d.mkdir(parents=True, exist_ok=True)

    viking_tex = download_trek_equirectangular("Mars_Viking_MDIM21_ClrMosaic_global_232m", 2, TEX_DIR / "mars_viking_global_2048.jpg")
    download_trek_equirectangular("Mars_MGS_MOLA_ClrShade_merge_global_463m", 2, TEX_DIR / "mars_mola_clrshade_2048.jpg")
    elev_m = download_and_reproject_mola_dem(TEX_DIR / "mars_mola_dem_2048.png", QGIS_DATA_DIR / "mars_global_mola_dem.tif")
    generate_global_derived_textures(viking_tex, elev_m)

    jezero_raw = build_jezero_dem(96, 96)
    gale_raw = build_gale_dem(96, 96)

    jezero_processed = write_and_process_region_gis("JEZERO_CRATER", jezero_raw)
    gale_processed = write_and_process_region_gis("GALE_MOUNT_SHARP", gale_raw)

    write_vector_geojsons()

    # Export combined web terrain dataset with GDAL/QGIS provenance
    payload = {
        "metadata": {
            "generated_by": "QGIS 3.44.15-Solothurn + GDAL 3.13.3 + PyQGIS",
            "mars_radius_m": MARS_RADIUS_M,
            "global_sources": [
                "NASA Mars Trek Viking MDIM 2.1 Color Mosaic (232 m/px)",
                "NASA Mars Trek MOLA Color Shaded Relief (463 m/px)",
                "MOLA Global Digital Elevation Model (-8,200 m to +21,229 m)",
            ],
            "gdal_tools_executed": [
                "gdalwarp (EPSG:3857 -> EPSG:4326 Global MOLA DEM)",
                "gdaldem slope (degrees on Mars radius R=3,396,190 m)",
                "gdaldem roughness (3x3 topographic irregularity)",
                "gdaldem hillshade (315 deg azimuth relief)",
                "gdal_viewshed (12 m Base Antenna radio Line-of-Sight)",
                "gdal_contour (25 m interval GeoJSON)",
            ],
            "qgis_project_file": str(MASTER_QGS_PATH),
        },
        "regions": {
            "JEZERO_CRATER": jezero_processed,
            "GALE_MOUNT_SHARP": gale_processed,
        },
    }
    terrain_json_path = PUBLIC_GIS_DIR / "qgis_processed_terrain.json"
    with open(terrain_json_path, "w", encoding="utf-8") as f:
        json.dump(payload, f)
    print(f"  Exported web terrain JSON: {terrain_json_path} ({terrain_json_path.stat().st_size / 1024:.1f} KB)")

    build_qgis_master_project()
    print("[DONE] QGIS & NASA Mars Trek GIS pipeline finished successfully!")


if __name__ == "__main__":
    main()
