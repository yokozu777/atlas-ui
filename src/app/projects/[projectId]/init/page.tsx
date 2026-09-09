import InitPage from "@/app/init/page";
import { MissingAtlasCluster, resolveProjectPage } from "@/server/project-page";
import { redirect } from "next/navigation";
import { projectHref } from "@/lib/project-href";

export default async function ProjectInitPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await resolveProjectPage(projectId);
  if (project.kind === "ansible") {
    redirect(projectHref(projectId));
  }
  if (!project.cluster_id) {
    return <MissingAtlasCluster />;
  }
  return <InitPage />;
}
