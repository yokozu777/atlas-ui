"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Folder, FolderGit2, GitBranch, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import {
  GIT_PULL_INHERIT,
  GitPullSecretSelect,
} from "@/components/git-pull-secret-select";
import { Panel } from "@/components/panel";
import { SectionHeader } from "@/components/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEnsureClusterctlSshKey } from "@/hooks/use-ensure-clusterctl-ssh";
import {
  fetchReposStatus,
  queueReposSync,
  waitHubExecution,
  type ClusterPlaybookRepo,
  type ReposStatusPayload,
} from "@/lib/api";
import { useCan } from "@/lib/authz";
import { notify, notifyExecution } from "@/lib/notification-inbox";
import { loadGitPullSecrets } from "@/lib/git-pull";
import { formatRelativeTime, shortSha } from "@/lib/project-dashboard";
import type { SecretOption } from "@/lib/project-sources";
import type { StargateProject } from "@/lib/project-types";
import { fetchProject, stargateJson } from "@/lib/stargate";

function entriesLabel(entries?: string[]) {
  if (!entries?.length) return "No entries";
  if (entries.length <= 3) return entries.join(", ");
  return `${entries.slice(0, 3).join(", ")} +${entries.length - 3}`;
}

function stateCopy(state: string, head: string | null, lockSha: string | null) {
  if (state === "ready" && head && lockSha && head === lockSha) {
    return {
      label: "Ready",
      detail: "Cloned, matches lock",
      variant: "success" as const,
    };
  }
  if (state === "ready") {
    return {
      label: "Ready",
      detail: lockSha ? "Cloned; lock may differ" : "Cloned on disk",
      variant: "success" as const,
    };
  }
  if (state === "missing") {
    return {
      label: "Missing",
      detail: "Not on disk yet — sync to clone",
      variant: "destructive" as const,
    };
  }
  if (state === "error") {
    return {
      label: "Error",
      detail: "Last sync failed",
      variant: "destructive" as const,
    };
  }
  return {
    label: state || "Unknown",
    detail: "Status not loaded yet",
    variant: "outline" as const,
  };
}

