"use client";

import { derivePhaseStates, type PhaseRunState } from "@/lib/phase-log";
import { cn } from "@/lib/utils";

const PENDING_CHIP = [
  "bg-chart-1/20 text-chart-1 hover:bg-chart-1/30",
  "bg-chart-2/20 text-chart-2 hover:bg-chart-2/30",
  "bg-chart-3/20 text-chart-3 hover:bg-chart-3/30",
  "bg-chart-5/20 text-chart-5 hover:bg-chart-5/30",
] as const;

const PENDING_DOT = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-5",
] as const;

const STATE_CLASS: Record<Exclude<PhaseRunState, "pending">, string> = {
  running: "animate-pulse bg-chart-1/35 text-chart-1 ring-2 ring-chart-1/70",
  ok: "bg-success/30 text-success",
  fail: "bg-destructive/30 text-destructive",
  skipped: "cursor-not-allowed text-muted-foreground line-through",
};

const DOT_CLASS: Record<Exclude<PhaseRunState, "pending">, string> = {
  running: "bg-chart-1",
  ok: "bg-success",
  fail: "bg-destructive",
  skipped: "bg-muted-foreground/30",
};

export function PhaseStepper({
  phases,
  skipped,
  log = "",
  exitCode = null,
  running = false,
  onSelect,
}: {
  phases: string[];
  skipped: Map<string, string>;
  log?: string;
  exitCode?: number | null;
  running?: boolean;
  onSelect: (phase: string) => void;
}) {
  if (phases.length === 0) {
    return null;
  }

  const states = derivePhaseStates({
    phases,
    skipped,
    log,
    exitCode,
    running,
  });

  return (
    <ol className="flex flex-wrap items-center gap-2">
      {phases.map((phase, index) => {
        const reason = skipped.get(phase);
        const state = states.get(phase) ?? (reason ? "skipped" : "pending");
        const chip =
          state === "pending"
            ? PENDING_CHIP[index % PENDING_CHIP.length]
            : STATE_CLASS[state];
        const dot =
          state === "pending"
            ? PENDING_DOT[index % PENDING_DOT.length]
            : DOT_CLASS[state];
        return (
          <li key={`${phase}-${index}`} className="flex items-center gap-1">
            {index > 0 ? (
              <span className="text-chart-1/50" aria-hidden>
                →
              </span>
            ) : null}
            <button
              type="button"
              title={reason ?? `run --phases ${phase}`}
              disabled={!!reason}
              onClick={() => onSelect(phase)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-sm transition-colors",
                chip,
              )}
            >
              <span
                aria-hidden
                className={cn("size-1.5 rounded-full", dot)}
              />
              {phase}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
