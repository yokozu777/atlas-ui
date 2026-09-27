"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
import { projectHref } from "@/lib/project-href";
import { fetchProject, stargateJson } from "@/lib/stargate";

export function AnsibleDashboardPage({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { clusterId } = useAtlasClusterSelection();
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [atlas, setAtlas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executionsError, setExecutionsError] = useState<string | null>(null);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    setExecutionsError(null);
    setLoadErrors([]);
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
        const settle = async <T,>(
          label: string,
          promise: Promise<T>,
        ): Promise<{ value: T | null; error?: string }> => {
          try {
            return { value: await promise };
          } catch (err: unknown) {
            return {
              value: null,
              error: `${label}: ${err instanceof Error ? err.message : String(err)}`,
            };
          }
        };
        const [
          playbookData,
          hostsData,
          hostStatusData,
          rolesData,
          executionsData,
          workersData,
          sourcesData,
        ] = await Promise.all([
          settle(
            "Playbooks",
            stargateJson<{ playbooks?: RawPlaybook[] }>(
              `/projects/${projectId}/playbooks${playbookQuery}`,
            ),
          ),
          settle(
            "Hosts",
            stargateJson<{ hosts?: unknown[] }>(`/inventory/hosts?${q}`),
          ),
          settle(
            "Host status",
            stargateJson<{ hosts?: Record<string, HostStatusRow> }>(
              `/inventory/host-status?${q}`,
            ),
          ),
          settle(
            "Roles",
            stargateJson<{ tree?: RoleNode[] }>(`/roles/storage?${q}`),
          ),
          settle(
            "Executions",
            stargateJson<{ executions?: RawExecution[] }>(`/executions?${q}`),
          ),
          settle("Workers", stargateJson<{ workers?: RawWorker[] }>("/admin/workers")),
          settle(
            "Sources",
            stargateJson<{ sources?: { repo?: RawRepoSource } }>(
              `/projects/${projectId}/sources`,
            ),
          ),
        ]);
        if (cancelled) {
          return;
        }
        const errors = [
          playbookData.error,
          hostsData.error,
          hostStatusData.error,
          rolesData.error,
          executionsData.error,
          workersData.error,
          sourcesData.error,
        ].filter((row): row is string => Boolean(row));
        setLoadErrors(errors);
        if (executionsData.error) {
          setExecutionsError(executionsData.error);
        }
        setData(
          buildDashboardSnapshot({
            project: p,
            hosts: Array.isArray(hostsData.value?.hosts)
              ? hostsData.value.hosts
              : [],
            hostStatus: hostStatusData.value?.hosts ?? {},
            rolesTree: rolesData.value?.tree ?? [],
            playbooks: playbookData.value?.playbooks ?? [],
            executions: executionsData.value?.executions ?? [],
            workers: workersData.value?.workers ?? [],
            repo: sourcesData.value?.sources?.repo ?? null,
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
  }, [projectId, clusterId, reloadKey]);

  if (error) {
    return <EmptyState title="Dashboard unavailable" description={error} />;
  }

  if (!data) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 text-[13px]">
      <ProjectHeader projectId={projectId} project={data.project} />
      {loadErrors.length ? (
        <p className="text-sm text-destructive" role="alert">
          {loadErrors.join(" · ")}
        </p>
      ) : null}
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
      <RecentExecutions
        projectId={projectId}
        executions={data.executions}
        onQueued={(id) =>
          router.push(projectHref(projectId, `/executions/${id}`))
        }
        onStopped={() => setReloadKey((value) => value + 1)}
      />
      <QuickActions projectId={projectId} />
    </div>
  );
}
