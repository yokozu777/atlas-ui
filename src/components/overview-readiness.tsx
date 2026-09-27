"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  fetchBootstrapStatus,
  fetchExecutionLogExcerpt,
  formatLogExcerpt,
  queueDockerPull,
  queueReposSync,
  waitHubExecution,
} from "@/lib/api";
import {
  overviewReadiness,
  type OverviewReadiness as ReadinessModel,
} from "@/lib/overview-readiness";
import { executionLogHref } from "@/lib/project-href";

const ACTION_WAIT_MS = 600_000;

type ActionKind = "sync" | "pull";

type ActionError = {
  title: string;
  excerpt: string | null;
  href: string | null;
};

export function OverviewReadiness({
  clusterId,
  projectId,
}: {
  clusterId: string;
  projectId: string | null;
}) {
  const [model, setModel] = useState<ReadinessModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ActionKind | null>(null);
  const [actionError, setActionError] = useState<ActionError | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const status = await fetchBootstrapStatus(clusterId, projectId);
      setModel(overviewReadiness(status));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [clusterId, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(kind: ActionKind) {
    if (!projectId || busy) return;
    setBusy(kind);
    setActionError(null);
    const failedTitle =
      kind === "sync" ? "Repos sync failed" : "Docker pull failed";
    const timeoutTitle =
      kind === "sync" ? "Repos sync timed out" : "Docker pull timed out";
    try {
      const queued =
        kind === "sync"
          ? await queueReposSync({ clusterId, projectId })
          : await queueDockerPull({ clusterId, projectId });
      if (queued.executionId) {
        const status = await waitHubExecution(
          projectId,
          queued.executionId,
          ACTION_WAIT_MS,
        );
        if (status !== "SUCCESS") {
          let excerpt: string | null = null;
          try {
            excerpt =
              formatLogExcerpt(
                await fetchExecutionLogExcerpt(projectId, queued.executionId),
              ) || null;
          } catch {
            excerpt = null;
          }
          const title = status === "TIMEOUT" ? timeoutTitle : failedTitle;
          setActionError({
            title,
            excerpt,
            href: executionLogHref(projectId, queued.executionId),
          });
          toast.error(title);
          return;
        }
      } else if (queued.exitCode) {
        const title = failedTitle;
        setActionError({
          title,
          excerpt: queued.log?.trim() || null,
          href: null,
        });
        toast.error(title);
        return;
      }
      const status = await fetchBootstrapStatus(clusterId, projectId);
      const next = overviewReadiness(status);
      setModel(next);
      setLoadError(null);
      if (next.ready) {
        toast.success(
          kind === "pull" ? "Executor image pulled" : "Playbooks synced",
        );
      } else {
        toast.message("Some runtime pieces are still missing");
      }
    } catch (err) {
      const title = err instanceof Error ? err.message : String(err);
      setActionError({ title, excerpt: null, href: null });
      toast.error(title);
    } finally {
      setBusy(null);
    }
  }

  if (!projectId) return null;

  return (
    <section aria-label="Runtime" className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Runtime</h2>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading || busy !== null}
          onClick={() => void load()}
        >
          <RefreshCw />
          {loading ? "Checking…" : "Refresh"}
        </Button>
      </div>

      {loading && !model ? (
        <p className="text-sm text-muted-foreground">Checking runtime…</p>
      ) : null}

      {loadError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}

      {model?.ready ? (
        <p className="text-sm text-muted-foreground">{model.summary}</p>
      ) : null}

      {model && !model.ready ? (
        <div
          className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3"
          role="alert"
        >
          <p className="text-sm font-medium text-destructive">
            Missing runtime pieces
          </p>
          {model.repos.length > 0 ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <ul className="min-w-0 space-y-2">
                {model.repos.map((row) => (
                  <li key={row.id}>
                    <p className="text-sm">{row.label}</p>
                    {row.detail ? (
                      <p className="break-all font-mono text-xs text-muted-foreground">
                        {row.detail}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
              {model.sync ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => void runAction("sync")}
                >
                  {busy === "sync" ? "Syncing…" : "Sync"}
                </Button>
              ) : null}
            </div>
          ) : null}
          {model.image ? (
            <div className="flex flex-col gap-3 border-t border-destructive/20 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm">{model.image.label}</p>
                {model.image.detail ? (
                  <p className="break-all font-mono text-xs text-muted-foreground">
                    {model.image.detail}
                  </p>
                ) : null}
              </div>
              {model.pull ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => void runAction("pull")}
                >
                  {busy === "pull" ? "Pulling…" : "Pull"}
                </Button>
              ) : null}
            </div>
          ) : null}
          {actionError ? (
            <div className="space-y-2 border-t border-destructive/20 pt-3 text-sm text-destructive">
              <p className="font-medium">{actionError.title}</p>
              {actionError.excerpt ? (
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-destructive/90">
                  {actionError.excerpt}
                </pre>
              ) : null}
              {actionError.href ? (
                <Link className="underline underline-offset-2" href={actionError.href}>
                  Open execution
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
