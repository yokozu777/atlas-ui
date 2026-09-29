import type { BootstrapStatus, ReposLockEntry, ReposStatusPayload } from "./api.ts";
import {
  playbookEntryRef,
  splitAnsibleGroups,
  splitInvocationTags,
  type ClusterYamlDraft,
  type ClusterYamlEntry,
  type ClusterYamlPlaybook,
} from "./cluster-yaml-model.ts";
import {
  isSecretsVarsFile,
  overlayVarsPath,
  playbookNameFromVarsFile,
  secretsVarsPath,
  varsFileBaseName,
} from "./playbook-setup.ts";

export const PACK_MAP_TAG_LIMIT = 4;
export const PACK_MAP_ALL_HOSTS = "all hosts";
export const PACK_MAP_COL_X = [24, 320, 616, 912, 1208, 1504, 1800] as const;
export const PACK_MAP_NODE_W = 248;
export const PACK_MAP_GAP_Y = 28;
export const PACK_MAP_BAND_GAP = 40;
export const PACK_MAP_ROW_H = 148;

export type PackMapColumn =
  | "cluster"
  | "pack"
  | "overlay"
  | "cfg"
  | "entry"
  | "phase"
  | "group";

export type PackMapHrefKind =
  | "setup"
  | "health"
  | "secrets"
  | "hosts"
  | "ansible-config";

export type PackMapStatus =
  | "ready"
  | "missing"
  | "drift"
  | "error"
  | "unused"
  | "broken"
  | "unknown";

export type PackMapNodeKind =
  | "cluster"
  | "workspace"
  | "lock"
  | "executor"
  | "ssh"
  | "pack"
  | "overlay"
  | "cfg"
  | "entry"
  | "phase"
  | "group";

export type PackMapEdgeKind =
  | "owns"
  | "mounts"
  | "calls"
  | "next"
  | "auth"
  | "limit"
  | "cfg";

export type PackMapVarsFile = {
  name: string;
  path?: string;
  exists?: boolean;
};

export type PackMapAuth = {
  sshKey?: string | null;
  sshKeyOk?: boolean | null;
};

export type PackMapNode = {
  id: string;
  kind: PackMapNodeKind;
  column: PackMapColumn;
  x: number;
  y: number;
  h?: number;
  title: string;
  subtitle?: string;
  detail?: string;
  status: PackMapStatus;
  hrefKind?: PackMapHrefKind;
  packName?: string;
  tags?: string[];
  tagsAll?: string[];
  tagsMore?: number;
  auth?: string[];
  groups?: string[];
};

export type PackMapEdge = {
  id: string;
  source: string;
  target: string;
  kind: PackMapEdgeKind;
  label?: string;
};

export type PackMapCounts = {
  ready: number;
  missing: number;
  drift: number;
  unused: number;
  broken: number;
};

export type PackMapGraph = {
  nodes: PackMapNode[];
  edges: PackMapEdge[];
  counts: PackMapCounts;
};

export type BuildPackMapInput = {
  clusterId: string;
  draft: ClusterYamlDraft;
  repos?: ReposStatusPayload | null;
  bootstrap?: BootstrapStatus | null;
  varsFiles?: PackMapVarsFile[] | null;
  auth?: PackMapAuth | null;
  inventoryGroups?: string[] | null;
};

export type PackMapEntryRuntime = {
  tags: string[];
  tagsAll: string[];
  tagsMore: number;
  auth: string[];
  groups: string[];
  allHosts: boolean;
  whenGroups: string[];
  ansibleLabel?: string;
  gitSsh: boolean;
  rootSsh: boolean;
};

function missingKind(bootstrap: BootstrapStatus | null | undefined, kind: string) {
  return (bootstrap?.missing ?? []).some((item) => item.kind === kind);
}

function lockEntry(
  repos: ReposStatusPayload | null | undefined,
  name: string,
): ReposLockEntry | undefined {
  return repos?.lock?.repos?.[name];
}

export function packMountState(
  record: { state?: string; head?: string | null } | undefined,
  lock: ReposLockEntry | undefined,
  reposLoaded: boolean,
): PackMapStatus {
  if (!reposLoaded) {
    return "unknown";
  }
  if (!record) {
    return "missing";
  }
  const state = (record.state || "").toLowerCase();
  if (state === "missing") {
    return "missing";
  }
  if (state === "error") {
    return "error";
  }
  if (state === "ready") {
    const head = record.head?.trim() || "";
    const pinned = lock?.resolved_sha?.trim() || "";
    if (head && pinned && head !== pinned) {
      return "drift";
    }
    return "ready";
  }
  return "unknown";
}

