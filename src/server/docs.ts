import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  defaultDocId,
  isAllowedDocRel,
  menuDocId,
  parseDocId,
} from "@/lib/docs-href";
import type { DocFile } from "@/lib/docs-types";
import { resolveClusterctlRoot } from "@/server/clusterctl";
import { loadConfig } from "@/server/config";

function sourceAndRel(
  id: string,
): { source: "ui" | "clusterctl"; rel: string } | null {
  if (id.startsWith("clusterctl/")) {
    return { source: "clusterctl", rel: id.slice("clusterctl/".length) };
  }
  if (id.startsWith("ui/")) {
    return { source: "ui", rel: id.slice("ui/".length) };
  }
  return null;
}

async function clusterctlRoot(): Promise<string> {
  const config = await loadConfig();
  const raw = config?.clusterctlRoot?.trim() || "../atlas-clusterctl";
  return resolveClusterctlRoot(raw);
}

async function absolutePath(id: string): Promise<string> {
  const parsed = sourceAndRel(id);
  if (!parsed || !isAllowedDocRel(parsed.rel)) {
    throw new Error("Unknown document");
  }
  const root =
    parsed.source === "ui" ? process.cwd() : await clusterctlRoot();
  const resolved = path.resolve(root, parsed.rel);
  const base = path.resolve(root);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    throw new Error("Unknown document");
  }
  return resolved;
}

export async function loadDoc(rawId?: string | null): Promise<DocFile> {
  const id = parseDocId(rawId ?? defaultDocId());
  try {
    const file = await absolutePath(id);
    const markdown = await readFile(/* turbopackIgnore: true */ file, "utf8");
    return { id, markdown, error: null };
  } catch (err) {
    return {
      id,
      markdown: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function loadDocsPage(rawId?: string | null): Promise<{
  current: DocFile;
  menu: DocFile;
}> {
  const current = await loadDoc(rawId);
  const menuId = menuDocId(current.id);
  if (menuId === current.id) {
    return { current, menu: current };
  }
  return { current, menu: await loadDoc(menuId) };
}
