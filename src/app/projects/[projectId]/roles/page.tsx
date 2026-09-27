"use client";

import { Suspense, use } from "react";

import { AnsibleRolesPage } from "@/components/ansible-roles-page";
import { EmptyState } from "@/components/empty-state";

export default function RolesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  return (
    <Suspense fallback={<EmptyState title="Loading roles" />}>
      <RolesPageInner params={params} />
    </Suspense>
  );
}

function RolesPageInner({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const projectId = decodeURIComponent(use(params).projectId);
  return <AnsibleRolesPage projectId={projectId} />;
}
