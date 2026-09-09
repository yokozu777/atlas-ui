import type { ReactNode } from "react";

import {
  Card,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TONE_CLASS = {
  success: {
    card: "bg-[color-mix(in_oklch,var(--success)_14%,var(--card))] ring-success/35",
    icon: "bg-success/20 text-success ring-success/30",
    hint: "text-success",
  },
  destructive: {
    card: "bg-[color-mix(in_oklch,var(--destructive)_14%,var(--card))] ring-destructive/35",
    icon: "bg-destructive/20 text-destructive ring-destructive/30",
    hint: "text-destructive",
  },
  warning: {
    card: "bg-[color-mix(in_oklch,var(--warning)_14%,var(--card))] ring-warning/35",
    icon: "bg-warning/20 text-warning ring-warning/30",
    hint: "text-warning",
  },
  info: {
    card: "bg-[color-mix(in_oklch,var(--info)_14%,var(--card))] ring-info/35",
    icon: "bg-info/20 text-info ring-info/30",
    hint: "text-info",
  },
  primary: {
    card: "bg-[color-mix(in_oklch,var(--chart-1)_14%,var(--card))] ring-chart-1/35",
    icon: "bg-chart-1/20 text-chart-1 ring-chart-1/30",
    hint: "text-chart-1",
  },
} as const;

export type MetricTone = keyof typeof TONE_CLASS;

export function MetricCard({
  tone,
  label,
  value,
  hint,
  icon,
  className,
}: {
  tone: MetricTone;
  label: string;
  value: ReactNode;
  hint: string;
  icon?: ReactNode;
  className?: string;
}) {
  const colors = TONE_CLASS[tone];
  return (
    <Card className={cn("ring-1", colors.card, className)}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs text-muted-foreground">{label}</p>
          {icon ? (
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-lg ring-1 [&_svg]:size-4",
                colors.icon,
              )}
            >
              {icon}
            </span>
          ) : null}
        </div>
        <CardTitle className="text-3xl font-medium tracking-tight tabular-nums">
          {value}
        </CardTitle>
        <p className={cn("text-xs", colors.hint)}>{hint}</p>
      </CardHeader>
    </Card>
  );
}
