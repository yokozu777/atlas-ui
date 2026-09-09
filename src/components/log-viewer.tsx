"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { LogPane } from "@/components/execution-log/log-pane";
import { Button } from "@/components/ui/button";
import { cancelJob } from "@/lib/api";
import {
  addCounts,
  appendParsedLines,
  consumeLogChunk,
  emptyLogCounts,
  type LogCounts,
  type ParsedLogLine,
} from "@/lib/execution-log";
import { cn } from "@/lib/utils";

function parseLogText(value: string): {
  lines: ParsedLogLine[];
  counts: LogCounts;
  errorIndexes: number[];
} {
  if (!value) {
    return {
      lines: [],
      counts: emptyLogCounts(),
      errorIndexes: [],
    };
  }
  const consumed = consumeLogChunk("", value);
  const raw = consumed.rest
    ? consumed.lines.concat(consumed.rest)
    : consumed.lines;
  const next = appendParsedLines([], raw);
  const errorIndexes: number[] = [];
  for (const line of next.added) {
    if (line.severity === "error") {
      errorIndexes.push(line.id - 1);
    }
  }
  return {
    lines: next.lines,
    counts: addCounts(emptyLogCounts(), next.added),
    errorIndexes,
  };
}

function useParsedLogText(
  value: string,
  running: boolean,
): {
  lines: ParsedLogLine[];
  counts: LogCounts;
  errorIndexes: number[];
} {
  const staticParsed = useMemo(() => parseLogText(value), [value]);
  const [live, setLive] = useState(staticParsed);
  const prevRef = useRef(running ? value : "");
  const bufferRef = useRef("");
  const linesRef = useRef<ParsedLogLine[]>(running ? staticParsed.lines : []);
  const countsRef = useRef<LogCounts>(
    running ? staticParsed.counts : emptyLogCounts(),
  );
  const errorsRef = useRef<number[]>(
    running ? staticParsed.errorIndexes : [],
  );

  useEffect(() => {
    if (!running) {
      prevRef.current = "";
      bufferRef.current = "";
      linesRef.current = [];
      countsRef.current = emptyLogCounts();
      errorsRef.current = [];
      return;
    }

    function commit(nextLines: ParsedLogLine[], added: ParsedLogLine[]) {
      linesRef.current = nextLines;
      countsRef.current = addCounts(countsRef.current, added);
      for (const line of added) {
        if (line.severity === "error") {
          errorsRef.current.push(line.id - 1);
        }
      }
      setLive({
        lines: nextLines,
        counts: countsRef.current,
        errorIndexes: errorsRef.current.slice(),
      });
    }

    const prev = prevRef.current;
    if (value === prev) {
      return;
    }
    if (!value.startsWith(prev)) {
      prevRef.current = "";
      bufferRef.current = "";
      linesRef.current = [];
      countsRef.current = emptyLogCounts();
      errorsRef.current = [];
      setLive({
        lines: [],
        counts: emptyLogCounts(),
        errorIndexes: [],
      });
    }
    const chunk = value.slice(prevRef.current.length);
    const consumed = consumeLogChunk(bufferRef.current, chunk);
    bufferRef.current = consumed.rest;
    if (consumed.lines.length > 0) {
      const next = appendParsedLines(linesRef.current, consumed.lines);
      commit(next.lines, next.added);
    }
    prevRef.current = value;
  }, [value, running]);

  return running ? live : staticParsed;
}

function downloadBasename(label: string): string {
  const trimmed = label.trim() || "log";
  return trimmed.endsWith(".log") ? trimmed : `${trimmed}.log`;
}

export function LogViewer({
  jobId,
  text,
  initialLog,
  running = false,
  fill,
  framed = true,
  label = "log",
  compact = false,
  className,
}: {
  jobId: string | null;
  text?: string;
  initialLog?: string;
  running?: boolean;
  fill?: boolean;
  framed?: boolean;
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  const value = text ?? initialLog ?? "";
  const parsed = useParsedLogText(value, running);
  const showCancel = Boolean(jobId && running);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col gap-2",
        compact ? "shrink-0" : "flex-1",
        fill && "h-full",
      )}
    >
      {showCancel ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              if (jobId) {
                void cancelJob(jobId);
              }
            }}
          >
            Cancel
          </Button>
        </div>
      ) : null}
      <LogPane
        lines={parsed.lines}
        counts={parsed.counts}
        errorIndexes={parsed.errorIndexes}
        running={running}
        ready
        fill={Boolean(fill)}
        downloadName={downloadBasename(label)}
        compact={compact}
        framed={framed}
        className={className}
        emptyLabel="No output yet"
      />
    </div>
  );
}
