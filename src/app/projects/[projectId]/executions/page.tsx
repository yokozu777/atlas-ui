"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AtlasSessionLogsPage } from "@/components/atlas-session-cluster-view";
import { EmptyState } from "@/components/empty-state";
import { ExecutionRowActions } from "@/components/execution-row-actions";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatExactTime, formatExecutionDuration } from "@/lib/format-time";
import { projectHref } from "@/lib/project-href";
import { fetchProject, stargateJson } from "@/lib/stargate";
import type { StargateProject } from "@/lib/project-types";
import { cn } from "@/lib/utils";

type Execution = {
  id?: string;
  executionId?: string;
  status?: string;
  playbookName?: string;
  playbookId?: string;
  playbook_id?: string;
  kind?: string;
  queuedAt?: string | number | null;
  startedAt?: string | number | null;
  createdAt?: string | number | null;
  finishedAt?: string | number | null;
  duration?: number | null;
  selectionSnapshot?: { playbookId?: string; playbookName?: string };
  runParams?: {
    phases?: string[];
    cluster_id?: string;
    argv?: string[];
    root_ssh?: boolean;
    inventory_files?: string[];
    ansible_config?: string;
    executor?: string;
  };
};

type HistoryTab = "jobs" | "logs";
type StatusFilter = "all" | "success" | "failed" | "running";

function parseHistoryTab(value: string | null): HistoryTab {
  return value === "logs" ? "logs" : "jobs";
}

function executionMatchesFilter(row: Execution, filter: StatusFilter): boolean {
  const status = (row.status ?? "").toUpperCase();
  if (filter === "all") {
    return true;
  }
  if (filter === "success") {
    return status === "SUCCESS" || status === "COMPLETED" || status === "COMPLETE";
  }
  if (filter === "failed") {
    return status === "FAILED" || status === "FAIL" || status === "ERROR";
  }
  return (
    status === "RUNNING" ||
    status === "QUEUED" ||
    status === "CANCELING" ||
    status === "CANCELLING"
  );
}

function executionPhases(row: Execution): string {
  const list = row.runParams?.phases;
  if (Array.isArray(list) && list.length > 0) {
    return list.join(", ");
  }
  return row.playbookName ?? "all";
}

export default function ExecutionsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  return (
    <Suspense fallback={<EmptyState title="Loading executions" />}>
      <ExecutionsPageInner params={params} />
    </Suspense>
  );
}

function ExecutionsPageInner({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const projectId = decodeURIComponent(use(params).projectId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseHistoryTab(searchParams.get("tab"));
  const [project, setProject] = useState<StargateProject | null>(null);
  const [rows, setRows] = useState<Execution[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  async function load() {
    const data = await stargateJson<{ executions?: Execution[] }>(
      `/executions?project_id=${encodeURIComponent(projectId)}`,
    );
    setRows(data.executions ?? []);
  }

  useEffect(() => {
    void fetchProject(projectId)
      .then(setProject)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    void load().catch((err: unknown) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (error) {
    return (
      <EmptyState
        title="Executions unavailable"
        description={error}
      />
    );
  }

  if (!project) {
    return <EmptyState title="Loading executions" />;
  }

  const atlas = project?.kind === "atlas";
  const visibleRows = rows.filter((row) =>
    executionMatchesFilter(row, statusFilter),
  );
  const statusFilters: { id: StatusFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "success", label: "Success" },
    { id: "failed", label: "Failed" },
    { id: "running", label: "Running" },
  ];
  const jobsTable = (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {statusFilters.map((item) => (
          <Button
            key={item.id}
            size="sm"
            variant={statusFilter === item.id ? "default" : "outline"}
            onClick={() => setStatusFilter(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <Panel>
        {visibleRows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title={
                rows.length === 0
                  ? "No executions"
                  : "No executions match this filter"
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Id</TableHead>
                <TableHead>{atlas ? "Phases" : "Name"}</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead className="sticky right-0 w-16 bg-card">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => {
                const id = row.id || row.executionId || "";
                const logHref = id
                  ? projectHref(projectId, `/executions/${id}`)
                  : "";
                return (
                  <TableRow
                    key={id}
                    className={cn(id && "cursor-pointer")}
                    onClick={() => {
                      if (logHref) {
                        router.push(logHref);
                      }
                    }}
                  >
                    <TableCell className="max-w-[9rem] truncate font-mono text-xs" title={id}>
                      {id}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {atlas ? executionPhases(row) : (row.playbookName ?? "—")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.kind ?? "ansible"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.status ?? "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {formatExactTime(
                        row.startedAt ?? row.queuedAt ?? row.createdAt,
                      )}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {formatExecutionDuration(row)}
                    </TableCell>
                    <TableCell
                      className="sticky right-0 bg-card text-right"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="flex items-center justify-end">
                        <ExecutionRowActions
                          projectId={projectId}
                          execution={
                            id
                              ? {
                                  ...row,
                                  id,
                                  rawStatus: row.status,
                                }
                              : null
                          }
                          onQueued={(nextId) =>
                            router.push(
                              projectHref(projectId, `/executions/${nextId}`),
                            )
                          }
                          onStopped={() => void load()}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        )}
      </Panel>
    </div>
  );

  if (!atlas) {
    return (
      <div>
        <PageHeader
          kicker="Ansible"
          title="Executions"
          description="Worker runs. Cancel queued jobs; stop sends CANCELING to a running worker."
        />
        {jobsTable}
      </div>
    );
  }

  function setTab(next: string) {
    const parsed = parseHistoryTab(next);
    const href =
      parsed === "jobs"
        ? projectHref(projectId, "/executions")
        : projectHref(projectId, "/executions?tab=logs");
    router.replace(href, { scroll: false });
  }

  return (
    <div>
      <PageHeader
        kicker="Atlas"
        title="Executions"
        description="Worker jobs and clusterctl run stamps for this cluster"
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line">
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="logs">Cluster logs</TabsTrigger>
        </TabsList>
        <TabsContent value="jobs" className="mt-6">
          {jobsTable}
        </TabsContent>
        <TabsContent value="logs" className="mt-6">
          <AtlasSessionLogsPage hideHeader />
        </TabsContent>
      </Tabs>
    </div>
  );
}
