import { redirect } from "next/navigation";

import { AnsibleRunsPage } from "@/app/projects/[projectId]/runs/ansible-runs";
import { projectHref } from "@/lib/project-href";
import { resolveProjectPage } from "@/server/project-page";

export default async function ProjectRunsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await resolveProjectPage(projectId);
  if (project.kind === "atlas") {
    redirect(projectHref(project.id));
  }
  return <AnsibleRunsPage projectId={project.id} />;
}
