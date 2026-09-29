"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  CheckCircle2,
  FileText,
  KeyRound,
  ListChecks,
  ListOrdered,
  MoreHorizontal,
  Play,
  Server,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { AtlasMetricsGrid } from "@/components/atlas-metrics-grid";
import { AtlasPackMapLive } from "@/components/atlas-pack-map-live";
import { AtlasRunProgressCard } from "@/components/atlas-run-progress-card";
import { useClusterOverlays } from "@/components/cluster-overlays";
import { OverviewPipeline } from "@/components/overview-pipeline";
import { OverviewReadiness } from "@/components/overview-readiness";
import { PlaybookSetupCard } from "@/components/playbook-setup-card";
import { Panel } from "@/components/panel";
import { ExecutionCharts } from "@/components/project-dashboard/execution-charts";
import { QuickActions } from "@/components/project-dashboard/quick-actions";
import { RecentExecutions } from "@/components/project-dashboard/recent-executions";
import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { projectApiQuery } from "@/components/hosts-groups/helpers";
import { useExecutionStream } from "@/hooks/use-execution-stream";
import {
  fetchClusters,
  type ClusterPhase,
  type ClusterPlaybookRepo,
  type ClusterRow,
} from "@/lib/api";
import {
  cancelOrStopExecution,
  isActiveExecutionStatus,
  isClusterAtlasRun,
  mapAtlasDashboardExecution,
  type AtlasExecution,
} from "@/lib/atlas-run";
import {
  countOnlineHosts,
  executionIdOf,
  executionStatusKind,
  executionStatusLabel,
  isWorkerOnline,
  type HostStatusRow,
  type RawWorker,
} from "@/lib/project-dashboard";
import { executionLogHref, projectHref, projectIdFromPath } from "@/lib/project-href";
import { stargateJson } from "@/lib/stargate";

export default function ClusterHomePage({
  params,
}: {
  params: Promise<{ clusterId: string }>;
}) {
  const clusterId = decodeURIComponent(use(params).clusterId);
  return <ClusterHomeView key={clusterId} clusterId={clusterId} />;
}

