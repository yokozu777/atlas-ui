import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: ReactNode;
}) {
  return (
    <div
      data-slot="panel"
      className="flex flex-col items-center justify-center gap-2 rounded-xl bg-card py-16 text-center"
    >
      <p className="font-display text-lg font-medium tracking-tight">{title}</p>
      {description ? (
        <div className="max-w-sm text-sm text-muted-foreground">{description}</div>
      ) : null}
    </div>
  );
}
