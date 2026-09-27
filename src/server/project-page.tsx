import { notFound } from "next/navigation";

import { loadProjectCached } from "@/server/load-project";
import type { StargateProject } from "@/lib/project-types";

export async function resolveProjectPage(
  projectId: string,
): Promise<StargateProject> {
  const project = await loadProjectCached(projectId);
  if (!project) {
    notFound();
  }
  return project;
}
