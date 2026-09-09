import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Panel({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel"
      className={cn(
        "overflow-hidden rounded-xl bg-card",
        className,
      )}
      {...props}
    />
  );
}

export function TerminalChrome({
  label,
  actions,
  className,
}: {
  label: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 border-b border-foreground/10 px-4 py-2.5",
        className,
      )}
    >
      <div className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
        {label}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
