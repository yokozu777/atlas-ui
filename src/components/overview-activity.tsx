"use client";

import { MetaStatusBadge } from "@/components/status-badge";
import { Panel } from "@/components/panel";
import { StackList, StackListRow } from "@/components/stack-list";
import { Badge } from "@/components/ui/badge";
import {
  formatAge,
  formatDuration,
  metaString,
  runCommandLabel,
} from "@/lib/format-time";
import type { RunLogRow } from "@/lib/api";

function metaTags(meta: Record<string, unknown> | null): string | null {
  const value = meta?.tags;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function OverviewActivity({
  runs,
  onOpen,
}: {
  runs: RunLogRow[];
  onOpen: (stamp: string) => void;
}) {
  return (
    <Panel>
      <StackList>
        {runs.map((run) => {
          const tags = metaTags(run.meta);
          const started = metaString(run.meta, "started_at");
          const finished = metaString(run.meta, "finished_at");
          const duration = formatDuration(started, finished);
          const age = formatAge(started ?? run.stamp) ?? run.stamp;
          return (
            <StackListRow
              key={run.stamp}
              onClick={() => onOpen(run.stamp)}
              trailing={
                <span className="flex shrink-0 items-center gap-3">
                  {tags ? (
                    <Badge variant="outline" className="max-w-[10rem] truncate">
                      {tags}
                    </Badge>
                  ) : null}
                  {duration ? (
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {duration}
                    </span>
                  ) : null}
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {age}
                  </span>
                </span>
              }
            >
              <span className="flex items-center gap-3">
                <MetaStatusBadge meta={run.meta} />
                <span className="min-w-0 truncate font-medium">
                  {runCommandLabel(run.meta)}
                </span>
              </span>
            </StackListRow>
          );
        })}
      </StackList>
    </Panel>
  );
}
