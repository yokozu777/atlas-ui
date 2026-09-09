"use client";

import { Suspense } from "react";

import { EmptyState } from "@/components/empty-state";
import { HostsGroupsPage } from "@/components/hosts-groups/hosts-groups-page";

export function AnsibleHostsPage({ projectId }: { projectId: string }) {
  return (
    <Suspense fallback={<EmptyState title="Loading hosts" />}>
      <HostsGroupsPage projectId={projectId} />
    </Suspense>
  );
}
