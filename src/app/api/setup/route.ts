import { NextResponse } from "next/server";

import { loadConfig, saveConfig } from "@/server/config";
import {
  ClusterctlPathError,
  probeClusterctlVersion,
  resolveClusterctlRoot,
} from "@/server/clusterctl";

export async function GET() {
  const config = await loadConfig();
  if (!config) {
    return NextResponse.json({ configured: false });
  }
  try {
    const root = await resolveClusterctlRoot(config.clusterctlRoot);
    const probe = probeClusterctlVersion(root);
    return NextResponse.json({
      configured: true,
      clusterctlRoot: root,
      version: probe.version,
      ok: probe.ok,
      error: probe.error ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      configured: true,
      clusterctlRoot: config.clusterctlRoot,
      ok: false,
      error: message,
    });
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as { path?: string };
  try {
    const root = await resolveClusterctlRoot(body.path ?? "");
    const probe = probeClusterctlVersion(root);
    if (!probe.ok) {
      return NextResponse.json(
        { ok: false, error: probe.error, clusterctlRoot: root },
        { status: 400 },
      );
    }
    await saveConfig({ clusterctlRoot: root });
    return NextResponse.json({
      ok: true,
      configured: true,
      clusterctlRoot: root,
      version: probe.version,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof ClusterctlPathError ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
