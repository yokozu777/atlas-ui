"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, XAxis } from "recharts";

import { ChartPeriodToggle } from "@/components/project-dashboard/chart-period-toggle";
import { Panel } from "@/components/panel";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  activityTotal,
  bucketActivity,
  type ChartPeriod,
  type DashboardExecution,
} from "@/lib/project-dashboard";

const chartConfig = {
  count: {
    label: "Executions",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const CHART_HEIGHT = "h-[280px]";

export function ActivityChart({
  executions,
  error,
}: {
  executions: DashboardExecution[];
  error: string | null;
}) {
  const [period, setPeriod] = useState<ChartPeriod>("24h");
  const buckets = useMemo(
    () => bucketActivity(executions, period),
    [executions, period],
  );
  const total = activityTotal(buckets);

  return (
    <Panel className="flex min-h-0 min-w-0 flex-col overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-foreground/10 px-4 py-3">
        <h2 className="text-sm font-medium">Execution Activity</h2>
        <div className="flex items-center gap-3">
          <span className="tabular-nums text-[13px] text-muted-foreground">
            {total} executions
          </span>
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
            <AreaChart
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
                cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                content={
                  <ChartTooltipContent
                    indicator="line"
                    labelFormatter={(_, payload) => {
                      const row = payload?.[0]?.payload as
                        | { tooltip?: string }
                        | undefined;
                      return row?.tooltip ?? "";
                    }}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="var(--color-count)"
                fill="var(--color-count)"
                fillOpacity={0.14}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </div>
    </Panel>
  );
}

function ChartMessage({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center text-[13px] text-muted-foreground">
      {text}
    </div>
  );
}
