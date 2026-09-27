import { cn } from "@/lib/utils";

export function SetupProgressBar({
  filled,
  total,
  label,
  compact,
  className,
}: {
  filled: number;
  total: number;
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  const safeTotal = Math.max(total, 0);
  const safeFilled = Math.min(Math.max(filled, 0), safeTotal);
  const complete = safeTotal > 0 && safeFilled >= safeTotal;
  const pct = safeTotal <= 0 ? 0 : Math.round((safeFilled / safeTotal) * 100);
  const caption = complete
    ? "Ready"
    : compact
      ? `${safeFilled} / ${safeTotal}`
      : `${safeFilled} / ${safeTotal} fields`;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">{label ?? caption}</span>
        {compact ? null : (
          <span className="shrink-0 tabular-nums">
            {safeFilled} / {safeTotal}
          </span>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            complete ? "bg-success" : "bg-chart-1",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
