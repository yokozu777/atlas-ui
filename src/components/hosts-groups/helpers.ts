import type { StatusKind } from "@/components/status-badge";
import type { GroupInfo, InvFile } from "@/components/hosts-groups/types";

export function inventoryKey(file: InvFile): string {
  return file.path || file.name || "";
}

export function parseYamlScalars(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const match = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line.trimEnd());
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[match[1]] = value;
  }
  return out;
}

export function invertHostGroups(
  groups: Record<string, GroupInfo>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [group, info] of Object.entries(groups)) {
    for (const host of info.hosts ?? []) {
      const list = out[host] ?? [];
      if (!list.includes(group)) list.push(group);
      out[host] = list;
    }
  }
  return out;
}

export function hostStatusKind(status?: string): StatusKind {
  const value = (status || "unknown").toLowerCase();
  if (["ok", "success", "reachable", "pong"].includes(value)) return "ok";
  if (["fail", "failed", "unreachable", "error"].includes(value)) return "fail";
  if (value === "running") return "running";
  return "unknown";
}

export function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export function projectApiQuery(
  projectId: string,
  clusterId?: string | null,
): string {
  const parts = [`project_id=${encodeURIComponent(projectId)}`];
  if (clusterId) {
    parts.push(`cluster_id=${encodeURIComponent(clusterId)}`);
  }
  return parts.join("&");
}

export function withClusterId<T extends Record<string, unknown>>(
  body: T,
  clusterId?: string | null,
): T {
  if (!clusterId) {
    return body;
  }
  return { ...body, cluster_id: clusterId };
}

export function inventoryFilesQuery(files: string[]): string {
  return files
    .filter(Boolean)
    .map((file) => `&inventory_files=${encodeURIComponent(file)}`)
    .join("");
}

export const SELECTED_INVENTORY_FILES_KEY = "atlas-ui:inventory-files";

export function readStoredInventoryFiles(projectId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${SELECTED_INVENTORY_FILES_KEY}:${projectId}`);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function writeStoredInventoryFiles(projectId: string, files: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    `${SELECTED_INVENTORY_FILES_KEY}:${projectId}`,
    JSON.stringify(files),
  );
}

export function reconcileSelectedInventoryFiles(
  listed: InvFile[],
  current: string[],
  projectId: string,
): string[] {
  const keys = new Set(listed.map(inventoryKey));
  if (current.length) {
    const kept = current.filter((item) => keys.has(item));
    if (kept.length) return kept;
  }
  const stored = readStoredInventoryFiles(projectId).filter((item) => keys.has(item));
  if (stored.length) return stored;
  const first = listed[0] ? inventoryKey(listed[0]) : "";
  return first ? [first] : [];
}

export function groupBadgeVariant(
  name: string,
): "outline" | "secondary" | "info" | "warning" {
  const variants = ["outline", "secondary", "info", "warning"] as const;
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash + name.charCodeAt(i) * (i + 1)) % variants.length;
  }
  return variants[hash];
}
