"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { JsonBlock } from "@/components/json-block";
import { StackList, StackListRow } from "@/components/stack-list";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { runClusterctl } from "@/lib/api";
import type { PlanJson, SmokeJson, ValidateJson } from "@/lib/cluster-types";
import { parseJobJson } from "@/lib/job-output";

export type InspectKind = "plan" | "validate" | "smoke";

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
  return (
    <Sheet open={kind !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl" showCloseButton>
        <SheetHeader>
          <SheetTitle className="font-display font-mono">
            {kind ? `./cluster ${kind} --json` : "inspect"}
          </SheetTitle>
          <SheetDescription className="font-mono text-xs">
            {clusterId}
          </SheetDescription>
        </SheetHeader>
        {kind ? (
          <InspectBody key={kind} clusterId={clusterId} kind={kind} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function InspectBody({
  clusterId,
  kind,
}: {
  clusterId: string;
  kind: InspectKind;
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
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
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
      {raw ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowRaw((value) => !value)}
          >
            {showRaw ? "Hide JSON" : "Raw JSON"}
          </Button>
          {showRaw ? <JsonBlock value={raw} /> : null}
        </div>
      ) : null}
    </div>
  );
}
