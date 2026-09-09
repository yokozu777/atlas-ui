"use client";

import { useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ServerLogEntry = {
  service: string;
  raw: string;
  timestamp?: string | null;
  level: string;
  message: string;
  line_number?: number;
};

function entryKey(row: ServerLogEntry, index: number): string {
  return `${row.service}-${row.line_number ?? "x"}-${row.timestamp ?? ""}-${index}`;
}

function sameEntry(a: ServerLogEntry | null, b: ServerLogEntry): boolean {
  if (!a) {
    return false;
  }
  return (
    a.service === b.service &&
    a.line_number === b.line_number &&
    a.timestamp === b.timestamp &&
    a.raw === b.raw
  );
}

export function ServerLogsList({
  logs,
  selected,
  follow,
  busy = false,
  onSelect,
}: {
  logs: ServerLogEntry[];
  selected: ServerLogEntry | null;
  follow: boolean;
  busy?: boolean;
  onSelect: (row: ServerLogEntry) => void;
}) {
  const [atBottom, setAtBottom] = useState(true);

  return (
    <Panel
      data-slot="server-logs-list"
      className="flex h-[70vh] min-h-0 flex-col lg:col-span-2"
    >
      {logs.length === 0 ? (
        <div className="p-6">
          <EmptyState
            title={busy ? "Loading logs" : "No log lines"}
          />
        </div>
      ) : (
        <Virtuoso
          data={logs}
          className="h-full"
          data-slot="log-scroller"
          computeItemKey={(index, row) => entryKey(row, index)}
          defaultItemHeight={36}
          increaseViewportBy={240}
          followOutput={follow && atBottom ? "auto" : false}
          atBottomThreshold={64}
          atBottomStateChange={setAtBottom}
          itemContent={(_index, row) => (
            <Button
              type="button"
              variant="ghost"
              data-slot="server-log-line"
              className={cn(
                "h-auto w-full justify-start gap-3 rounded-none border-b border-foreground/5 px-3 py-2 font-mono text-xs font-normal",
                sameEntry(selected, row) && "bg-white/5",
              )}
              onClick={() => {
                onSelect(row);
                toast.dismiss();
              }}
            >
              <span className="w-36 shrink-0 text-muted-foreground">
                {row.timestamp ?? "—"}
              </span>
              <span className="w-14 shrink-0">{row.service}</span>
              <span className="w-16 shrink-0">{row.level}</span>
              <span className="min-w-0 truncate">{row.message}</span>
            </Button>
          )}
        />
      )}
    </Panel>
  );
}
