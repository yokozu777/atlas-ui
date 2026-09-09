"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, XAxis } from "recharts";

import { ChartPeriodToggle } from "@/components/project-dashboard/chart-period-toggle";
import { Panel } from "@/components/panel";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  bucketStatus,
  statusTotal,
  type ChartPeriod,
  type DashboardExecution,
  type StatusBucket,
} from "@/lib/project-dashboard";
import { cn } from "@/lib/utils";

const chartConfig = {
  success: {
    label: "Success",
    color: "var(--success)",
  },
  failed: {
    label: "Failed",
    color: "var(--destructive)",
  },
  running: {
    label: "Running",
    color: "var(--warning)",
  },
} satisfies ChartConfig;

const CHART_HEIGHT = "h-[280px]";

export function StatusChart({
  executions,
  error,
}: {
  executions: DashboardExecution[];
  error: string | null;
}) {
  const [period, setPeriod] = useState<ChartPeriod>("24h");
  const buckets = useMemo(
    () => bucketStatus(executions, period),
    [executions, period],
  );
  const total = statusTotal(buckets);

  return (
    <Panel className="flex min-h-0 min-w-0 flex-col overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-foreground/10 px-4 py-3">
        <h2 className="text-sm font-medium">Execution Status</h2>
        <div className="flex items-center gap-3">
          <Legend />
          <ChartPeriodToggle value={period} onChange={setPeriod} />
        </div>
      </div>
      <div className={`min-w-0 px-2 pb-2 pt-1 ${CHART_HEIGHT}`}>
        {error ? (
          <ChartMessage text={error} />
        ) : total === 0 ? (
          <ChartMessage text="No execution history available" />
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-full w-full min-w-0"
          >
            <BarChart
              accessibilityLayer
              data={buckets}
              margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
            >
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval={0}
                minTickGap={8}
                tickMargin={8}
              />
              <ChartTooltip
                cursor={{ fill: "var(--foreground)", fillOpacity: 0.04 }}
                content={<StatusTooltip />}
              />
              <Bar
                dataKey="success"
                stackId="status"
                fill="var(--color-success)"
                maxBarSize={18}
              />
              <Bar
                dataKey="failed"
                stackId="status"
                fill="var(--color-failed)"
                maxBarSize={18}
              />
              <Bar
                dataKey="running"
                stackId="status"
                fill="var(--color-running)"
                maxBarSize={18}
              />
            </BarChart>
          </ChartContainer>
        )}
      </div>
    </Panel>
  );
}

function Legend() {
  return (
    <div className="hidden items-center gap-3 text-[12px] text-muted-foreground sm:flex">
      <LegendSwatch className="bg-success" label="Success" />
      <LegendSwatch className="bg-destructive" label="Failed" />
      <LegendSwatch className="bg-warning" label="Running" />
    </div>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-1.5 rounded-sm", className)} />
      {label}
    </span>
  );
}

function StatusTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: StatusBucket }[];
}) {
  if (!active || !payload?.length) {
    return null;
  }
  const row = payload[0]?.payload;
  if (!row) {
    return null;
  }
  const total = row.success + row.failed + row.running;
  return (
    <div className="grid min-w-36 gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <p className="font-medium">{row.tooltip}</p>
      <p className="flex justify-between gap-4">
        <span className="text-muted-foreground">Success</span>
        <span className="tabular-nums">{row.success}</span>
      </p>
      <p className="flex justify-between gap-4">
        <span className="text-muted-foreground">Failed</span>
        <span className="tabular-nums">{row.failed}</span>
      </p>
      <p className="flex justify-between gap-4">
        <span className="text-muted-foreground">Running</span>
        <span className="tabular-nums">{row.running}</span>
      </p>
      <p className="flex justify-between gap-4 border-t border-foreground/10 pt-1 font-medium">
        <span>Total</span>
        <span className="tabular-nums">{total}</span>
      </p>
    </div>
  );
}

function ChartMessage({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center text-[13px] text-muted-foreground">
      {text}
    </div>
  );
}
