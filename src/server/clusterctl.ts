import { spawn, spawnSync } from "node:child_process";
import { access, constants, lstat } from "node:fs/promises";
import path from "node:path";

export class ClusterctlPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClusterctlPathError";
  }
}

export async function resolveClusterctlRoot(rawPath: string): Promise<string> {
  const trimmed = rawPath.trim();
  if (!trimmed) {
    throw new ClusterctlPathError("path is empty");
  }
  const root = path.resolve(trimmed);
  let stat;
  try {
    stat = await lstat(root);
  } catch {
    throw new ClusterctlPathError(`directory not found: ${root}`);
  }
  if (!stat.isDirectory()) {
    throw new ClusterctlPathError(`not a directory: ${root}`);
  }
  const clusterBin = path.join(root, "cluster");
  const mainPy = path.join(root, "clusterctl", "__main__.py");
  try {
    await access(clusterBin, constants.F_OK);
    await access(mainPy, constants.F_OK);
  } catch {
    throw new ClusterctlPathError(
      `not an atlas-clusterctl checkout (need ./cluster and clusterctl/__main__.py): ${root}`,
    );
  }
  return root;
}

export function clusterBinPath(root: string): string {
  return path.join(root, "cluster");
}

export function probeClusterctlVersion(root: string): { ok: boolean; version: string; error?: string } {
  const bin = clusterBinPath(root);
  const result = spawnSync(bin, ["--version"], {
    cwd: root,
    env: { ...process.env, ATLAS_CLUSTER_ROOT: root },
    encoding: "utf8",
    timeout: 20_000,
  });
  if (result.error) {
    return { ok: false, version: "", error: result.error.message };
  }
  const text = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.status !== 0) {
    return { ok: false, version: "", error: text || `exit ${result.status}` };
  }
  return { ok: true, version: text };
}

export type SpawnClusterctlOptions = {
  root: string;
  argv: string[];
  clusterId?: string;
  onStdout: (chunk: string) => void;
  onStderr: (chunk: string) => void;
};

export function spawnClusterctl(options: SpawnClusterctlOptions) {
  const env: NodeJS.ProcessEnv = { ...process.env, ATLAS_CLUSTER_ROOT: options.root };
  if (options.clusterId) {
    env.CLUSTER_ID = options.clusterId;
  } else {
    delete env.CLUSTER_ID;
  }
  const child = spawn(clusterBinPath(options.root), options.argv, {
    cwd: options.root,
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => options.onStdout(chunk));
  child.stderr?.on("data", (chunk: string) => options.onStderr(chunk));
  return child;
}
