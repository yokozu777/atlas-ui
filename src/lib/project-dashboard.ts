import type { StatusKind } from "@/components/status-badge";
import { formatSeconds } from "@/lib/format-time";
import type { StargateProject } from "@/lib/project-types";

export const WORKER_ONLINE_TTL_SEC = 60;
export const RECENT_LIMIT = 5;
export const EXECUTIONS_TABLE_LIMIT = 20;

export type ChartPeriod = "24h" | "7d";

export type ActivityBucket = {
  t: number;
  label: string;
  tooltip: string;
  count: number;
};

export type StatusBucket = {
  t: number;
  label: string;
  tooltip: string;
  success: number;
  failed: number;
  running: number;
};

export type RoleNode = {
  type?: string;
  children?: RoleNode[];
};

export type HostStatusRow = { status?: string; last_checked_at?: string };

export type RawPlaybook = {
  id?: string;
  name?: string;
  description?: string;
};

export type RawExecution = {
  id?: string;
  executionId?: string;
  status?: string;
  playbookId?: string;
  playbook_id?: string;
  playbookName?: string;
  queuedAt?: string | number | null;
  startedAt?: string | number | null;
  createdAt?: string | number | null;
  created_at?: string | number | null;
  finishedAt?: string | number | null;
  duration?: number | null;
  workerName?: string;
  selectionSnapshot?: { playbookName?: string; playbookId?: string };
  runParams?: { inventory_files?: string[] };
};

export type RawWorker = {
  id?: string;
  enabled?: boolean;
  lastSeenAt?: number | null;
};

export type RawRepoSource = {
  mode?: string;
  git?: { ref?: string; branch?: string };
  branch?: string;
  syncState?: {
    lastPullStatus?: string;
    lastPullError?: string;
    lastPullRevision?: string;
    lastPullAt?: string | number | null;
  };
  syncStatus?: { pull?: { status?: string; error?: string } };
};

export type DashboardProject = {
  id: string;
  name: string;
  description: string;
};

export type DashboardPlaybook = {
  id: string;
  name: string;
  description: string | null;
  lastStatus: StatusKind | null;
  lastAt: number | null;
};

export type DashboardExecution = {
  id: string;
  playbookName: string;
  playbookId: string | null;
  status: StatusKind;
  target: string;
  duration: string;
  startedAt: number | null;
  workerName: string;
};

export type RepoPullKind = "ok" | "error" | "idle";

export type DashboardRepo = {
  mode: "GIT" | "LOCAL";
  ref: string;
  revision: string;
  pull: RepoPullKind;
  label: string;
  lastSyncAt: number | null;
};

export type HealthHint = "ok" | "warn" | "fail";

export type HealthRow = {
  key: string;
  label: string;
  value: string;
  points: number;
  hint: HealthHint;
};

export type DashboardHealth = {
  score: number;
  rows: HealthRow[];
};

export type DashboardSnapshot = {
  project: DashboardProject;
  hostsTotal: number;
  hostsOnline: number;
  rolesCount: number;
  playbooks: DashboardPlaybook[];
  executions: DashboardExecution[];
  recent: DashboardExecution[];
  workersOnline: number;
  workersTotal: number;
  repo: DashboardRepo;
  health: DashboardHealth;
};

