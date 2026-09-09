"use client";

import { ActivityChart } from "@/components/project-dashboard/activity-chart";
import { StatusChart } from "@/components/project-dashboard/status-chart";
import type { DashboardExecution } from "@/lib/project-dashboard";

export function ExecutionCharts({
  executions,
  error,
}: {
  executions: DashboardExecution[];
  error: string | null;
}) {
  return (
    <div className="grid min-w-0 grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
      <ActivityChart executions={executions} error={error} />
      <StatusChart executions={executions} error={error} />
    </div>
  );
}
