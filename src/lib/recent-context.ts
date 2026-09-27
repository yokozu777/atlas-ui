const RECENT_LIMIT = 5;
export const RECENT_PROJECTS_KEY = "atlas-ui:recent-projects";
export const RECENT_CLUSTERS_PREFIX = "atlas-ui:recent-clusters:";
export const RECENT_CONTEXTS_KEY = "atlas-ui:recent-contexts";
export const ATLAS_CLUSTER_STORAGE_PREFIX = "atlas-ui:atlas-cluster:";

export type RecentContext = {
  projectId: string;
  clusterId: string | null;
};

function readIds(storage: Storage, key: string): string[] {
  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === "string" && item.trim() !== "");
  } catch {
    return [];
  }
}

function writeIds(storage: Storage, key: string, ids: string[]) {
  try {
    storage.setItem(key, JSON.stringify(ids));
  } catch {
    /* quota / private mode */
  }
}

export function pushRecentId(
  storage: Storage,
  key: string,
  id: string,
  limit = RECENT_LIMIT,
): string[] {
  const trimmed = id.trim();
  if (!trimmed) {
    return readIds(storage, key);
  }
  const next = [trimmed, ...readIds(storage, key).filter((item) => item !== trimmed)].slice(
    0,
    limit,
  );
  writeIds(storage, key, next);
  return next;
}

export function readRecentProjectIds(): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  return readIds(window.localStorage, RECENT_PROJECTS_KEY);
}

export function pushRecentProjectId(id: string): void {
  if (typeof window === "undefined") {
    return;
  }
  pushRecentId(window.localStorage, RECENT_PROJECTS_KEY, id);
}

export function recentClustersKey(projectId: string): string {
  return `${RECENT_CLUSTERS_PREFIX}${projectId}`;
}

export function readRecentClusterIds(projectId: string): string[] {
  if (typeof window === "undefined" || !projectId) {
    return [];
  }
  return readIds(window.localStorage, recentClustersKey(projectId));
}

export function pushRecentClusterId(projectId: string, clusterId: string): void {
  if (typeof window === "undefined" || !projectId) {
    return;
  }
  pushRecentId(window.localStorage, recentClustersKey(projectId), clusterId);
}

export function pickRecentItems<T>(
  items: T[],
  recentIds: string[],
  idOf: (item: T) => string,
): T[] {
  const byId = new Map(items.map((item) => [idOf(item), item]));
  const picked: T[] = [];
  for (const id of recentIds) {
    const row = byId.get(id);
    if (row) {
      picked.push(row);
    }
  }
  return picked;
}

function readStoredClusterId(projectId: string): string | null {
  if (typeof window === "undefined" || !projectId) {
    return null;
  }
  try {
    const stored = window.sessionStorage.getItem(
      `${ATLAS_CLUSTER_STORAGE_PREFIX}${projectId}`,
    );
    if (stored?.trim()) {
      return stored.trim();
    }
  } catch {
    /* private mode */
  }
  return readRecentClusterIds(projectId)[0] ?? null;
}

function readRecentContextList(): RecentContext[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(RECENT_CONTEXTS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    const rows: RecentContext[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const projectId = String(
        (item as { projectId?: unknown }).projectId ?? "",
      ).trim();
      if (!projectId) {
        continue;
      }
      const clusterRaw = (item as { clusterId?: unknown }).clusterId;
      const clusterId =
        typeof clusterRaw === "string" && clusterRaw.trim()
          ? clusterRaw.trim()
          : null;
      rows.push({ projectId, clusterId });
    }
    return rows;
  } catch {
    return [];
  }
}

export function readRecentContexts(): RecentContext[] {
  const stored = readRecentContextList();
  if (stored.length > 0) {
    return stored;
  }
  const fallback: RecentContext[] = [];
  for (const projectId of readRecentProjectIds()) {
    fallback.push({
      projectId,
      clusterId: readStoredClusterId(projectId),
    });
  }
  return fallback;
}

export function pushRecentContext(context: RecentContext): void {
  if (typeof window === "undefined") {
    return;
  }
  const projectId = context.projectId.trim();
  if (!projectId) {
    return;
  }
  const clusterId = context.clusterId?.trim() || null;
  const next = [
    { projectId, clusterId },
    ...readRecentContextList().filter(
      (row) =>
        !(
          row.projectId === projectId &&
          (row.clusterId || null) === clusterId
        ),
    ),
  ].slice(0, RECENT_LIMIT);
  try {
    window.localStorage.setItem(RECENT_CONTEXTS_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
  pushRecentProjectId(projectId);
  if (clusterId) {
    pushRecentClusterId(projectId, clusterId);
  }
}
