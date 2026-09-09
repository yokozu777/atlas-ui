"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  FileText,
  List,
  Play,
  RotateCw,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { LogViewer } from "@/components/log-viewer";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { projectApiQuery } from "@/components/hosts-groups/helpers";
import { useExecutionStream } from "@/hooks/use-execution-stream";
import type { ClusterPhase } from "@/lib/api";
import {
  executionIdOf,
  executionStatusKind,
  executionStatusLabel,
  formatRelativeTime,
  isWorkerOnline,
  type RawExecution,
  type RawWorker,
} from "@/lib/project-dashboard";
import { projectHref } from "@/lib/project-href";
import { stargateJson } from "@/lib/stargate";
import { cn } from "@/lib/utils";

const RECENT_LIMIT = 8;
const TAGS_SINGLE_PHASE = "--tags requires a single phase";

const PHASE_EDGE = [
  "border-t-chart-1",
  "border-t-chart-2",
  "border-t-chart-3",
  "border-t-chart-5",
] as const;

const PHASE_INDEX = [
  "text-chart-1",
  "text-chart-2",
  "text-chart-3",
  "text-chart-5",
] as const;

type AtlasRunParams = {
  cluster_id?: string;
  phases?: string[];
  root_ssh?: boolean;
  argv?: string[];
};

type AtlasExecution = RawExecution & {
  kind?: string;
  runParams?: AtlasRunParams;
};

type PendingRun = {
  phases: string[];
  all: boolean;
  tags?: string[];
  extraArgs?: string[];
  rootSsh?: boolean;
  dryRun?: boolean;
  executor?: string;
};

