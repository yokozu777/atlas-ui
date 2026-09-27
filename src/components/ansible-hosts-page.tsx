"use client";

import { Suspense } from "react";

import { EmptyState } from "@/components/empty-state";
import { HostsGroupsPage } from "@/components/hosts-groups/hosts-groups-page";
import type { ProjectKind } from "@/lib/project-types";

export function AnsibleHostsPage({
  projectId,
  kind,
}: {
  projectId: string;
  kind?: ProjectKind;
}) {
  return (
    <Suspense fallback={<EmptyState title="Loading hosts" />}>
      <HostsGroupsPage projectId={projectId} kind={kind} />
    </Suspense>
  );
}
