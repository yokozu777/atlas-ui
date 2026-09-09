import type { ReactNode } from "react";

import { Panel } from "@/components/panel";
import { cn } from "@/lib/utils";

export function SettingsSection({
  icon,
  title,
  actions,
  children,
  className,
}: {
  icon?: ReactNode;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Panel className={cn("space-y-4 p-6", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold uppercase tracking-wide">{title}</h2>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </Panel>
  );
}

export function SettingsHint({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-info/40 bg-info/10 px-3 py-2 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
