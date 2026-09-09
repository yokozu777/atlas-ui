import type {
  AnsibleLineMeta,
  LogLineKind,
  LogLineSeverity,
  LogLineStatus,
  ParsedLogLine,
} from "./types";
import { stripAndParseAnsi } from "./parse-ansi";

const TIMESTAMP_PATTERNS: RegExp[] = [
  /^\[(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\]\s*/,
  /^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\s+/,
  /^(\d{2}:\d{2}:\d{2}(?:[.,]\d+)?)\s+/,
];

const HOST_STATUS =
  /^(ok|changed|skipping|failed|fatal|unreachable|rescued|ignored):\s*\[([^\]]+)\]/;

const RECAP_HOST =
  /^(\S+)\s+:\s+ok=\d+\s+changed=\d+\s+unreachable=(\d+)\s+failed=(\d+)/;

const KIND_STATUS: Record<
  Exclude<LogLineKind, "play" | "task" | "recap" | "handler" | "output">,
  { status: LogLineStatus; severity: LogLineSeverity }
> = {
  ok: { status: "success", severity: "info" },
  changed: { status: "changed", severity: "warning" },
  skipping: { status: "skipped", severity: "info" },
  failed: { status: "failed", severity: "error" },
  fatal: { status: "failed", severity: "error" },
  unreachable: { status: "unreachable", severity: "error" },
  rescued: { status: "changed", severity: "warning" },
  ignored: { status: "changed", severity: "warning" },
};

function splitTimestamp(plain: string): { timestamp: string | null; rest: string } {
  for (const pattern of TIMESTAMP_PATTERNS) {
    const match = pattern.exec(plain);
    if (match) {
      return { timestamp: match[1] ?? null, rest: plain.slice(match[0].length) };
    }
  }
  return { timestamp: null, rest: plain };
}

function heading(
  kind: "play" | "task" | "handler" | "recap",
  task: string | null,
): Pick<AnsibleLineMeta, "kind" | "status" | "severity" | "host" | "task"> {
  return {
    kind,
    status: kind === "recap" ? "neutral" : "running",
    severity: "info",
    host: null,
    task,
  };
}

export function parseAnsibleLine(plain: string): AnsibleLineMeta {
  const { timestamp, rest } = splitTimestamp(plain);
  const trimmed = rest.replace(/^\s+/, "");

  const play = /^PLAY \[([^\]]*)\]/.exec(trimmed);
  if (play) {
    return { timestamp, ...heading("play", play[1] || null) };
  }
  const task = /^TASK \[([^\]]*)\]/.exec(trimmed);
  if (task) {
    return { timestamp, ...heading("task", task[1] || null) };
  }
  const handler = /^RUNNING HANDLER \[([^\]]*)\]/.exec(trimmed);
  if (handler) {
    return { timestamp, ...heading("handler", handler[1] || null) };
  }
  if (/^PLAY RECAP/.test(trimmed)) {
    return { timestamp, ...heading("recap", null) };
  }

  const hostStatus = HOST_STATUS.exec(trimmed);
  if (hostStatus) {
    const kind = hostStatus[1] as keyof typeof KIND_STATUS;
    const mapped = KIND_STATUS[kind];
    return {
      timestamp,
      kind,
      status: mapped.status,
      severity: mapped.severity,
      host: hostStatus[2] ?? null,
      task: null,
    };
  }

  const recap = RECAP_HOST.exec(trimmed);
  if (recap) {
    const unreachable = Number(recap[2]);
    const failed = Number(recap[3]);
    const isError = unreachable > 0 || failed > 0;
    return {
      timestamp,
      kind: "recap",
      status: isError ? "failed" : "success",
      severity: isError ? "error" : "info",
      host: recap[1] ?? null,
      task: null,
    };
  }

  if (/^\s*(?:ERROR!?|fatal:)/i.test(trimmed) || /\bFAILED!\b/.test(trimmed)) {
    return {
      timestamp,
      kind: "fatal",
      status: "failed",
      severity: "error",
      host: null,
      task: null,
    };
  }

  if (/^\s*\[?WARNING\]?:/i.test(trimmed) || /\bWARNING\b/.test(trimmed)) {
    return {
      timestamp,
      kind: "output",
      status: "changed",
      severity: "warning",
      host: null,
      task: null,
    };
  }

  return {
    timestamp,
    kind: "output",
    status: "neutral",
    severity: "info",
    host: null,
    task: null,
  };
}

export function getLogLineStatus(plain: string): LogLineStatus {
  return parseAnsibleLine(plain).status;
}

export function parseLogLine(id: number, raw: string): ParsedLogLine {
  const { plain, tokens } = stripAndParseAnsi(raw);
  const meta = parseAnsibleLine(plain);
  return { id, raw, plain, tokens, ...meta };
}

export function lineMatchesFilter(
  line: ParsedLogLine,
  filter: "all" | "errors" | "warnings" | "info",
): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "errors") {
    return line.severity === "error";
  }
  if (filter === "warnings") {
    return line.severity === "warning";
  }
  return line.severity === "info";
}