export function packMapStatusLabel(status: PackMapStatus): string {
  if (status === "ready") return "Ready";
  if (status === "missing") return "Missing";
  if (status === "drift") return "Drift";
  if (status === "error") return "Error";
  if (status === "unused") return "Unused";
  if (status === "broken") return "Broken";
  return "Unknown";
}

export function packMapHref(
  projectId: string,
  hrefKind: PackMapHrefKind | undefined,
): string | null {
  const encoded = encodeURIComponent(projectId);
  if (hrefKind === "health") {
    return `/projects/${encoded}/cluster-yaml?tab=health`;
  }
  if (hrefKind === "setup") {
    return `/projects/${encoded}/cluster-yaml`;
  }
  if (hrefKind === "secrets") {
    return `/projects/${encoded}/secrets`;
  }
  if (hrefKind === "hosts") {
    return `/projects/${encoded}/hosts`;
  }
  if (hrefKind === "ansible-config") {
    return `/projects/${encoded}/ansible-config`;
  }
  return null;
}

function sshKeyBasename(path: string | null | undefined): string {
  const text = (path || "").trim();
  if (!text) return "SSH_KEY";
  const parts = text.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || "SSH_KEY";
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = value.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function tagPreview(entry: ClusterYamlEntry): {
  tags: string[];
  tagsAll: string[];
  tagsMore: number;
} {
  const seen = new Set<string>();
  const tagsAll: string[] = [];
  for (const invocation of entry.invocations) {
    for (const tag of splitInvocationTags(invocation.tags)) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      tagsAll.push(tag);
    }
  }
  if (tagsAll.length <= PACK_MAP_TAG_LIMIT) {
    return { tags: tagsAll, tagsAll, tagsMore: 0 };
  }
  return {
    tags: tagsAll.slice(0, PACK_MAP_TAG_LIMIT),
    tagsAll,
    tagsMore: tagsAll.length - PACK_MAP_TAG_LIMIT,
  };
}

export function packMapEntryRuntime(entry: ClusterYamlEntry): PackMapEntryRuntime {
  const preview = tagPreview(entry);
  const groups = new Set<string>();
  let allHosts = entry.invocations.length === 0;
  let rootSsh = false;
  for (const invocation of entry.invocations) {
    if (invocation.rootSsh) rootSsh = true;
    const parts = splitAnsibleGroups(invocation.limit);
    if (parts.length === 0) allHosts = true;
    else parts.forEach((group) => groups.add(group));
  }
  const whenGroups = unique([
    ...entry.inventoryGroupsAny,
    ...entry.inventoryGroupsAll,
  ]);
  const auth: string[] = [];
  if (rootSsh) auth.push("root_ssh");
  if (entry.gitSsh) auth.push("git_ssh");
  const strategy = entry.ansibleStrategy.trim();
  const forks = entry.ansibleForks.trim();
  const ansibleLabel = [strategy, forks ? `forks ${forks}` : ""]
    .filter(Boolean)
    .join(" · ");
  return {
    ...preview,
    auth,
    groups: [...groups],
    allHosts,
    whenGroups,
    ansibleLabel: ansibleLabel || undefined,
    gitSsh: entry.gitSsh,
    rootSsh,
  };
}

function overlaysForPack(
  pack: ClusterYamlPlaybook,
  varsFiles: PackMapVarsFile[] | null | undefined,
): PackMapVarsFile[] {
  const listed = (varsFiles ?? []).filter(
    (file) => playbookNameFromVarsFile(file.name) === pack.name,
  );
  const byName = new Map(
    listed.map((file) => [varsFileBaseName(file.name), file] as const),
  );
  const conventional: PackMapVarsFile[] = [
    { name: `${pack.name}.yml`, path: overlayVarsPath(pack.name) },
    { name: `${pack.name}.secrets.yml`, path: secretsVarsPath(pack.name) },
  ];
  const rows: PackMapVarsFile[] = [];
  for (const row of conventional) {
    const found = byName.get(row.name);
    if (found) {
      rows.push(found);
      byName.delete(row.name);
      continue;
    }
    rows.push({
      ...row,
      ...(varsFiles == null ? {} : { exists: false }),
    });
  }
  rows.push(...byName.values());
  return rows;
}

