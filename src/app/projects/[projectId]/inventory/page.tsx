import { InventoryPage } from "@/components/hosts-groups/inventory-page";
import { resolveProjectPage } from "@/server/project-page";

export default async function ProjectInventoryPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await resolveProjectPage(projectId);
  return <InventoryPage projectId={project.id} />;
}
