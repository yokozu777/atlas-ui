"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { AtlasRunProgressCard } from "@/components/atlas-run-progress-card";
import { ConfirmAction } from "@/components/confirm-action";
import { JsonBlock } from "@/components/json-block";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { useExecutionStream } from "@/hooks/use-execution-stream";
import {
  fetchWorkspaceShow,
  queueWorkspaceReset,
  type WorkspaceShowPayload,
} from "@/lib/api";
import { notifyExecution } from "@/lib/notification-inbox";
import {
  executionStatusKind,
  executionStatusLabel,
} from "@/lib/project-dashboard";
import { executionLogHref, projectHref } from "@/lib/project-href";
import { stargateJson } from "@/lib/stargate";
import { cn } from "@/lib/utils";

export function AtlasClusterRuntime({
  projectId,
  clusterId,
  loading = false,
}: {
  projectId: string;
  clusterId: string | null;
  loading?: boolean;
}) {
  if (!clusterId) {
    if (loading) {
      return (
        <p className="text-sm text-muted-foreground">Loading cluster…</p>
      );
    }
    return (
      <p className="text-sm text-muted-foreground">
        No cluster selected. Choose one in the header, or{" "}
        <Link
          href={projectHref(projectId, "/init")}
          className="text-foreground underline-offset-4 hover:underline"
        >
          create a cluster
        </Link>
        .
      </p>
    );
  }

  return (
    <AtlasClusterRuntimeLoaded
      key={clusterId}
      projectId={projectId}
      clusterId={clusterId}
    />
  );
}

function AtlasClusterRuntimeLoaded({
  projectId,
  clusterId,
}: {
  projectId: string;
  clusterId: string;
}) {
  const [status, setStatus] = useState<WorkspaceShowPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [executionStatus, setExecutionStatus] = useState<string | null>(null);
  const router = useRouter();
  const { text, running } = useExecutionStream(projectId, executionId);

  const loadShow = useCallback(async () => {
    const data = await fetchWorkspaceShow(clusterId);
    setStatus(data);
    setLoadError(null);
  }, [clusterId]);

  useEffect(() => {
    let cancelled = false;
    void fetchWorkspaceShow(clusterId)
      .then((data) => {
        if (!cancelled) {
          setStatus(data);
          setLoadError(null);
          setLoaded(true);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [clusterId]);

  useEffect(() => {
    if (!executionId || running) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await stargateJson<{ execution?: { status?: string } }>(
          `/executions/${encodeURIComponent(executionId)}?project_id=${encodeURIComponent(projectId)}`,
        );
        if (!cancelled && data.execution?.status) {
          setExecutionStatus(data.execution.status);
        }
      } catch {
        /* ignore */
      }
      try {
        await loadShow();
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [executionId, running, loadShow, projectId]);

  async function refresh() {
    setBusy(true);
    try {
      await loadShow();
      toast.success("Workspace status updated");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLoadError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function resetRuntime() {
    setBusy(true);
    try {
      const result = await queueWorkspaceReset(clusterId, projectId);
      if (result.executionId) {
        setExecutionId(result.executionId);
        setExecutionStatus("QUEUED");
        notifyExecution(
          "success",
          "Reset queued on worker",
          projectId,
          result.executionId,
        );
        return;
      }
      if (result.exitCode) {
        toast.error("Reset failed");
      } else {
        toast.success("Runtime reset");
      }
      await loadShow();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const liveStatus =
    executionStatus === "CANCELING" || executionStatus === "CANCELED"
      ? executionStatus
      : running
        ? "RUNNING"
        : executionStatus;
  const kubeLabel =
    status?.kubeconfig_exists === true
      ? "Ready"
      : status?.kubeconfig_exists === false
        ? "Not configured"
        : "—";

  return (
    <div className="space-y-5">
      {!loaded ? (
        <p className="text-sm text-muted-foreground">Loading cluster runtime…</p>
      ) : (
        <>
          {loadError && !status ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : (
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <RuntimeField
                label="Workspace"
                value={status?.workspace_id || "—"}
                mono
              />
              <RuntimeField
                label="Runtime directory"
                value={status?.workspace_root || "—"}
                mono
              />
              <RuntimeField label="Logs" value={status?.logs || "—"} mono />
              <RuntimeField label="Kubernetes" value={kubeLabel} />
            </dl>
          )}
          {loadError && status ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Reset deletes only{" "}
            <span className="font-mono">workspace/&lt;cluster_id&gt;/</span>.
            Durable tfstate stays.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void refresh()}
            >
              <RefreshCw />
              Refresh
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => setConfirmOpen(true)}
            >
              <RotateCcw />
              Reset runtime
            </Button>
          </div>
          {executionId ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {liveStatus ? (
                  <StatusBadge status={executionStatusKind(liveStatus)}>
                    {executionStatusLabel(executionStatusKind(liveStatus))}
                  </StatusBadge>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  render={
                    <Link
                      href={projectHref(
                        projectId,
                        `/executions/${executionId}`,
                      )}
                    />
                  }
                >
                  Open log
                </Button>
              </div>
              <AtlasRunProgressCard
                status={liveStatus}
                text={text}
                onSelect={(id) => {
                  if (!executionId || !id.startsWith("phase:")) {
                    return;
                  }
                  router.push(
                    executionLogHref(
                      projectId,
                      executionId,
                      id.slice("phase:".length),
                    ),
                  );
                }}
              />
            </div>
          ) : null}
          {status ? (
            <Disclosure
              label="Advanced"
              open={advancedOpen}
              onOpenChange={setAdvancedOpen}
            >
              <JsonBlock value={status} label="workspace show" />
            </Disclosure>
          ) : null}
        </>
      )}
      <ConfirmAction
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Reset runtime"
        confirmLabel="Reset runtime"
        destructive
        description={`Permanently delete workspace runtime for ${clusterId}?\nDurable tfstate is not deleted.`}
        onConfirm={() => void resetRuntime()}
      />
    </div>
  );
}

function RuntimeField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 text-sm", mono && "font-mono break-all")}>
        {value}
      </dd>
    </div>
  );
}

function Disclosure({
  label,
  open,
  onOpenChange,
  children,
}: {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        className="h-auto gap-2 px-0 text-sm font-normal text-muted-foreground hover:text-foreground"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        {label}
        <ChevronDown
          className={cn(
            "size-4 transition-transform",
            open ? "rotate-180" : "rotate-0",
          )}
        />
      </Button>
      {open ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
