"use client";

import { use } from "react";

import { ExecutionLogViewer } from "@/components/execution-log";

export default function ExecutionLogPage({
  params,
}: {
  params: Promise<{ projectId: string; executionId: string }>;
}) {
  const { projectId, executionId } = use(params);
  return (
    <ExecutionLogViewer
      projectId={decodeURIComponent(projectId)}
      executionId={decodeURIComponent(executionId)}
    />
  );
}