function overlayStatus(
  file: PackMapVarsFile,
  varsLoaded: boolean,
): PackMapStatus {
  if (!varsLoaded || file.exists == null) {
    return "unknown";
  }
  return file.exists ? "ready" : "missing";
}

function executorStatus(
  draft: ClusterYamlDraft,
  bootstrap: BootstrapStatus | null | undefined,
): { title: string; subtitle: string; status: PackMapStatus } {
  const mode = draft.execution.mode.trim() || "docker";
  const image = draft.execution.image.trim();
  const tag = draft.execution.tag.trim();
  const composed = image && tag ? `${image}:${tag}` : image;
  const title = bootstrap?.docker_image || composed || "Executor";
  if (mode.toLowerCase() !== "docker") {
    return { title: mode, subtitle: "Local executor", status: "ready" };
  }
  if (bootstrap == null) {
    return { title, subtitle: "Docker executor", status: "unknown" };
  }
  if (!title) {
    return {
      title: "Docker image",
      subtitle: "Not configured",
      status: "missing",
    };
  }
  return {
    title,
    subtitle: "Docker executor",
    status: bootstrap.docker_image_present ? "ready" : "missing",
  };
}

function sshStatus(auth: PackMapAuth | null | undefined): PackMapStatus {
  if (auth == null || auth.sshKeyOk == null) {
    return "unknown";
  }
  return auth.sshKeyOk ? "ready" : "missing";
}

function packAnsibleCfgPath(
  pack: ClusterYamlPlaybook,
  repoPath?: string,
): string {
  const base = (repoPath || pack.path || pack.name).replace(/\/$/, "");
  return `${base}/ansible.cfg`;
}

function runtimeGroupChips(runtime: PackMapEntryRuntime): string[] {
  return unique([
    ...(runtime.allHosts ? [PACK_MAP_ALL_HOSTS] : []),
    ...runtime.groups,
    ...runtime.whenGroups
      .filter((group) => !runtime.groups.includes(group))
      .map((group) => `when:${group}`),
  ]);
}

function groupStatus(
  name: string,
  inventoryGroups: string[] | null | undefined,
): PackMapStatus {
  if (name === PACK_MAP_ALL_HOSTS) {
    return inventoryGroups == null ? "unknown" : "ready";
  }
  if (inventoryGroups == null) {
    return "unknown";
  }
  return inventoryGroups.includes(name) ? "ready" : "missing";
}

function edge(
  kind: PackMapEdgeKind,
  source: string,
  target: string,
  label?: string,
): PackMapEdge {
  return {
    id: `${kind}:${source}->${target}${label ? `:${label}` : ""}`,
    source,
    target,
    kind,
    label,
  };
}

function chipLineWidth(label: string): number {
  return Math.min(PACK_MAP_NODE_W - 24, 16 + label.length * 7);
}

function chipsBlockHeight(items?: string[]): number {
  if (!items?.length) return 0;
  const inner = PACK_MAP_NODE_W - 24;
  let lineW = 0;
  let lines = 1;
  for (const item of items) {
    const width = chipLineWidth(item);
    if (lineW > 0 && lineW + 4 + width > inner) {
      lines += 1;
      lineW = width;
    } else {
      lineW += (lineW > 0 ? 4 : 0) + width;
    }
  }
  return 8 + lines * 20;
}

export function estimatePackMapNodeHeight(node: PackMapNode): number {
  let height = 20 + 20 + 24;
  if (node.subtitle) height += 16;
  if (node.detail && node.detail !== node.subtitle) height += 14;
  height += chipsBlockHeight(node.auth);
  height += chipsBlockHeight(node.groups);
  if (node.tags?.length) {
    const tags = [...node.tags];
    if (node.tagsMore) tags.push(`+${node.tagsMore}`);
    height += chipsBlockHeight(tags);
  }
  return Math.max(96, height + 24);
}

function stackHeight(nodes: PackMapNode[]): number {
  if (!nodes.length) return 0;
  return (
    nodes.reduce((sum, node) => sum + (node.h ?? 96), 0) +
    PACK_MAP_GAP_Y * (nodes.length - 1)
  );
}

