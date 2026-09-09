import { AnsibleHostsPage } from "@/components/ansible-hosts-page";
import { resolveProjectPage } from "@/server/project-page";

export default async function ProjectHostsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await resolveProjectPage(projectId);
  return <AnsibleHostsPage projectId={project.id} />;
}
