"use client";

import { memo, type ReactNode } from "react";

import { ANSI_FG_CLASS, type ParsedLogLine } from "@/lib/execution-log";
import { cn } from "@/lib/utils";

const KEYWORD_CLASS: Record<string, string> = {
  ok: "text-success",
  changed: "text-warning",
  skipping: "text-muted-foreground",
  skipped: "text-muted-foreground",
  failed: "text-destructive",
  fatal: "text-destructive",
  unreachable: "text-destructive",
  rescued: "text-warning",
  ignored: "text-warning",
  PLAY: "text-info",
  TASK: "text-info",
  "PLAY RECAP": "text-info",
  "RUNNING HANDLER": "text-info",
};

const BORDER: Record<ParsedLogLine["status"], string> = {
  success: "border-l-success/80",
  changed: "border-l-warning/80",
  skipped: "border-l-muted-foreground/40",
  failed: "border-l-destructive",
  unreachable: "border-l-destructive",
  running: "border-l-info/80",
  neutral: "border-l-transparent",
};

function displayTimestamp(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const time = /\d{2}:\d{2}:\d{2}/.exec(value);
  return time ? time[0] : value;
}

function highlightPlain(text: string, query: string, isCurrent: boolean): ReactNode {
  if (!query) {
    return text;
  }
  const lower = text.toLowerCase();
  const needle = query.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  let nth = 0;
  let idx = lower.indexOf(needle, from);
  while (idx !== -1) {
    if (idx > from) {
      parts.push(text.slice(from, idx));
    }
    parts.push(
      <mark
        key={`m${nth}`}
        className={cn(
          "rounded-[2px] px-0.5 text-foreground",
          isCurrent ? "bg-warning/50" : "bg-warning/20",
        )}
      >
        {text.slice(idx, idx + query.length)}
      </mark>,
    );
    from = idx + needle.length;
    nth += 1;
    idx = lower.indexOf(needle, from);
  }
  if (from < text.length) {
    parts.push(text.slice(from));
  }
  return parts;
}

function colorizeKeyword(plain: string, query: string, isCurrent: boolean): ReactNode {
  const match =
    /^(ok|changed|skipping|failed|fatal|unreachable|rescued|ignored|PLAY RECAP|RUNNING HANDLER|PLAY|TASK)\b/.exec(
      plain.trimStart(),
    );
  if (!match) {
    return highlightPlain(plain, query, isCurrent);
  }
  const lead = plain.match(/^\s*/)?.[0] ?? "";
  const keyword = match[1];
  const start = lead.length + keyword.length;
  return (
    <>
      {lead}
      <span className={KEYWORD_CLASS[keyword] ?? undefined}>{keyword}</span>
      {highlightPlain(plain.slice(start), query, isCurrent)}
    </>
  );
}

function LogLineInner({
  line,
  wrap,
  query,
  isCurrentMatch,
  highlighted,
}: {
  line: ParsedLogLine;
  wrap: boolean;
  query: string;
  isCurrentMatch: boolean;
  highlighted: boolean;
}) {
  const timestamp = displayTimestamp(line.timestamp);
  const hasAnsi = line.tokens.some((token) => token.fg || token.bold || token.dim);
  const body =
    query || !hasAnsi
      ? colorizeKeyword(line.plain, query, isCurrentMatch)
      : line.tokens.map((token, index) => (
          <span
            key={index}
            className={cn(
              token.fg ? ANSI_FG_CLASS[token.fg] : undefined,
              token.bold && "font-semibold",
              token.dim && "opacity-70",
              token.underline && "underline",
            )}
          >
            {token.text}
          </span>
        ));

  return (
    <div
      data-slot="log-line"
      data-line={line.id}
      data-severity={line.severity}
      className={cn(
        "flex border-l-2 font-mono text-[12px] leading-[22px]",
        BORDER[line.status],
        wrap ? "min-h-[22px] items-start" : "h-[22px] items-center",
        highlighted && "bg-warning/15",
        isCurrentMatch && !highlighted && "bg-warning/10",
      )}
    >
      <span
        className={cn(
          "sticky left-0 z-10 w-14 shrink-0 select-none bg-card/90 pr-2 text-right text-muted-foreground/70",
        )}
      >
        {line.id}
      </span>
      <span className="w-[4.75rem] shrink-0 truncate pr-2 text-muted-foreground/80">
        {timestamp ?? ""}
      </span>
      {line.host ? (
        <span
          className="max-w-[9rem] shrink-0 truncate pr-2 text-muted-foreground"
          title={line.host}
        >
          {line.host}
        </span>
      ) : null}
      <span
        className={cn(
          "min-w-0 flex-1 pr-4",
          wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre",
        )}
      >
        {body}
      </span>
    </div>
  );
}

export const LogLine = memo(LogLineInner);