function placeStacked(nodes: PackMapNode[], top: number): void {
  let y = top;
  for (const node of nodes) {
    node.y = y;
    y += (node.h ?? 96) + PACK_MAP_GAP_Y;
  }
}

function layoutStackedColumn(nodes: PackMapNode[]): void {
  const ordered = [...nodes].sort(
    (left, right) => left.y - right.y || left.id.localeCompare(right.id),
  );
  placeStacked(ordered, 0);
}

function layoutPackBands(nodes: PackMapNode[]): void {
  const packs = nodes
    .filter((node) => node.column === "pack")
    .sort((left, right) => left.y - right.y);
  let bandTop = 0;
  for (const pack of packs) {
    const name = pack.packName || pack.title;
    const overlays = nodes
      .filter((node) => node.column === "overlay" && node.packName === name)
      .sort((left, right) => left.y - right.y);
    const entries = nodes
      .filter((node) => node.column === "entry" && node.packName === name)
      .sort((left, right) => left.y - right.y);
    const cfgs = nodes.filter(
      (node) => node.column === "cfg" && node.packName === name,
    );
    const bandH = Math.max(
      pack.h ?? 96,
      stackHeight(overlays),
      stackHeight(entries),
      ...cfgs.map((node) => node.h ?? 96),
    );
    placeStacked(overlays, bandTop);
    placeStacked(entries, bandTop);
    pack.y = bandTop + (bandH - (pack.h ?? 96)) / 2;
    for (const cfg of cfgs) {
      cfg.y = bandTop + (bandH - (cfg.h ?? 96)) / 2;
    }
    bandTop += bandH + PACK_MAP_BAND_GAP;
  }
}

function layoutPhases(nodes: PackMapNode[]): void {
  const phases = nodes
    .filter((node) => node.column === "phase")
    .sort((left, right) => left.y - right.y);
  let minY = 0;
  for (const phase of phases) {
    const ref =
      phase.subtitle && phase.subtitle !== "no ref" ? phase.subtitle : "";
    const entry = ref
      ? nodes.find((node) => node.id === `entry:${ref}`)
      : undefined;
    const preferred = entry?.y ?? minY;
    phase.y = Math.max(preferred, minY);
    minY = phase.y + (phase.h ?? 96) + PACK_MAP_GAP_Y;
  }
}

export function packMapActiveEntryId(
  nodes: readonly Pick<PackMapNode, "id" | "kind">[],
  liveIds: readonly string[],
): string | null {
  const kindOf = new Map(nodes.map((node) => [node.id, node.kind]));
  return liveIds.find((id) => kindOf.get(id) === "entry") ?? null;
}

export function layoutPackMapNodes(
  nodes: PackMapNode[],
  heights?: Record<string, number>,
): void {
  for (const node of nodes) {
    node.h = heights?.[node.id] ?? estimatePackMapNodeHeight(node);
  }
  layoutStackedColumn(nodes.filter((node) => node.column === "cluster"));
  layoutPackBands(nodes);
  layoutPhases(nodes);
  layoutStackedColumn(nodes.filter((node) => node.column === "group"));
}

export function layoutPackMapCopy(
  nodes: PackMapNode[],
  heights?: Record<string, number>,
): PackMapNode[] {
  const copy = nodes.map((node) => ({ ...node }));
  layoutPackMapNodes(copy, heights);
  return copy;
}

export function packMapColumnOverlaps(nodes: PackMapNode[]): string[] {
  const pairs: string[] = [];
  const byColumn = new Map<PackMapColumn, PackMapNode[]>();
  for (const node of nodes) {
    const list = byColumn.get(node.column) ?? [];
    list.push(node);
    byColumn.set(node.column, list);
  }
  for (const [column, list] of byColumn) {
    const ordered = [...list].sort((left, right) => left.y - right.y);
    for (let index = 1; index < ordered.length; index += 1) {
      const prev = ordered[index - 1];
      const next = ordered[index];
      const prevBottom = prev.y + (prev.h ?? 96);
      if (prevBottom > next.y + 0.5) {
        pairs.push(`${column}:${prev.id}→${next.id}`);
      }
    }
  }
  return pairs;
}

function emptyCounts(): PackMapCounts {
  return { ready: 0, missing: 0, drift: 0, unused: 0, broken: 0 };
}

