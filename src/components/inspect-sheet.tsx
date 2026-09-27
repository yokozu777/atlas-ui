"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Flame, ListTree, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { JsonBlock } from "@/components/json-block";
import { StackList, StackListRow } from "@/components/stack-list";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { runClusterctl } from "@/lib/api";
import type { PlanJson, SmokeJson, ValidateJson } from "@/lib/cluster-types";
import { parseJobJson } from "@/lib/job-output";

export type InspectKind = "plan" | "validate" | "smoke";

const INSPECT_META: Record<
  InspectKind,
  { title: string; icon: ReactNode }
> = {
  plan: { title: "Plan", icon: <ListTree className="size-4" /> },
  validate: { title: "Validate", icon: <ShieldCheck className="size-4" /> },
  smoke: { title: "Smoke", icon: <Flame className="size-4" /> },
};

function argvFor(kind: InspectKind): string[] {
  return [kind, "--json"];
}

function PlanView({ data }: { data: PlanJson }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <span className="text-muted-foreground">phases</span>
        <span className="font-mono">{(data.phases ?? []).join(" → ") || "—"}</span>
        <span className="text-muted-foreground">invocations</span>
        <span className="font-mono">{data.invocation_count ?? "—"}</span>
        <span className="text-muted-foreground">execution</span>
        <span className="font-mono">{data.execution ?? "—"}</span>
        <span className="text-muted-foreground">inventory</span>
        <span className="font-mono break-all">{data.inventory ?? "—"}</span>
      </div>
      {(data.filter_skipped ?? []).length > 0 ? (
        <div>
          <p className="mb-1 text-muted-foreground">skipped</p>
          <StackList>
            {(data.filter_skipped ?? []).map((item) => (
              <StackListRow
                key={item.phase_ref}
                className="px-0 py-1"
                title={
                  <span className="font-mono text-xs font-normal">
                    {item.phase_ref}
                  </span>
                }
                description={item.reason}
              />
            ))}
          </StackList>
        </div>
      ) : null}
      {(data.stage_details ?? []).length > 0 ? (
        <StackList>
          {(data.stage_details ?? []).map((stage) => (
            <StackListRow
              key={stage.phase_ref}
              className="px-0 py-1"
              title={
                <span className="font-mono text-xs font-normal">
                  {stage.phase_ref}
                </span>
              }
              description={`${stage.repo_name}/${stage.entry_name} ×${stage.invocation_count}`}
            />
          ))}
        </StackList>
      ) : null}
    </div>
  );
}

function ValidateView({ data }: { data: ValidateJson }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div>
        {data.ok ? <StatusBadge status="ok" /> : <StatusBadge status="fail" />}
      </div>
      {(data.reports ?? []).map((report) => (
        <div key={report.cluster_id} className="space-y-1">
          <p className="font-mono">
            {report.cluster_id}{" "}
            <span className="text-muted-foreground">
              {report.errors} error(s), {report.warnings} warning(s)
            </span>
          </p>
          {(report.issues ?? []).map((issue, index) => (
            <p key={index} className="text-xs">
              <span className="font-mono text-muted-foreground">
                {issue.severity ?? "issue"}
              </span>{" "}
              {issue.path ? (
                <span className="font-mono">{issue.path} </span>
              ) : null}
              {issue.message ?? issue.code ?? ""}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

function SmokeView({ data }: { data: SmokeJson }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div>
        {data.ok ? <StatusBadge status="ok" /> : <StatusBadge status="fail" />}
      </div>
      {(data.results ?? []).map((result) => (
        <div key={result.cluster_id} className="space-y-1">
          <p className="font-mono">{result.cluster_id}</p>
          <p className="text-xs text-muted-foreground">
            validate {result.validate_ok ? "ok" : "fail"}
            {result.smoke
              ? ` · plan ${result.smoke.plan_ok ? "ok" : "fail"}`
              : ""}
          </p>
          {result.smoke?.error ? (
            <p className="text-xs text-destructive">{result.smoke.error}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function InspectSheet({
  clusterId,
  kind,
  onOpenChange,
}: {
  clusterId: string;
  kind: InspectKind | null;
  onOpenChange: (open: boolean) => void;
}) {
  const lastKind = useRef<InspectKind | null>(kind);
  if (kind) lastKind.current = kind;
  const displayKind = kind ?? lastKind.current;
  const meta = displayKind ? INSPECT_META[displayKind] : null;
  return (
    <Dialog open={kind !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] min-h-0 w-full flex-col overflow-hidden sm:max-w-3xl bg-[var(--color-panel-solid,#1c1c1f)] [backdrop-filter:none] [-webkit-backdrop-filter:none]">
        <DialogHeader className="pr-8">
          <DialogTitle className="flex items-center gap-2">
            {meta?.icon}
            {meta?.title ?? "Inspect"}
          </DialogTitle>
          <DialogDescription className="font-mono">
            {clusterId}
            {displayKind ? ` · ./cluster ${displayKind} --json` : ""}
          </DialogDescription>
        </DialogHeader>
        {kind ? (
          <InspectBody
            key={kind}
            clusterId={clusterId}
            kind={kind}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function InspectBody({
  clusterId,
  kind,
  onClose,
}: {
  clusterId: string;
  kind: InspectKind;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<unknown>(null);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void runClusterctl({ argv: argvFor(kind), clusterId, wait: true })
      .then((job) => {
        if (cancelled) return;
        if (!job.log) {
          setError("empty output");
          return;
        }
        try {
          setRaw(parseJobJson(job.log));
        } catch {
          setError(job.log);
        }
        if (job.exitCode && job.exitCode !== 0) {
          toast.error(`${kind} exit ${job.exitCode}`);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, clusterId]);

  return (
    <>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {busy ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error ? (
          <p className="font-mono text-xs whitespace-pre-wrap text-destructive">
            {error}
          </p>
        ) : kind === "plan" && raw ? (
          <PlanView data={raw as PlanJson} />
        ) : kind === "validate" && raw ? (
          <ValidateView data={raw as ValidateJson} />
        ) : kind === "smoke" && raw ? (
          <SmokeView data={raw as SmokeJson} />
        ) : null}
        {showRaw && raw ? <JsonBlock value={raw} /> : null}
      </div>
      <DialogFooter className="sm:justify-between">
        {raw ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowRaw((value) => !value)}
          >
            {showRaw ? "Hide JSON" : "Raw JSON"}
          </Button>
        ) : (
          <span />
        )}
        <Button type="button" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </>
  );
}
