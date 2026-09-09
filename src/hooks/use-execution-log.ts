"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ACTIVE_EXECUTION_STATUSES,
  addCounts,
  appendParsedLines,
  consumeLogChunk,
  emptyLogCounts,
  type ExecutionLogSsePayload,
  type LogCounts,
  type ParsedLogLine,
} from "@/lib/execution-log";

export type UseExecutionLogResult = {
  lines: ParsedLogLine[];
  counts: LogCounts;
  errorIndexes: number[];
  status: string | null;
  running: boolean;
  ready: boolean;
  error: string | null;
  retry: () => void;
};

function parsePayload(data: string): ExecutionLogSsePayload {
  try {
    return JSON.parse(data) as ExecutionLogSsePayload;
  } catch {
    return { type: "chunk", text: data };
  }
}

export function useExecutionLog(
  projectId: string,
  executionId: string,
): UseExecutionLogResult {
  const [lines, setLines] = useState<ParsedLogLine[]>([]);
  const [counts, setCounts] = useState<LogCounts>(emptyLogCounts);
  const [errorIndexes, setErrorIndexes] = useState<number[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [running, setRunning] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const offsetRef = useRef(0);
  const bufferRef = useRef("");
  const completeRef = useRef(false);
  const linesRef = useRef<ParsedLogLine[]>([]);
  const countsRef = useRef<LogCounts>(emptyLogCounts());
  const errorsRef = useRef<number[]>([]);

  const retry = useCallback(() => {
    setError(null);
    setRetryKey((key) => key + 1);
  }, []);

  useEffect(() => {
    offsetRef.current = 0;
    bufferRef.current = "";
    completeRef.current = false;
    linesRef.current = [];
    countsRef.current = emptyLogCounts();
    errorsRef.current = [];
    setLines([]);
    setCounts(emptyLogCounts());
    setErrorIndexes([]);
    setStatus(null);
    setReady(false);
    setError(null);
    setRunning(true);
  }, [projectId, executionId]);

  useEffect(() => {
    if (!executionId) {
      return;
    }
    completeRef.current = false;
    setRunning(true);
    setError(null);

    const params = new URLSearchParams({
      project_id: projectId,
      offset: String(offsetRef.current),
    });
    const source = new EventSource(
      `/api/hub/executions/${encodeURIComponent(executionId)}/log/stream?${params}`,
    );

    const flushRest = () => {
      if (!bufferRef.current) {
        return;
      }
      const leftover = bufferRef.current;
      bufferRef.current = "";
      const next = appendParsedLines(linesRef.current, [leftover]);
      linesRef.current = next.lines;
      countsRef.current = addCounts(countsRef.current, next.added);
      for (const line of next.added) {
        if (line.severity === "error") {
          errorsRef.current.push(line.id - 1);
        }
      }
      setLines(next.lines);
      setCounts(countsRef.current);
      setErrorIndexes(errorsRef.current.slice());
    };

    source.onmessage = (event) => {
      const payload = parsePayload(event.data);
      setReady(true);
      if (payload.status) {
        setStatus(payload.status);
      }
      if (typeof payload.nextOffset === "number") {
        offsetRef.current = payload.nextOffset;
      } else if (typeof payload.offset === "number") {
        offsetRef.current = payload.offset;
      }

      if (payload.type === "error" && payload.error) {
        completeRef.current = true;
        setError(payload.error);
        setRunning(false);
        source.close();
        return;
      }

      if (payload.text) {
        const consumed = consumeLogChunk(bufferRef.current, payload.text);
        bufferRef.current = consumed.rest;
        if (consumed.lines.length > 0) {
          const next = appendParsedLines(linesRef.current, consumed.lines);
          linesRef.current = next.lines;
          countsRef.current = addCounts(countsRef.current, next.added);
          for (const line of next.added) {
            if (line.severity === "error") {
              errorsRef.current.push(line.id - 1);
            }
          }
          setLines(next.lines);
          setCounts(countsRef.current);
          setErrorIndexes(errorsRef.current.slice());
        }
      }

      if (payload.isComplete) {
        completeRef.current = true;
        flushRest();
        setRunning(false);
        source.close();
      } else if (
        payload.status &&
        !ACTIVE_EXECUTION_STATUSES.has(payload.status)
      ) {
        completeRef.current = true;
        flushRest();
        setRunning(false);
        source.close();
      }
    };

    source.onerror = () => {
      if (completeRef.current) {
        source.close();
        setRunning(false);
        return;
      }
      source.close();
      flushRest();
      setRunning(false);
      setReady(true);
      setError("Failed to load execution logs");
    };

    return () => {
      source.close();
    };
  }, [projectId, executionId, retryKey]);

  return {
    lines,
    counts,
    errorIndexes,
    status,
    running,
    ready,
    error,
    retry,
  };
}
