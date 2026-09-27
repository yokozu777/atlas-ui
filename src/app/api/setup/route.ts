import { spawnSync } from "node:child_process";
import fs from "node:fs";
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
  const result = spawnSync("git", ["-c", "http.sslVerify=false", ...args], {
    cwd,
    encoding: "utf8",
    timeout: GIT_TIMEOUT_MS,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_SSL_NO_VERIFY: "1",
    },
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

async function probePayload(root: string, gitUrl: string, fetchedAt?: string | null) {
  const probe = probeClusterctlVersion(root);
  const stamp = fetchedAt ?? checkoutFetchedAt(root);
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
    fetchedAt: stamp,
  };
}

function parseGitRefs(stdout: string): string[] {
  let hasMain = false;
  const tags: string[] = [];
  for (const raw of stdout.split("\n")) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    const name = line.split(/\s+/).pop() || "";
    if (name === "refs/heads/main") {
      hasMain = true;
    } else if (name.startsWith("refs/tags/")) {
      const tag = name.slice("refs/tags/".length);
      if (!tag.endsWith("^{}")) {
        tags.push(tag);
      }
    }
  }
  tags.sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" }));
  return [...(hasMain ? ["main"] : []), ...tags];
}

function isEmptyDir(dest: string): boolean {
  if (!fs.existsSync(dest)) {
    return true;
  }
  return fs.readdirSync(dest).length === 0;
}

function isGitRepo(dest: string): boolean {
  return fs.existsSync(path.join(dest, ".git"));
}

function looksLikeClusterctl(dest: string): boolean {
  return (
    fs.existsSync(path.join(dest, "cluster")) &&
    fs.existsSync(path.join(dest, "clusterctl", "__main__.py"))
  );
}

function checkoutFetchedAt(dest: string, fallback?: string | null): string | null {
  for (const rel of [path.join(".git", "FETCH_HEAD"), ".git"]) {
    const target = path.join(dest, rel);
    try {
      return new Date(fs.statSync(target).mtimeMs).toISOString();
    } catch {
      continue;
    }
  }
  return fallback?.trim() || null;
}

function latestRef(refs: string[]): string {
  const tags = refs.filter((item) => item !== "main");
  if (tags[0]) {
    return tags[0];
  }
  if (refs.includes("main")) {
    return "main";
  }
  throw new Error("No main branch or tags on that Git URL");
}

async function persistCheckout(root: string) {
  await saveConfig({
    clusterctlRoot: root,
    clusterctlFetchedAt: checkoutFetchedAt(root) ?? new Date().toISOString(),
  });
}

function installCheckout(gitUrl: string, dest: string, ref: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(ref)) {
    throw new Error(`invalid ref: ${ref}`);
  }
  if (isEmptyDir(dest)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    runGit(["clone", "--depth", "1", "--branch", ref, gitUrl, dest]);
  } else if (!isGitRepo(dest)) {
    throw new Error(`destination is not empty: ${dest}`);
  } else {
    const origin = runGit(["remote", "get-url", "origin"], dest);
    const normalize = (value: string) => value.replace(/\/+$/, "").replace(/\.git$/, "");
    if (normalize(origin) !== normalize(gitUrl)) {
      throw new Error(`origin is ${origin}, not ${gitUrl}`);
    }
    if (ref === "main") {
      runGit(["fetch", "--depth", "1", "origin", "main"], dest);
      runGit(["checkout", "-B", "main", "FETCH_HEAD"], dest);
    } else {
      runGit(
        ["fetch", "--depth", "1", "origin", `refs/tags/${ref}:refs/tags/${ref}`],
        dest,
      );
      runGit(["checkout", "--force", "--detach", `refs/tags/${ref}`], dest);
    }
  }
  if (!looksLikeClusterctl(dest)) {
    throw new Error(
      `not an atlas-clusterctl checkout (need ./cluster and clusterctl/__main__.py): ${dest}`,
    );
  }
}

export async function GET() {
  const config = await loadConfig();
  const gitUrl = defaultGitUrl();
  const dest = config?.clusterctlRoot?.trim() || defaultDest();
  const exists = fs.existsSync(dest);
  const isRepo = exists && isGitRepo(dest);
  const configured = exists && looksLikeClusterctl(dest);
  const fetchedAt = checkoutFetchedAt(dest, config?.clusterctlFetchedAt);
  if (!configured) {
    return NextResponse.json({
      success: true,
      configured: false,
      gitUrl,
      dest,
      clusterctlRoot: dest,
      exists,
      isRepo,
      ok: false,
      version: "",
      error: exists && !isRepo && !isEmptyDir(dest)
        ? `destination is not empty and is not a git checkout: ${dest}`
        : null,
      fetchedAt: exists ? fetchedAt : config?.clusterctlFetchedAt ?? null,
    });
  }
  try {
    const root = await resolveClusterctlRoot(dest);
    return NextResponse.json(await probePayload(root, gitUrl, fetchedAt));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      configured: true,
      gitUrl,
      dest,
      clusterctlRoot: dest,
      exists,
      isRepo,
      ok: false,
      version: "",
      error: message,
      fetchedAt,
    });
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    path?: string;
    dest?: string;
    url?: string;
    ref?: string;
    action?: "probe" | "clone" | "pull" | "refs" | "install" | "ensure";
  };
  const action = body.action ?? "probe";
  const gitUrl = body.url?.trim() || defaultGitUrl();
  try {
    if (action === "refs") {
      const stdout = runGit(["ls-remote", "--heads", "--tags", "--refs", gitUrl]);
      return NextResponse.json({
        success: true,
        gitUrl,
        refs: parseGitRefs(stdout),
      });
    }
    if (action === "ensure") {
      const dest = body.dest?.trim() || localCheckout();
      if (looksLikeClusterctl(dest)) {
        const root = await resolveClusterctlRoot(dest);
        return NextResponse.json(await probePayload(root, gitUrl));
      }
      if (!isEmptyDir(dest) && !isGitRepo(dest)) {
        throw new Error(`destination is not empty: ${dest}`);
      }
      const refs = parseGitRefs(
        runGit(["ls-remote", "--heads", "--tags", "--refs", gitUrl]),
      );
      installCheckout(gitUrl, dest, latestRef(refs));
      const root = await resolveClusterctlRoot(dest);
      await persistCheckout(root);
      return NextResponse.json(await probePayload(root, gitUrl));
    }
    if (action === "install") {
      const dest = body.dest?.trim() || localCheckout();
      const ref = body.ref?.trim();
      if (!ref) {
        throw new Error("ref is required");
      }
      installCheckout(gitUrl, dest, ref);
      const root = await resolveClusterctlRoot(dest);
      const probe = probeClusterctlVersion(root);
      if (!probe.ok) {
        return NextResponse.json(
          { ok: false, error: probe.error, clusterctlRoot: root, dest: root },
          { status: 400 },
        );
      }
      await persistCheckout(root);
      return NextResponse.json(await probePayload(root, gitUrl));
    }
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
      await persistCheckout(root);
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
      fetchedAt: checkoutFetchedAt(root),
    });
  } catch (err) {
    return gitErrorResponse(err);
  }
}
