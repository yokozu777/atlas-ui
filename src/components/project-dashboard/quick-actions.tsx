"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BookOpen, FileText, KeyRound, Play, Server } from "lucide-react";

import { projectHref } from "@/lib/project-href";

export function QuickActions({ projectId }: { projectId: string }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-medium">Quick Actions</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <QuickAction
          href={projectHref(projectId, "/runs")}
          icon={<Play />}
          label="Run Playbook"
        />
        <QuickAction
          href={projectHref(projectId, "/hosts")}
          icon={<Server />}
          label="Hosts & Groups"
        />
        <QuickAction
          href={projectHref(projectId, "/executions")}
          icon={<FileText />}
          label="Executions"
        />
        <QuickAction
          href={projectHref(projectId, "/roles")}
          icon={<BookOpen />}
          label="Roles"
        />
        <QuickAction
          href={projectHref(projectId, "/secrets")}
          icon={<KeyRound />}
          label="Secrets"
        />
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  label,
}: {
  href: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl bg-card px-4 py-5 transition-colors hover:bg-white/5"
      data-slot="panel"
    >
      <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
        {icon}
      </span>
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}
