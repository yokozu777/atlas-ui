"use client";

import Link from "next/link";
import { FolderGit2 } from "lucide-react";

import { Panel } from "@/components/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatRelativeTime,
  type DashboardRepo,
} from "@/lib/project-dashboard";
import { projectHref } from "@/lib/project-href";

export function RepositoryStatus({
  projectId,
  repo,
}: {
  projectId: string;
  repo: DashboardRepo;
}) {
  const settingsHref = projectHref(projectId, "/settings");
  return (
    <Panel>
      <div className="flex items-center justify-between border-b border-foreground/10 px-4 py-3">
        <h2 className="text-sm font-medium">Repository</h2>
        <Button size="sm" variant="outline" render={<Link href={settingsHref} />}>
          Settings
        </Button>
      </div>
      <Link
        href={settingsHref}
        className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-white/5"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <FolderGit2 className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">Repository Workspace</p>
            <p className="truncate text-[13px] text-muted-foreground">
              {repo.ref} · {repo.revision}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline">{repo.mode}</Badge>
          <Badge
            variant={
              repo.pull === "error"
                ? "destructive"
                : repo.pull === "ok"
                  ? "success"
                  : "outline"
            }
          >
            {repo.label}
          </Badge>
          <span className="hidden text-[13px] tabular-nums text-muted-foreground sm:inline">
            {formatRelativeTime(repo.lastSyncAt)}
          </span>
        </div>
      </Link>
    </Panel>
  );
}
