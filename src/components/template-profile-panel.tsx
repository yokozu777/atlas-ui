"use client";

import { TemplateFlowCanvas, TemplateNodeIcon } from "@/components/template-flow-canvas";
import { templateProfile } from "@/lib/template-profiles";
import { cn } from "@/lib/utils";

export function TemplateProfilePanel({
  template,
  className,
}: {
  template: string;
  className?: string;
}) {
  const profile = templateProfile(template);
  if (!profile) return null;

  const serverLabel =
    profile.servers === 0
      ? "No guest VMs"
      : `${profile.servers} VM${profile.servers === 1 ? "" : "s"}`;

  return (
    <aside
      className={cn(
        "flex flex-col gap-5 rounded-xl bg-card p-5",
        className,
      )}
    >
      <div className="space-y-2">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Template default
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-mono text-sm font-medium">{template}</h2>
          <p className="text-2xl font-medium tracking-tight tabular-nums">
            {serverLabel}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">{profile.technologies}</p>
        <p className="text-sm">{profile.summary}</p>
      </div>

      {profile.roles.length > 0 ? (
        <section className="space-y-1">
          <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Roles
          </h3>
          <ul className="divide-y divide-foreground/10">
            {profile.roles.map((role) => (
              <li key={role.label} className="flex items-center gap-2 py-1">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-white/10 text-muted-foreground">
                  <TemplateNodeIcon label={role.label} className="size-3" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px]">{role.label}</span>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {role.count}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Layout
        </h3>
        <div className="h-[22rem] overflow-hidden rounded-xl ring-1 ring-foreground/10">
          <TemplateFlowCanvas stages={profile.flow} />
        </div>
      </section>

      {profile.spec.map((group) => (
        <section key={group.title} className="space-y-2">
          <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {group.title}
          </h3>
          <ul className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            {group.items.map((item) => (
              <li
                key={item.name}
                className="flex min-w-0 items-baseline justify-between gap-3 border-b border-foreground/10 py-1.5"
              >
                <span className="truncate text-[13px]">{item.name}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {item.version}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="text-[11px] text-muted-foreground">
        Counts and versions come from the scaffold. You can change them after init.
      </p>
    </aside>
  );
}
