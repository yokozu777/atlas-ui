"use client";

import { derivePhaseStates, type PhaseRunState } from "@/lib/phase-log";
import { cn } from "@/lib/utils";

const TILE_EDGE: Record<PhaseRunState, string> = {
  pending: "border-t-chart-1",
  running: "border-t-chart-1 animate-pulse",
  ok: "border-t-success",
  fail: "border-t-destructive",
  skipped: "border-t-muted-foreground/40",
};

const TILE_INDEX: Record<PhaseRunState, string> = {
  pending: "text-chart-1",
  running: "text-chart-1",
  ok: "text-success",
  fail: "text-destructive",
  skipped: "text-muted-foreground",
};

const PENDING_EDGE = [
  "border-t-chart-1",
  "border-t-chart-2",
  "border-t-chart-3",
  "border-t-chart-5",
] as const;

const PENDING_INDEX = [
  "text-chart-1",
  "text-chart-2",
  "text-chart-3",
  "text-chart-5",
] as const;

function splitPhaseRef(ref: string): { repo: string; entry: string } {
  const slash = ref.lastIndexOf("/");
  if (slash <= 0) {
    return { repo: "", entry: ref };
  }
  return { repo: ref.slice(0, slash), entry: ref.slice(slash + 1) };
}

export function OverviewPipeline({
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
    return (
      <p className="px-4 py-8 text-sm text-muted-foreground">No phases in plan.</p>
    );
  }

  const states = derivePhaseStates({
    phases,
    skipped,
    log,
    exitCode,
    running,
  });

  return (
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
      {phases.map((phase, index) => {
        const reason = skipped.get(phase);
        const state = states.get(phase) ?? (reason ? "skipped" : "pending");
        const { repo, entry } = splitPhaseRef(phase);
        const pendingCycle = index % PENDING_EDGE.length;
        const edge =
          state === "pending" ? PENDING_EDGE[pendingCycle] : TILE_EDGE[state];
        const indexClass =
          state === "pending" ? PENDING_INDEX[pendingCycle] : TILE_INDEX[state];
        return (
          <li key={`${phase}-${index}`}>
            <button
              type="button"
              title={reason ?? `run --phases ${phase}`}
              disabled={!!reason}
              onClick={() => onSelect(phase)}
              className={cn(
                "flex h-full w-full flex-col gap-2 rounded-xl border-t-2 bg-card px-4 py-4 text-left transition-colors",
                edge,
                reason
                  ? "cursor-not-allowed opacity-50"
                  : "hover:bg-white/5",
              )}
              data-slot="panel"
            >
              <span
                className={cn(
                  "font-mono text-xs tabular-nums",
                  indexClass,
                )}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="font-display text-base font-medium tracking-tight">
                {entry}
              </span>
              {repo ? (
                <span className="font-mono text-xs text-muted-foreground">
                  {repo}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
