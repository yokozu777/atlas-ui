import type { JobSnapshot } from "@/server/jobs";
import { parseJobJson } from "@/lib/job-output";
import { currentNavProjectId } from "@/lib/project-href";
import { fetchMe, stargateJson } from "@/lib/stargate";

export type ClusterRow = {
  id: string;
  display_name: string | null;
  active: boolean;
  kind: string;
  error?: string;
};

export type RunLogRow = {
  stamp: string;
  dir: string;
  meta: Record<string, unknown> | null;
};

type InspectResult = {
  success?: boolean;
  argv?: string[];
  log?: string;
  json?: unknown;
  return_code?: number;
  error?: string;
  cluster_id?: string;
};

function projectIdFromWindow(): string | null {
  if (typeof window !== "undefined") {
    const fromPath = window.location.pathname.match(/^\/projects\/([^/]+)/)?.[1];
    if (fromPath && fromPath !== "new") {
      return decodeURIComponent(fromPath);
    }
  }
  return currentNavProjectId();
}

export async function isHubRemote(): Promise<boolean> {
  const me = await fetchMe();
  return Boolean(me?.remote);
}

async function hubProjectId(): Promise<string | null> {
  if (!(await isHubRemote())) {
    return null;
  }
  return projectIdFromWindow();
}

function inspectToSnapshot(
  argv: string[],
  data: InspectResult,
  clusterId?: string,
): JobSnapshot & { log?: string } {
  const exitCode = data.return_code ?? 1;
  return {
    id: "inspect",
    argv: data.argv ?? argv,
    clusterId: clusterId ?? data.cluster_id ?? null,
    mutating: false,
    status: "exited",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    exitCode,
    logPath: "",
    error: exitCode === 0 ? null : (data.error ?? "inspect failed"),
    log: data.log ?? "",
  };
}

function shouldHubInspect(argv: string[]): boolean {
  const command = argv[0];
  if (command === "run" || command === "init" || command === "use") {
    return false;
  }
  if (command === "workspace" && argv[1] === "reset") {
    return false;
  }
  if ((command === "repos" || command === "playbooks") && argv[1] === "sync") {
    return false;
  }
  return true;
}

async function hubInspect(
  argv: string[],
  clusterId?: string,
): Promise<InspectResult | null> {
  if (!shouldHubInspect(argv)) {
    return null;
  }
  const projectId = await hubProjectId();
  if (!projectId) {
    return null;
  }
  const body: { argv: string[]; cluster_id?: string } = { argv };
  if (clusterId) {
    body.cluster_id = clusterId;
  }
  return stargateJson<InspectResult>(
    `/projects/${encodeURIComponent(projectId)}/atlas/inspect`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export type ClusterctlGitStatus = {
  success?: boolean;
  gitUrl?: string;
  dest?: string;
  clusterctlRoot?: string;
  exists?: boolean;
  isRepo?: boolean;
  configured?: boolean;
  version?: string;
  ok?: boolean;
  error?: string | null;
};

export const DEFAULT_CLUSTERCTL_GIT_URL =
  "https://github.com/yokozu777/atlas-clusterctl.git";

function hubUnavailable(message: string): boolean {
  return (
    message.includes("HUB_API_URL is not set") ||
    message.includes("Hub API is not configured")
  );
}

async function setupJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: "no-store", ...init });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "setup failed");
  }
  return data;
}

export async function fetchSetup() {
  const res = await fetch("/api/setup", { cache: "no-store" });
  return res.json() as Promise<ClusterctlGitStatus>;
}

