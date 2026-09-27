import { AtlasPackMapPage } from "@/components/atlas-pack-map-page";
import { projectHref } from "@/lib/project-href";
import { resolveProjectPage } from "@/server/project-page";
import { redirect } from "next/navigation";

export default async function ProjectPackMapPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await resolveProjectPage(projectId);
  if (project.kind === "ansible") {
    redirect(projectHref(project.id, "/hosts"));
  }
  return <AtlasPackMapPage projectId={project.id} />;
}
