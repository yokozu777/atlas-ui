"use client";

import { use, useEffect, useState } from "react";

import { useAtlasClusterSelection } from "@/components/atlas-cluster-selection";
import { EmptyState } from "@/components/empty-state";
import { projectApiQuery } from "@/components/hosts-groups/helpers";
import { DashboardSkeleton } from "@/components/project-dashboard/dashboard-skeleton";
import { ExecutionCharts } from "@/components/project-dashboard/execution-charts";
import { MetricsGrid } from "@/components/project-dashboard/metrics-grid";
import { PlaybooksList } from "@/components/project-dashboard/playbooks-list";
import { ProjectHeader } from "@/components/project-dashboard/project-header";
import { ProjectHealth } from "@/components/project-dashboard/project-health";
import { QuickActions } from "@/components/project-dashboard/quick-actions";
import { RecentExecutions } from "@/components/project-dashboard/recent-executions";
import { RepositoryStatus } from "@/components/project-dashboard/repository-status";
import {
  buildDashboardSnapshot,
  type DashboardSnapshot,
  type HostStatusRow,
  type RawExecution,
  type RawPlaybook,
  type RawRepoSource,
  type RawWorker,
  type RoleNode,
} from "@/lib/project-dashboard";
import { fetchProject, stargateJson } from "@/lib/stargate";

export default function AnsibleDashboardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const projectId = decodeURIComponent(use(params).projectId);
  const { clusterId } = useAtlasClusterSelection();
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [atlas, setAtlas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executionsError, setExecutionsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    setExecutionsError(null);
    void (async () => {
      try {
        const p = await fetchProject(projectId);
        if (cancelled) {
          return;
        }
        setAtlas(p.kind === "atlas");
        const q = projectApiQuery(projectId, clusterId);
        const playbookQuery = clusterId
          ? `?cluster_id=${encodeURIComponent(clusterId)}`
          : "";
        const [
          playbookData,
          hostsData,
          hostStatusData,
          rolesData,
          executionsData,
          workersData,
          sourcesData,
        ] = await Promise.all([
          stargateJson<{ playbooks?: RawPlaybook[] }>(
            `/projects/${projectId}/playbooks${playbookQuery}`,
          ).catch(() => ({ playbooks: [] as RawPlaybook[] })),
          stargateJson<{ hosts?: unknown[] }>(`/inventory/hosts?${q}`).catch(
            () => ({ hosts: [] as unknown[] }),
          ),
          stargateJson<{ hosts?: Record<string, HostStatusRow> }>(
            `/inventory/host-status?${q}`,
          ).catch(() => ({ hosts: {} as Record<string, HostStatusRow> })),
          stargateJson<{ tree?: RoleNode[] }>(`/roles/storage?${q}`).catch(
            () => ({ tree: [] as RoleNode[] }),
          ),
          stargateJson<{ executions?: RawExecution[] }>(`/executions?${q}`).then(
            (payload) => ({
              ok: true as const,
              executions: payload.executions ?? [],
            }),
            (err: unknown) => ({
              ok: false as const,
              executions: [] as RawExecution[],
              error: err instanceof Error ? err.message : String(err),
            }),
          ),
          stargateJson<{ workers?: RawWorker[] }>("/admin/workers").catch(
            () => ({ workers: [] as RawWorker[] }),
          ),
          stargateJson<{ sources?: { repo?: RawRepoSource } }>(
            `/projects/${projectId}/sources`,
          ).catch(() => ({ sources: {} as { repo?: RawRepoSource } })),
        ]);
        if (cancelled) {
          return;
        }
        if (!executionsData.ok) {
          setExecutionsError(executionsData.error);
        }
        setData(
          buildDashboardSnapshot({
            project: p,
            hosts: Array.isArray(hostsData.hosts) ? hostsData.hosts : [],
            hostStatus: hostStatusData.hosts ?? {},
            rolesTree: rolesData.tree ?? [],
            playbooks: playbookData.playbooks ?? [],
            executions: executionsData.executions,
            workers: workersData.workers ?? [],
            repo: sourcesData.sources?.repo ?? null,
          }),
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, clusterId]);

  if (error) {
    return <EmptyState title="Dashboard unavailable" description={error} />;
  }

  if (!data) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 text-[13px]">
      <ProjectHeader projectId={projectId} project={data.project} />
      <MetricsGrid projectId={projectId} data={data} />
      <ExecutionCharts
        executions={data.executions}
        error={executionsError}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <ProjectHealth health={data.health} />
          <RepositoryStatus projectId={projectId} repo={data.repo} />
        </div>
        <PlaybooksList
          projectId={projectId}
          playbooks={data.playbooks}
          atlas={atlas}
        />
      </div>
      <RecentExecutions projectId={projectId} executions={data.executions} />
      <QuickActions projectId={projectId} />
    </div>
  );
}
