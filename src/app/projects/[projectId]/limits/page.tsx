import { resolveProjectPage } from "@/server/project-page";
import { projectHref } from "@/lib/project-href";
import { redirect } from "next/navigation";

export default async function ProjectLimitsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await resolveProjectPage(projectId);
  redirect(projectHref(project.id, "/hosts"));
}
