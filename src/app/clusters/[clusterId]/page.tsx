"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Layers, Server, Timer } from "lucide-react";

import { useClusterOverlays } from "@/components/cluster-overlays";
import { useJobSession } from "@/components/job-session";
import { LogViewer } from "@/components/log-viewer";
import { MetricCard } from "@/components/metric-card";
import { OverviewActivity } from "@/components/overview-activity";
import {
  OverviewHero,
  overviewHeroKind,
} from "@/components/overview-hero";
import { OverviewPipeline } from "@/components/overview-pipeline";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { ExecutionCharts } from "@/components/project-dashboard/execution-charts";
import { SectionHeader } from "@/components/section-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  clusterHref,
  fetchClusters,
  fetchClusterRuns,
  runClusterctl,
  type ClusterRow,
  type RunLogRow,
} from "@/lib/api";
import {
  atlasRunsToDashboardExecutions,
  averageRunDurationLabel,
} from "@/lib/atlas-overview";
import type { PlanJson } from "@/lib/cluster-types";
import { lastRunStatus } from "@/lib/cluster-types";
import { formatAge, formatDuration, metaString } from "@/lib/format-time";
import { parseJobJson } from "@/lib/job-output";

type LimitsJson = {
  hosts?: { key: string }[];
  groups?: string[];
};

export default function ClusterHomePage({
  params,
}: {
  params: Promise<{ clusterId: string }>;
}) {
  const clusterId = decodeURIComponent(use(params).clusterId);
  return <ClusterHomeView key={clusterId} clusterId={clusterId} />;
}

export function ClusterHomeView({ clusterId }: { clusterId: string }) {
  const { openRun, openInspect } = useClusterOverlays();
  const { job, log } = useJobSession();
  const router = useRouter();
  const sessionForCluster = job?.clusterId === clusterId;
  const running = Boolean(sessionForCluster && job?.status === "running");
  const [plan, setPlan] = useState<PlanJson | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [runs, setRuns] = useState<RunLogRow[]>([]);
  const [hostCount, setHostCount] = useState<number | null>(null);
  const [cluster, setCluster] = useState<ClusterRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchClusters()
      .then((rows) => {
        if (!cancelled) {
          setCluster(rows.find((row) => row.id === clusterId) ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setCluster(null);
      });
    return () => {
      cancelled = true;
    };
  }, [clusterId]);

  useEffect(() => {
    let cancelled = false;
    void runClusterctl({
      argv: ["plan", "--json"],
      clusterId,
      wait: true,
    })
      .then((result) => {
        if (cancelled) return;
        setPlan(parseJobJson<PlanJson>(result.log ?? "{}"));
        setPlanError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPlan(null);
        setPlanError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setPlanLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clusterId]);

  useEffect(() => {
    let cancelled = false;
    void runClusterctl({ argv: ["limits", "--json"], clusterId, wait: true })
      .then((result) => {
        if (cancelled) return;
        const data = parseJobJson<LimitsJson>(result.log ?? "{}");
        setHostCount((data.hosts ?? []).length);
      })
      .catch(() => {
        if (!cancelled) setHostCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [clusterId]);

  useEffect(() => {
    let cancelled = false;
    void fetchClusterRuns(clusterId)
      .then((data) => {
        if (!cancelled) setRuns(data.runs);
      })
      .catch(() => {
        if (!cancelled) setRuns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [clusterId, job?.id, job?.status]);

  const skipped = new Map(
    (plan?.filter_skipped ?? []).map((item) => [item.phase_ref, item.reason]),
  );
  const lastRun = runs[0] ?? null;
  const lastStatus = lastRun ? lastRunStatus(lastRun.meta) : null;
  const started = metaString(lastRun?.meta ?? null, "started_at");
  const finished = metaString(lastRun?.meta ?? null, "finished_at");
  const recent = runs.slice(0, 8);
  const title = cluster?.display_name || clusterId;
  const heroKind = overviewHeroKind({ running, lastStatus });
  const heroMeta = [
    lastRun
      ? (formatAge(started ?? lastRun.stamp) ?? lastRun.stamp)
      : "No runs yet",
    plan?.execution,
    plan?.workspace_id,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="flex min-h-0 flex-col gap-8">
      <PageHeader kicker="Cluster" title={title} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <OverviewHero
            kind={heroKind}
            title={title}
            clusterId={clusterId}
            meta={heroMeta}
            onRun={() => openRun()}
            onInspect={openInspect}
          />
        </div>
        <div className="flex flex-col gap-4 xl:col-span-4">
          <Link
            href={clusterHref(clusterId, "/hosts")}
            className="block rounded-xl outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MetricCard
              tone="info"
              label="Hosts"
              icon={<Server />}
              value={hostCount === null ? "—" : hostCount}
              hint="inventory --limit keys"
              className="transition-colors hover:bg-white/5"
            />
          </Link>
          <MetricCard
            tone="primary"
            label="Phases"
            icon={<Layers />}
            value={planLoading ? "…" : (plan?.phases?.length ?? 0)}
            hint="from plan --json"
          />
          <MetricCard
            tone="warning"
            label="Duration"
            icon={<Timer />}
            value={formatDuration(started, finished) ?? "—"}
            hint="started_at → finished_at"
          />
        </div>
      </div>

      <div>
        <SectionHeader title="Pipeline" />
        {planLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
        ) : planError ? (
          <Panel className="p-4">
            <p className="font-mono text-xs whitespace-pre-wrap text-destructive">
              {planError}
            </p>
          </Panel>
        ) : (
          <OverviewPipeline
            phases={plan?.phases ?? []}
            skipped={skipped}
            log={sessionForCluster ? log : ""}
            exitCode={sessionForCluster ? (job?.exitCode ?? null) : null}
            running={running}
            onSelect={(phase) => openRun({ phases: phase })}
          />
        )}
        {running && job ? (
          <div className="mt-4">
            <LogViewer
              jobId={job.id}
              text={log}
              running
              compact
              label="live"
            />
          </div>
        ) : null}
      </div>

      <ExecutionCharts
        executions={atlasRunsToDashboardExecutions(runs)}
        error={null}
      />

      <div>
        <SectionHeader
          title="Activity"
          actions={
            <>
              <span className="tabular-nums text-sm text-muted-foreground">
                {averageRunDurationLabel(runs)}
              </span>
              <Button
                variant="outline"
                size="sm"
                render={<Link href={clusterHref(clusterId, "/logs")} />}
              >
                History
              </Button>
            </>
          }
        />
        {recent.length === 0 ? (
          <Panel className="px-4 py-8 text-sm text-muted-foreground">
            No workspace logs yet.
          </Panel>
        ) : (
          <OverviewActivity
            runs={recent}
            onOpen={(stamp) =>
              router.push(
                clusterHref(clusterId, `/logs/${encodeURIComponent(stamp)}`),
              )
            }
          />
        )}
      </div>
    </div>
  );
}
