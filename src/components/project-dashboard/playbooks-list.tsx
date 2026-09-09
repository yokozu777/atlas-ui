"use client";

import Link from "next/link";

import { Panel } from "@/components/panel";
import { StackList, StackListRow } from "@/components/stack-list";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  executionStatusLabel,
  formatRelativeTime,
  type DashboardPlaybook,
} from "@/lib/project-dashboard";
import { projectHref } from "@/lib/project-href";

export function PlaybooksList({
  projectId,
  playbooks,
  atlas = false,
}: {
  projectId: string;
  playbooks: DashboardPlaybook[];
  atlas?: boolean;
}) {
  const catalog = projectHref(projectId, "/playbooks");
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3 border-b border-foreground/10 px-4 py-3">
        <h2 className="text-sm font-medium">Playbooks</h2>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" render={<Link href={catalog} />}>
            View all
          </Button>
          {atlas ? null : (
            <Button size="sm" render={<Link href={catalog} />}>
              + New Playbook
            </Button>
          )}
        </div>
      </div>
      {playbooks.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-muted-foreground">
          No playbooks yet.
        </p>
      ) : (
        <StackList>
          {playbooks.map((pb) => (
            <StackListRow
              key={pb.id}
              title={pb.name}
              description={
                <>
                  {pb.description ? (
                    <span className="block truncate">{pb.description}</span>
                  ) : null}
                  <span className="mt-1 flex items-center gap-2">
                    {pb.lastStatus ? (
                      <StatusBadge
                        status={pb.lastStatus}
                        className="h-4 px-1.5 text-[10px]"
                      >
                        {executionStatusLabel(pb.lastStatus)}
                      </StatusBadge>
                    ) : (
                      <span>never run</span>
                    )}
                    {pb.lastAt != null ? (
                      <span className="tabular-nums">
                        · {formatRelativeTime(pb.lastAt)}
                      </span>
                    ) : null}
                  </span>
                </>
              }
              trailing={
                <Button
                  size="sm"
                  variant="outline"
                  render={
                    <Link
                      href={projectHref(
                        projectId,
                        `/playbooks/${encodeURIComponent(pb.id)}`,
                      )}
                    />
                  }
                >
                  Edit
                </Button>
              }
            />
          ))}
        </StackList>
      )}
    </Panel>
  );
}
