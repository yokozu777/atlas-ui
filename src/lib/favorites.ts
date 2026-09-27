export const FAVORITES_EVENT = "atlas-ui:favorites";
export const FAVORITE_PROJECTS_KEY = "atlas-ui:favorite-projects";
export const FAVORITE_CLUSTERS_PREFIX = "atlas-ui:favorite-clusters:";

export function favoriteClustersKey(projectId: string): string {
  return `${FAVORITE_CLUSTERS_PREFIX}${projectId}`;
}

export function parseFavoriteIds(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const item of parsed) {
      if (typeof item !== "string") {
        continue;
      }
      const id = item.trim();
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      ids.push(id);
    }
    return ids;
  } catch {
    return [];
  }
}

export function toggleFavoriteId(ids: string[], id: string): string[] {
  const trimmed = id.trim();
  if (!trimmed) {
    return ids;
  }
  if (ids.includes(trimmed)) {
    return ids.filter((item) => item !== trimmed);
  }
  return [trimmed, ...ids];
}

export function sortFavoritesFirst<T>(
  items: T[],
  favoriteIds: Iterable<string>,
  idOf: (item: T) => string,
): T[] {
  const starred = new Set(favoriteIds);
  const fav: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    if (starred.has(idOf(item))) {
      fav.push(item);
    } else {
      rest.push(item);
    }
  }
  return [...fav, ...rest];
}

function readIds(key: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    return parseFavoriteIds(window.localStorage.getItem(key));
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[]) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* quota / private mode */
  }
  window.dispatchEvent(new Event(FAVORITES_EVENT));
}

export function readFavoriteProjectIds(): string[] {
  return readIds(FAVORITE_PROJECTS_KEY);
}

export function writeFavoriteProjectIds(ids: string[]): void {
  writeIds(FAVORITE_PROJECTS_KEY, ids);
}

export function toggleFavoriteProject(id: string): string[] {
  const next = toggleFavoriteId(readFavoriteProjectIds(), id);
  writeFavoriteProjectIds(next);
  return next;
}

export function readFavoriteClusterIds(projectId: string): string[] {
  if (!projectId) {
    return [];
  }
  return readIds(favoriteClustersKey(projectId));
}

export function writeFavoriteClusterIds(projectId: string, ids: string[]): void {
  if (!projectId) {
    return;
  }
  writeIds(favoriteClustersKey(projectId), ids);
}

export function toggleFavoriteCluster(
  projectId: string,
  clusterId: string,
): string[] {
  const next = toggleFavoriteId(readFavoriteClusterIds(projectId), clusterId);
  writeFavoriteClusterIds(projectId, next);
  return next;
}
