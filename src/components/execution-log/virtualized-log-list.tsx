"use client";

import { forwardRef, useMemo } from "react";
import { Virtuoso, type ListRange, type VirtuosoHandle } from "react-virtuoso";

import { LogLine } from "@/components/execution-log/log-line";
import type { ParsedLogLine } from "@/lib/execution-log";
import { cn } from "@/lib/utils";

const Scroller = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { wrap?: boolean }
>(function LogScroller({ className, wrap, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="log-scroller"
      className={cn("h-full", wrap ? "overflow-y-auto" : "overflow-auto", className)}
      {...props}
    />
  );
});

export const VirtualizedLogList = forwardRef<
  VirtuosoHandle,
  {
    lines: ParsedLogLine[];
    wrap: boolean;
    follow: boolean;
    query: string;
    currentMatchLineId: number | null;
    highlightedId: number | null;
    onAtBottomChange: (atBottom: boolean) => void;
    onRangeChanged: (range: ListRange) => void;
  }
>(function VirtualizedLogList(
  {
    lines,
    wrap,
    follow,
    query,
    currentMatchLineId,
    highlightedId,
    onAtBottomChange,
    onRangeChanged,
  },
  ref,
) {
  const scroller = useMemo(
    () =>
      forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
        function BoundScroller(props, scrollerRef) {
          return <Scroller ref={scrollerRef} wrap={wrap} {...props} />;
        },
      ),
    [wrap],
  );

  return (
    <Virtuoso
      ref={ref}
      data={lines}
      className="h-full"
      style={{ height: "100%" }}
      computeItemKey={(_, line) => line.id}
      defaultItemHeight={22}
      increaseViewportBy={240}
      followOutput={follow ? "auto" : false}
      atBottomThreshold={64}
      atBottomStateChange={onAtBottomChange}
      rangeChanged={onRangeChanged}
      components={{ Scroller: scroller }}
      itemContent={(_index, line) => (
        <LogLine
          line={line}
          wrap={wrap}
          query={query}
          isCurrentMatch={currentMatchLineId === line.id}
          highlighted={highlightedId === line.id}
        />
      )}
    />
  );
});
