export type PlanJson = {
  cluster_id?: string;
  workspace_id?: string;
  execution?: string;
  execution_source?: string;
  phases?: string[];
  invocation_count?: number;
  inventory?: string;
  schema_version?: number;
  filter_skipped?: { phase_ref: string; reason: string }[];
  stage_details?: {
    phase_ref: string;
    repo_name: string;
    entry_name: string;
    invocation_count: number;
  }[];
};

export type ValidateIssue = {
  severity?: string;
  message?: string;
  path?: string;
  code?: string;
};

export type ValidateJson = {
  ok?: boolean;
  reports?: {
    cluster_id: string;
    ok: boolean;
    errors: number;
    warnings: number;
    issues?: ValidateIssue[];
  }[];
};

export type SmokeJson = {
  ok?: boolean;
  results?: {
    cluster_id: string;
    validate_ok: boolean;
    issues?: ValidateIssue[];
    smoke?: {
      plan_ok?: boolean;
      error?: string | null;
      phases?: unknown;
      invocations?: number;
    };
  }[];
};

export function lastRunStatus(
  meta: Record<string, unknown> | null,
): "ok" | "fail" | "unknown" {
  if (!meta) {
    return "unknown";
  }
  if ("ok" in meta) {
    return meta.ok ? "ok" : "fail";
  }
  const exit = meta.exit_code;
  if (typeof exit === "number" && Number.isFinite(exit)) {
    return exit === 0 ? "ok" : "fail";
  }
  return "unknown";
}
