"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BookOpen, FileText, KeyRound, Play, Server } from "lucide-react";

import { projectHref } from "@/lib/project-href";
import { cn } from "@/lib/utils";

export type QuickActionItem = {
  label: string;
  icon: ReactNode;
  href?: string;
  onClick?: () => void;
};

function defaultItems(projectId: string): QuickActionItem[] {
  return [
    {
      href: projectHref(projectId, "/runs"),
      icon: <Play />,
      label: "Run Playbook",
    },
    {
      href: projectHref(projectId, "/hosts"),
      icon: <Server />,
      label: "Hosts & Groups",
    },
    {
      href: projectHref(projectId, "/executions"),
      icon: <FileText />,
      label: "Executions",
    },
    {
      href: projectHref(projectId, "/roles"),
      icon: <BookOpen />,
      label: "Roles",
    },
    {
      href: projectHref(projectId, "/secrets"),
      icon: <KeyRound />,
      label: "Secrets",
    },
  ];
}

export function QuickActions({
  projectId,
  items,
  hideTitle = false,
}: {
  projectId?: string;
  items?: QuickActionItem[];
  hideTitle?: boolean;
}) {
  const resolved = items ?? (projectId ? defaultItems(projectId) : []);
  return (
    <div>
      {hideTitle ? null : (
        <h2 className="mb-3 text-sm font-medium">Quick Actions</h2>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {resolved.map((item) => (
          <QuickAction key={item.label} {...item} />
        ))}
      </div>
    </div>
  );
}

function QuickAction({ href, onClick, icon, label }: QuickActionItem) {
  const className =
    "flex items-center gap-3 rounded-xl bg-card px-4 py-5 text-left transition-colors hover:bg-white/5";
  const body = (
    <>
      <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
        {icon}
      </span>
      <span className="text-sm font-medium">{label}</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={className} data-slot="panel">
        {body}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={cn(className, "w-full")}
      data-slot="panel"
      onClick={onClick}
    >
      {body}
    </button>
  );
}
