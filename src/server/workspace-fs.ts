import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

export const WORKSPACE_FILE_MAX = 512 * 1024;

export type WorkspaceFsEntry = {
  name: string;
  rel: string;
  kind: "dir" | "file";
  size?: number;
};

export type WorkspaceLsPayload = {
  rel: string;
  entries: WorkspaceFsEntry[];
};

export type WorkspaceFilePayload = {
  rel: string;
  content?: string;
  binary?: boolean;
  truncated?: boolean;
  size?: number;
};

export function normalizeWorkspaceRel(rel: string): string {
  const value = rel.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  if (!value) {
    return "";
  }
  if (value.includes("\0")) {
    throw new Error("invalid path");
  }
  const parts = value.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error("invalid path");
  }
  return value;
}

async function resolveUnder(root: string, rel: string): Promise<string> {
  const resolvedRoot = await realpath(/* turbopackIgnore: true */ root);
  const full = rel
    ? path.resolve(resolvedRoot, ...rel.split("/"))
    : resolvedRoot;
  let resolved: string;
  try {
    resolved = await realpath(/* turbopackIgnore: true */ full);
  } catch {
    const relative = path.relative(resolvedRoot, full);
    if (!relative) {
      return resolvedRoot;
    }
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("path outside workspace");
    }
    throw new Error("not found");
  }
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("path outside workspace");
  }
  return resolved;
}

export async function listWorkspaceDir(
  root: string,
  rel = "",
): Promise<WorkspaceLsPayload> {
  const normalized = normalizeWorkspaceRel(rel);
  try {
    await realpath(/* turbopackIgnore: true */ root);
  } catch {
    return { rel: normalized, entries: [] };
  }
  let target: string;
  try {
    target = await resolveUnder(root, normalized);
  } catch (err) {
    if (err instanceof Error && err.message === "not found") {
      return { rel: normalized, entries: [] };
    }
    throw err;
  }
  const info = await stat(/* turbopackIgnore: true */ target);
  if (!info.isDirectory()) {
    throw new Error(`not a directory: ${normalized || "."}`);
  }
  const names = await readdir(/* turbopackIgnore: true */ target);
  const entries: WorkspaceFsEntry[] = [];
  for (const name of names) {
    const childRel = normalized ? `${normalized}/${name}` : name;
    try {
      const child = await resolveUnder(root, childRel);
      const childInfo = await stat(/* turbopackIgnore: true */ child);
      const kind = childInfo.isDirectory() ? "dir" : "file";
      entries.push({
        name,
        rel: childRel,
        kind,
        ...(kind === "file" ? { size: childInfo.size } : {}),
      });
    } catch {
      continue;
    }
  }
  entries.sort(
    (a, b) =>
      Number(a.kind !== "dir") - Number(b.kind !== "dir") ||
      a.name.localeCompare(b.name),
  );
  return { rel: normalized, entries };
}

export async function readWorkspaceFile(
  root: string,
  rel: string,
): Promise<WorkspaceFilePayload> {
  const normalized = normalizeWorkspaceRel(rel);
  if (!normalized) {
    throw new Error("invalid path");
  }
  const full = await resolveUnder(root, normalized);
  const info = await stat(/* turbopackIgnore: true */ full);
  if (!info.isFile()) {
    throw new Error(`file not found: ${normalized}`);
  }
  const buf = await readFile(/* turbopackIgnore: true */ full);
  const size = buf.byteLength;
  if (buf.subarray(0, 8192).includes(0)) {
    return { rel: normalized, binary: true, size };
  }
  const truncated = size > WORKSPACE_FILE_MAX;
  const content = buf.subarray(0, WORKSPACE_FILE_MAX).toString("utf8");
  return {
    rel: normalized,
    content,
    binary: false,
    truncated,
    size,
  };
}
