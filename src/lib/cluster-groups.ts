/** Distinct environment names from cluster ids such as `build33/k8s`. */
export function environmentNames(ids: string[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const id of ids) {
    const group = splitClusterId(id).group;
    if (!group) continue;
    const key = group.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(group);
  }
  return names.sort((a, b) => a.localeCompare(b));
}

export function splitClusterId(id: string): { group: string | null; name: string } {
  const trimmed = id.trim();
  const slash = trimmed.indexOf("/");
  if (slash <= 0 || slash === trimmed.length - 1) {
    return { group: null, name: trimmed };
  }
  return {
    group: trimmed.slice(0, slash),
    name: trimmed.slice(slash + 1),
  };
}

/** Env/org cascade leaf (`lab/default`, `default/default`) — not a deployable cluster. */
export function isCascadeDefaultCluster(id: string): boolean {
  return splitClusterId(id).name.toLowerCase() === "default";
}

/** `{env}/default` cascade layer for a real cluster, or null. */
export function envDefaultClusterId(id: string): string | null {
  const { group, name } = splitClusterId(id);
  if (!group || name.toLowerCase() === "default") {
    return null;
  }
  return `${group}/default`;
}

export function clusterMatchesQuery(id: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  const { group, name } = splitClusterId(id);
  return [id, group ?? "", name].some((part) => part.toLowerCase().includes(q));
}

export type ClusterGroup<T extends { id: string }> = {
  key: string;
  label: string;
  items: T[];
};

export function groupClusters<T extends { id: string }>(rows: T[]): ClusterGroup<T>[] {
  const grouped = new Map<string, T[]>();
  const ungrouped: T[] = [];
  for (const row of rows) {
    const { group } = splitClusterId(row.id);
    if (!group) {
      ungrouped.push(row);
      continue;
    }
    const list = grouped.get(group) ?? [];
    list.push(row);
    grouped.set(group, list);
  }

  const sections: ClusterGroup<T>[] = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => ({
      key,
      label: key,
      items,
    }));

  if (ungrouped.length > 0) {
    sections.push({
      key: "_other",
      label: sections.length > 0 ? "Other" : "Clusters",
      items: ungrouped,
    });
  }
  return sections;
}

/** Recent is a shortcut. Env groups still list every cluster, including recent ones. */
export function clusterSwitcherGroups<T extends { id: string }>(
  rows: T[],
  recentIds: string[],
): ClusterGroup<T>[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const recent: T[] = [];
  for (const id of recentIds) {
    const row = byId.get(id);
    if (row && !recent.some((item) => item.id === row.id)) {
      recent.push(row);
    }
  }
  const sections: ClusterGroup<T>[] = [];
  if (recent.length > 0) {
    sections.push({ key: "recent", label: "Recent", items: recent });
  }
  sections.push(...groupClusters(rows));
  return sections;
}
