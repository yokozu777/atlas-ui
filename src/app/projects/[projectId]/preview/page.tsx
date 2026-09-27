import { redirect } from "next/navigation";

import { InventoryPreviewPage } from "@/components/inventory-preview-page";
import { projectHref } from "@/lib/project-href";
import { resolveProjectPage } from "@/server/project-page";

export default async function ProjectPreviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await resolveProjectPage(projectId);
  if (project.kind === "atlas") {
    redirect(projectHref(project.id, "/hosts?tab=vars"));
  }
  return <InventoryPreviewPage projectId={project.id} />;
}