export function packMapCounts(nodes: PackMapNode[]): PackMapCounts {
  const counts = emptyCounts();
  for (const node of nodes) {
    if (node.kind === "cfg" || node.kind === "entry" || node.kind === "phase") {
      if (node.status === "unused") counts.unused += 1;
      else if (node.status === "broken") counts.broken += 1;
      continue;
    }
    if (node.status === "ready" && (node.kind === "pack" || node.kind === "overlay")) {
      counts.ready += 1;
    } else if (node.status === "missing") {
      counts.missing += 1;
    } else if (node.status === "drift" || node.status === "error") {
      counts.drift += 1;
    } else if (node.status === "unused") {
      counts.unused += 1;
    } else if (node.status === "broken") {
      counts.broken += 1;
    }
  }
  return counts;
}

function packNameFromRef(ref: string): string {
  const index = ref.indexOf("/");
  return index > 0 ? ref.slice(0, index) : "";
}

export function buildPackMapGraph(input: BuildPackMapInput): PackMapGraph {
  const {
    clusterId,
    draft,
    repos,
    bootstrap,
    varsFiles,
    auth,
    inventoryGroups,
  } = input;
  const reposLoaded = repos != null;
  const varsLoaded = varsFiles != null;
  const repoByName = new Map(
    (repos?.repos ?? [])
      .filter((row) => row.name)
      .map((row) => [row.name, row] as const),
  );
  const calledRefs = new Set(
    draft.phases.map((phase) => phase.ref.trim()).filter(Boolean),
  );

  const nodes: PackMapNode[] = [];
  const edges: PackMapEdge[] = [];

  const clusterTitle = draft.displayName.trim() || draft.id.trim() || clusterId;
  const clusterIdNode = "cluster:leaf";
  nodes.push({
    id: clusterIdNode,
    kind: "cluster",
    column: "cluster",
    x: PACK_MAP_COL_X[0],
    y: 0,
    title: clusterTitle,
    subtitle: "cluster.yaml",
    detail: clusterId,
    status: draft.playbooks.length > 0 || draft.phases.length > 0 ? "ready" : "missing",
    hrefKind: "setup",
  });

  const workspaceMissing = missingKind(bootstrap, "workspace");
  nodes.push({
    id: "cluster:workspace",
    kind: "workspace",
    column: "cluster",
    x: PACK_MAP_COL_X[0],
    y: PACK_MAP_ROW_H,
    title: "Workspace",
    subtitle: bootstrap?.workspace_root || "runtime leaf",
    status:
      bootstrap == null ? "unknown" : workspaceMissing ? "missing" : "ready",
    hrefKind: "setup",
  });
  edges.push(edge("owns", clusterIdNode, "cluster:workspace"));

  const lockMissing = missingKind(bootstrap, "lock");
  nodes.push({
    id: "cluster:lock",
    kind: "lock",
    column: "cluster",
    x: PACK_MAP_COL_X[0],
    y: PACK_MAP_ROW_H * 2,
    title: "playbooks.lock",
    subtitle: lockMissing ? "Not created yet" : "Pinned SHAs",
    status: bootstrap == null ? "unknown" : lockMissing ? "missing" : "ready",
    hrefKind: "health",
  });
  edges.push(edge("owns", clusterIdNode, "cluster:lock"));

  const executor = executorStatus(draft, bootstrap);
  nodes.push({
    id: "cluster:executor",
    kind: "executor",
    column: "cluster",
    x: PACK_MAP_COL_X[0],
    y: PACK_MAP_ROW_H * 3,
    title: executor.title,
    subtitle: executor.subtitle,
    status: executor.status,
    hrefKind: "setup",
  });
  edges.push(edge("owns", clusterIdNode, "cluster:executor"));

  const sshId = "cluster:ssh";
  nodes.push({
    id: sshId,
    kind: "ssh",
    column: "cluster",
    x: PACK_MAP_COL_X[0],
    y: PACK_MAP_ROW_H * 4,
    title: sshKeyBasename(auth?.sshKey),
    subtitle: "ANSIBLE_PRIVATE_KEY_FILE",
    detail: auth?.sshKey?.trim() || "clusterctl SSH_KEY",
    status: sshStatus(auth),
    hrefKind: "secrets",
    auth: ["ansible SSH"],
  });
  edges.push(edge("owns", clusterIdNode, sshId));

  let slotTop = 0;
  const entryIds = new Map<string, string>();
  const runtimeByRef = new Map<string, PackMapEntryRuntime>();
  const cfgIds = new Map<string, string>();
  const secretOverlayIds = new Map<string, string[]>();

  for (const pack of draft.playbooks) {
    const record = repoByName.get(pack.name);
    const status = packMountState(record, lockEntry(repos, pack.name), reposLoaded);
    const overlays = overlaysForPack(pack, varsFiles);
    const rows = Math.max(1, overlays.length, pack.entries.length);
    const slotH = rows * PACK_MAP_ROW_H;
    const packId = `pack:${pack.name}`;
    const layout = record?.layout || pack.layout;
    const source = record?.source || pack.source;
    nodes.push({
      id: packId,
      kind: "pack",
      column: "pack",
      x: PACK_MAP_COL_X[1],
      y: slotTop + ((rows - 1) * PACK_MAP_ROW_H) / 2,
      title: pack.name,
      subtitle: [source, layout].filter(Boolean).join(" · ") || "playbook pack",
      detail: record?.path || record?.layout_dir || pack.path || undefined,
      status,
      hrefKind: "health",
      packName: pack.name,
      auth: source === "git" ? ["git clone SSH"] : undefined,
    });
    edges.push(edge("mounts", clusterIdNode, packId));
    if (source === "git") {
      edges.push(edge("auth", sshId, packId, "clone"));
    }

    const secretsForPack: string[] = [];
    overlays.forEach((file, index) => {
      const overlayId = `overlay:${pack.name}:${file.name}`;
      const secrets = isSecretsVarsFile(file.name);
      nodes.push({
        id: overlayId,
        kind: "overlay",
        column: "overlay",
        x: PACK_MAP_COL_X[2],
        y: slotTop + index * PACK_MAP_ROW_H,
        title: file.name,
        subtitle: secrets
          ? "passwords · extra-vars"
          : file.path || overlayVarsPath(pack.name),
        detail: file.path || (secrets ? secretsVarsPath(pack.name) : overlayVarsPath(pack.name)),
        status: overlayStatus(file, varsLoaded),
        hrefKind: "setup",
        packName: pack.name,
        auth: secrets ? ["passwords"] : undefined,
      });
      edges.push(edge("owns", packId, overlayId));
      if (secrets) secretsForPack.push(overlayId);
    });
    secretOverlayIds.set(pack.name, secretsForPack);

    const cfgId = `cfg:${pack.name}`;
    cfgIds.set(pack.name, cfgId);
    const cfgPath = packAnsibleCfgPath(pack, record?.path);
    nodes.push({
      id: cfgId,
      kind: "cfg",
      column: "cfg",
      x: PACK_MAP_COL_X[3],
      y: slotTop + ((rows - 1) * PACK_MAP_ROW_H) / 2,
      title: "ansible.cfg",
      subtitle: "pack then clusterctl fallback",
      detail: cfgPath,
      status,
      hrefKind: "ansible-config",
      packName: pack.name,
    });
    edges.push(edge("cfg", packId, cfgId, "ANSIBLE_CONFIG"));

    pack.entries.forEach((entry, index) => {
      const ref = playbookEntryRef(pack.name, entry.name);
      const entryId = `entry:${ref}`;
      entryIds.set(ref, entryId);
      const runtime = packMapEntryRuntime(entry);
      runtimeByRef.set(ref, runtime);
      const unused = !calledRefs.has(ref);
      nodes.push({
        id: entryId,
        kind: "entry",
        column: "entry",
        x: PACK_MAP_COL_X[4],
        y: slotTop + index * PACK_MAP_ROW_H,
        title: entry.name,
        subtitle: [entry.file, runtime.ansibleLabel].filter(Boolean).join(" · ") || undefined,
        status: unused ? "unused" : "ready",
        hrefKind: "setup",
        packName: pack.name,
        tags: runtime.tags,
        tagsAll: runtime.tagsAll,
        tagsMore: runtime.tagsMore,
        auth: runtime.auth,
        groups: runtimeGroupChips(runtime),
      });
      edges.push(edge("owns", packId, entryId));
      edges.push(edge("cfg", cfgId, entryId));
    });

    slotTop += slotH + 24;
  }

  const phaseIds: string[] = [];
  const usedGroups = new Map<string, { limit: boolean; when: boolean }>();

  draft.phases.forEach((phase, index) => {
    const ref = phase.ref.trim();
    const entryId = ref ? entryIds.get(ref) : undefined;
    const runtime = ref ? runtimeByRef.get(ref) : undefined;
    const phaseId = `phase:${index}:${phase.alias || ref || "phase"}`;
    phaseIds.push(phaseId);
    const packName = packNameFromRef(ref);
    nodes.push({
      id: phaseId,
      kind: "phase",
      column: "phase",
      x: PACK_MAP_COL_X[5],
      y: index * PACK_MAP_ROW_H,
      title: phase.alias || ref || `phase ${index + 1}`,
      subtitle: ref || "no ref",
      status: entryId ? "ready" : "broken",
      hrefKind: "setup",
      packName: packName || undefined,
      tags: runtime?.ansibleLabel ? [runtime.ansibleLabel] : undefined,
      auth: runtime?.auth,
      groups: runtime ? runtimeGroupChips(runtime) : undefined,
    });
    if (entryId) {
      edges.push(edge("calls", entryId, phaseId));
      edges.push(edge("auth", sshId, phaseId, "SSH"));
      if (runtime?.gitSsh) {
        edges.push(edge("auth", sshId, entryId, "git_ssh"));
      }
      for (const overlayId of secretOverlayIds.get(packName) ?? []) {
        edges.push(edge("auth", overlayId, phaseId, "passwords"));
      }
      if (runtime?.allHosts) {
        const current = usedGroups.get(PACK_MAP_ALL_HOSTS) ?? {
          limit: false,
          when: false,
        };
        current.limit = true;
        usedGroups.set(PACK_MAP_ALL_HOSTS, current);
      }
      for (const group of runtime?.groups ?? []) {
        const current = usedGroups.get(group) ?? { limit: false, when: false };
        current.limit = true;
        usedGroups.set(group, current);
      }
      for (const group of runtime?.whenGroups ?? []) {
        const current = usedGroups.get(group) ?? { limit: false, when: false };
        current.when = true;
        usedGroups.set(group, current);
      }
    } else {
      edges.push(edge("calls", clusterIdNode, phaseId));
    }
    if (index > 0) {
      edges.push(edge("next", phaseIds[index - 1], phaseId));
    }
  });

  const groupNames = [...usedGroups.keys()].sort((left, right) => {
    if (left === PACK_MAP_ALL_HOSTS) return -1;
    if (right === PACK_MAP_ALL_HOSTS) return 1;
    return left.localeCompare(right);
  });
  groupNames.forEach((name, index) => {
    const groupId = `group:${name}`;
    const meta = usedGroups.get(name);
    nodes.push({
      id: groupId,
      kind: "group",
      column: "group",
      x: PACK_MAP_COL_X[6],
      y: index * PACK_MAP_ROW_H,
      title: name,
      subtitle: name === PACK_MAP_ALL_HOSTS ? "no --limit" : "inventory group",
      status: groupStatus(name, inventoryGroups),
      hrefKind: "hosts",
      groups: [
        ...(meta?.limit ? ["limit"] : []),
        ...(meta?.when ? ["when"] : []),
      ],
    });
  });

  draft.phases.forEach((phase, index) => {
    const ref = phase.ref.trim();
    const runtime = ref ? runtimeByRef.get(ref) : undefined;
    const entryId = ref ? entryIds.get(ref) : undefined;
    if (!runtime || !entryId) return;
    const phaseId = phaseIds[index];
    if (runtime.allHosts) {
      edges.push(
        edge("limit", phaseId, `group:${PACK_MAP_ALL_HOSTS}`, "limit"),
      );
    }
    for (const group of runtime.groups) {
      edges.push(edge("limit", phaseId, `group:${group}`, "limit"));
    }
    for (const group of runtime.whenGroups) {
      if (runtime.groups.includes(group) || (runtime.allHosts && group === PACK_MAP_ALL_HOSTS)) {
        continue;
      }
      edges.push(edge("limit", phaseId, `group:${group}`, "when"));
    }
  });

  layoutPackMapNodes(nodes);
  return { nodes, edges, counts: packMapCounts(nodes) };
}
