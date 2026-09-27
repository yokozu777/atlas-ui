"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Play } from "lucide-react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { RuntimePiecesAlert } from "@/components/overview-readiness";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { projectApiQuery } from "@/components/hosts-groups/helpers";
import type { ClusterPhase } from "@/lib/api";
import {
  confirmText,
  extraArgsFor,
  parseRunPhasesOpt,
  runSummaryLabel,
  tagsForPhases,
  TAGS_SINGLE_PHASE,
  type PendingRun,
} from "@/lib/atlas-run";
import { notifyExecution } from "@/lib/notification-inbox";
import { useCan } from "@/lib/authz";
import { isWorkerOnline, type RawWorker } from "@/lib/project-dashboard";
import { stargateJson } from "@/lib/stargate";
import { cn } from "@/lib/utils";

type RunMode = "all" | "selected";

export function AtlasRunDialog({
  open,
  onOpenChange,
  projectId,
  clusterId,
  initialPhases,
  onQueued,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  clusterId: string;
  initialPhases?: string | string[];
  onQueued?: (executionId: string) => void;
}) {
  const q = projectApiQuery(projectId, clusterId);
  const can = useCan();
  const canExecute = can("atlas.execute");
  const canRootSsh = can("atlas.execute_root_ssh");
  const [phases, setPhases] = useState<ClusterPhase[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<RunMode>("all");
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
  const [workersOnline, setWorkersOnline] = useState<number | null>(null);
  const [workersTotal, setWorkersTotal] = useState<number | null>(null);

  const resetFromInitial = useCallback(
    (list: ClusterPhase[]) => {
      const aliases = list.map((row) => row.alias).filter(Boolean);
      const requested = parseRunPhasesOpt(initialPhases).filter((alias) =>
        aliases.includes(alias),
      );
      if (requested.length > 0) {
        setMode("selected");
        setSelected(requested);
        setExpanded(requested.slice(0, 1));
      } else {
        setMode("all");
        setSelected(aliases);
        setExpanded([]);
      }
      setSelectedTags({});
      setRootSsh(false);
      setDryRun(false);
      setExecutor("cluster default");
      setAdvanced(false);
      setPending(null);
    },
    [initialPhases],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setLoaded(false);
    setLoadError(null);
    void stargateJson<{ phases?: ClusterPhase[] }>(
      `/projects/${encodeURIComponent(projectId)}/atlas/cluster-yaml?${q}`,
    )
      .then((data) => {
        if (cancelled) {
          return;
        }
        const list = data.phases ?? [];
        setPhases(list);
        resetFromInitial(list);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setLoadError(err instanceof Error ? err.message : String(err));
        setLoaded(true);
      });
    void stargateJson<{ workers?: RawWorker[] }>("/admin/workers")
      .then((data) => {
        if (cancelled) {
          return;
        }
        const workers = data.workers ?? [];
        setWorkersTotal(workers.length);
        setWorkersOnline(workers.filter((row) => isWorkerOnline(row)).length);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setWorkersOnline(null);
        setWorkersTotal(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId, q, resetFromInitial]);

  const aliases = useMemo(
    () => phases.map((row) => row.alias).filter(Boolean),
    [phases],
  );

  const chosenPhases = mode === "all" ? aliases : selected;
  const chosenTags =
    mode === "all" ? [] : tagsForPhases(selectedTags, chosenPhases);
  const summary = runSummaryLabel({
    phaseCount: chosenPhases.length,
    tags: chosenTags,
  });
  const noWorkers =
    workersTotal !== null && workersOnline !== null && workersOnline === 0;
  const confirmDry = pending?.dryRun ?? dryRun;
  const canSubmit =
    loaded && !loadError && chosenPhases.length > 0 && !busy && canExecute;

  function togglePhase(alias: string) {
    setMode("selected");
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
    setMode("selected");
    setSelected((current) =>
      current.includes(alias) ? current : [...current, alias],
    );
    setSelectedTags((current) => {
      const list = current[alias] ?? [];
      const next = list.includes(tag)
        ? list.filter((item) => item !== tag)
        : [...list, tag];
      return { ...current, [alias]: next };
    });
  }

  function askRun() {
    const next: PendingRun = {
      all: mode === "all",
      phases: chosenPhases,
      tags: chosenTags,
      rootSsh,
      dryRun,
      executor,
    };
    if (!next.all && next.tags && next.tags.length > 0 && next.phases.length !== 1) {
      toast.error(TAGS_SINGLE_PHASE);
      return;
    }
    setPending(next);
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
      notifyExecution(
        "success",
        (next.dryRun ?? dryRun)
          ? "Dry run queued on worker"
          : "Run queued on worker",
        projectId,
        id,
      );
      setPending(null);
      onOpenChange(false);
      onQueued?.(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="flex max-h-[min(90vh,44rem)] min-h-0 w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
          style={{ maxWidth: "56.25rem", width: "min(56.25rem, calc(100vw - 2rem))" }}
          showCloseButton
        >
          <DialogHeader className="shrink-0 space-y-1 border-b border-border px-5 py-4 text-left">
            <DialogTitle>Run pipeline</DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {clusterId}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {loadError ? (
              <p className="font-mono text-sm text-destructive">{loadError}</p>
            ) : !loaded ? (
              <p className="text-sm text-muted-foreground">Loading phases…</p>
            ) : phases.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No phases in cluster.yaml. Add a phases list in Setup, then
                return here.
              </p>
            ) : (
              <div className="space-y-5">
                <RadioGroup
                  value={mode}
                  onValueChange={(value) => {
                    if (value === "all" || value === "selected") {
                      setMode(value);
                      if (value === "all") {
                        setSelected(aliases);
                      }
                    }
                  }}
                  className="flex flex-wrap gap-4"
                >
                  <Label className="font-normal">
                    <RadioGroupItem value="all" />
                    All phases
                  </Label>
                  <Label className="font-normal">
                    <RadioGroupItem value="selected" />
                    Selected phases
                  </Label>
                </RadioGroup>

                <ol className="space-y-2">
                  {phases.map((row, index) => {
                    const on = chosenPhases.includes(row.alias);
                    const openTags = expanded.includes(row.alias);
                    const tags = row.tags ?? [];
                    const picked = selectedTags[row.alias] ?? [];
                    return (
                      <li key={row.alias} className="rounded-lg border border-border">
                        <div className="flex items-start gap-3 px-3 py-2.5">
                          <Checkbox
                            checked={on}
                            aria-label={`Select ${row.alias}`}
                            className="mt-1"
                            onCheckedChange={() => togglePhase(row.alias)}
                          />
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            aria-expanded={openTags}
                            onClick={() => toggleExpand(row.alias)}
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span className="flex min-w-0 items-baseline gap-2">
                                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                                  {String(index + 1).padStart(2, "0")}
                                </span>
                                <span className="truncate text-sm font-medium">
                                  {row.alias}
                                </span>
                                {row.ref ? (
                                  <span className="truncate font-mono text-[11px] text-muted-foreground">
                                    {row.ref}
                                  </span>
                                ) : null}
                              </span>
                              <ChevronDown
                                className={cn(
                                  "size-4 shrink-0 text-muted-foreground transition-transform",
                                  openTags ? "rotate-180" : "rotate-0",
                                )}
                              />
                            </span>
                            {tags.length > 0 ? (
                              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                {tags.length} tag{tags.length === 1 ? "" : "s"}
                                {picked.length > 0
                                  ? ` · ${picked.length} selected`
                                  : ""}
                              </span>
                            ) : null}
                          </button>
                        </div>
                        {openTags ? (
                          <div className="border-t border-border px-3 py-2.5 pl-10">
                            {tags.length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                No tags in cluster.yaml
                              </p>
                            ) : (
                              <div className="grid gap-2 sm:grid-cols-2">
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
                      </li>
                    );
                  })}
                </ol>

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
                            <SelectItem value="cluster default">
                              cluster default
                            </SelectItem>
                            <SelectItem value="local">local</SelectItem>
                            <SelectItem value="docker">docker</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          cluster default uses execution.mode in cluster.yaml.
                          local runs ansible on the worker; docker runs the
                          clusterctl executor image.
                        </p>
                      </div>
                      <Label className="font-normal">
                        <Checkbox
                          checked={rootSsh}
                          disabled={!canRootSsh}
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

                {noWorkers ? (
                  <p className="text-sm text-warning">
                    No hub workers online. The run will stay queued until a
                    worker claims it.
                  </p>
                ) : null}
              </div>
            )}
          </div>

          <div className="shrink-0 px-5 pt-4 pb-4 empty:hidden">
            <RuntimePiecesAlert
              clusterId={clusterId}
              projectId={projectId}
              enabled={open}
            />
          </div>

          <DialogFooter className="mx-0 mb-0 shrink-0 flex-row items-center justify-between gap-3 rounded-none border-t border-border bg-transparent px-5 py-3 sm:justify-between">
            <p className="min-w-0 text-sm text-muted-foreground">{summary}</p>
            <Button type="button" disabled={!canSubmit} onClick={askRun}>
              <Play />
              {mode === "all" ? "Run pipeline" : "Run selected"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmAction
        open={pending != null}
        onOpenChange={(next) => {
          if (!next) {
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
    </>
  );
}
