export type ExecutionRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "CANCELING"
  | "CANCELED"
  | "SUCCESS"
  | "FAILED"
  | "UNKNOWN";

export type LogLineKind =
  | "play"
  | "task"
  | "recap"
  | "handler"
  | "ok"
  | "changed"
  | "skipping"
  | "failed"
  | "fatal"
  | "unreachable"
  | "rescued"
  | "ignored"
  | "output";

export type LogLineSeverity = "error" | "warning" | "info";

export type LogLineStatus =
  | "success"
  | "changed"
  | "skipped"
  | "failed"
  | "unreachable"
  | "running"
  | "neutral";

export type AnsiColor =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
  | "bright-black"
  | "bright-red"
  | "bright-green"
  | "bright-yellow"
  | "bright-blue"
  | "bright-magenta"
  | "bright-cyan"
  | "bright-white";

export type AnsiToken = {
  text: string;
  fg?: AnsiColor;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
};

export type AnsibleLineMeta = {
  kind: LogLineKind;
  status: LogLineStatus;
  severity: LogLineSeverity;
  timestamp: string | null;
  host: string | null;
  task: string | null;
};

export type ParsedLogLine = AnsibleLineMeta & {
  id: number;
  raw: string;
  plain: string;
  tokens: AnsiToken[];
};

export type LogFilter = "all" | "errors" | "warnings" | "info";

export type LogCounts = {
  errors: number;
  warnings: number;
  lines: number;
};

export type ExecutionLogSsePayload = {
  type?: "chunk" | "heartbeat" | "status" | "error" | string;
  text?: string;
  nextOffset?: number;
  offset?: number;
  fileSize?: number;
  isComplete?: boolean;
  status?: string;
  error?: string;
};

export const ACTIVE_EXECUTION_STATUSES = new Set<string>([
  "QUEUED",
  "RUNNING",
  "CANCELING",
]);
