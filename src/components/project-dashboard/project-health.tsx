"use client";

import { Panel } from "@/components/panel";
import { StackList, StackListRow } from "@/components/stack-list";
import type { DashboardHealth, HealthHint } from "@/lib/project-dashboard";
import { cn } from "@/lib/utils";

const HINT: Record<HealthHint, { mark: string; className: string }> = {
  ok: { mark: "✓", className: "text-success" },
  warn: { mark: "⚠", className: "text-warning" },
  fail: { mark: "✕", className: "text-destructive" },
};

export function ProjectHealth({ health }: { health: DashboardHealth }) {
  return (
    <Panel>
      <div className="flex items-center justify-between border-b border-foreground/10 px-4 py-3">
        <h2 className="text-sm font-medium">Project Health</h2>
        <span className="text-sm tabular-nums text-muted-foreground">
          {health.score}%
        </span>
      </div>
      <div className="px-4 pt-3">
        <div
          role="progressbar"
          aria-label="Project health"
          aria-valuenow={health.score}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-foreground transition-none"
            style={{ width: `${Math.min(100, Math.max(0, health.score))}%` }}
          />
        </div>
      </div>
      <StackList>
        {health.rows.map((row) => {
          const hint = HINT[row.hint];
          return (
            <StackListRow
              key={row.key}
              className="py-2.5"
              title={
                <span className="font-normal text-muted-foreground">
                  {row.label}
                </span>
              }
              trailing={
                <span className="flex items-center gap-3 text-[13px]">
                  <span className="truncate tabular-nums text-foreground">
                    {row.value}
                  </span>
                  <span
                    className={cn("w-4 shrink-0 text-center", hint.className)}
                    aria-label={row.hint}
                  >
                    {hint.mark}
                  </span>
                </span>
              }
            />
          );
        })}
      </StackList>
    </Panel>
  );
}
