"use client";

import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { lastRunStatus } from "@/lib/cluster-types";
import type { JobSnapshot } from "@/server/jobs";

export type StatusKind =
  | "ok"
  | "fail"
  | "unknown"
  | "running"
  | "canceling"
  | "canceled"
  | "pending"
  | "skipped";

export function jobStatusKind(job: JobSnapshot): StatusKind {
  if (job.status === "running") {
    return "running";
  }
  if (job.status === "canceled") {
    return "canceled";
  }
  if (job.exitCode === 0) {
    return "ok";
  }
  if (job.exitCode !== null) {
    return "fail";
  }
  return "unknown";
}

export function StatusBadge({
  status,
  className,
  children,
}: {
  status: StatusKind;
  className?: string;
  children?: ReactNode;
}) {
  const variant =
    status === "ok"
      ? "success"
      : status === "fail"
        ? "destructive"
        : status === "running" || status === "canceling" || status === "canceled"
          ? "warning"
          : status === "unknown"
            ? "info"
            : "outline";
  return (
    <Badge variant={variant} className={className}>
      {children ?? status}
    </Badge>
  );
}

export function MetaStatusBadge({
  meta,
  className,
}: {
  meta: Record<string, unknown> | null;
  className?: string;
}) {
  return <StatusBadge status={lastRunStatus(meta)} className={className} />;
}
