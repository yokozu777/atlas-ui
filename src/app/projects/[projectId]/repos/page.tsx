import { resolveProjectPage } from "@/server/project-page";
import { redirect } from "next/navigation";
import { projectHref } from "@/lib/project-href";

export default async function ProjectReposPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await resolveProjectPage(projectId);
  if (project.kind === "ansible") {
    redirect(projectHref(project.id, "/settings"));
  }
  redirect(projectHref(project.id, "/cluster-yaml?tab=repos"));
}
