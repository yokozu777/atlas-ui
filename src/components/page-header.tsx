import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageHeader({
  kicker,
  title,
  description,
  actions,
  className,
}: {
  kicker?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-10 flex flex-wrap items-start justify-between gap-4",
        className,
      )}
    >
      <div className="min-w-0 space-y-3">
        {kicker ? (
          <p className="text-[13px] text-muted-foreground">{kicker}</p>
        ) : null}
        <h1 className="font-display text-5xl font-medium tracking-tighter md:text-6xl">
          {title}
        </h1>
        {description ? (
          <div className="max-w-xl text-xl text-muted-foreground">
            {description}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
