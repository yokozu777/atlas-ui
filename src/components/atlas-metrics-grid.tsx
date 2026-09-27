"use client";

import { Cpu, FileText, FolderGit2, ListOrdered, Server } from "lucide-react";

import { DashboardMetric } from "@/components/project-dashboard/dashboard-metric";
import { RECENT_LIMIT, type DashboardExecution } from "@/lib/project-dashboard";
import { projectHref } from "@/lib/project-href";

export function AtlasMetricsGrid({
  projectId,
  hostsTotal,
  hostsOnline,
  sourceCount,
  phaseCount,
  executions,
  workersOnline,
  workersTotal,
}: {
  projectId: string;
  hostsTotal: number;
  hostsOnline: number;
  sourceCount: number;
  phaseCount: number;
  executions: DashboardExecution[];
  workersOnline: number;
  workersTotal: number;
}) {
  const recent = executions.slice(0, RECENT_LIMIT);
  const failedCount = recent.filter((row) => row.status === "fail").length;
  const successCount = recent.filter((row) => row.status === "ok").length;
  const hostsHintTone =
    hostsTotal > 0 && hostsOnline === 0 ? "destructive" : "muted";
  const runsHintTone =
    recent.length === 0
      ? "muted"
      : failedCount === recent.length
        ? "destructive"
        : failedCount > 0
          ? "warning"
          : "muted";
  const workersHintTone =
    workersTotal > 0 && workersOnline === 0 ? "destructive" : "muted";

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <DashboardMetric
        href={projectHref(projectId, "/hosts")}
        icon={<Server />}
        label="Hosts"
        value={String(hostsTotal)}
        hint={`${hostsOnline} online`}
        hintTone={hostsHintTone}
      />
      <DashboardMetric
        href={projectHref(projectId, "/cluster-yaml")}
        icon={<FolderGit2 />}
        label="Sources"
        value={String(sourceCount)}
        hint="Playbook repositories"
      />
      <DashboardMetric
        href="#cluster-pipeline"
        icon={<ListOrdered />}
        label="Pipeline"
        value={String(phaseCount)}
        hint={phaseCount === 1 ? "1 phase" : `${phaseCount} phases`}
      />
      <DashboardMetric
        href={projectHref(projectId, "/executions")}
        icon={<FileText />}
        label="Runs"
        value={String(recent.length)}
        hint={
          recent.length === 0
            ? "No recent runs"
            : failedCount > 0
              ? `${failedCount} failed`
              : `${successCount} success`
        }
        hintTone={runsHintTone}
      />
      <DashboardMetric
        href="/workers"
        icon={<Cpu />}
        label="Workers"
        value={`${workersOnline}/${workersTotal}`}
        hint={
          workersTotal === 0
            ? "No workers"
            : `${workersTotal - workersOnline} offline`
        }
        hintTone={workersHintTone}
      />
    </div>
  );
}