export function ClusterHomeView({ clusterId }: { clusterId: string }) {
  const { openRun, openInspect, liveExecutionId, followExecution } =
    useClusterOverlays();
  const router = useRouter();
  const pathname = usePathname();
  const projectId = projectIdFromPath(pathname);
  const q = projectId ? projectApiQuery(projectId, clusterId) : "";

  const [cluster, setCluster] = useState<ClusterRow | null>(null);
  const [phases, setPhases] = useState<ClusterPhase[]>([]);
  const [sourceCount, setSourceCount] = useState(0);
  const [phasesError, setPhasesError] = useState<string | null>(null);
  const [phasesLoading, setPhasesLoading] = useState(true);
  const [runs, setRuns] = useState<AtlasExecution[]>([]);
  const [executionsError, setExecutionsError] = useState<string | null>(null);
  const [hostsTotal, setHostsTotal] = useState(0);
  const [hostsOnline, setHostsOnline] = useState(0);
  const [hostsError, setHostsError] = useState<string | null>(null);
  const [clusterError, setClusterError] = useState<string | null>(null);
  const [workersOnline, setWorkersOnline] = useState<number | null>(null);
  const [workersTotal, setWorkersTotal] = useState<number | null>(null);
  const [workersError, setWorkersError] = useState<string | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [executionStatus, setExecutionStatus] = useState<string | null>(null);

  const { text, running } = useExecutionStream(
    projectId ?? "",
    projectId ? executionId : null,
  );

  const dashboardExecutions = useMemo(
    () =>
      runs.map((row) => {
        const mapped = mapAtlasDashboardExecution(row, clusterId);
        if (
          executionId &&
          mapped.id === executionId &&
          running &&
          (mapped.rawStatus === "QUEUED" || mapped.status === "pending")
        ) {
          return { ...mapped, status: "running" as const, rawStatus: "RUNNING" };
        }
        return mapped;
      }),
    [runs, clusterId, executionId, running],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("run") !== "1") {
      return;
    }
    openRun();
    params.delete("run");
    const search = params.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, {
      scroll: false,
    });
  }, [clusterId, openRun, pathname, router]);

  useEffect(() => {
    let cancelled = false;
    void fetchClusters()
      .then((rows) => {
        if (!cancelled) {
          setClusterError(null);
          setCluster(rows.find((row) => row.id === clusterId) ?? null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setCluster(null);
          setClusterError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [clusterId]);

  const loadPhases = useCallback(async () => {
    if (!projectId) {
      setPhases([]);
      setSourceCount(0);
      return;
    }
    const data = await stargateJson<{
      phases?: ClusterPhase[];
      playbooks?: ClusterPlaybookRepo[];
    }>(
      `/projects/${encodeURIComponent(projectId)}/atlas/cluster-yaml?${q}`,
    );
    setPhases(data.phases ?? []);
    setSourceCount((data.playbooks ?? []).length);
  }, [projectId, q]);

  const loadRuns = useCallback(async () => {
    if (!projectId) {
      setRuns([]);
      setExecutionsError(null);
      return;
    }
    try {
      const data = await stargateJson<{ executions?: AtlasExecution[] }>(
        `/executions?project_id=${encodeURIComponent(projectId)}`,
      );
      setRuns(
        (data.executions ?? []).filter((row) =>
          isClusterAtlasRun(row, clusterId),
        ),
      );
      setExecutionsError(null);
    } catch (err) {
      setRuns([]);
      setExecutionsError(err instanceof Error ? err.message : String(err));
    }
  }, [projectId, clusterId]);

  const loadHosts = useCallback(async () => {
    if (!projectId) {
      setHostsTotal(0);
      setHostsOnline(0);
      setHostsError(null);
      return;
    }
    try {
      const [hostsData, hostStatusData] = await Promise.all([
        stargateJson<{ hosts?: unknown[] }>(`/inventory/hosts?${q}`),
        stargateJson<{ hosts?: Record<string, HostStatusRow> }>(
          `/inventory/host-status?${q}`,
        ),
      ]);
      const counted = countOnlineHosts(
        Array.isArray(hostsData.hosts) ? hostsData.hosts : [],
        hostStatusData.hosts ?? {},
      );
      setHostsTotal(counted.total);
      setHostsOnline(counted.online);
      setHostsError(null);
    } catch (err: unknown) {
      setHostsError(err instanceof Error ? err.message : String(err));
    }
  }, [projectId, q]);

  const loadWorkers = useCallback(async () => {
    try {
      const data = await stargateJson<{ workers?: RawWorker[] }>("/admin/workers");
      const workers = data.workers ?? [];
      setWorkersTotal(workers.length);
      setWorkersOnline(workers.filter((row) => isWorkerOnline(row)).length);
      setWorkersError(null);
    } catch (err: unknown) {
      setWorkersError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPhasesLoading(true);
    setPhasesError(null);
    void loadPhases()
      .then(() => {
        if (!cancelled) setPhasesLoading(false);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPhasesError(err instanceof Error ? err.message : String(err));
          setPhasesLoading(false);
        }
      });
    void loadRuns();
    void loadHosts();
    void loadWorkers();
    return () => {
      cancelled = true;
    };
  }, [loadPhases, loadRuns, loadHosts, loadWorkers]);

  useEffect(() => {
    if (liveExecutionId) {
      setExecutionId(liveExecutionId);
      setExecutionStatus("QUEUED");
      void loadRuns();
    }
  }, [liveExecutionId, loadRuns]);

  useEffect(() => {
    if (executionId) {
      return;
    }
    const active = runs.find((row) => isActiveExecutionStatus(row.status));
    if (!active) {
      return;
    }
    const id = executionIdOf(active);
    if (id) {
      setExecutionId(id);
      if (active.status) {
        setExecutionStatus(active.status);
      }
    }
  }, [runs, executionId]);

  useEffect(() => {
    if (!executionId) {
      return;
    }
    if (!running) {
      void loadRuns();
      void loadWorkers();
      return;
    }
    void loadRuns();
    const timer = window.setInterval(() => {
      void loadRuns();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [executionId, running, loadRuns, loadWorkers]);

  useEffect(() => {
    if (!executionId) {
      return;
    }
    const row = runs.find((item) => executionIdOf(item) === executionId);
    if (row?.status) {
      setExecutionStatus(row.status);
    } else if (running) {
      setExecutionStatus("RUNNING");
    }
  }, [executionId, runs, running]);

  const liveStatus =
    executionStatus === "CANCELING" || executionStatus === "CANCELED"
      ? executionStatus
      : running
        ? "RUNNING"
        : executionStatus;
  const liveKind = executionStatusKind(liveStatus ?? undefined);
  const liveActive = isActiveExecutionStatus(liveStatus);
  const liveRow = runs.find((row) => executionIdOf(row) === executionId);
  const lastRun = runs[0] ?? null;
  const lastKind = lastRun ? executionStatusKind(lastRun.status) : null;
  const headerKind = liveActive
    ? liveKind
    : lastKind === "fail"
      ? "fail"
      : "ok";
  const headerLabel = liveActive
    ? executionStatusLabel(liveKind)
    : lastKind === "fail"
      ? "Failed"
      : "Ready";
  const title = cluster?.display_name || clusterId;
  const runPhases = useMemo(
    () =>
      liveRow?.runParams?.phases && liveRow.runParams.phases.length > 0
        ? liveRow.runParams.phases
        : phases.map((row) => row.alias),
    [liveRow, phases],
  );

  async function cancelLive() {
    if (!projectId || !executionId) {
      return;
    }
    try {
      await cancelOrStopExecution(
        projectId,
        executionId,
        liveStatus ?? undefined,
      );
      toast.success(
        liveStatus === "QUEUED" ? "Cancel requested" : "Stop requested",
      );
      setExecutionStatus(liveStatus === "QUEUED" ? "CANCELED" : "CANCELING");
      await loadRuns();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="flex min-h-0 flex-col gap-8">
      <header className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <p className="font-mono text-xs text-muted-foreground">{clusterId}</p>
          <h1 className="font-display text-2xl font-medium tracking-tight">
            {title}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge status={headerKind}>{headerLabel}</StatusBadge>
            <span className="text-muted-foreground">
              {workersTotal == null
                ? "Workers …"
                : `${workersTotal} workers · ${workersOnline ?? 0} online`}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button type="button" onClick={() => openRun()}>
            <Play />
            Run
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => openInspect("validate")}
          >
            <CheckCircle2 />
            Validate
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="More actions"
              className={buttonVariants({ variant: "outline", size: "icon" })}
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openInspect("plan")}>
                Plan
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openInspect("smoke")}>
                Smoke
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <OverviewReadiness clusterId={clusterId} projectId={projectId} />

      {clusterError || hostsError || workersError ? (
        <p className="text-sm text-destructive" role="alert">
          {[clusterError, hostsError, workersError].filter(Boolean).join(" · ")}
        </p>
      ) : null}

      {projectId ? (
        <AtlasMetricsGrid
          projectId={projectId}
          hostsTotal={hostsTotal}
          hostsOnline={hostsOnline}
          sourceCount={sourceCount}
          phaseCount={phases.length}
          executions={dashboardExecutions}
          workersOnline={workersOnline ?? 0}
          workersTotal={workersTotal ?? 0}
        />
      ) : null}

      {projectId ? (
        <ExecutionCharts
          executions={dashboardExecutions}
          error={executionsError}
        />
      ) : null}

      <div id="cluster-pipeline">
        <SectionHeader title="Pipeline" icon={<ListOrdered />} />
        {phasesLoading ? (
          <div className="flex gap-3 overflow-hidden">
            <Skeleton className="h-28 w-44 shrink-0 rounded-xl" />
            <Skeleton className="h-28 w-44 shrink-0 rounded-xl" />
            <Skeleton className="h-28 w-44 shrink-0 rounded-xl" />
          </div>
        ) : phasesError ? (
          <Panel className="p-4">
            <p className="font-mono text-xs whitespace-pre-wrap text-destructive">
              {phasesError}
            </p>
          </Panel>
        ) : (
          <OverviewPipeline
            phases={phases}
            liveAliases={liveRow?.runParams?.phases}
            liveStatus={liveActive ? liveStatus : null}
            onSelect={(alias) => openRun({ phases: alias })}
          />
        )}
        {projectId && executionId ? (
          <div className="mt-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <StatusBadge status={liveKind}>
                  {executionStatusLabel(liveKind)}
                </StatusBadge>
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {executionId}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  render={
                    <Link
                      href={projectHref(projectId, `/executions/${executionId}`)}
                    />
                  }
                >
                  Open log
                </Button>
                {liveActive && liveStatus !== "CANCELING" ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => void cancelLive()}
                  >
                    {liveStatus === "QUEUED" ? "Cancel" : "Stop"}
                  </Button>
                ) : null}
              </div>
            </div>
            <AtlasRunProgressCard
              status={liveStatus}
              text={text}
              phases={runPhases}
              onSelect={(id) => {
                if (!projectId || !executionId || !id.startsWith("phase:")) {
                  return;
                }
                router.push(
                  executionLogHref(
                    projectId,
                    executionId,
                    id.slice("phase:".length),
                  ),
                );
              }}
            />
            <AtlasPackMapLive
              projectId={projectId}
              clusterId={clusterId}
              executionId={executionId}
              status={liveStatus}
              text={text}
              phases={runPhases}
            />
          </div>
        ) : null}
      </div>

      {projectId ? (
        <PlaybookSetupCard
          projectId={projectId}
          clusterId={clusterId}
          variant="summary"
        />
      ) : null}

      {projectId ? (
        <RecentExecutions
          projectId={projectId}
          executions={dashboardExecutions}
          playbookColumnLabel="Phases"
          fallbackClusterId={clusterId}
          onQueued={followExecution}
          onStopped={() => void loadRuns()}
          emptyMessage="No atlas runs for this cluster yet."
          emptyAction={
            <Button size="sm" onClick={() => openRun()}>
              <Play />
              Run
            </Button>
          }
        />
      ) : null}

      {projectId ? (
        <div>
          <SectionHeader title="Quick Actions" icon={<Zap />} />
          <QuickActions
            hideTitle
            items={[
              {
                label: "Run pipeline",
                icon: <Play />,
                onClick: () => openRun(),
              },
              {
                label: "Inventory",
                icon: <Server />,
                href: projectHref(projectId, "/hosts"),
              },
              {
                label: "Executions",
                icon: <FileText />,
                href: projectHref(projectId, "/executions"),
              },
              {
                label: "Setup",
                icon: <ListChecks />,
                href: projectHref(projectId, "/cluster-yaml"),
              },
              {
                label: "Secrets",
                icon: <KeyRound />,
                href: projectHref(projectId, "/secrets"),
              },
            ]}
          />
        </div>
      ) : null}
    </div>
  );
}
