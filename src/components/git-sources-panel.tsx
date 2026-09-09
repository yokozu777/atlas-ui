"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, FolderGit2, Link2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { EditSourceDialog } from "@/components/edit-source-dialog";
import { EmptyState } from "@/components/empty-state";
import { Panel } from "@/components/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  asSyncDirection,
  BINDING_LABEL,
  canPull,
  canPush,
  formatSyncAt,
  laneKind,
  laneLabel,
  pathDisplay,
  setupKind,
  type RepoSource,
  type SecretOption,
  type SourcesPayload,
  type SyncDirection,
} from "@/lib/project-sources";
import { stargateJson } from "@/lib/stargate";
import { cn } from "@/lib/utils";

function LaneStatus({
  label,
  status,
  at,
  error,
}: {
  label: string;
  status: string | undefined;
  at: string | number | null | undefined;
  error: string | null | undefined;
}) {
  const kind = laneKind(status);
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label === "Push" ? (
          <ArrowUp className="size-3" />
        ) : (
          <ArrowDown className="size-3" />
        )}
        {label}
      </p>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "size-2.5 shrink-0 rounded-full",
            kind === "ok" && "bg-success",
            kind === "failed" && "bg-destructive",
            kind === "running" && "bg-warning",
            kind === "idle" && "bg-muted-foreground/50",
          )}
          title={error || kind}
        />
        <span className="text-sm font-medium">{laneLabel(kind)}</span>
      </div>
      {formatSyncAt(at) ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{formatSyncAt(at)}</p>
      ) : null}
      {error ? (
        <p className="mt-1 truncate text-[11px] text-destructive" title={error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function GitSourcesPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<SourcesPayload | null>(null);
  const [secrets, setSecrets] = useState<SecretOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  async function load() {
    const [json, secretData, globalData] = await Promise.all([
      stargateJson<SourcesPayload>(`/projects/${projectId}/sources`),
      stargateJson<{ secrets?: { name?: string; type?: string }[] }>(
        `/secrets?project_id=${encodeURIComponent(projectId)}`,
      ).catch(() => ({ secrets: [] as { name?: string; type?: string }[] })),
      stargateJson<{
        options?: { id?: string; name?: string; type?: string }[];
      }>("/global/secrets/options?purpose=git").catch(() => ({
        options: [] as { id?: string; name?: string; type?: string }[],
      })),
    ]);
    setData(json);
    const global: SecretOption[] = (globalData.options ?? [])
      .filter((row) => row.id && row.name)
      .map((row) => ({
        id: row.id as string,
        name: row.name as string,
        type: row.type,
        group: "global" as const,
      }));
    const project: SecretOption[] = (secretData.secrets ?? [])
      .filter((row) => row.name)
      .map((row) => ({
        id: row.name as string,
        name: row.name as string,
        type: row.type,
        group: "project" as const,
      }));
    setSecrets([...global, ...project]);
  }

  useEffect(() => {
    void load().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function sync(direction: "pull" | "push") {
    setBusy(true);
    try {
      await stargateJson(`/projects/${projectId}/sources/sync`, {
        method: "POST",
        body: JSON.stringify({ sourceKey: "repo", direction }),
      });
      toast.success(direction === "pull" ? "Pull finished" : "Push finished");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return <EmptyState title="Git sources unavailable" description={error} />;
  }

  if (!data) {
    return (
      <Panel className="space-y-3 p-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-16 w-full" />
      </Panel>
    );
  }

  const repo: RepoSource | undefined = data.sources?.repo;
  const direction: SyncDirection = asSyncDirection(repo?.syncDirection);
  const setup = setupKind(repo);
  const isGit = (repo?.mode || "local").toLowerCase() === "git";
  const pullCount = canPull(direction) ? 1 : 0;
  const pushCount = canPush(direction) ? 1 : 0;

  return (
    <div data-slot="git-sources-panel">
      {pullCount > 0 || pushCount > 0 ? (
        <div className="mb-4 flex flex-wrap justify-end gap-2">
          {pushCount > 0 ? (
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void sync("push")}
            >
              <ArrowUp />
              Push All ({pushCount})
            </Button>
          ) : null}
          {pullCount > 0 ? (
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void sync("pull")}
            >
              <ArrowDown />
              Pull All ({pullCount})
            </Button>
          ) : null}
        </div>
      ) : null}

      <Panel data-slot="repository-workspace">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-foreground/10 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <FolderGit2 className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-medium">Repository Workspace</h2>
                <Badge variant="info">{isGit ? "Git" : "Local"}</Badge>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                setup === "ok"
                  ? "success"
                  : setup === "error"
                    ? "destructive"
                    : "warning"
              }
            >
              {setup === "ok" ? "OK" : setup === "error" ? "Error" : "Needs setup"}
            </Badge>
            {canPush(direction) ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void sync("push")}
              >
                <ArrowUp />
                Push
              </Button>
            ) : null}
            {canPull(direction) ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void sync("pull")}
              >
                <ArrowDown />
                Pull
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEditOpen(true)}
            >
              <Pencil />
              Edit
            </Button>
          </div>
        </div>
        <div className="space-y-3 px-4 py-4">
          <p className="truncate font-mono text-sm">{pathDisplay(repo)}</p>
          <p className="text-[13px] text-muted-foreground italic">
            Git-synced workspace containing roles, playbooks, inventories,
            ansible.cfg, etc.
          </p>
          {direction !== "none" ? (
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <Link2 className="size-3.5 text-muted-foreground" />
              Source Binding: {BINDING_LABEL[direction]}
            </p>
          ) : null}
          <div className="grid gap-4 rounded-lg bg-muted/40 px-4 py-3 sm:grid-cols-2">
            <LaneStatus
              label="Push"
              status={repo?.syncState?.lastPushStatus}
              at={repo?.syncState?.lastPushAt}
              error={repo?.syncState?.lastPushError}
            />
            <LaneStatus
              label="Pull"
              status={repo?.syncState?.lastPullStatus}
              at={repo?.syncState?.lastPullAt}
              error={repo?.syncState?.lastPullError}
            />
          </div>
        </div>
      </Panel>

      <EditSourceDialog
        projectId={projectId}
        open={editOpen}
        onOpenChange={setEditOpen}
        repo={repo}
        layout={data.repoLayout}
        secrets={secrets}
        onSaved={load}
      />
    </div>
  );
}
