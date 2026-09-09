"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ListRange, VirtuosoHandle } from "react-virtuoso";
import { toast } from "sonner";

import { LogToolbar } from "@/components/execution-log/log-toolbar";
import { NewLinesIndicator } from "@/components/execution-log/new-lines-indicator";
import { VirtualizedLogList } from "@/components/execution-log/virtualized-log-list";
import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  joinPlainLines,
  lineMatchesFilter,
  type LogCounts,
  type LogFilter,
  type ParsedLogLine,
} from "@/lib/execution-log";
import { cn } from "@/lib/utils";

export type LogPaneActions = {
  onCopyAll: () => void;
  onCopyVisible: () => void;
  onDownload: () => void;
};

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

export function LogPane({
  lines,
  counts,
  errorIndexes,
  running,
  ready = true,
  error = null,
  onRetry,
  downloadName = "log.txt",
  compact = false,
  fill = false,
  framed = true,
  className,
  emptyLabel = "No execution output yet",
  errorTitle = "Failed to load execution logs",
  header,
}: {
  lines: ParsedLogLine[];
  counts: LogCounts;
  errorIndexes: number[];
  running: boolean;
  ready?: boolean;
  error?: string | null;
  onRetry?: () => void;
  downloadName?: string;
  compact?: boolean;
  fill?: boolean;
  framed?: boolean;
  className?: string;
  emptyLabel?: string;
  errorTitle?: string;
  header?: (actions: LogPaneActions) => ReactNode;
}) {
  const [filter, setFilter] = useState<LogFilter>("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [atBottom, setAtBottom] = useState(true);
  const follow = atBottom;
  const [wrap, setWrap] = useState(false);
  const [matchCursor, setMatchCursor] = useState(0);
  const [errorCursor, setErrorCursor] = useState(-1);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [newLines, setNewLines] = useState(0);
  const [range, setRange] = useState<ListRange>({ startIndex: 0, endIndex: 0 });

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const pendingScrollId = useRef<number | null>(null);
  const prevLen = useRef(0);
  const scannedForQuery = useRef(0);
  const queryKey = useRef("");
  const matchesRef = useRef<number[]>([]);
  const [matches, setMatches] = useState<number[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (debouncedQuery !== queryKey.current) {
      queryKey.current = debouncedQuery;
      scannedForQuery.current = 0;
      matchesRef.current = [];
      if (!debouncedQuery) {
        setMatches([]);
        setMatchCursor(0);
        return;
      }
    }
    if (!debouncedQuery) {
      return;
    }
    const needle = debouncedQuery.toLowerCase();
    const start = scannedForQuery.current;
    if (start >= lines.length) {
      return;
    }
    const extra: number[] = [];
    for (let i = start; i < lines.length; i += 1) {
      if (lines[i].plain.toLowerCase().includes(needle)) {
        extra.push(i);
      }
    }
    scannedForQuery.current = lines.length;
    matchesRef.current =
      start === 0 ? extra : matchesRef.current.concat(extra);
    setMatches(matchesRef.current);
    setMatchCursor((cursor) =>
      matchesRef.current.length === 0
        ? 0
        : Math.min(cursor, matchesRef.current.length - 1),
    );
  }, [debouncedQuery, lines, lines.length]);

  const view = useMemo(
    () => lines.filter((line) => lineMatchesFilter(line, filter)),
    [lines, filter],
  );

  useEffect(() => {
    const delta = lines.length - prevLen.current;
    prevLen.current = lines.length;
    if (!atBottom && delta > 0) {
      setNewLines((count) => count + delta);
    }
  }, [lines.length, atBottom]);

  useEffect(() => {
    if (atBottom) {
      setNewLines(0);
    }
  }, [atBottom]);

  const scrollToLineId = useCallback(
    (lineId: number) => {
      const index = view.findIndex((line) => line.id === lineId);
      setHighlightedId(lineId);
      window.setTimeout(() => {
        setHighlightedId((current) => (current === lineId ? null : current));
      }, 1200);
      if (index >= 0) {
        virtuosoRef.current?.scrollToIndex({
          index,
          align: "center",
          behavior: "smooth",
        });
        return;
      }
      pendingScrollId.current = lineId;
      setFilter("all");
    },
    [view],
  );

  useEffect(() => {
    if (pendingScrollId.current == null) {
      return;
    }
    const index = view.findIndex((line) => line.id === pendingScrollId.current);
    if (index >= 0) {
      virtuosoRef.current?.scrollToIndex({
        index,
        align: "center",
        behavior: "smooth",
      });
      pendingScrollId.current = null;
    }
  }, [view]);

  const goToMatch = useCallback(
    (next: number) => {
      if (matches.length === 0) {
        return;
      }
      const cursor = (next + matches.length) % matches.length;
      setMatchCursor(cursor);
      const line = lines[matches[cursor]];
      if (line) {
        setAtBottom(false);
        scrollToLineId(line.id);
      }
    },
    [lines, matches, scrollToLineId],
  );

  const goToError = useCallback(
    (direction: 1 | -1) => {
      if (errorIndexes.length === 0) {
        return;
      }
      const next =
        errorCursor < 0
          ? direction === 1
            ? 0
            : errorIndexes.length - 1
          : (errorCursor + direction + errorIndexes.length) %
            errorIndexes.length;
      setErrorCursor(next);
      const line = lines[errorIndexes[next]];
      if (line) {
        setAtBottom(false);
        scrollToLineId(line.id);
      }
    },
    [errorCursor, errorIndexes, lines, scrollToLineId],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const visibleLines = useCallback((): ParsedLogLine[] => {
    if (view.length === 0) {
      return [];
    }
    const start = Math.max(0, range.startIndex);
    const end = Math.min(view.length, range.endIndex + 1);
    return view.slice(start, end);
  }, [range.endIndex, range.startIndex, view]);

  const onCopyAll = useCallback(() => {
    void copyText(joinPlainLines(lines))
      .then(() => toast.success("Copied log"))
      .catch(() => toast.error("Copy failed"));
  }, [lines]);

  const onCopyVisible = useCallback(() => {
    void copyText(joinPlainLines(visibleLines()))
      .then(() => toast.success("Copied visible lines"))
      .catch(() => toast.error("Copy failed"));
  }, [visibleLines]);

  const onDownload = useCallback(() => {
    downloadLog(downloadName, joinPlainLines(lines));
  }, [downloadName, lines]);

  const enableFollow = useCallback(() => {
    setAtBottom(true);
    if (view.length > 0) {
      virtuosoRef.current?.scrollToIndex({
        index: view.length - 1,
        align: "end",
      });
    }
  }, [view.length]);

  const actions: LogPaneActions = {
    onCopyAll,
    onCopyVisible,
    onDownload,
  };

  const currentMatchLineId =
    matches.length > 0 ? (lines[matches[matchCursor]]?.id ?? null) : null;

  const showSkeleton = !ready && !error && lines.length === 0;
  const showEmpty = ready && !error && lines.length === 0 && !running;
  const waitingLive = ready && running && lines.length === 0;

  const list = (
    <>
      <LogToolbar
        query={query}
        onQueryChange={setQuery}
        searchRef={searchRef}
        matchIndex={matchCursor}
        matchCount={matches.length}
        onPrevMatch={() => goToMatch(matchCursor - 1)}
        onNextMatch={() => goToMatch(matchCursor + 1)}
        filter={filter}
        onFilterChange={setFilter}
        counts={counts}
        follow={follow}
        onFollowChange={(value) => {
          if (value) {
            enableFollow();
          } else {
            setAtBottom(false);
          }
        }}
        wrap={wrap}
        onWrapChange={setWrap}
        onPrevError={() => goToError(-1)}
        onNextError={() => goToError(1)}
        errorCount={errorIndexes.length}
        onCopyAll={onCopyAll}
        onCopyVisible={onCopyVisible}
        onDownload={onDownload}
      />
      <div
        className={cn(
          "relative overflow-hidden",
          compact
            ? "h-40 shrink-0"
            : fill
              ? "min-h-0 flex-1"
              : "h-[min(60vh,32rem)] min-h-[240px] shrink-0",
        )}
      >
        {showSkeleton ? (
          <div className="space-y-2 p-4" data-slot="log-loading">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        ) : error && lines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm font-medium">{errorTitle}</p>
            <p className="max-w-sm text-xs text-muted-foreground">{error}</p>
            {onRetry ? (
              <Button type="button" size="sm" variant="outline" onClick={onRetry}>
                Retry
              </Button>
            ) : null}
          </div>
        ) : showEmpty || waitingLive ? (
          <div className="flex h-full items-center justify-center p-6">
            <p className="text-sm text-muted-foreground">{emptyLabel}</p>
          </div>
        ) : view.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <p className="text-sm text-muted-foreground">
              No lines match this filter
            </p>
          </div>
        ) : (
          <VirtualizedLogList
            ref={virtuosoRef}
            lines={view}
            wrap={wrap}
            follow={follow}
            query={debouncedQuery}
            currentMatchLineId={currentMatchLineId}
            highlightedId={highlightedId}
            onAtBottomChange={setAtBottom}
            onRangeChanged={setRange}
          />
        )}
        <NewLinesIndicator count={newLines} onClick={enableFollow} />
      </div>
      {error && lines.length > 0 ? (
        <div className="flex items-center justify-between gap-2 border-t border-foreground/10 px-3 py-2 text-xs text-destructive">
          <span>{error}</span>
          {onRetry ? (
            <Button type="button" size="xs" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );

  const pane = framed ? (
    <Panel
      data-slot="log-pane"
      className={cn(
        "relative flex min-h-0 flex-col",
        compact || !fill ? "shrink-0" : "flex-1",
        className,
      )}
    >
      {list}
    </Panel>
  ) : (
    <div
      data-slot="log-pane"
      className={cn(
        "relative flex min-h-0 flex-col",
        compact || !fill ? "shrink-0" : "flex-1",
        className,
      )}
    >
      {list}
    </div>
  );

  if (!header) {
    return pane;
  }

  return (
    <div
      data-slot="execution-log-viewer"
      className="flex min-h-0 flex-1 flex-col"
    >
      {header(actions)}
      {pane}
    </div>
  );
}
