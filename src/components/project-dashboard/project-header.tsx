"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { projectHref } from "@/lib/project-href";
import type { DashboardProject } from "@/lib/project-dashboard";

export function ProjectHeader({
  projectId,
  project,
}: {
  projectId: string;
  project: DashboardProject;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <p className="text-[13px] text-muted-foreground">Ansible</p>
        <h1 className="truncate text-xl font-medium tracking-tight">
          {project.name}
        </h1>
        {project.description ? (
          <p className="max-w-2xl truncate text-[13px] text-muted-foreground">
            {project.description}
          </p>
        ) : null}
      </div>
      <Button
        variant="outline"
        size="sm"
        render={<Link href={projectHref(projectId, "/playbooks")} />}
      >
        Playbooks
      </Button>
    </div>
  );
}
