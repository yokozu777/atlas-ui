"use client";

import { Play } from "lucide-react";

import type { ClusterPhase } from "@/lib/api";
import { isActiveExecutionStatus } from "@/lib/atlas-run";
import { cn } from "@/lib/utils";

export function OverviewPipeline({
  phases,
  liveAliases,
  liveStatus,
  onSelect,
}: {
  phases: ClusterPhase[];
  liveAliases?: string[];
  liveStatus?: string | null;
  onSelect: (alias: string) => void;
}) {
  if (phases.length === 0) {
    return (
      <p className="px-1 py-6 text-sm text-muted-foreground">
        No phases in cluster.yaml.
      </p>
    );
  }

  const live = isActiveExecutionStatus(liveStatus);
  const liveAll = live && (!liveAliases || liveAliases.length === 0);

  return (
    <ol className="flex min-w-0 items-stretch gap-0 overflow-x-auto pb-1">
      {phases.map((row, index) => {
        const phaseLive =
          live && (liveAll || Boolean(liveAliases?.includes(row.alias)));
        return (
          <li key={row.alias} className="flex min-w-0 items-stretch">
            {index > 0 ? (
              <span
                aria-hidden
                className="flex items-center px-1.5 text-muted-foreground"
              >
                →
              </span>
            ) : null}
            <button
              type="button"
              title={`Run phase ${row.alias}`}
              onClick={() => onSelect(row.alias)}
              className={cn(
                "flex w-[11.5rem] shrink-0 flex-col gap-1.5 rounded-xl border-t-2 bg-card px-3 py-3 text-left transition-colors hover:bg-white/5",
                phaseLive
                  ? "border-t-chart-1 ring-1 ring-chart-1/40"
                  : "border-t-chart-2",
              )}
              data-slot="panel"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {phaseLive ? (
                  <span className="text-[10px] font-medium tracking-wide text-chart-1 uppercase">
                    {liveStatus === "QUEUED" ? "queued" : "running"}
                  </span>
                ) : null}
              </span>
              <span className="truncate font-display text-sm font-medium tracking-tight">
                {row.alias}
              </span>
              {row.ref ? (
                <span className="truncate font-mono text-[11px] text-muted-foreground">
                  {row.ref}
                </span>
              ) : null}
              <span className="mt-auto inline-flex items-center gap-1 pt-1 text-[11px] text-muted-foreground">
                <Play className="size-3" />
                Run phase
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
