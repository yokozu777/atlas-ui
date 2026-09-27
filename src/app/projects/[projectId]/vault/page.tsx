import { ProjectVaultsPage } from "@/components/project-vaults/project-vaults-page";
import { resolveProjectPage } from "@/server/project-page";

export default async function VaultPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await resolveProjectPage(projectId);
  return <ProjectVaultsPage projectId={project.id} />;
}
