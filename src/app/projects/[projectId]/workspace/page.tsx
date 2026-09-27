import { redirect } from "next/navigation";

import { projectHref } from "@/lib/project-href";
import { resolveProjectPage } from "@/server/project-page";

export default async function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await resolveProjectPage(projectId);
  if (project.kind === "atlas") {
    redirect(projectHref(project.id, "/cluster-yaml?tab=runtime"));
  }
  redirect(projectHref(project.id));
}