export function toMs(value: string | number | null | undefined): number | null {
  if (value == null || value === "") {
    return null;
  }
  if (typeof value === "number") {
    return value < 1e12 ? value * 1000 : value;
  }
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    return n < 1e12 ? n * 1000 : n;
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

export function formatRelativeTime(
  value: string | number | null | undefined,
  now = Date.now(),
): string {
  const ms = typeof value === "number" && value > 1e12 ? value : toMs(value);
  if (ms == null) {
    return "—";
  }
  const seconds = Math.max(0, Math.round((now - ms) / 1000));
  if (seconds < 60) {
    return "just now";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric" });
}

export function shortSha(revision: string | null | undefined): string {
  const value = revision?.trim();
  if (!value) {
    return "—";
  }
  return value.length > 8 ? value.slice(0, 8) : value;
}

export function collectRoleCount(nodes: RoleNode[] | undefined): number {
  let count = 0;
  for (const node of nodes ?? []) {
    if (node.type === "role") {
      count += 1;
    }
    count += collectRoleCount(node.children);
  }
  return count;
}

export function isWorkerOnline(
  row: RawWorker,
  nowSec = Date.now() / 1000,
): boolean {
  if (row.enabled === false) {
    return false;
  }
  const seen = row.lastSeenAt;
  if (seen == null) {
    return false;
  }
  return nowSec - seen < WORKER_ONLINE_TTL_SEC;
}

export function executionStatusKind(status?: string): StatusKind {
  const s = (status || "").toLowerCase();
  if (s === "success" || s === "completed" || s === "complete") {
    return "ok";
  }
  if (s === "failed" || s === "fail" || s === "error") {
    return "fail";
  }
  if (s === "running" || s === "run") {
    return "running";
  }
  if (s === "canceling" || s === "cancelling") {
    return "canceling";
  }
  if (s === "canceled" || s === "cancelled") {
    return "canceled";
  }
  if (s === "queued" || s === "pending") {
    return "pending";
  }
  if (s === "skipped" || s === "skip") {
    return "skipped";
  }
  return "unknown";
}

export function executionStatusLabel(kind: StatusKind): string {
  switch (kind) {
    case "ok":
      return "SUCCESS";
    case "fail":
      return "FAILED";
    case "running":
      return "RUNNING";
    case "canceling":
      return "CANCELING";
    case "canceled":
      return "CANCELED";
    case "pending":
      return "PENDING";
    case "skipped":
      return "SKIPPED";
    default:
      return "UNKNOWN";
  }
}

export function playbookNameOf(exec: RawExecution): string {
  return exec.playbookName || exec.selectionSnapshot?.playbookName || "playbook";
}

export function executionIdOf(exec: RawExecution): string {
  return exec.id || exec.executionId || "";
}

export function playbookIdOf(
  exec: RawExecution,
  playbooks: RawPlaybook[],
): string | null {
  const direct =
    exec.playbookId || exec.playbook_id || exec.selectionSnapshot?.playbookId;
  if (direct) {
    return direct;
  }
  const name = playbookNameOf(exec);
  const match = playbooks.find((pb) => pb.name === name);
  return match?.id ?? null;
}

function displayOrDash(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

function durationLabel(exec: RawExecution): string {
  if (typeof exec.duration === "number" && Number.isFinite(exec.duration) && exec.duration > 0) {
    return formatSeconds(exec.duration);
  }
  const start = toMs(exec.startedAt) ?? toMs(exec.createdAt);
  const end = toMs(exec.finishedAt);
  if (start != null && end != null && end >= start) {
    return formatSeconds((end - start) / 1000);
  }
  return "—";
}

function targetLabel(exec: RawExecution): string {
  const files = exec.runParams?.inventory_files?.filter(Boolean) ?? [];
  if (files.length === 0) {
    return "—";
  }
  return files.join(", ");
}

export function mapRepo(raw: RawRepoSource | null | undefined): DashboardRepo {
  const mode = (raw?.mode || "local").toLowerCase() === "git" ? "GIT" : "LOCAL";
  const ref = displayOrDash(raw?.git?.ref || raw?.git?.branch || raw?.branch);
  const revision = shortSha(raw?.syncState?.lastPullRevision);
  const pullStatus = (
    raw?.syncState?.lastPullStatus ||
    raw?.syncStatus?.pull?.status ||
    ""
  ).toLowerCase();
  let pull: RepoPullKind = "idle";
  let label = "Idle";
  if (pullStatus === "ok" || pullStatus === "success") {
    pull = "ok";
    label = "Synced";
  } else if (
    pullStatus === "error" ||
    pullStatus === "failed" ||
    pullStatus === "fail"
  ) {
    pull = "error";
    label = "Error";
  }
  return {
    mode,
    ref,
    revision,
    pull,
    label,
    lastSyncAt: toMs(raw?.syncState?.lastPullAt),
  };
}

export function mapExecution(
  raw: RawExecution,
  playbooks: RawPlaybook[] = [],
): DashboardExecution {
  return {
    id: executionIdOf(raw),
    playbookName: playbookNameOf(raw),
    playbookId: playbookIdOf(raw, playbooks),
    status: executionStatusKind(raw.status),
    target: targetLabel(raw),
    duration: durationLabel(raw),
    startedAt:
      toMs(raw.startedAt) ??
      toMs(raw.queuedAt) ??
      toMs(raw.createdAt) ??
      toMs(raw.created_at),
    workerName: displayOrDash(raw.workerName),
  };
}

function execStamp(exec: RawExecution): number {
  return (
    toMs(exec.startedAt) ??
    toMs(exec.queuedAt) ??
    toMs(exec.createdAt) ??
    toMs(exec.created_at) ??
    0
  );
}

export function mapPlaybooks(
  playbooks: RawPlaybook[],
  executions: RawExecution[],
): DashboardPlaybook[] {
  const lastById = new Map<string, RawExecution>();
  const lastByName = new Map<string, RawExecution>();
  const sorted = [...executions].sort((a, b) => execStamp(b) - execStamp(a));
  for (const exec of sorted) {
    const id = playbookIdOf(exec, playbooks);
    const name = playbookNameOf(exec);
    if (id && !lastById.has(id)) {
      lastById.set(id, exec);
    }
    if (name && !lastByName.has(name)) {
      lastByName.set(name, exec);
    }
  }
  return playbooks.map((pb) => {
    const id = pb.id || pb.name || "playbook";
    const name = pb.name || pb.id || "playbook";
    const last = lastById.get(id) ?? lastByName.get(name) ?? null;
    const description = pb.description?.trim() || null;
    return {
      id,
      name,
      description,
      lastStatus: last ? executionStatusKind(last.status) : null,
      lastAt: last ? execStamp(last) || null : null,
    };
  });
}

export function countOnlineHosts(
  hosts: unknown[],
  statusMap: Record<string, HostStatusRow>,
): { total: number; online: number } {
  let online = 0;
  for (const host of hosts) {
    const name = typeof host === "string" ? host : String(host);
    const status = (statusMap[name]?.status || "").toLowerCase();
    if (status === "online" || status === "ok") {
      online += 1;
    }
  }
  return { total: hosts.length, online };
}

export function deriveHealth(input: {
  hostsTotal: number;
  hostsOnline: number;
  workersTotal: number;
  workersOnline: number;
  playbookCount: number;
  recent: Pick<DashboardExecution, "status">[];
  repo: Pick<DashboardRepo, "pull">;
}): DashboardHealth {
  const hostsFail = input.hostsTotal > 0 && input.hostsOnline === 0;
  const hosts: HealthRow = hostsFail
    ? {
        key: "hosts",
        label: "Hosts",
        value: "0 online",
        points: 0,
        hint: "fail",
      }
    : {
        key: "hosts",
        label: "Hosts",
        value:
          input.hostsTotal === 0
            ? "no hosts"
            : `${input.hostsOnline} online`,
        points: 20,
        hint: "ok",
      };

  let workers: HealthRow;
  if (input.workersTotal === 0 || input.workersOnline === 0) {
    workers = {
      key: "workers",
      label: "Workers",
      value: input.workersTotal === 0 ? "none" : "0 online",
      points: 0,
      hint: "fail",
    };
  } else if (input.workersOnline === input.workersTotal) {
    workers = {
      key: "workers",
      label: "Workers",
      value: "all online",
      points: 20,
      hint: "ok",
    };
  } else {
    workers = {
      key: "workers",
      label: "Workers",
      value: `${input.workersOnline}/${input.workersTotal} online`,
      points: 10,
      hint: "warn",
    };
  }

  const playbooks: HealthRow =
    input.playbookCount > 0
      ? {
          key: "playbooks",
          label: "Playbooks",
          value: String(input.playbookCount),
          points: 20,
          hint: "ok",
        }
      : {
          key: "playbooks",
          label: "Playbooks",
          value: "none",
          points: 0,
          hint: "fail",
        };

  const failed = input.recent.filter((row) => row.status === "fail").length;
  let executions: HealthRow;
  if (input.recent.length === 0) {
    executions = {
      key: "executions",
      label: "Recent executions",
      value: "none",
      points: 15,
      hint: "warn",
    };
  } else if (failed === input.recent.length) {
    executions = {
      key: "executions",
      label: "Recent executions",
      value: "all failed",
      points: 0,
      hint: "fail",
    };
  } else if (failed > 0) {
    executions = {
      key: "executions",
      label: "Recent executions",
      value: `${failed} failed`,
      points: 10,
      hint: "warn",
    };
  } else {
    executions = {
      key: "executions",
      label: "Recent executions",
      value: "no failures",
      points: 20,
      hint: "ok",
    };
  }

  let repo: HealthRow;
  if (input.repo.pull === "ok") {
    repo = {
      key: "repo",
      label: "Repository",
      value: "synced",
      points: 20,
      hint: "ok",
    };
  } else if (input.repo.pull === "error") {
    repo = {
      key: "repo",
      label: "Repository",
      value: "error",
      points: 0,
      hint: "fail",
    };
  } else {
    repo = {
      key: "repo",
      label: "Repository",
      value: "idle",
      points: 10,
      hint: "warn",
    };
  }

  const rows = [hosts, workers, playbooks, executions, repo];
  return {
    score: rows.reduce((sum, row) => sum + row.points, 0),
    rows,
  };
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function startOfHour(ms: number): number {
  const d = new Date(ms);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function hourLabel(ms: number): string {
  return String(new Date(ms).getHours()).padStart(2, "0");
}

function hourTooltip(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dayLabel(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { weekday: "short" });
}

function dayTooltip(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

export function chartWindow(
  period: ChartPeriod,
  now = Date.now(),
): { start: number; step: number; count: number } {
  if (period === "24h") {
    const end = startOfHour(now);
    return { start: end - 23 * HOUR_MS, step: HOUR_MS, count: 24 };
  }
  const end = startOfDay(now);
  return { start: end - 6 * DAY_MS, step: DAY_MS, count: 7 };
}

function bucketIndex(
  stamp: number,
  start: number,
  step: number,
  count: number,
): number | null {
  if (stamp < start || stamp >= start + step * count) {
    return null;
  }
  const index = Math.floor((stamp - start) / step);
  if (index < 0 || index >= count) {
    return null;
  }
  return index;
}

function axisLabel(period: ChartPeriod, t: number, index: number): string {
  if (period === "24h") {
    return index % 4 === 0 ? hourLabel(t) : "";
  }
  return dayLabel(t);
}

function axisTooltip(period: ChartPeriod, t: number): string {
  return period === "24h" ? hourTooltip(t) : dayTooltip(t);
}

export function bucketActivity(
  executions: Pick<DashboardExecution, "startedAt">[],
  period: ChartPeriod,
  now = Date.now(),
): ActivityBucket[] {
  const { start, step, count } = chartWindow(period, now);
  const buckets: ActivityBucket[] = [];
  for (let i = 0; i < count; i++) {
    const t = start + i * step;
    buckets.push({
      t,
      label: axisLabel(period, t, i),
      tooltip: axisTooltip(period, t),
      count: 0,
    });
  }
  for (const exec of executions) {
    if (exec.startedAt == null) {
      continue;
    }
    const index = bucketIndex(exec.startedAt, start, step, count);
    if (index != null) {
      buckets[index].count += 1;
    }
  }
  return buckets;
}

export function bucketStatus(
  executions: Pick<DashboardExecution, "startedAt" | "status">[],
  period: ChartPeriod,
  now = Date.now(),
): StatusBucket[] {
  const { start, step, count } = chartWindow(period, now);
  const buckets: StatusBucket[] = [];
  for (let i = 0; i < count; i++) {
    const t = start + i * step;
    buckets.push({
      t,
      label: axisLabel(period, t, i),
      tooltip: axisTooltip(period, t),
      success: 0,
      failed: 0,
      running: 0,
    });
  }
  for (const exec of executions) {
    if (exec.startedAt == null) {
      continue;
    }
    const index = bucketIndex(exec.startedAt, start, step, count);
    if (index == null) {
      continue;
    }
    if (exec.status === "ok") {
      buckets[index].success += 1;
    } else if (exec.status === "fail") {
      buckets[index].failed += 1;
    } else if (exec.status === "running") {
      buckets[index].running += 1;
    }
  }
  return buckets;
}

export function activityTotal(buckets: ActivityBucket[]): number {
  return buckets.reduce((sum, row) => sum + row.count, 0);
}

export function statusTotal(buckets: StatusBucket[]): number {
  return buckets.reduce(
    (sum, row) => sum + row.success + row.failed + row.running,
    0,
  );
}

export function buildDashboardSnapshot(input: {
  project: StargateProject;
  hosts: unknown[];
  hostStatus: Record<string, HostStatusRow>;
  rolesTree: RoleNode[];
  playbooks: RawPlaybook[];
  executions: RawExecution[];
  workers: RawWorker[];
  repo: RawRepoSource | null;
}): DashboardSnapshot {
  const { total: hostsTotal, online: hostsOnline } = countOnlineHosts(
    input.hosts,
    input.hostStatus,
  );
  const enabledWorkers = input.workers.filter((row) => row.enabled !== false);
  const workersTotal = enabledWorkers.length;
  const workersOnline = enabledWorkers.filter((row) => isWorkerOnline(row)).length;
  const executions = input.executions
    .map((row) => mapExecution(row, input.playbooks))
    .filter((row) => row.id);
  const recent = executions.slice(0, RECENT_LIMIT);
  const playbooks = mapPlaybooks(input.playbooks, input.executions);
  const repo = mapRepo(input.repo);
  return {
    project: {
      id: input.project.id,
      name: input.project.name,
      description: input.project.description?.trim() || "",
    },
    hostsTotal,
    hostsOnline,
    rolesCount: collectRoleCount(input.rolesTree),
    playbooks,
    executions,
    recent,
    workersOnline,
    workersTotal,
    repo,
    health: deriveHealth({
      hostsTotal,
      hostsOnline,
      workersTotal,
      workersOnline,
      playbookCount: playbooks.length,
      recent,
      repo,
    }),
  };
}