export function AtlasHubRun({
  projectId,
  clusterId,
}: {
  projectId: string;
  clusterId: string;
}) {
  const q = projectApiQuery(projectId, clusterId);
  const [phases, setPhases] = useState<ClusterPhase[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<Record<string, string[]>>(
    {},
  );
  const [rootSsh, setRootSsh] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [executor, setExecutor] = useState("cluster default");
  const [advanced, setAdvanced] = useState(false);
  const [pending, setPending] = useState<PendingRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [executionStatus, setExecutionStatus] = useState<string | null>(null);
  const [runs, setRuns] = useState<AtlasExecution[]>([]);
  const [workersOnline, setWorkersOnline] = useState<number | null>(null);
  const [workersTotal, setWorkersTotal] = useState<number | null>(null);
  const { text, running } = useExecutionStream(projectId, executionId);

  useEffect(() => {
    setExecutionId(null);
    setExecutionStatus(null);
    setRuns([]);
  }, [clusterId]);

  const loadPhases = useCallback(async () => {
    const data = await stargateJson<{ phases?: ClusterPhase[] }>(
      `/projects/${encodeURIComponent(projectId)}/atlas/cluster-yaml?${q}`,
    );
    setPhases(data.phases ?? []);
  }, [projectId, q]);

  const loadRuns = useCallback(async () => {
    const data = await stargateJson<{ executions?: AtlasExecution[] }>(
      `/executions?project_id=${encodeURIComponent(projectId)}`,
    );
    setRuns(
      (data.executions ?? []).filter((row) =>
        isClusterAtlasRun(row, clusterId),
      ),
    );
  }, [projectId, clusterId]);

  const loadWorkers = useCallback(async () => {
    const data = await stargateJson<{ workers?: RawWorker[] }>("/admin/workers");
    const workers = data.workers ?? [];
    setWorkersTotal(workers.length);
    setWorkersOnline(workers.filter((row) => isWorkerOnline(row)).length);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setLoadError(null);
    setSelected([]);
    setExpanded([]);
    setSelectedTags({});
    void loadPhases()
      .then(() => {
        if (!cancelled) {
          setLoaded(true);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
          setLoaded(true);
        }
      });
    void loadRuns().catch(() => {
      if (!cancelled) {
        setRuns([]);
      }
    });
    void loadWorkers().catch(() => {
      if (!cancelled) {
        setWorkersOnline(null);
        setWorkersTotal(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadPhases, loadRuns, loadWorkers]);

  useEffect(() => {
    if (executionId) {
      return;
    }
    const active = runs.find((row) => {
      const status = row.status ?? "";
      return (
        status === "QUEUED" ||
        status === "RUNNING" ||
        status === "CANCELING"
      );
    });
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
    if (!executionId || running) {
      return;
    }
    void loadRuns().catch(() => undefined);
    void loadWorkers().catch(() => undefined);
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

  const aliases = useMemo(
    () => phases.map((row) => row.alias).filter(Boolean),
    [phases],
  );

  function tagsForPhases(phaseAliases: string[]): string[] {
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

  function togglePhase(alias: string) {
    setSelected((current) =>
      current.includes(alias)
        ? current.filter((item) => item !== alias)
        : [...current, alias],
    );
  }

  function toggleExpand(alias: string) {
    setExpanded((current) =>
      current.includes(alias)
        ? current.filter((item) => item !== alias)
        : [...current, alias],
    );
  }

  function toggleTag(alias: string, tag: string) {
    setSelectedTags((current) => {
      const list = current[alias] ?? [];
      const next = list.includes(tag)
        ? list.filter((item) => item !== tag)
        : [...list, tag];
      return { ...current, [alias]: next };
    });
  }

  function askRun(next: PendingRun) {
    const tags = next.all
      ? []
      : (next.tags ?? (next.extraArgs ? [] : tagsForPhases(next.phases)));
    if (
      !next.extraArgs &&
      !next.all &&
      tags.length > 0 &&
      next.phases.length !== 1
    ) {
      toast.error(TAGS_SINGLE_PHASE);
      return;
    }
    setPending({ ...next, tags });
  }

  function askRerun(row: AtlasExecution) {
    const params = row.runParams ?? {};
    const list = Array.isArray(params.phases)
      ? params.phases.filter(Boolean)
      : [];
    askRun({
      all: list.length === 0,
      phases: list,
      extraArgs: replayExtraArgs(params.argv),
      rootSsh: Boolean(params.root_ssh),
      dryRun: argvHasFlag(params.argv, "--dry-run"),
      executor: argvValue(params.argv, "--executor") ?? "cluster default",
    });
  }

  async function queue(next: PendingRun) {
    const tags = next.tags ?? [];
    if (!next.all && !next.extraArgs && tags.length > 0 && next.phases.length !== 1) {
      toast.error(TAGS_SINGLE_PHASE);
      return;
    }
    setBusy(true);
    try {
      const data = await stargateJson<{
        executionId?: string;
        error?: string;
      }>(`/projects/${encodeURIComponent(projectId)}/atlas/run`, {
        method: "POST",
        body: JSON.stringify({
          phases: next.all ? [] : next.phases,
          root_ssh: next.rootSsh ?? rootSsh,
          dry_run: next.dryRun ?? dryRun,
          cluster_id: clusterId,
          extra_args: extraArgsFor(next, executor),
        }),
      });
      const id = data.executionId;
      if (!id) {
        throw new Error("No execution id");
      }
      setExecutionId(id);
      setExecutionStatus("QUEUED");
      toast.success(
        (next.dryRun ?? dryRun)
          ? "Dry run queued on worker"
          : "Run queued on worker",
      );
      await loadRuns();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancelOrStop(id: string, status?: string) {
    try {
      if (status === "QUEUED") {
        await stargateJson(
          `/projects/${encodeURIComponent(projectId)}/executions/${id}/cancel`,
          { method: "POST", body: JSON.stringify({}) },
        );
      } else if (status === "RUNNING") {
        await stargateJson(
          `/projects/${encodeURIComponent(projectId)}/executions/${id}/stop`,
          { method: "POST", body: JSON.stringify({}) },
        );
      } else {
        await stargateJson(
          `/executions/${id}?project_id=${encodeURIComponent(projectId)}`,
          { method: "PATCH", body: JSON.stringify({ status: "CANCELING" }) },
        );
      }
      toast.success(status === "QUEUED" ? "Cancel requested" : "Stop requested");
      if (id === executionId) {
        setExecutionStatus(status === "QUEUED" ? "CANCELED" : "CANCELING");
      }
      await loadRuns();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  const liveStatus =
    executionStatus === "CANCELING" || executionStatus === "CANCELED"
      ? executionStatus
      : running
        ? "RUNNING"
        : executionStatus;
  const liveActive =
    liveStatus === "QUEUED" ||
    liveStatus === "RUNNING" ||
    liveStatus === "CANCELING";
  const noWorkers =
    workersTotal !== null && workersOnline !== null && workersOnline === 0;
  const confirmDry = pending?.dryRun ?? dryRun;

  if (loadError) {
    return (
      <div className="flex min-h-0 flex-col gap-4">
        <RunHeader projectId={projectId} />
        <EmptyState title="Run unavailable" description={loadError} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-8">
      <RunHeader projectId={projectId} />

      <Panel className="grid gap-4 px-4 py-4 sm:grid-cols-2">
        <ContextField label="Cluster" value={clusterId} mono />
        <ContextField
          label="Workers"
          value={
            workersTotal == null
              ? "…"
              : `${workersOnline ?? 0} online / ${workersTotal}`
          }
        />
        {noWorkers ? (
          <p className="text-sm text-warning sm:col-span-2">
            No hub workers online. The run will stay queued until a worker
            claims it.
          </p>
        ) : null}
      </Panel>

      {!loaded ? (
        <EmptyState title="Loading phases" />
      ) : phases.length === 0 ? (
        <EmptyState
          title="No phases in cluster.yaml"
          description={
            <>
              Add a <span className="font-mono">phases</span> list, then return
              here.{" "}
              <Link
                href={projectHref(projectId, "/cluster-yaml")}
                className="text-foreground underline underline-offset-4"
              >
                Cluster definition
              </Link>
            </>
          }
        />
      ) : (
        <div className="space-y-4">
          <SectionHeader title="Quick run" />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy}
              onClick={() => askRun({ all: true, phases: aliases })}
            >
              <Play />
              Run all phases
            </Button>
            {phases.map((row) => (
              <Button
                key={row.alias}
                type="button"
                variant="outline"
                disabled={busy}
                title={row.ref || row.alias}
                onClick={() => {
                  setSelected([row.alias]);
                  askRun({
                    all: false,
                    phases: [row.alias],
                    tags: selectedTags[row.alias] ?? [],
                  });
                }}
              >
                <Play />
                {row.alias}
              </Button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Init here is the cluster.yaml phase (node bootstrap), not creating a
            cluster from a template.
          </p>
        </div>
      )}

      {loaded && phases.length > 0 ? (
        <div>
          <SectionHeader
            title="Phases"
            actions={
              <Button
                type="button"
                disabled={busy || selected.length === 0}
                onClick={() =>
                  askRun({
                    all: false,
                    phases: aliases.filter((alias) => selected.includes(alias)),
                  })
                }
              >
                <Play />
                Run selected
              </Button>
            }
          />
          <ol
            className={cn(
              "grid gap-3",
              phases.length === 1
                ? "grid-cols-1"
                : phases.length === 2
                  ? "sm:grid-cols-2"
                  : phases.length === 3
                    ? "sm:grid-cols-3"
                    : "sm:grid-cols-2 xl:grid-cols-4",
            )}
          >
            {phases.map((row, index) => {
              const on = selected.includes(row.alias);
              const open = expanded.includes(row.alias);
              const cycle = index % PHASE_EDGE.length;
              const tags = row.tags ?? [];
              const picked = selectedTags[row.alias] ?? [];
              return (
                <li
                  key={row.alias}
                  className={open ? "sm:col-span-full" : undefined}
                >
                  <div
                    className={cn(
                      "flex h-full w-full flex-col gap-2 rounded-xl border-t-2 bg-card px-4 py-4 text-left",
                      PHASE_EDGE[cycle],
                      on && "ring-2 ring-foreground/40",
                    )}
                    data-slot="panel"
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={on}
                        aria-label={`Select ${row.alias}`}
                        className="mt-1"
                        onCheckedChange={() => togglePhase(row.alias)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        aria-expanded={open}
                        className="h-auto min-w-0 flex-1 flex-col items-stretch gap-2 rounded-none p-0 font-normal"
                        onClick={() => toggleExpand(row.alias)}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span
                            className={cn(
                              "font-mono text-xs tabular-nums",
                              PHASE_INDEX[cycle],
                            )}
                          >
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <ChevronDown
                            className={cn(
                              "size-4 shrink-0 text-muted-foreground transition-transform",
                              open ? "rotate-180" : "rotate-0",
                            )}
                          />
                        </span>
                        <span className="font-display text-base font-medium tracking-tight">
                          {row.alias}
                        </span>
                        {row.ref ? (
                          <span className="font-mono text-xs text-muted-foreground">
                            {row.ref}
                          </span>
                        ) : null}
                      </Button>
                    </div>
                    {open ? (
                      <div className="mt-1 border-t border-white/10 pt-3">
                        {tags.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            No tags in cluster.yaml
                          </p>
                        ) : (
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {tags.map((tag) => (
                              <Label
                                key={tag}
                                className="font-normal font-mono text-xs"
                              >
                                <Checkbox
                                  checked={picked.includes(tag)}
                                  onCheckedChange={() =>
                                    toggleTag(row.alias, tag)
                                  }
                                />
                                {tag}
                              </Label>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      <div>
        <Button
          type="button"
          variant="ghost"
          className="h-auto gap-2 px-0 text-sm font-normal text-muted-foreground hover:text-foreground"
          aria-expanded={advanced}
          onClick={() => setAdvanced((value) => !value)}
        >
          Advanced
          <ChevronDown
            className={cn(
              "size-4 transition-transform",
              advanced ? "rotate-180" : "rotate-0",
            )}
          />
        </Button>
        {advanced ? (
          <div className="mt-3 flex flex-col gap-3">
            <div className="space-y-2">
              <Label>Executor</Label>
              <Select
                value={executor}
                onValueChange={(value) =>
                  setExecutor(value ?? "cluster default")
                }
              >
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cluster default">cluster default</SelectItem>
                  <SelectItem value="local">local</SelectItem>
                  <SelectItem value="docker">docker</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                cluster default uses execution.mode in cluster.yaml. local runs
                ansible on the worker; docker runs the clusterctl executor
                image.
              </p>
            </div>
            <Label className="font-normal">
              <Checkbox
                checked={rootSsh}
                onCheckedChange={(value) => setRootSsh(value === true)}
              />
              Root SSH for first-boot phases
            </Label>
            <Label className="font-normal">
              <Checkbox
                checked={dryRun}
                onCheckedChange={(value) => setDryRun(value === true)}
              />
              Dry run
            </Label>
          </div>
        ) : null}
      </div>

      {executionId ? (
        <div>
          <SectionHeader
            title="This run"
            actions={
              <>
                {liveStatus ? (
                  <StatusBadge status={executionStatusKind(liveStatus)}>
                    {executionStatusLabel(executionStatusKind(liveStatus))}
                  </StatusBadge>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  render={
                    <Link
                      href={projectHref(
                        projectId,
                        `/executions/${executionId}`,
                      )}
                    />
                  }
                >
                  <FileText />
                  Open log
                </Button>
                {liveActive && liveStatus !== "CANCELING" ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => void cancelOrStop(executionId, liveStatus ?? undefined)}
                  >
                    {liveStatus === "QUEUED" ? "Cancel" : "Stop"}
                  </Button>
                ) : null}
              </>
            }
          />
          <LogViewer
            jobId={null}
            text={text}
            running={running}
            label="worker log"
          />
        </div>
      ) : null}

      <div>
        <SectionHeader
          title="Recent runs"
          actions={
            <Button
              size="sm"
              variant="outline"
              render={
                <Link href={projectHref(projectId, "/executions")} />
              }
            >
              <List />
              All executions
            </Button>
          }
        />
        <Panel>
          {runs.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              No atlas runs for this cluster yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Phases</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.slice(0, RECENT_LIMIT).map((row) => {
                  const id = executionIdOf(row);
                  const status = row.status ?? "";
                  const kind = executionStatusKind(status);
                  const active =
                    status === "QUEUED" ||
                    status === "RUNNING" ||
                    status === "CANCELING";
                  const canRerun = !active;
                  return (
                    <TableRow key={id}>
                      <TableCell>
                        <StatusBadge status={kind}>
                          {executionStatusLabel(kind)}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatRunPhases(row)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatRelativeTime(
                          row.startedAt ??
                            row.queuedAt ??
                            row.createdAt ??
                            row.created_at,
                        )}
                      </TableCell>
                      <TableCell className="space-x-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          render={
                            <Link
                              href={projectHref(
                                projectId,
                                `/executions/${id}`,
                              )}
                            />
                          }
                        >
                          <FileText />
                          Log
                        </Button>
                        {canRerun ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => askRerun(row)}
                          >
                            <RotateCw />
                            Rerun
                          </Button>
                        ) : null}
                        {active && status !== "CANCELING" ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => void cancelOrStop(id, status)}
                          >
                            {status === "QUEUED" ? "Cancel" : "Stop"}
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Panel>
      </div>

      <ConfirmAction
        open={pending != null}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null);
          }
        }}
        title={confirmDry ? `Dry-run ${clusterId}?` : `Run on ${clusterId}?`}
        description={confirmText(
          clusterId,
          pending,
          phases,
          pending?.rootSsh ?? rootSsh,
          confirmDry,
          pending?.executor ?? executor,
        )}
        confirmLabel={confirmDry ? "Queue dry run" : "Queue run"}
        onConfirm={() => {
          if (pending) {
            void queue(pending);
          }
        }}
      />
    </div>
  );
}

function RunHeader({ projectId }: { projectId: string }) {
  return (
    <PageHeader
      kicker="Atlas"
      title="Run"
      description="Pick phases for this cluster and queue them on a hub worker."
      actions={
        <Button
          variant="outline"
          render={<Link href={projectHref(projectId, "/executions")} />}
        >
          <List />
          Executions
        </Button>
      }
    />
  );
}

function ContextField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-sm", mono && "font-mono break-all")}>{value}</p>
    </div>
  );
}

function isClusterAtlasRun(row: AtlasExecution, clusterId: string): boolean {
  if ((row.kind || "").toLowerCase() !== "atlas") {
    return false;
  }
  const cid = row.runParams?.cluster_id;
  return !cid || cid === clusterId;
}

function formatRunPhases(row: AtlasExecution): string {
  const list = row.runParams?.phases;
  const phases =
    Array.isArray(list) && list.length > 0 ? list.join(", ") : "all";
  const tags = argvValue(row.runParams?.argv, "--tags");
  return tags ? `${phases} [${tags}]` : phases;
}

function confirmText(
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

function extraArgsFor(pending: PendingRun, executor: string): string[] {
  const extra = [...(pending.extraArgs ?? [])];
  const tags = pending.tags ?? [];
  if (tags.length > 0 && !argvHasFlag(extra, "--tags")) {
    extra.push("--tags", tags.join(","));
  }
  const chosen = pending.executor ?? executor;
  if (
    (chosen === "local" || chosen === "docker") &&
    !argvHasFlag(extra, "--executor")
  ) {
    extra.push("--executor", chosen);
  }
  return extra;
}

function replayExtraArgs(argv: string[] | undefined): string[] {
  const extra: string[] = [];
  const tags = argvValue(argv, "--tags");
  if (tags) {
    extra.push("--tags", tags);
  }
  const exec = argvValue(argv, "--executor");
  if (exec) {
    extra.push("--executor", exec);
  }
  return extra;
}

function argvHasFlag(argv: string[] | undefined, flag: string): boolean {
  if (!argv) {
    return false;
  }
  return argv.some((token) => token === flag || token.startsWith(`${flag}=`));
}

function argvValue(
  argv: string[] | undefined,
  flag: string,
): string | undefined {
  if (!argv) {
    return undefined;
  }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === flag) {
      const next = argv[i + 1];
      return next && !next.startsWith("-") ? next : "";
    }
    if (token.startsWith(`${flag}=`)) {
      return token.slice(flag.length + 1);
    }
  }
  return undefined;
}
