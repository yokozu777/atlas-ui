import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { loadProject } from "@/server/load-project";
import type { StargateProject } from "@/lib/project-types";

export async function resolveProjectPage(
  projectId: string,
): Promise<StargateProject> {
  const project = await loadProject(projectId);
  if (!project) {
    notFound();
  }
  return project;
}

export function MissingAtlasCluster() {
  return (
    <EmptyState
      title="Atlas cluster is not bound"
      description="This atlas project has no cluster_id. Recreate it with a leaf such as dev/k8s."
    />
  );
}
