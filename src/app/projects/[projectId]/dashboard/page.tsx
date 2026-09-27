import { redirect } from "next/navigation";

import { AnsibleDashboardPage } from "@/components/project-dashboard/ansible-dashboard-page";
import { projectHref } from "@/lib/project-href";
import { resolveProjectPage } from "@/server/project-page";

export default async function ProjectDashboardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await resolveProjectPage(projectId);
  if (project.kind === "atlas") {
    redirect(projectHref(project.id));
  }
  return <AnsibleDashboardPage projectId={project.id} />;
}
