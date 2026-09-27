import { PlaybooksCatalogPage } from "@/components/playbooks-catalog-page";
import { projectHref } from "@/lib/project-href";
import { resolveProjectPage } from "@/server/project-page";
import { redirect } from "next/navigation";

export default async function ProjectPlaybooksPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await resolveProjectPage(projectId);
  if (project.kind === "atlas") {
    redirect(projectHref(project.id, "/cluster-yaml?tab=health"));
  }
  return <PlaybooksCatalogPage projectId={project.id} />;
}
