"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import {
  GIT_PULL_INHERIT,
  GitPullSecretSelect,
} from "@/components/git-pull-secret-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fetchReposStatus,
  queueReposSync,
  waitHubExecution,
  type ClusterPlaybookRepo,
  type ReposStatusPayload,
} from "@/lib/api";
import { loadGitPullSecrets } from "@/lib/git-pull";
import { formatRelativeTime, shortSha } from "@/lib/project-dashboard";
import type { SecretOption } from "@/lib/project-sources";
import type { StargateProject } from "@/lib/project-types";
import { fetchProject, stargateJson } from "@/lib/stargate";

function entriesLabel(entries?: string[]) {
  if (!entries?.length) return "—";
  if (entries.length <= 3) return entries.join(", ");
  return `${entries.slice(0, 3).join(", ")} +${entries.length - 3}`;
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
    void loadGitPull().catch((err: unknown) =>
      toast.error(err instanceof Error ? err.message : String(err)),
    );
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
    void loadStatus();
  }, [loadStatus]);

  const rows = useMemo(() => {
    const byName = new Map(
      (status?.repos ?? []).map((row) => [row.name, row]),
    );
    const lockRepos = status?.lock?.repos ?? {};
    return playbooks.map((repo) => {
      const live = byName.get(repo.name);
      const lock = lockRepos[repo.name];
      return {
        name: repo.name,
        source: live?.source || repo.source || "—",
        origin: live?.url || repo.url || live?.path || repo.path || "—",
        ref: live?.ref || repo.ref || "—",
        sync: live?.sync || repo.sync || "—",
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
      const result = await queueReposSync({
        clusterId,
        projectId,
        repo,
      });
      if (result.executionId) {
        toast.success("Sync queued on worker");
        const done = await waitHubExecution(projectId, result.executionId);
        if (done === "SUCCESS") {
          toast.success("Repo sync finished");
        } else if (done === "TIMEOUT") {
          toast.error("Repo sync is still running; refresh status later");
        } else {
          toast.error(`Repo sync ${done.toLowerCase()}`);
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
      <EmptyState
        title="No cluster selected"
        description="Choose a cluster in the header."
      />
    );
  }

  if (!playbooks.length) {
    return (
      <EmptyState
        title="No playbook repos"
        description="cluster.yaml has no playbooks: entries for this cluster."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Last sync:{" "}
          <span className="text-foreground">
            {lastSync ? formatRelativeTime(lastSync) : "never"}
          </span>
          {lastSync ? (
            <span className="ml-2 font-mono text-xs">{lastSync}</span>
          ) : null}
        </p>
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
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              setConfirm({
                title: "Sync all repos?",
                description: `./cluster repos sync — ${clusterId}`,
              })
            }
          >
            Sync all
          </Button>
        </div>
      </div>
      {statusError ? (
        <p className="text-sm text-destructive">{statusError}</p>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Repo</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Origin</TableHead>
            <TableHead>Ref</TableHead>
            <TableHead>Sync</TableHead>
            <TableHead>State</TableHead>
            <TableHead>HEAD</TableHead>
            <TableHead>Lock SHA</TableHead>
            <TableHead>Entries</TableHead>
            <TableHead>Git pull key</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.name}>
              <TableCell className="font-medium">{row.name}</TableCell>
              <TableCell>
                <Badge variant="outline">{row.source}</Badge>
              </TableCell>
              <TableCell className="max-w-[14rem] truncate font-mono text-xs">
                {row.origin}
              </TableCell>
              <TableCell className="font-mono text-xs">{row.ref}</TableCell>
              <TableCell className="font-mono text-xs">{row.sync}</TableCell>
              <TableCell>
                <Badge
                  variant={
                    row.state === "ready"
                      ? "success"
                      : row.state === "missing"
                        ? "destructive"
                        : "outline"
                  }
                >
                  {row.state}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-xs whitespace-nowrap">
                {shortSha(row.head)}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="font-mono text-xs whitespace-nowrap"
                    title={row.lockSha || undefined}
                  >
                    {shortSha(row.lockSha)}
                  </span>
                  {row.lockSha && row.syncAction ? (
                    <Badge variant="outline" className="font-sans font-normal">
                      {row.syncAction}
                    </Badge>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="max-w-[10rem] truncate text-xs text-muted-foreground">
                {entriesLabel(row.entries)}
              </TableCell>
              <TableCell className="min-w-[12rem]">
                {row.git ? (
                  <GitPullSecretSelect
                    id={`git-pull-${row.name}`}
                    label=""
                    compact
                    inheritLabel={
                      defaultSecretId
                        ? "Project default"
                        : "Project default (machine SSH_KEY)"
                    }
                    value={repoSecretIds[row.name] || GIT_PULL_INHERIT}
                    secrets={secrets}
                    onValueChange={(next) => void saveRepoSecret(row.name, next)}
                    disabled={busy}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                {row.git ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      setConfirm({
                        title: `Sync ${row.name}?`,
                        description: `./cluster repos sync --repo ${row.name}`,
                        repo: row.name,
                      })
                    }
                  >
                    Sync
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
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
    </div>
  );
}
