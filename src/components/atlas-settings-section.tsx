import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function AtlasSettingsSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-t border-border py-8", className)}>
      <div className="mb-6 space-y-1">
        <h2 className="text-sm font-medium tracking-tight">{title}</h2>
        {description ? (
          <div className="max-w-2xl text-sm text-muted-foreground">
            {description}
          </div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function AtlasSettingsField({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-start sm:gap-6">
      <LabelCol htmlFor={htmlFor}>{label}</LabelCol>
      <div className="min-w-0 space-y-1.5">
        {children}
        {hint ? (
          <p className="text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}

function LabelCol({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-sm text-muted-foreground sm:pt-2"
    >
      {children}
    </label>
  );
}
