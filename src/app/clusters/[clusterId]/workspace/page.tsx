"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { JsonBlock } from "@/components/json-block";
import { LogViewer } from "@/components/log-viewer";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkspaceFsBrowser } from "@/components/workspace-fs-browser";
import { useExecutionStream } from "@/hooks/use-execution-stream";
import {
  clusterHref,
  fetchWorkspaceLs,
  fetchWorkspaceShow,
  queueWorkspaceReset,
  type WorkspaceShowPayload,
} from "@/lib/api";
import {
  executionStatusKind,
  executionStatusLabel,
} from "@/lib/project-dashboard";
import { projectHref } from "@/lib/project-href";
import { stargateJson } from "@/lib/stargate";
import { cn } from "@/lib/utils";

export default function WorkspacePage({
  params,
}: {
  params: Promise<{ clusterId: string }>;
}) {
  const clusterId = decodeURIComponent(use(params).clusterId);
  return <ClusterWorkspaceView key={clusterId} clusterId={clusterId} />;
}

export function ClusterWorkspaceView({
  clusterId,
  projectId,
  hub = false,
}: {
  clusterId: string;
  projectId?: string;
  hub?: boolean;
}) {
  const logsHref = projectId
    ? projectHref(projectId, "/logs")
    : clusterHref(clusterId, "/logs");
  const [status, setStatus] = useState<WorkspaceShowPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [executionStatus, setExecutionStatus] = useState<string | null>(null);
  const [localLog, setLocalLog] = useState("");
  const [folders, setFolders] = useState<string[]>([]);
  const [tab, setTab] = useState("");
  const [fsKey, setFsKey] = useState(0);
  const { text, running } = useExecutionStream(
    hub && projectId ? projectId : "",
    hub ? executionId : null,
  );

  const loadShow = useCallback(async () => {
    const data = await fetchWorkspaceShow(clusterId);
    setStatus(data);
    setLoadError(null);
  }, [clusterId]);

  const loadFolders = useCallback(async () => {
    const data = await fetchWorkspaceLs(clusterId, "");
    const dirs = data.entries
      .filter((row) => row.kind === "dir" && row.name !== "logs")
      .map((row) => row.name);
    setFolders(dirs);
    setTab((current) =>
      current && dirs.includes(current) ? current : (dirs[0] ?? ""),
    );
  }, [clusterId]);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setLoadError(null);
    setStatus(null);
    setExecutionId(null);
    setExecutionStatus(null);
    setLocalLog("");
    void loadShow()
      .then(() => {
        if (!cancelled) {
          setLoaded(true);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
          setLoaded(true);
        }
      });
    void loadFolders().catch(() => {
      if (!cancelled) {
        setFolders([]);
        setTab("");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadShow, loadFolders]);

  useEffect(() => {
    if (!hub || !projectId || !executionId || running) {
      return;
    }
    let cancelled = false;
    void stargateJson<{ execution?: { status?: string } }>(
      `/executions/${encodeURIComponent(executionId)}?project_id=${encodeURIComponent(projectId)}`,
    )
      .then((data) => {
        if (!cancelled && data.execution?.status) {
          setExecutionStatus(data.execution.status);
        }
      })
      .catch(() => undefined);
    void loadShow().catch(() => undefined);
    void loadFolders()
      .then(() => {
        if (!cancelled) {
          setFsKey((value) => value + 1);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [hub, projectId, executionId, running, loadShow, loadFolders]);

  async function refresh() {
    setBusy(true);
    try {
      await loadShow();
      await loadFolders();
      setFsKey((value) => value + 1);
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
        setLocalLog("");
        toast.success("Reset queued on worker");
        return;
      }
      setLocalLog(result.log ?? "");
      if (result.exitCode) {
        toast.error("Reset failed");
      } else {
        toast.success("Runtime reset");
      }
      await loadShow();
      await loadFolders();
      setFsKey((value) => value + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancelOrStop(id: string, status?: string) {
    if (!projectId) {
      return;
    }
    try {
      if (status === "QUEUED") {
        await stargateJson(
          `/projects/${encodeURIComponent(projectId)}/executions/${id}/cancel`,
          { method: "POST", body: JSON.stringify({}) },
        );
      } else if (status === "RUNNING") {
        await stargateJson(
          `/projects/${encodeURIComponent(projectId)}/executions/${id}/stop`,
          { method: "POST", body: JSON.stringify({}) },
        );
      } else {
        await stargateJson(
          `/executions/${id}?project_id=${encodeURIComponent(projectId)}`,
          { method: "PATCH", body: JSON.stringify({ status: "CANCELING" }) },
        );
      }
      toast.success(status === "QUEUED" ? "Cancel requested" : "Stop requested");
      if (id === executionId) {
        setExecutionStatus(status === "QUEUED" ? "CANCELED" : "CANCELING");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  const liveStatus =
    executionStatus === "CANCELING" || executionStatus === "CANCELED"
      ? executionStatus
      : running
        ? "RUNNING"
        : executionStatus;
  const liveActive =
    liveStatus === "QUEUED" ||
    liveStatus === "RUNNING" ||
    liveStatus === "CANCELING";
  const showHubLog = Boolean(hub && executionId);
  const showLocalLog = Boolean(!hub && localLog);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <PageHeader
        kicker="Atlas"
        title="Workspace"
        description="Runtime directory for this cluster. Reset deletes only workspace/<cluster_id>/ — durable tfstate stays."
        actions={
          <Button variant="outline" render={<Link href={logsHref} />}>
            Logs
          </Button>
        }
      />

      {!loaded ? (
        <EmptyState title="Loading workspace" />
      ) : loadError && !status ? (
        <EmptyState title="Workspace unavailable" description={loadError} />
      ) : (
        <>
          <Panel className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            <ContextField
              label="Cluster"
              value={status?.cluster_id || clusterId}
              mono
            />
            <ContextField
              label="Workspace id"
              value={status?.workspace_id || "—"}
              mono
            />
            <ContextField
              label="Runtime path"
              value={status?.workspace_root || "—"}
              mono
            />
            <ContextField label="Logs path" value={status?.logs || "—"} mono />
            <ContextField
              label="Kubeconfig"
              value={
                status?.kubeconfig_exists === true
                  ? "yes"
                  : status?.kubeconfig_exists === false
                    ? "no"
                    : "—"
              }
            />
          </Panel>
          {loadError ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" disabled={busy} onClick={() => void refresh()}>
              Refresh
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="sm:ml-auto"
              disabled={busy}
              onClick={() => setConfirmOpen(true)}
            >
              Reset runtime
            </Button>
          </div>
          <div>
            <SectionHeader title="Runtime files" />
            {folders.length === 0 ? (
              <EmptyState
                title="No runtime folders"
                description="Workspace directories appear here after a run. Logs are on the Logs page."
              />
            ) : (
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList
                  variant="line"
                  className="h-auto w-full flex-wrap justify-start"
                >
                  {folders.map((name) => (
                    <TabsTrigger key={name} value={name} className="font-mono">
                      {name}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {folders.map((name) => (
                  <TabsContent key={name} value={name} className="mt-4">
                    {tab === name ? (
                      <WorkspaceFsBrowser
                        clusterId={clusterId}
                        rootRel={name}
                        refreshKey={fsKey}
                      />
                    ) : null}
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </div>
        </>
      )}

      <div>
        <Button
          type="button"
          variant="ghost"
          className="h-auto gap-2 px-0 text-sm font-normal text-muted-foreground hover:text-foreground"
          aria-expanded={advanced}
          onClick={() => setAdvanced((value) => !value)}
        >
          Advanced
          <ChevronDown
            className={cn(
              "size-4 transition-transform",
              advanced ? "rotate-180" : "rotate-0",
            )}
          />
        </Button>
        {advanced ? (
          <div className="mt-3">
            <JsonBlock value={status ?? {}} label="workspace show" />
          </div>
        ) : null}
      </div>

      {showHubLog && executionId && projectId ? (
        <div>
          <SectionHeader
            title="This reset"
            actions={
              <>
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
                {liveActive && liveStatus !== "CANCELING" ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() =>
                      void cancelOrStop(executionId, liveStatus ?? undefined)
                    }
                  >
                    {liveStatus === "QUEUED" ? "Cancel" : "Stop"}
                  </Button>
                ) : null}
              </>
            }
          />
          <LogViewer
            jobId={null}
            text={text}
            running={running}
            label="worker log"
          />
        </div>
      ) : null}

      {showLocalLog ? (
        <div>
          <SectionHeader title="This reset" />
          <LogViewer
            jobId={null}
            text={localLog}
            running={false}
            label="clusterctl log"
          />
        </div>
      ) : null}

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

function ContextField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-sm", mono && "font-mono break-all")}>{value}</p>
    </div>
  );
}
