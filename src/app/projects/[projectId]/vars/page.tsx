import { VarsPage } from "@/components/hosts-groups/vars-page";
import { resolveProjectPage } from "@/server/project-page";

export default async function ProjectVarsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await resolveProjectPage(projectId);
  return <VarsPage projectId={project.id} />;
}
