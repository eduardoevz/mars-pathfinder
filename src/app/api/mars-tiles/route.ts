import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LAYER_URLS: Record<string, (z: number, y: number, x: number) => string> = {
  viking: (z, y, x) =>
    `https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/${z}/${y}/${x}.jpg`,
  mola_color: (z, y, x) =>
    `https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/${z}/${y}/${x}.jpg`,
  ctx: (z, y, x) =>
    `https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/${z}/${y}/${x}.jpg`,
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const layer = (searchParams.get("layer") || "viking").toLowerCase();
  const zRaw = Number(searchParams.get("z"));
  const yRaw = Number(searchParams.get("y"));
  const xRaw = Number(searchParams.get("x"));

  if (
    !(layer in LAYER_URLS) ||
    !Number.isInteger(zRaw) ||
    !Number.isInteger(yRaw) ||
    !Number.isInteger(xRaw) ||
    zRaw < 0 ||
    zRaw > 8
  ) {
    return NextResponse.json({ ok: false, error: "Invalid tile parameters" }, { status: 400 });
  }

  const maxCols = 1 << (zRaw + 1);
  const maxRows = 1 << zRaw;
  if (yRaw < 0 || yRaw >= maxRows) {
    return NextResponse.json({ ok: false, error: "Tile row out of range" }, { status: 404 });
  }
  // Wrap X horizontally cleanly around Mars
  const x = ((xRaw % maxCols) + maxCols) % maxCols;
  const y = yRaw;
  const z = zRaw;

  const cacheDir = path.join(process.cwd(), "public", "gis", "tile_cache", layer, String(z));
  const cacheFile = path.join(cacheDir, `${y}_${x}.jpg`);

  try {
    const cached = await fs.readFile(cacheFile);
    return new NextResponse(cached, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400",
        "X-Tile-Source": "local-cache",
      },
    });
  } catch {
    // Not cached yet; fetch from NASA Mars Trek WMTS
  }

  const remoteUrl = LAYER_URLS[layer](z, y, x);
  try {
    const res = await fetch(remoteUrl, {
      signal: AbortSignal.timeout(4000),
      headers: {
        "User-Agent": "MarsPathfinder-QGIS/1.0 (NASA Space Apps)",
      },
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Upstream NASA Trek returned HTTP ${res.status}` },
        { status: 404 }
      );
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) {
      return NextResponse.json({ ok: false, error: "Empty upstream tile" }, { status: 404 });
    }
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(cacheFile, buf);

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400",
        "X-Tile-Source": "nasa-trek-wmts",
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "NASA Mars Trek tile fetch timeout or unreachable" },
      { status: 404 }
    );
  }
}
