import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);
const MCP_SERVER_SCRIPT = path.join(process.cwd(), "mcp", "qgis_mars_mcp_server.py");

export async function GET() {
  try {
    const { stdout } = await execFileAsync(
      "python",
      [MCP_SERVER_SCRIPT, "--cli", "qgis_get_status"],
      { timeout: 8000 }
    );
    const data = JSON.parse(stdout);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        qgis_desktop_live: false,
        error: err instanceof Error ? err.message : "Failed to query QGIS MCP Server",
      },
      { status: 200 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tool = body.tool || "qgis_get_status";
    const args = body.arguments || {};
    const { stdout } = await execFileAsync(
      "python",
      [MCP_SERVER_SCRIPT, "--cli", tool, JSON.stringify(args)],
      { timeout: 120000 }
    );
    const data = JSON.parse(stdout);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "QGIS MCP action failed",
      },
      { status: 500 }
    );
  }
}
