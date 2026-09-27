export type ReplayRunParams = {
  inventory_files?: string[];
  ansible_config?: string;
  cluster_id?: string;
  phases?: string[];
  argv?: string[];
  root_ssh?: boolean;
  executor?: string;
};

export type ReplayableRun = {
  kind?: string | null;
  playbookName?: string;
  playbookId?: string | null;
  playbook_id?: string;
  selectionSnapshot?: { playbookId?: string };
  runParams?: ReplayRunParams;
};

export type PendingRun = {
  phases: string[];
  all: boolean;
  tags?: string[];
  extraArgs?: string[];
  rootSsh?: boolean;
  dryRun?: boolean;
  executor?: string;
};

export type ExecutionRowAction = "cancel" | "stop" | "rerun" | null;

export function executionRowAction(
  status?: string | null,
): ExecutionRowAction {
  const raw = (status || "").toUpperCase();
  if (raw === "QUEUED" || raw === "PENDING") {
    return "cancel";
  }
  if (raw === "RUNNING") {
    return "stop";
  }
  if (raw === "CANCELING" || raw === "CANCELLING") {
    return null;
  }
  if (!raw) {
    return null;
  }
  return "rerun";
}

export function isAtlasKind(row: ReplayableRun): boolean {
  if ((row.kind || "").toLowerCase() === "atlas") {
    return true;
  }
  return (
    row.runParams?.executor === "clusterctl" ||
    Boolean(row.runParams?.cluster_id)
  );
}

export function isAtlasPipelineRun(row: ReplayableRun): boolean {
  if (!isAtlasKind(row)) {
    return false;
  }
  const argv = row.runParams?.argv;
  if (Array.isArray(argv) && argv.length > 0) {
    return argv.includes("run");
  }
  const name = (row.playbookName || "").toLowerCase();
  return name === "clusterctl" || name === "playbook";
}

export function canReplayExecution(row: ReplayableRun): boolean {
  if (isAtlasKind(row)) {
    return isAtlasPipelineRun(row);
  }
  return Boolean(
    row.playbookId || row.playbook_id || row.selectionSnapshot?.playbookId,
  );
}

export function extraArgsFor(pending: PendingRun, executor: string): string[] {
  const extra = [...(pending.extraArgs ?? [])];
  const tags = pending.tags ?? [];
  if (tags.length > 0 && !argvHasFlag(extra, "--tags")) {
    extra.push("--tags", tags.join(","));
  }
  const chosen = pending.executor ?? executor;
  if (
    (chosen === "local" || chosen === "docker") &&
    !argvHasFlag(extra, "--executor")
  ) {
    extra.push("--executor", chosen);
  }
  return extra;
}

export function replayExtraArgs(argv: string[] | undefined): string[] {
  const extra: string[] = [];
  const tags = argvValue(argv, "--tags");
  if (tags) {
    extra.push("--tags", tags);
  }
  const exec = argvValue(argv, "--executor");
  if (exec) {
    extra.push("--executor", exec);
  }
  return extra;
}

export function argvHasFlag(argv: string[] | undefined, flag: string): boolean {
  if (!argv) {
    return false;
  }
  return argv.some((token) => token === flag || token.startsWith(`${flag}=`));
}

export function argvValue(
  argv: string[] | undefined,
  flag: string,
): string | undefined {
  if (!argv) {
    return undefined;
  }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === flag) {
      const next = argv[i + 1];
      return next && !next.startsWith("-") ? next : "";
    }
    if (token.startsWith(`${flag}=`)) {
      return token.slice(flag.length + 1);
    }
  }
  return undefined;
}

export function pendingFromExecution(row: ReplayableRun): PendingRun {
  const params = row.runParams ?? {};
  const list = Array.isArray(params.phases)
    ? params.phases.filter(Boolean)
    : [];
  return {
    all: list.length === 0,
    phases: list,
    extraArgs: replayExtraArgs(params.argv),
    rootSsh: Boolean(params.root_ssh),
    dryRun: argvHasFlag(params.argv, "--dry-run"),
    executor: argvValue(params.argv, "--executor") ?? "cluster default",
  };
}

export function atlasReplayBody(
  row: ReplayableRun,
  fallbackClusterId?: string,
): {
  phases: string[];
  root_ssh: boolean;
  dry_run: boolean;
  cluster_id: string;
  extra_args: string[];
} {
  const clusterId = row.runParams?.cluster_id || fallbackClusterId || "";
  if (!clusterId) {
    throw new Error("cluster_id missing");
  }
  const pending = pendingFromExecution(row);
  return {
    phases: pending.all ? [] : pending.phases,
    root_ssh: Boolean(pending.rootSsh),
    dry_run: Boolean(pending.dryRun),
    cluster_id: clusterId,
    extra_args: extraArgsFor(pending, pending.executor ?? "cluster default"),
  };
}
