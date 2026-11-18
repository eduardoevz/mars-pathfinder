import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  _req: Request,
  context: { params: Promise<{ name: string }> }
) {
  const { name } = await context.params;
  // Prevent directory traversal
  const safeName = path.basename(name);
  const filePath = path.join(process.cwd(), 'src', 'app', 'cesium-mars', 'data', safeName);

  if (!fs.existsSync(filePath)) {
    return new NextResponse('Asset not found', { status: 404 });
  }

  const ext = path.extname(safeName).toLowerCase();
  const contentType =
    ext === '.json'
      ? 'application/json; charset=utf-8'
      : ext === '.jpg' || ext === '.jpeg'
      ? 'image/jpeg'
      : ext === '.png'
      ? 'image/png'
      : 'application/octet-stream';

  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