export function ClusterYamlReposTab({
  projectId,
  clusterId,
  playbooks,
}: {
  projectId: string;
  clusterId: string | null;
  playbooks: ClusterPlaybookRepo[];
}) {
  const canSync = useCan()("atlas.execute");
  const { ensure: ensureSshKey, dialog: sshDialog } = useEnsureClusterctlSshKey();
  const [status, setStatus] = useState<ReposStatusPayload | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [secrets, setSecrets] = useState<SecretOption[]>([]);
  const [repoSecretIds, setRepoSecretIds] = useState<Record<string, string>>({});
  const [defaultSecretId, setDefaultSecretId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    repo?: string;
  } | null>(null);

  const loadStatus = useCallback(async () => {
    if (!clusterId) return;
    setLoading(true);
    setStatusError(null);
    try {
      setStatus(await fetchReposStatus(clusterId));
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [clusterId]);

  const loadGitPull = useCallback(async () => {
    const [project, rows] = await Promise.all([
      fetchProject(projectId),
      loadGitPullSecrets(projectId),
    ]);
    setSecrets(rows);
    setDefaultSecretId(project.gitPull?.defaultSecretId || null);
    setRepoSecretIds({ ...(project.gitPull?.repoSecretIds || {}) });
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      void loadGitPull().catch((err: unknown) =>
        toast.error(err instanceof Error ? err.message : String(err)),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [loadGitPull]);

  async function saveRepoSecret(repo: string, value: string) {
    try {
      const data = await stargateJson<{ project?: StargateProject }>(
        `/projects/${encodeURIComponent(projectId)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            gitPull: {
              repoSecretIds: {
                [repo]: value === GIT_PULL_INHERIT ? null : value,
              },
            },
          }),
        },
      );
      const next = data.project?.gitPull?.repoSecretIds || {};
      setRepoSecretIds({ ...next });
      setDefaultSecretId(data.project?.gitPull?.defaultSecretId || null);
      toast.success("Saved git pull key");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void loadStatus();
    });
    return () => {
      cancelled = true;
    };
  }, [loadStatus]);

  const rows = useMemo(() => {
    const byName = new Map((status?.repos ?? []).map((row) => [row.name, row]));
    const lockRepos = status?.lock?.repos ?? {};
    return playbooks.map((repo) => {
      const live = byName.get(repo.name);
      const lock = lockRepos[repo.name];
      return {
        name: repo.name,
        source: live?.source || repo.source || "—",
        origin: live?.url || repo.url || live?.path || repo.path || "—",
        ref: live?.ref || repo.ref || "—",
        state: live?.state || "unknown",
        head: live?.head || null,
        lockSha: lock?.resolved_sha || null,
        syncAction: lock?.sync_action || null,
        entries: repo.entries ?? [],
        git: (live?.source || repo.source) === "git",
      };
    });
  }, [playbooks, status]);

  const lastSync = status?.lock?.updated_at ?? null;

  async function runSync(repo?: string) {
    if (!clusterId) return;
    setBusy(true);
    try {
      if (!(await ensureSshKey())) {
        notify("error", "Add an SSH key in Secrets Manager to clone playbooks", {
          href: "/secrets",
        });
        return;
      }
      const result = await queueReposSync({
        clusterId,
        projectId,
        repo,
      });
      if (result.executionId) {
        notifyExecution(
          "success",
          "Sync queued on worker",
          projectId,
          result.executionId,
        );
        const done = await waitHubExecution(projectId, result.executionId);
        if (done === "SUCCESS") {
          notifyExecution(
            "success",
            "Repo sync finished",
            projectId,
            result.executionId,
          );
        } else if (done === "TIMEOUT") {
          notifyExecution(
            "error",
            "Repo sync is still running; refresh status later",
            projectId,
            result.executionId,
          );
        } else {
          notifyExecution(
            "error",
            `Repo sync ${done.toLowerCase()}`,
            projectId,
            result.executionId,
          );
        }
      } else if (result.exitCode) {
        toast.error("Repo sync failed");
      } else {
        toast.success("Repo sync finished");
      }
      await loadStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!clusterId) {
    return (
      <>
        {sshDialog}
        <EmptyState
          title="No cluster selected"
          description="Choose a cluster in the header."
        />
      </>
    );
  }

  if (!playbooks.length) {
    return (
      <>
        {sshDialog}
        <EmptyState
          title="No playbook sources"
          description="Add Git or local playbooks on the Setup tab, then sync them here."
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Playbook sync"
        icon={<FolderGit2 />}
        actions={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void loadStatus()}
              disabled={loading || busy}
            >
              <RefreshCw />
              Refresh
            </Button>
            {canSync ? (
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  setConfirm({
                    title: "Sync all playbooks?",
                    description: `Clone or update every Git source for ${clusterId}.`,
                  })
                }
              >
                <Download />
                Sync all
              </Button>
            ) : null}
          </div>
        }
      />
      <p className="text-sm text-muted-foreground">
        Last sync:{" "}
        <span className="text-foreground" title={lastSync || undefined}>
          {lastSync ? formatRelativeTime(lastSync) : "never"}
        </span>
      </p>
      {statusError ? (
        <p className="text-sm text-destructive">{statusError}</p>
      ) : null}
      <div className="grid gap-3">
        {rows.map((row) => {
          const copy = stateCopy(row.state, row.head, row.lockSha);
          return (
            <Panel key={row.name} className="space-y-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    {row.git ? (
                      <GitBranch className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <Folder className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{row.name}</span>
                  </p>
                  <p className="break-all font-mono text-xs text-muted-foreground">
                    {row.origin}
                    {row.ref && row.ref !== "—" ? ` · ${row.ref}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {copy.detail}
                    {row.head ? ` · ${shortSha(row.head)}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entriesLabel(row.entries)}
                  </p>
                </div>
                <Badge variant={copy.variant}>{copy.label}</Badge>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                {row.git ? (
                  <GitPullSecretSelect
                    id={`git-pull-${row.name}`}
                    label="Git pull key"
                    compact={false}
                    inheritLabel={
                      defaultSecretId
                        ? "Project default"
                        : "Project default (clusterctl SSH key)"
                    }
                    value={repoSecretIds[row.name] || GIT_PULL_INHERIT}
                    secrets={secrets}
                    onValueChange={(next) => void saveRepoSecret(row.name, next)}
                    disabled={busy}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">Local source</p>
                )}
                {row.git && canSync ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      setConfirm({
                        title: `Sync ${row.name}?`,
                        description: `Clone or update this playbook source.`,
                        repo: row.name,
                      })
                    }
                  >
                    <Download />
                    Sync
                  </Button>
                ) : null}
              </div>
            </Panel>
          );
        })}
      </div>
      <ConfirmAction
        open={Boolean(confirm)}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={confirm?.title || "Sync"}
        description={confirm?.description || ""}
        confirmLabel="Sync"
        onConfirm={() => {
          if (confirm) void runSync(confirm.repo);
        }}
      />
      {sshDialog}
    </div>
  );
}
