import { parseLogLine } from "./parse-ansible";
import type { LogCounts, ParsedLogLine } from "./types";

export function normalizeLogChunk(chunk: string): string {
  return chunk.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function consumeLogChunk(
  buffer: string,
  chunk: string,
): { lines: string[]; rest: string } {
  const combined = buffer + normalizeLogChunk(chunk);
  const parts = combined.split("\n");
  const rest = parts.pop() ?? "";
  return { lines: parts, rest };
}

export function appendParsedLines(
  existing: ParsedLogLine[],
  rawLines: string[],
): { lines: ParsedLogLine[]; added: ParsedLogLine[] } {
  if (rawLines.length === 0) {
    return { lines: existing, added: [] };
  }
  const start = existing.length;
  const added = rawLines.map((raw, index) => parseLogLine(start + index + 1, raw));
  return { lines: existing.concat(added), added };
}

export function emptyLogCounts(): LogCounts {
  return { errors: 0, warnings: 0, lines: 0 };
}

export function addCounts(counts: LogCounts, added: ParsedLogLine[]): LogCounts {
  let errors = counts.errors;
  let warnings = counts.warnings;
  for (const line of added) {
    if (line.severity === "error") {
      errors += 1;
    } else if (line.severity === "warning") {
      warnings += 1;
    }
  }
  return {
    errors,
    warnings,
    lines: counts.lines + added.length,
  };
}

export function joinPlainLines(lines: ParsedLogLine[]): string {
  if (lines.length === 0) {
    return "";
  }
  return lines.map((line) => line.plain).join("\n") + "\n";
}

export function formatClockDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function formatClockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
