import { spawnSync } from "node:child_process";
import path from "node:path";
import { NextResponse } from "next/server";

import { loadConfig, saveConfig } from "@/server/config";
import {
  ClusterctlPathError,
  probeClusterctlVersion,
  resolveClusterctlRoot,
} from "@/server/clusterctl";
import { defaultDest, defaultGitUrl } from "@/server/clusterctl-defaults";

const GIT_TIMEOUT_MS = 180_000;

function gitErrorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const status = err instanceof ClusterctlPathError ? 400 : 500;
  return NextResponse.json({ ok: false, success: false, error: message }, { status });
}

function localCheckout(): string {
  return path.join(process.cwd(), "atlas-clusterctl");
}

function runGit(args: string[], cwd?: string): string {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: GIT_TIMEOUT_MS,
  });
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error("git is not installed on this host");
    }
    throw new Error(result.error.message);
  }
  if (result.status !== 0) {
    throw new Error(`${result.stderr ?? ""}${result.stdout ?? ""}`.trim() || "git failed");
  }
  return (result.stdout ?? "").trim();
}

async function probePayload(root: string, gitUrl: string) {
  const probe = probeClusterctlVersion(root);
  return {
    success: probe.ok,
    ok: probe.ok,
    configured: true,
    gitUrl,
    dest: root,
    clusterctlRoot: root,
    exists: true,
    isRepo: true,
    version: probe.version,
    error: probe.error ?? null,
  };
}

export async function GET() {
  const config = await loadConfig();
  const gitUrl = defaultGitUrl();
  const dest = config?.clusterctlRoot?.trim() || defaultDest();
  if (!config) {
    return NextResponse.json({
      configured: false,
      gitUrl,
      dest,
      clusterctlRoot: dest,
      exists: false,
      isRepo: false,
      ok: false,
      version: "",
      error: null,
    });
  }
  try {
    const root = await resolveClusterctlRoot(config.clusterctlRoot);
    const probe = probeClusterctlVersion(root);
    return NextResponse.json({
      configured: true,
      gitUrl,
      dest: root,
      clusterctlRoot: root,
      exists: true,
      isRepo: true,
      version: probe.version,
      ok: probe.ok,
      error: probe.error ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      configured: true,
      gitUrl,
      dest: config.clusterctlRoot,
      clusterctlRoot: config.clusterctlRoot,
      ok: false,
      error: message,
    });
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    path?: string;
    dest?: string;
    url?: string;
    action?: "probe" | "clone" | "pull";
  };
  const action = body.action ?? "probe";
  const gitUrl = body.url?.trim() || defaultGitUrl();
  try {
    if (action === "clone" || action === "pull") {
      const dest = localCheckout();
      if (action === "clone") {
        runGit(["clone", "--depth", "1", gitUrl, dest]);
      } else {
        runGit(["pull", "--ff-only"], dest);
      }
      const root = await resolveClusterctlRoot(dest);
      const probe = probeClusterctlVersion(root);
      if (!probe.ok) {
        return NextResponse.json(
          { ok: false, error: probe.error, clusterctlRoot: root, dest: root },
          { status: 400 },
        );
      }
      await saveConfig({ clusterctlRoot: root });
      return NextResponse.json(await probePayload(root, gitUrl));
    }
    const dest = body.dest ?? body.path ?? "";
    const root = await resolveClusterctlRoot(dest);
    const probe = probeClusterctlVersion(root);
    if (!probe.ok) {
      return NextResponse.json(
        { ok: false, error: probe.error, clusterctlRoot: root, dest: root },
        { status: 400 },
      );
    }
    await saveConfig({ clusterctlRoot: root });
    return NextResponse.json({
      ok: true,
      configured: true,
      clusterctlRoot: root,
      dest: root,
      version: probe.version,
    });
  } catch (err) {
    return gitErrorResponse(err);
  }
}
