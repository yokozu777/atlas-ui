"use client";

import { use } from "react";

import { ProjectVaultsPage } from "@/components/project-vaults/project-vaults-page";

export default function VaultPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const projectId = decodeURIComponent(use(params).projectId);
  return <ProjectVaultsPage projectId={projectId} />;
}
