"use client";

import { Check, Circle, MoreHorizontal, Square, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { ExecutionRowActions } from "@/components/execution-row-actions";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ACTIVE_EXECUTION_STATUSES,
  formatClockDuration,
  formatClockTime,
} from "@/lib/execution-log";
import {
  executionStatusKind,
  executionStatusLabel,
  playbookNameOf,
  toMs,
  type RawExecution,
} from "@/lib/project-dashboard";
import { projectHref } from "@/lib/project-href";
import { cn } from "@/lib/utils";

function inventoryLabel(record: RawExecution | null): string {
  const files = record?.runParams?.inventory_files;
  if (files && files.length > 0) {
    return files.join(", ");
  }
  const clusterId = record?.runParams?.cluster_id?.trim();
  if (clusterId) {
    return clusterId;
  }
  return "—";
}

export function ExecutionHeader({
  projectId,
  executionId,
  record,
  loading,
  liveStatus,
  now,
  onCopyAll,
  onCopyVisible,
  onDownload,
}: {
  projectId: string;
  executionId: string;
  record: RawExecution | null;
  loading: boolean;
  liveStatus: string | null;
  now: number;
  onCopyAll: () => void;
  onCopyVisible: () => void;
  onDownload: () => void;
}) {
  const router = useRouter();
  const status = liveStatus || record?.status || "UNKNOWN";
  const kind = executionStatusKind(status);
  const label = executionStatusLabel(kind);
  const id = record?.id || record?.executionId || executionId;
  const playbook = record ? playbookNameOf(record) : "—";
  const inventory = inventoryLabel(record);
  const worker = record?.workerName || "—";
  const startedMs = toMs(record?.startedAt ?? record?.queuedAt ?? record?.createdAt);
  const finishedMs = toMs(record?.finishedAt);
  const active = ACTIVE_EXECUTION_STATUSES.has(status);
  const durationMs =
    startedMs != null
      ? (finishedMs ?? (active ? now : startedMs)) - startedMs
      : null;

  if (loading && !record) {
    return (
      <div data-slot="execution-header" className="mb-3 shrink-0 space-y-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-80" />
      </div>
    );
  }

  return (
    <div
      data-slot="execution-header"
      className="mb-3 flex shrink-0 flex-wrap items-start justify-between gap-3"
    >
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] text-muted-foreground">Execution</p>
          <h1 className="font-mono text-sm font-medium tracking-tight md:text-base">
            {id || "—"}
          </h1>
          <StatusBadge status={kind} className="gap-1">
            {kind === "ok" ? (
              <Check />
            ) : kind === "fail" ? (
              <X />
            ) : kind === "running" ? (
              <Circle className="fill-current" />
            ) : (
              <Square className="fill-current" />
            )}
            {label}
          </StatusBadge>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          <span className="text-foreground/80">{playbook}</span>
          <span className="px-1.5">·</span>
          {inventory}
          <span className="px-1.5">·</span>
          {worker}
          <span className="px-1.5">·</span>
          started {startedMs != null ? formatClockTime(startedMs) : "—"}
          <span className="px-1.5">·</span>
          {durationMs != null ? formatClockDuration(durationMs) : "—"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ExecutionRowActions
          projectId={projectId}
          size="icon-sm"
          liveStatus={liveStatus}
          execution={
            id
              ? {
                  ...(record ?? {}),
                  id,
                  status: record?.status || liveStatus || undefined,
                  rawStatus: record?.status || liveStatus,
                }
              : null
          }
          onQueued={(nextId) =>
            router.push(projectHref(projectId, `/executions/${nextId}`))
          }
        />
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Execution actions"
            className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }))}
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuItem onClick={onCopyVisible}>Copy visible</DropdownMenuItem>
            <DropdownMenuItem onClick={onCopyAll}>Copy all</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDownload}>Download log</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
