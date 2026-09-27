"use client";

import { Check, Circle, Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";

export type JobStepState = "pending" | "running" | "ok" | "fail";

export type JobStep = {
  id: string;
  label: string;
  detail?: string;
  state: JobStepState;
};

function StepIcon({ state }: { state: JobStepState }) {
  if (state === "ok") {
    return <Check className="size-4 text-success" />;
  }
  if (state === "fail") {
    return <X className="size-4 text-destructive" />;
  }
  if (state === "running") {
    return <Loader2 className="size-4 animate-spin text-chart-1" />;
  }
  return <Circle className="size-3.5 text-muted-foreground" />;
}

export function JobProgress({
  steps,
  currentLabel,
  selectedId,
  onSelect,
}: {
  steps: JobStep[];
  currentLabel?: string;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const total = Math.max(steps.length, 1);
  const done = steps.filter((step) => step.state === "ok").length;
  const runningIndex = steps.findIndex((step) => step.state === "running");
  const failIndex = steps.findIndex((step) => step.state === "fail");
  const current =
    runningIndex >= 0
      ? runningIndex + 1
      : failIndex >= 0
        ? failIndex + 1
        : Math.min(done, total);
  const pct = Math.min(
    100,
    Math.round(((done + (runningIndex >= 0 ? 0.45 : 0)) / total) * 100),
  );
  const running = steps.find((step) => step.state === "running");
  const failed = failIndex >= 0 ? steps[failIndex] : null;
  const label =
    currentLabel || running?.label || failed?.label || (done === total ? "Done" : "Waiting…");

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">{label}</span>
          <span className="shrink-0 tabular-nums">
            {current} / {total}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300",
              failIndex >= 0 ? "bg-destructive" : "bg-chart-1",
            )}
            style={{ width: `${Math.max(pct, done === 0 && runningIndex < 0 ? 4 : pct)}%` }}
          />
        </div>
      </div>
      <ol className="space-y-2 text-sm">
        {steps.map((step) => {
          const phase = step.id.startsWith("phase:");
          const selected = selectedId === step.id;
          const className = cn(
            "flex w-full items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-left",
            step.state === "running" && "ring-1 ring-chart-1/40",
            step.state === "fail" && "ring-1 ring-destructive/40",
            selected && "ring-1 ring-foreground/40",
          );
          const body = (
            <>
              <span
                className={cn(
                  "mt-0.5 shrink-0",
                  step.state === "running" && "animate-pulse",
                )}
              >
                <StepIcon state={step.state} />
              </span>
              <div className="min-w-0">
                <div className="font-medium">{step.label}</div>
                {step.detail ? (
                  <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
                    {step.detail}
                  </div>
                ) : null}
              </div>
            </>
          );
          if (phase && onSelect) {
            return (
              <li key={step.id}>
                <button type="button" className={className} onClick={() => onSelect(step.id)}>
                  {body}
                </button>
              </li>
            );
          }
          return (
            <li key={step.id} className={className}>
              {body}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
