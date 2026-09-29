"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { ExecutionHeader } from "@/components/execution-log/execution-header";
import { LogPane } from "@/components/execution-log/log-pane";
import { JobProgress } from "@/components/job-progress";
import { Button } from "@/components/ui/button";
import { useExecutionLog } from "@/hooks/use-execution-log";
import { useExecutionRecord } from "@/hooks/use-execution-record";
import {
  atlasRunProgress,
  logCountsFor,
  logErrorIndexes,
  logPhaseSlices,
  phasesFromRunParams,
} from "@/lib/atlas-run-progress";
import { joinPlainLines } from "@/lib/execution-log";
import { cn } from "@/lib/utils";

function useNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);
  return now;
}

function copyText(value: string) {
  return navigator.clipboard.writeText(value);
}

function downloadLog(filename: string, body: string) {
  const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export function ExecutionLogViewer({
  projectId,
  executionId,
}: {
  projectId: string;
  executionId: string;
}) {
  const log = useExecutionLog(projectId, executionId);
  const record = useExecutionRecord(projectId, executionId, log.status);
  const active = Boolean(log.running);
  const now = useNow(active);
  const status = log.status || record.record?.status || null;
  const failed = status === "FAILED";
  const phaseFromUrl = useSearchParams()?.get("phase") ?? null;
  const [logOpen, setLogOpen] = useState<boolean | null>(null);
  const [userPhase, setUserPhase] = useState<string | null>(null);
  const slices = useMemo(() => logPhaseSlices(log.lines), [log.lines]);
  const phaseNames = useMemo(() => {
    if (slices.length > 0) {
      return slices.map((slice) => slice.label);
    }
    return phasesFromRunParams(record.record?.runParams);
  }, [record.record?.runParams, slices]);
  const progress = useMemo(
    () => atlasRunProgress({ status, lines: log.lines, phases: phaseNames }),
    [log.lines, phaseNames, status],
  );
  const failedPhase = progress.steps.find(
    (step) => step.state === "fail" && step.id.startsWith("phase:"),
  );
  const failedLabel = failedPhase ? failedPhase.id.slice("phase:".length) : null;

  const pickedPhase = userPhase ?? phaseFromUrl ?? (failed ? failedLabel : null);
  const showLog = logOpen ?? (failed || Boolean(phaseFromUrl));

  const visibleLines = useMemo(() => {
    if (!pickedPhase) {
      return log.lines;
    }
    return (
      slices.find((slice) => slice.label === pickedPhase)?.lines ?? log.lines
    );
  }, [log.lines, pickedPhase, slices]);
  const fullBody = joinPlainLines(log.lines);
  const body = joinPlainLines(visibleLines);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <ExecutionHeader
        projectId={projectId}
        executionId={executionId}
        record={record.record}
        loading={record.loading}
        liveStatus={log.status}
        now={now}
        onCopyAll={() => {
          void copyText(fullBody)
            .then(() => toast.success("Copied log"))
            .catch(() => toast.error("Copy failed"));
        }}
        onCopyVisible={() => {
          void copyText(body)
            .then(() => toast.success("Copied log"))
            .catch(() => toast.error("Copy failed"));
        }}
        onDownload={() => downloadLog(`${executionId}.log`, fullBody)}
      />
      <JobProgress
        steps={progress.steps}
        currentLabel={progress.currentLabel}
        selectedId={pickedPhase ? `phase:${pickedPhase}` : null}
        onSelect={(id) => {
          if (!id.startsWith("phase:")) {
            return;
          }
          setUserPhase(id.slice("phase:".length));
          setLogOpen(true);
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        aria-expanded={showLog}
        onClick={() => setLogOpen((open) => !(open ?? showLog))}
      >
        {showLog ? "Hide log" : "Show log"}
        <ChevronDown
          className={cn(
            "size-4 transition-transform",
            showLog ? "rotate-180" : "rotate-0",
          )}
        />
      </Button>
      {showLog ? (
        <LogPane
          key={pickedPhase ?? "all"}
          lines={visibleLines}
          counts={logCountsFor(visibleLines)}
          errorIndexes={logErrorIndexes(visibleLines)}
          running={log.running}
          ready={log.ready}
          fill
          error={log.error}
          onRetry={log.retry}
          downloadName={`${executionId}.log`}
        />
      ) : null}
    </div>
  );
}
