"use client";

import { BookOpen, Cpu, FileText, Play, Server } from "lucide-react";

import { DashboardMetric } from "@/components/project-dashboard/dashboard-metric";
import { projectHref } from "@/lib/project-href";
import type { DashboardSnapshot } from "@/lib/project-dashboard";

export function MetricsGrid({
  projectId,
  data,
}: {
  projectId: string;
  data: DashboardSnapshot;
}) {
  const recent = data.recent;
  const failedCount = recent.filter((row) => row.status === "fail").length;
  const successCount = recent.filter((row) => row.status === "ok").length;
  const hostsHintTone =
    data.hostsTotal > 0 && data.hostsOnline === 0 ? "destructive" : "muted";
  const playbookHintTone =
    recent.length === 0
      ? "muted"
      : failedCount === recent.length
        ? "destructive"
        : failedCount > 0
          ? "warning"
          : "muted";
  const workersHintTone =
    data.workersTotal > 0 && data.workersOnline === 0
      ? "destructive"
      : "muted";

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <DashboardMetric
        href={projectHref(projectId, "/hosts")}
        icon={<Server />}
        label="Hosts"
        value={String(data.hostsTotal)}
        hint={`${data.hostsOnline} online`}
        hintTone={hostsHintTone}
      />
      <DashboardMetric
        href={projectHref(projectId, "/roles")}
        icon={<BookOpen />}
        label="Roles"
        value={String(data.rolesCount)}
        hint="Ansible roles"
      />
      <DashboardMetric
        href={projectHref(projectId, "/playbooks")}
        icon={<Play />}
        label="Playbooks"
        value={String(data.playbooks.length)}
        hint="Saved playbooks"
      />
      <DashboardMetric
        href={projectHref(projectId, "/executions")}
        icon={<FileText />}
        label="Playbook Status"
        value={String(recent.length)}
        hint={
          recent.length === 0
            ? "No recent runs"
            : failedCount > 0
              ? `${failedCount} failed`
              : `${successCount} success`
        }
        hintTone={playbookHintTone}
      />
      <DashboardMetric
        href="/workers"
        icon={<Cpu />}
        label="Workers"
        value={`${data.workersOnline}/${data.workersTotal}`}
        hint={
          data.workersTotal === 0
            ? "No workers"
            : `${data.workersTotal - data.workersOnline} offline`
        }
        hintTone={workersHintTone}
      />
    </div>
  );
}
