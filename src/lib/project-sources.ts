import { toMs } from "@/lib/project-dashboard";

export type SyncDirection = "none" | "push" | "pull" | "both";

export type GitCfg = {
  repo?: string;
  ref?: string;
  branch?: string;
  subdir?: string;
  authSecretId?: string | null;
};

export type SyncState = {
  lastPushAt?: string | number | null;
  lastPullAt?: string | number | null;
  lastPushStatus?: string;
  lastPullStatus?: string;
  lastPushError?: string | null;
  lastPullError?: string | null;
  lastPushRevision?: string | null;
  lastPullRevision?: string | null;
};

export type RepoSource = {
  mode?: string;
  git?: GitCfg;
  url?: string;
  branch?: string;
  localPath?: string;
  syncDirection?: string;
  syncState?: SyncState;
  syncStatus?: {
    push?: { status?: string; error?: string; lastSyncAt?: string | number | null };
    pull?: { status?: string; error?: string; lastSyncAt?: string | number | null };
  };
};

export type RepoLayout = {
  playbooks?: string;
  roles?: string;
  inventories?: string;
  vars?: string;
};

export type SourcesPayload = {
  sources?: { repo?: RepoSource };
  repoLayout?: RepoLayout | null;
};

export type SecretOption = {
  id: string;
  name: string;
  type?: string;
  group: "global" | "project";
};

export const DEFAULT_REPO_LAYOUT: Required<
  Pick<RepoLayout, "playbooks" | "roles" | "inventories">
> = {
  playbooks: "playbooks",
  roles: "roles",
  inventories: "inventories",
};

export const BINDING_LABEL: Record<SyncDirection, string> = {
  none: "None",
  push: "Push only",
  pull: "Pull only",
  both: "Bidirectional",
};

export function asSyncDirection(value: string | undefined): SyncDirection {
  if (value === "push" || value === "pull" || value === "both" || value === "none") {
    return value;
  }
  return "none";
}

export function gitOf(repo: RepoSource | undefined): GitCfg {
  return repo?.git ?? {};
}

export function repoUrlOf(repo: RepoSource | undefined): string {
  return gitOf(repo).repo || repo?.url || "";
}

export function repoRefOf(repo: RepoSource | undefined): string {
  return gitOf(repo).ref || gitOf(repo).branch || repo?.branch || "main";
}

export function repoSubdirOf(repo: RepoSource | undefined): string {
  return gitOf(repo).subdir || "";
}

export function pathDisplay(repo: RepoSource | undefined): string {
  const url = repoUrlOf(repo);
  if (!url) {
    return "Not configured";
  }
  const subdir = repoSubdirOf(repo);
  const ref = repoRefOf(repo);
  return `${url}${subdir ? ` (${subdir})` : ""} @ ${ref}`;
}

export function setupKind(
  repo: RepoSource | undefined,
): "ok" | "error" | "needs_setup" {
  const mode = (repo?.mode || "local").toLowerCase();
  if (mode === "git") {
    return repoUrlOf(repo) ? "ok" : "error";
  }
  return repo?.localPath ? "ok" : "needs_setup";
}

export function canPull(direction: SyncDirection): boolean {
  return direction === "pull" || direction === "both";
}

export function canPush(direction: SyncDirection): boolean {
  return direction === "push" || direction === "both";
}

export type LaneKind = "idle" | "ok" | "failed" | "running";

export function laneKind(status: string | undefined): LaneKind {
  const value = (status || "idle").toLowerCase();
  if (value === "ok" || value === "success") {
    return "ok";
  }
  if (value === "failed" || value === "error" || value === "fail") {
    return "failed";
  }
  if (value === "running" || value === "syncing") {
    return "running";
  }
  return "idle";
}

export function laneLabel(kind: LaneKind): string {
  if (kind === "ok") {
    return "Success";
  }
  if (kind === "failed") {
    return "Error";
  }
  if (kind === "running") {
    return "Syncing...";
  }
  return "Idle";
}

export function formatSyncAt(value: string | number | null | undefined): string | null {
  const ms = toMs(value);
  if (ms == null) {
    return null;
  }
  return new Date(ms).toLocaleString();
}

export function layoutOrDefault(layout: RepoLayout | null | undefined): {
  playbooks: string;
  roles: string;
  inventories: string;
} {
  return {
    playbooks: layout?.playbooks || DEFAULT_REPO_LAYOUT.playbooks,
    roles: layout?.roles || DEFAULT_REPO_LAYOUT.roles,
    inventories: layout?.inventories || DEFAULT_REPO_LAYOUT.inventories,
  };
}
