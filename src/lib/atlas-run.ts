import type { ClusterPhase } from "@/lib/api";
import { notifyExecution } from "@/lib/notification-inbox";
import {
  atlasReplayBody,
  argvValue,
  isAtlasKind,
  isAtlasPipelineRun,
  type PendingRun,
} from "@/lib/execution-replay";
import {
  mapExecution,
  type DashboardExecution,
  type ExecutionRunParams,
  type RawExecution,
} from "@/lib/project-dashboard";
import { stargateJson } from "@/lib/stargate";

export {
  atlasReplayBody,
  argvHasFlag,
  argvValue,
  canReplayExecution,
  executionRowAction,
  extraArgsFor,
  isAtlasKind,
  isAtlasPipelineRun,
  pendingFromExecution,
  replayExtraArgs,
  type ExecutionRowAction,
  type PendingRun,
} from "@/lib/execution-replay";

export const TAGS_SINGLE_PHASE = "--tags requires a single phase";

export type AtlasRunParams = ExecutionRunParams;

export type AtlasExecution = RawExecution & {
  kind?: string;
  runParams?: AtlasRunParams;
};

export async function queueAtlasReplay(
  projectId: string,
  row: AtlasExecution,
  fallbackClusterId?: string,
): Promise<string> {
  if (!isAtlasPipelineRun(row)) {
    throw new Error("This job cannot be rerun");
  }
  const body = atlasReplayBody(row, fallbackClusterId);
  const data = await stargateJson<{ executionId?: string }>(
    `/projects/${encodeURIComponent(projectId)}/atlas/run`,
    { method: "POST", body: JSON.stringify(body) },
  );
  const id = data.executionId;
  if (!id) {
    throw new Error("No execution id");
  }
  notifyExecution(
    "success",
    body.dry_run ? "Dry run queued on worker" : "Run queued on worker",
    projectId,
    id,
  );
  return id;
}

export async function queuePlaybookReplay(
  projectId: string,
  row: RawExecution,
): Promise<string> {
  const playbookId =
    row.playbookId || row.playbook_id || row.selectionSnapshot?.playbookId;
  if (!playbookId) {
    throw new Error("Playbook is missing");
  }
  const inventory = row.runParams?.inventory_files?.filter(Boolean) ?? [];
  const data = await stargateJson<{
    executionId?: string;
    execution_id?: string;
  }>(`/projects/${encodeURIComponent(projectId)}/playbooks/${playbookId}/run`, {
    method: "POST",
    body: JSON.stringify({
      ansible_config:
        row.runParams?.ansible_config || "ansible-config/ansible.cfg",
      inventory_files: inventory.length ? inventory : undefined,
    }),
  });
  const id = data.executionId || data.execution_id;
  if (!id) {
    throw new Error("No execution id");
  }
  notifyExecution("success", `Queued ${id.slice(0, 8)}`, projectId, id);
  return id;
}

export async function queueExecutionReplay(
  projectId: string,
  row: AtlasExecution,
  fallbackClusterId?: string,
): Promise<string> {
  if (isAtlasKind(row)) {
    return queueAtlasReplay(projectId, row, fallbackClusterId);
  }
  return queuePlaybookReplay(projectId, row);
}

export function parseRunPhasesOpt(
  phases?: string | string[],
): string[] {
  if (!phases) {
    return [];
  }
  if (Array.isArray(phases)) {
    return phases.map((item) => item.trim()).filter(Boolean);
  }
  return phases
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function isClusterAtlasRun(
  row: AtlasExecution,
  clusterId: string,
): boolean {
  if ((row.kind || "").toLowerCase() !== "atlas") {
    return false;
  }
  const cid = row.runParams?.cluster_id;
  return !cid || cid === clusterId;
}

export function isActiveExecutionStatus(status?: string | null): boolean {
  return (
    status === "QUEUED" || status === "RUNNING" || status === "CANCELING"
  );
}

export function formatRunPhases(row: AtlasExecution): string {
  const list = row.runParams?.phases;
  const phases =
    Array.isArray(list) && list.length > 0 ? list.join(", ") : "all";
  const tags = argvValue(row.runParams?.argv, "--tags");
  return tags ? `${phases} [${tags}]` : phases;
}

export function mapAtlasDashboardExecution(
  row: AtlasExecution,
  clusterId: string,
): DashboardExecution {
  return {
    ...mapExecution(row),
    playbookName: formatRunPhases(row),
    target: clusterId,
  };
}

export function tagsForPhases(
  selectedTags: Record<string, string[]>,
  phaseAliases: string[],
): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const alias of phaseAliases) {
    for (const tag of selectedTags[alias] ?? []) {
      if (seen.has(tag)) {
        continue;
      }
      seen.add(tag);
      tags.push(tag);
    }
  }
  return tags;
}

export function runSummaryLabel(opts: {
  phaseCount: number;
  tags: string[];
}): string {
  const n = opts.phaseCount;
  const phaseLabel = `${n} phase${n === 1 ? "" : "s"}`;
  if (opts.tags.length > 0) {
    const t = opts.tags.length;
    return `${phaseLabel} · ${t} task${t === 1 ? "" : "s"}`;
  }
  return `${phaseLabel} · all tasks`;
}

export function confirmText(
  clusterId: string,
  pending: PendingRun | null,
  phases: ClusterPhase[],
  rootSsh: boolean,
  dryRun: boolean,
  executor: string,
): string {
  if (!pending) {
    return "";
  }
  const names = pending.all
    ? phases.map((row) => row.alias).join(" → ") || "all"
    : pending.phases.join(" → ");
  const tags =
    pending.tags && pending.tags.length > 0
      ? pending.tags.join(",")
      : argvValue(pending.extraArgs, "--tags");
  const lines = [
    `cluster: ${clusterId}`,
    pending.all ? `phases: all (${names})` : `phases: ${names}`,
  ];
  if (tags) {
    lines.push(`tags: ${tags}`);
  }
  const shownExecutor =
    argvValue(pending.extraArgs, "--executor") ?? executor;
  if (shownExecutor === "local" || shownExecutor === "docker") {
    lines.push(`executor: ${shownExecutor}`);
  } else {
    lines.push("executor: cluster default");
  }
  if (rootSsh) {
    lines.push("root-ssh: yes");
  }
  if (dryRun) {
    lines.push("dry-run: yes");
  }
  return lines.join("\n");
}

export async function cancelOrStopExecution(
  projectId: string,
  id: string,
  status?: string,
): Promise<void> {
  if (status === "QUEUED") {
    await stargateJson(
      `/projects/${encodeURIComponent(projectId)}/executions/${id}/cancel`,
      { method: "POST", body: JSON.stringify({}) },
    );
    return;
  }
  if (status === "RUNNING") {
    await stargateJson(
      `/projects/${encodeURIComponent(projectId)}/executions/${id}/stop`,
      { method: "POST", body: JSON.stringify({}) },
    );
    return;
  }
  await stargateJson(
    `/executions/${id}?project_id=${encodeURIComponent(projectId)}`,
    { method: "PATCH", body: JSON.stringify({ status: "CANCELING" }) },
  );
}