export async function fetchClusterctlGit(input?: {
  url?: string;
  dest?: string;
}): Promise<ClusterctlGitStatus> {
  const params = new URLSearchParams();
  if (input?.url) {
    params.set("url", input.url);
  }
  if (input?.dest) {
    params.set("dest", input.dest);
  }
  const q = params.toString() ? `?${params.toString()}` : "";
  try {
    return await stargateJson<ClusterctlGitStatus>(`/atlas/clusterctl${q}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!hubUnavailable(message)) {
      throw err;
    }
    return setupJson<ClusterctlGitStatus>("/api/setup");
  }
}

export async function cloneClusterctlGit(input: {
  url?: string;
  dest?: string;
}): Promise<ClusterctlGitStatus> {
  try {
    return await stargateJson<ClusterctlGitStatus>("/atlas/clusterctl/clone", {
      method: "POST",
      body: JSON.stringify(input),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!hubUnavailable(message)) {
      throw err;
    }
    return setupJson<ClusterctlGitStatus>("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "clone",
        url: input.url,
        dest: input.dest,
      }),
    });
  }
}

export async function pullClusterctlGit(input: {
  url?: string;
  dest?: string;
}): Promise<ClusterctlGitStatus> {
  try {
    return await stargateJson<ClusterctlGitStatus>("/atlas/clusterctl/pull", {
      method: "POST",
      body: JSON.stringify(input),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!hubUnavailable(message)) {
      throw err;
    }
    return setupJson<ClusterctlGitStatus>("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "pull",
        url: input.url,
        dest: input.dest,
      }),
    });
  }
}

export async function saveSetup(path: string) {
  try {
    const params = new URLSearchParams();
    if (path.trim()) {
      params.set("dest", path.trim());
    }
    const q = params.toString() ? `?${params.toString()}` : "";
    const data = await stargateJson<ClusterctlGitStatus>(`/atlas/clusterctl${q}`);
    if (!data.ok) {
      throw new Error(data.error || "clusterctl probe failed");
    }
    const dest = data.dest || path;
    await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: dest }),
    }).catch(() => undefined);
    return data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!hubUnavailable(message)) {
      throw err;
    }
  }
  const res = await fetch("/api/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  const data = (await res.json()) as ClusterctlGitStatus;
  if (!res.ok) {
    throw new Error(data.error || "setup failed");
  }
  return data;
}

export async function fetchAtlasProjectClusters(): Promise<{
  clustersRoot: string;
  clusters: ClusterRow[];
}> {
  const projectId = await hubProjectId();
  if (projectId) {
    const data = await stargateJson<{
      clustersRoot?: string;
      clusters?: { id?: string; kind?: string }[];
    }>(`/projects/${encodeURIComponent(projectId)}/atlas/clusters`);
    const clusters = (data.clusters ?? [])
      .map((row) => String(row.id ?? "").trim())
      .filter(Boolean)
      .map((id) => ({
        id,
        display_name: null,
        active: false,
        kind: "deployable",
      }));
    return { clustersRoot: data.clustersRoot ?? "", clusters };
  }
  const res = await fetch("/api/clusters", { cache: "no-store" });
  const data = (await res.json()) as { clusters?: ClusterRow[]; error?: string };
  if (!res.ok) {
    throw new Error(data.error || "list failed");
  }
  return { clustersRoot: "", clusters: data.clusters ?? [] };
}

export async function fetchClusters() {
  const listed = await fetchAtlasProjectClusters();
  return listed.clusters;
}

export async function runClusterctl(input: {
  argv: string[];
  clusterId?: string;
  wait?: boolean;
}): Promise<JobSnapshot & { log?: string }> {
  if (input.argv[0] === "init" && (await isHubRemote())) {
    const queued = await queueAtlasInit({ argv: input.argv });
    return {
      id: queued.executionId ?? "init",
      argv: input.argv,
      clusterId: queued.clusterId ?? input.clusterId ?? null,
      mutating: true,
      status: "exited",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      exitCode: 0,
      logPath: "",
      error: null,
      log: "Init queued on worker",
    };
  }
  const inspect = await hubInspect(input.argv, input.clusterId);
  if (inspect) {
    return inspectToSnapshot(input.argv, inspect, input.clusterId);
  }
  const res = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await res.json()) as JobSnapshot & { log?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error || "clusterctl failed");
  }
  return data;
}

export type ClusterPlaybookRepo = {
  name: string;
  source?: string | null;
  url?: string | null;
  ref?: string | null;
  path?: string | null;
  sync?: string | null;
  layout?: string | null;
  entries?: string[];
};

export type ClusterPhase = {
  alias: string;
  ref?: string;
  tags?: string[];
};

export type ConfigShowReport = {
  cluster_id?: string;
  display_name?: string | null;
  execution_effective?: string;
  execution_configured?: string;
  execution_source?: string;
  docker_image?: string | null;
  docker_available?: boolean;
  ssh_key?: string;
  ssh_key_ok?: boolean;
  workspace_id?: string;
  workspace_root?: string;
  inventory?: string;
  boundary?: string;
  phase_ref?: string;
  schema_version?: number;
  deployable?: boolean;
  cascade_paths?: string[];
  ansible_lines?: string[];
  ansible_runtime_lines?: string[];
  ansible?: {
    boundary?: string;
    phase_ref?: string;
    runtime_lines?: string[];
    lines?: string[];
  };
};

export type ConfigEffectivePayload = {
  cluster_id?: string;
  config_dir?: string | null;
  deployable?: boolean;
  cascade_paths?: string[];
  effective?: unknown;
};

export type ReposStatusRecord = {
  name: string;
  state?: string;
  source?: string;
  layout?: string;
  layout_dir?: string;
  url?: string;
  ref?: string;
  sync?: string;
  path?: string;
  head?: string | null;
};

export type ReposLockEntry = {
  resolved_sha?: string | null;
  sync_action?: string | null;
  source?: string | null;
};

export type ReposStatusPayload = {
  cluster_id?: string;
  workspace_root?: string;
  repos?: ReposStatusRecord[];
  lock?: {
    updated_at?: string;
    repos?: Record<string, ReposLockEntry>;
  } | null;
};

export type WorkspaceShowPayload = {
  cluster_id?: string;
  workspace_id?: string;
  workspace_root?: string;
  logs?: string;
  kubeconfig?: string;
  kubeconfig_exists?: boolean;
  lines?: string[];
};

export async function fetchWorkspaceShow(
  clusterId: string,
): Promise<WorkspaceShowPayload> {
  const argv = ["workspace", "show", "--json"];
  const inspect = await hubInspect(argv, clusterId);
  if (inspect) {
    if (inspect.return_code) {
      throw new Error(
        inspect.log?.trim() || inspect.error || "workspace show failed",
      );
    }
    return (inspect.json ??
      parseJobJson<WorkspaceShowPayload>(
        inspect.log ?? "",
      )) as WorkspaceShowPayload;
  }
  const result = await runClusterctl({ argv, clusterId, wait: true });
  if (result.exitCode) {
    throw new Error(
      result.log?.trim() || result.error || "workspace show failed",
    );
  }
  return parseJobJson<WorkspaceShowPayload>(result.log ?? "");
}

export async function queueAtlasInit(input: {
  argv: string[];
  projectId?: string;
}): Promise<{
  executionId?: string;
  clusterId?: string;
}> {
  const remote = await isHubRemote();
  if (!remote) {
    throw new Error("atlas init on hub requires a remote project");
  }
  const pid = input.projectId || (await hubProjectId());
  if (!pid) {
    throw new Error("init requires a project on hub");
  }
  const data = await stargateJson<{
    executionId?: string;
    cluster_id?: string;
  }>(`/projects/${encodeURIComponent(pid)}/atlas/init`, {
    method: "POST",
    body: JSON.stringify({ argv: input.argv }),
  });
  if (!data.executionId) {
    throw new Error("No execution id");
  }
  return { executionId: data.executionId, clusterId: data.cluster_id };
}

export async function queueWorkspaceReset(
  clusterId: string,
  projectId?: string,
): Promise<{
  executionId?: string;
  log?: string;
  exitCode?: number | null;
}> {
  const remote = await isHubRemote();
  const pid = projectId || (remote ? await hubProjectId() : null);
  if (remote) {
    if (!pid) {
      throw new Error("workspace reset requires a project on hub");
    }
    const data = await stargateJson<{ executionId?: string }>(
      `/projects/${encodeURIComponent(pid)}/atlas/workspace/reset`,
      {
        method: "POST",
        body: JSON.stringify({ cluster_id: clusterId }),
      },
    );
    if (!data.executionId) {
      throw new Error("No execution id");
    }
    return { executionId: data.executionId };
  }
  const result = await runClusterctl({
    argv: ["workspace", "reset", "--yes"],
    clusterId,
    wait: true,
  });
  return { log: result.log ?? "", exitCode: result.exitCode };
}

export async function queueReposSync(input: {
  clusterId: string;
  projectId?: string;
  repo?: string;
  phase?: string;
}): Promise<{
  executionId?: string;
  log?: string;
  exitCode?: number | null;
}> {
  const remote = await isHubRemote();
  const pid = input.projectId || (remote ? await hubProjectId() : null);
  if (remote) {
    if (!pid) {
      throw new Error("repos sync requires a project on hub");
    }
    const body: Record<string, string> = { cluster_id: input.clusterId };
    const repo = input.repo?.trim();
    const phase = input.phase?.trim();
    if (repo) body.repo = repo;
    if (phase) body.phase = phase;
    const data = await stargateJson<{ executionId?: string }>(
      `/projects/${encodeURIComponent(pid)}/atlas/repos/sync`,
      { method: "POST", body: JSON.stringify(body) },
    );
    if (!data.executionId) {
      throw new Error("No execution id");
    }
    return { executionId: data.executionId };
  }
  const argv = ["repos", "sync"];
  if (input.repo?.trim()) argv.push("--repo", input.repo.trim());
  if (input.phase?.trim()) argv.push("--phase", input.phase.trim());
  const result = await runClusterctl({
    argv,
    clusterId: input.clusterId,
    wait: true,
  });
  return { log: result.log ?? "", exitCode: result.exitCode };
}

const HUB_EXECUTION_DONE = new Set(["SUCCESS", "FAILED", "CANCELED"]);

export async function waitHubExecution(
  projectId: string,
  executionId: string,
  timeoutMs = 180_000,
): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const data = await stargateJson<{ execution?: { status?: string } }>(
      `/executions/${encodeURIComponent(executionId)}?project_id=${encodeURIComponent(projectId)}`,
    );
    const status = String(data.execution?.status || "");
    if (HUB_EXECUTION_DONE.has(status)) {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return "TIMEOUT";
}

export type WorkspaceFsEntry = {
  name: string;
  rel: string;
  kind: "dir" | "file";
  size?: number;
};

export type WorkspaceLsPayload = {
  rel: string;
  entries: WorkspaceFsEntry[];
};

export type WorkspaceFilePayload = {
  rel: string;
  content?: string;
  binary?: boolean;
  truncated?: boolean;
  size?: number;
};

export async function fetchWorkspaceLs(
  clusterId: string,
  rel = "",
): Promise<WorkspaceLsPayload> {
  const projectId = await hubProjectId();
  if (projectId) {
    const params = new URLSearchParams();
    if (rel) {
      params.set("rel", rel);
    }
    if (clusterId) {
      params.set("cluster_id", clusterId);
    }
    const q = params.toString();
    const data = await stargateJson<WorkspaceLsPayload>(
      `/projects/${encodeURIComponent(projectId)}/atlas/workspace/ls${q ? `?${q}` : ""}`,
    );
    return { rel: data.rel ?? rel, entries: data.entries ?? [] };
  }
  const params = new URLSearchParams({ clusterId, kind: "ls" });
  if (rel) {
    params.set("rel", rel);
  }
  const res = await fetch(`/api/workspace?${params.toString()}`, {
    cache: "no-store",
  });
  const data = (await res.json()) as WorkspaceLsPayload & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "workspace ls failed");
  }
  return { rel: data.rel ?? rel, entries: data.entries ?? [] };
}

export async function fetchWorkspaceFile(
  clusterId: string,
  rel: string,
): Promise<WorkspaceFilePayload> {
  const projectId = await hubProjectId();
  if (projectId) {
    const params = new URLSearchParams({ rel });
    if (clusterId) {
      params.set("cluster_id", clusterId);
    }
    return stargateJson<WorkspaceFilePayload>(
      `/projects/${encodeURIComponent(projectId)}/atlas/workspace/file?${params.toString()}`,
    );
  }
  const params = new URLSearchParams({ clusterId, kind: "file", rel });
  const res = await fetch(`/api/workspace?${params.toString()}`, {
    cache: "no-store",
  });
  const data = (await res.json()) as WorkspaceFilePayload & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "workspace file failed");
  }
  return data;
}

export async function fetchReposStatus(
  clusterId: string,
): Promise<ReposStatusPayload> {
  const inspect = await hubInspect(["repos", "status", "--json"], clusterId);
  if (inspect) {
    if (inspect.return_code) {
      throw new Error(
        inspect.log?.trim() || inspect.error || "repos status failed",
      );
    }
    return (inspect.json ??
      parseJobJson<ReposStatusPayload>(inspect.log ?? "")) as ReposStatusPayload;
  }
  const result = await runClusterctl({
    argv: ["repos", "status", "--json"],
    clusterId,
    wait: true,
  });
  if (result.exitCode) {
    throw new Error(result.log?.trim() || result.error || "repos status failed");
  }
  return parseJobJson<ReposStatusPayload>(result.log ?? "");
}

function configShowArgv(phase?: string): string[] {
  const trimmed = (phase || "").trim();
  if (trimmed && !trimmed.startsWith("-")) {
    return ["config", "show", trimmed, "--json"];
  }
  return ["config", "show", "--json"];
}

export async function fetchConfigShow(
  clusterId: string,
  phase?: string,
): Promise<ConfigShowReport> {
  const argv = configShowArgv(phase);
  const inspect = await hubInspect(argv, clusterId);
  if (inspect) {
    if (inspect.return_code) {
      throw new Error(
        inspect.log?.trim() || inspect.error || "config show failed",
      );
    }
    return (inspect.json ??
      parseJobJson<ConfigShowReport>(inspect.log ?? "")) as ConfigShowReport;
  }
  const result = await runClusterctl({ argv, clusterId, wait: true });
  if (result.exitCode) {
    throw new Error(result.log?.trim() || result.error || "config show failed");
  }
  return parseJobJson<ConfigShowReport>(result.log ?? "");
}

export async function fetchConfigEffective(
  clusterId: string,
): Promise<ConfigEffectivePayload> {
  const argv = ["config", "effective", "--json"];
  const inspect = await hubInspect(argv, clusterId);
  if (inspect) {
    if (inspect.return_code) {
      throw new Error(
        inspect.log?.trim() || inspect.error || "config effective failed",
      );
    }
    return (inspect.json ??
      parseJobJson<ConfigEffectivePayload>(
        inspect.log ?? "",
      )) as ConfigEffectivePayload;
  }
  const result = await runClusterctl({ argv, clusterId, wait: true });
  if (result.exitCode) {
    throw new Error(
      result.log?.trim() || result.error || "config effective failed",
    );
  }
  return parseJobJson<ConfigEffectivePayload>(result.log ?? "");
}

export async function fetchJob(id: string): Promise<JobSnapshot & { log?: string }> {
  const res = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
  const data = (await res.json()) as JobSnapshot & { log?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error || "job not found");
  }
  return data;
}

export async function cancelJob(id: string) {
  const res = await fetch(`/api/jobs/${id}/cancel`, { method: "POST" });
  return res.json();
}

export async function fetchClusterRuns(clusterId: string): Promise<{
  logsDir: string;
  runs: RunLogRow[];
}> {
  const projectId = await hubProjectId();
  if (projectId) {
    const query = clusterId
      ? `?cluster_id=${encodeURIComponent(clusterId)}`
      : "";
    const data = await stargateJson<{
      logsDir?: string;
      runs?: RunLogRow[];
    }>(`/projects/${encodeURIComponent(projectId)}/atlas/log${query}`);
    return { logsDir: data.logsDir ?? "", runs: data.runs ?? [] };
  }
  const res = await fetch(
    `/api/logs?clusterId=${encodeURIComponent(clusterId)}`,
    { cache: "no-store" },
  );
  const data = (await res.json()) as {
    logsDir?: string;
    runs?: RunLogRow[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || "logs failed");
  }
  return { logsDir: data.logsDir ?? "", runs: data.runs ?? [] };
}

export async function fetchClusterRunLog(
  clusterId: string,
  stamp: string,
): Promise<string> {
  const projectId = await hubProjectId();
  if (projectId) {
    const params = new URLSearchParams({ stamp });
    if (clusterId) {
      params.set("cluster_id", clusterId);
    }
    const data = await stargateJson<{ log?: string }>(
      `/projects/${encodeURIComponent(projectId)}/atlas/log?${params.toString()}`,
    );
    return data.log ?? "";
  }
  const res = await fetch(
    `/api/logs?clusterId=${encodeURIComponent(clusterId)}&stamp=${encodeURIComponent(stamp)}`,
    { cache: "no-store" },
  );
  const data = (await res.json()) as { log?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error || "log failed");
  }
  return data.log ?? "";
}

export function clusterHref(id: string, suffix = ""): string {
  const fromWindow =
    typeof window !== "undefined"
      ? window.location.pathname.match(/^\/projects\/([^/]+)/)?.[1]
      : null;
  const projectId =
    (fromWindow && fromWindow !== "new" ? fromWindow : null) ||
    currentNavProjectId();
  if (projectId) {
    return `/projects/${projectId}${suffix}`;
  }
  return `/clusters/${encodeURIComponent(id)}${suffix}`;
}

export type VarsFile = {
  rel: string;
  layer: string;
  kind: string;
  secret: boolean;
};

export type VarsCatalog = {
  cluster_id: string;
  clusters_root: string;
  files: VarsFile[];
};

export async function fetchVarsCatalog(clusterId: string): Promise<VarsCatalog> {
  const inspect = await hubInspect(["vars", "--json"], clusterId);
  if (inspect) {
    if (inspect.return_code) {
      throw new Error(
        inspect.log?.trim() || inspect.error || "vars catalog failed",
      );
    }
    const payload = (inspect.json ??
      parseJobJson<VarsCatalog>(inspect.log ?? "")) as VarsCatalog;
    if (!payload.clusters_root || !Array.isArray(payload.files)) {
      throw new Error("invalid vars catalog");
    }
    return payload;
  }
  const res = await fetch(
    `/api/vars?clusterId=${encodeURIComponent(clusterId)}`,
    { cache: "no-store" },
  );
  const data = (await res.json()) as VarsCatalog & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "vars catalog failed");
  }
  return data;
}

export async function fetchVarsFile(
  clusterId: string,
  rel: string,
): Promise<{ file: VarsFile; content: string }> {
  const projectId = await hubProjectId();
  if (projectId) {
    const catalog = await fetchVarsCatalog(clusterId);
    const file = catalog.files.find((item) => item.rel === rel);
    if (!file) {
      throw new Error("file is not in the cluster vars catalog");
    }
    const params = new URLSearchParams({ rel });
    if (clusterId) {
      params.set("cluster_id", clusterId);
    }
    const data = await stargateJson<{ content?: string }>(
      `/projects/${encodeURIComponent(projectId)}/atlas/file?${params.toString()}`,
    );
    return { file, content: data.content ?? "" };
  }
  const res = await fetch(
    `/api/vars?clusterId=${encodeURIComponent(clusterId)}&rel=${encodeURIComponent(rel)}`,
    { cache: "no-store" },
  );
  const data = (await res.json()) as {
    file?: VarsFile;
    content?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || "vars read failed");
  }
  return { file: data.file as VarsFile, content: data.content ?? "" };
}

export async function saveVarsFile(
  clusterId: string,
  rel: string,
  content: string,
): Promise<void> {
  if (await isHubRemote()) {
    throw new Error("read-only on hub");
  }
  const res = await fetch("/api/vars", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clusterId, rel, content }),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok) {
    throw new Error(data.error || "vars save failed");
  }
}
