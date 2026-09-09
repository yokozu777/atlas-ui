import { AnsibleConfigPage } from "@/components/hosts-groups/ansible-config-page";
import { resolveProjectPage } from "@/server/project-page";

export default async function ProjectAnsibleConfigPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await resolveProjectPage(projectId);
  return <AnsibleConfigPage projectId={project.id} />;
}
