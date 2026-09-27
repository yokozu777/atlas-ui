"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  History,
  List,
  LoaderCircle,
  XCircle,
} from "lucide-react";

import { ExecutionRowActions } from "@/components/execution-row-actions";
import { Panel } from "@/components/panel";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EXECUTIONS_TABLE_LIMIT,
  executionStatusLabel,
  formatRelativeTime,
  type DashboardExecution,
} from "@/lib/project-dashboard";
import { projectHref } from "@/lib/project-href";

type ExecFilter = "all" | "success" | "failed" | "running";

function matchesFilter(row: DashboardExecution, filter: ExecFilter): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "success") {
    return row.status === "ok";
  }
  if (filter === "failed") {
    return row.status === "fail";
  }
  return row.status === "running";
}

export function RecentExecutions({
  projectId,
  executions,
  playbookColumnLabel = "Playbook",
  emptyMessage = "No executions yet.",
  emptyAction,
  fallbackClusterId,
  onQueued,
  onStopped,
}: {
  projectId: string;
  executions: DashboardExecution[];
  playbookColumnLabel?: string;
  emptyMessage?: string;
  emptyAction?: ReactNode;
  fallbackClusterId?: string;
  onQueued?: (executionId: string) => void;
  onStopped?: () => void;
}) {
  const [filter, setFilter] = useState<ExecFilter>("all");
  const rows = useMemo(
    () =>
      executions
        .filter((row) => matchesFilter(row, filter))
        .slice(0, EXECUTIONS_TABLE_LIMIT),
    [executions, filter],
  );

  return (
    <Panel className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-foreground/10 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <History className="size-4 text-muted-foreground" />
          Recent Executions
        </h2>
        <Button
          size="sm"
          variant="outline"
          render={<Link href={projectHref(projectId, "/executions")} />}
        >
          View all
        </Button>
      </div>
      <Tabs
        value={filter}
        onValueChange={(value) => setFilter(value as ExecFilter)}
        className="gap-0"
      >
        <div className="border-b border-foreground/10 px-4 py-2">
          <TabsList variant="line" className="h-8">
            <TabsTrigger value="all">
              <List />
              All
            </TabsTrigger>
            <TabsTrigger value="success">
              <CheckCircle2 />
              Success
            </TabsTrigger>
            <TabsTrigger value="failed">
              <XCircle />
              Failed
            </TabsTrigger>
            <TabsTrigger value="running">
              <LoaderCircle />
              Running
            </TabsTrigger>
          </TabsList>
        </div>
      </Tabs>
      {rows.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-6">
          <p className="text-[13px] text-muted-foreground">
            {executions.length === 0
              ? emptyMessage
              : "No executions in this filter."}
          </p>
          {executions.length === 0 ? emptyAction : null}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full caption-bottom text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>{playbookColumnLabel}</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Initiator</TableHead>
                <TableHead className="w-16">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="relative">
                  <TableCell>
                    <StatusBadge status={row.status}>
                      {executionStatusLabel(row.status)}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="max-w-[10rem] truncate font-medium">
                    <Link
                      href={projectHref(projectId, `/executions/${row.id}`)}
                      className="after:absolute after:inset-0"
                    >
                      {row.playbookName}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[8rem] truncate text-[13px] text-muted-foreground">
                    {row.target}
                  </TableCell>
                  <TableCell className="tabular-nums text-[13px] text-muted-foreground">
                    {row.duration}
                  </TableCell>
                  <TableCell className="tabular-nums text-[13px] text-muted-foreground">
                    {formatRelativeTime(row.startedAt)}
                  </TableCell>
                  <TableCell className="max-w-[8rem] truncate text-[13px] text-muted-foreground">
                    {row.workerName}
                  </TableCell>
                  <TableCell className="w-16">
                    <ExecutionRowActions
                      projectId={projectId}
                      fallbackClusterId={fallbackClusterId}
                      execution={{
                        id: row.id,
                        kind: row.kind ?? undefined,
                        status: row.rawStatus || row.status,
                        rawStatus: row.rawStatus,
                        playbookId: row.playbookId ?? undefined,
                        playbookName: row.playbookName,
                        runParams: row.runParams,
                      }}
                      onQueued={onQueued}
                      onStopped={onStopped}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </table>
        </div>
      )}
    </Panel>
  );
}
