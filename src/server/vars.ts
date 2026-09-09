import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseJobJson } from "@/lib/job-output";
import { readJobLog, startJob, waitForJob } from "@/server/jobs";

export type VarsFile = {
  rel: string;
  layer: string;
  kind: string;
  secret: boolean;
};

export type VarsCatalog = {
  cluster_id: string;
  clusters_root: string;
  files: VarsFile[];
};

export async function loadVarsCatalog(clusterId: string): Promise<VarsCatalog> {
  const job = await startJob({ argv: ["vars", "--json"], clusterId });
  const done = await waitForJob(job);
  const log = await readJobLog(done.id);
  if (done.exitCode !== 0) {
    throw new Error(log || `vars exit ${done.exitCode}`);
  }
  const payload = parseJobJson<VarsCatalog>(log);
  if (!payload.clusters_root || !Array.isArray(payload.files)) {
    throw new Error("invalid vars catalog");
  }
  return payload;
}

function normalizeRel(rel: string): string {
  return rel.replaceAll("\\", "/").replace(/^\/+/, "");
}

export function resolveCatalogPath(catalog: VarsCatalog, rel: string): string {
  const normalized = normalizeRel(rel);
  if (!normalized || normalized.includes("\0")) {
    throw new Error("invalid path");
  }
  const parts = normalized.split("/");
  if (parts.some((part) => part === ".." || part === "." || part === "")) {
    throw new Error("invalid path");
  }
  const root = path.resolve(catalog.clusters_root);
  const full = path.resolve(root, ...parts);
  const relative = path.relative(root, full);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("path outside clusters_root");
  }
  if (!catalog.files.some((file) => file.rel === normalized)) {
    throw new Error("file is not in the cluster vars catalog");
  }
  return full;
}

export async function readVarsFile(
  clusterId: string,
  rel: string,
): Promise<{ file: VarsFile; content: string }> {
  const catalog = await loadVarsCatalog(clusterId);
  const normalized = normalizeRel(rel);
  const full = resolveCatalogPath(catalog, normalized);
  const file = catalog.files.find((item) => item.rel === normalized);
  if (!file) {
    throw new Error("file is not in the cluster vars catalog");
  }
  const content = await readFile(/* turbopackIgnore: true */ full, "utf8");
  return { file, content };
}

export async function writeVarsFile(
  clusterId: string,
  rel: string,
  content: string,
): Promise<VarsFile> {
  if (typeof content !== "string") {
    throw new Error("content must be a string");
  }
  const catalog = await loadVarsCatalog(clusterId);
  const normalized = normalizeRel(rel);
  const full = resolveCatalogPath(catalog, normalized);
  const file = catalog.files.find((item) => item.rel === normalized);
  if (!file) {
    throw new Error("file is not in the cluster vars catalog");
  }
  await writeFile(/* turbopackIgnore: true */ full, content, "utf8");
  return file;
}
