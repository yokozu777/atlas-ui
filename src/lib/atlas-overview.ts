import type { RunLogRow } from "@/lib/api";
import { lastRunStatus } from "@/lib/cluster-types";
import {
  formatDuration,
  formatSeconds,
  metaString,
  runCommandLabel,
} from "@/lib/format-time";
import type { DashboardExecution } from "@/lib/project-dashboard";
import type { StatusKind } from "@/components/status-badge";

function parseStampMs(stamp: string): number | null {
  const iso = stamp.replace("_", "T");
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : parsed;
}

function runStartedAtMs(run: RunLogRow): number | null {
  const started = metaString(run.meta, "started_at");
  if (started) {
    const parsed = Date.parse(started);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return parseStampMs(run.stamp);
}

function chartStatus(meta: Record<string, unknown> | null): StatusKind {
  const status = lastRunStatus(meta);
  if (status === "ok") {
    return "ok";
  }
  if (status === "fail") {
    return "fail";
  }
  return "unknown";
}

export function atlasRunsToDashboardExecutions(
  runs: RunLogRow[],
): DashboardExecution[] {
  return runs.map((run) => {
    const started = metaString(run.meta, "started_at");
    const finished = metaString(run.meta, "finished_at");
    return {
      id: run.stamp,
      playbookName: runCommandLabel(run.meta),
      playbookId: null,
      status: chartStatus(run.meta),
      target: "—",
      duration: formatDuration(started, finished) ?? "—",
      startedAt: runStartedAtMs(run),
      workerName: "—",
    };
  });
}

export function averageRunDurationLabel(runs: RunLogRow[]): string {
  const seconds: number[] = [];
  for (const run of runs) {
    const started = metaString(run.meta, "started_at");
    const finished = metaString(run.meta, "finished_at");
    if (!started || !finished) {
      continue;
    }
    const start = Date.parse(started);
    const end = Date.parse(finished);
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
      continue;
    }
    seconds.push((end - start) / 1000);
  }
  if (seconds.length === 0) {
    return "Avg —";
  }
  const mean = seconds.reduce((sum, value) => sum + value, 0) / seconds.length;
  return `Avg ${formatSeconds(mean)}`;
}
