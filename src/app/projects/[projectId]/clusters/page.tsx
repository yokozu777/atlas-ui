"use client";

import { use } from "react";

import { ClustersCatalog } from "@/components/clusters-catalog";

export default function ProjectClustersPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const projectId = decodeURIComponent(use(params).projectId);
  return <ClustersCatalog projectId={projectId} />;
}
