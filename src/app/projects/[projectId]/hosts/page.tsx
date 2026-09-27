import { redirect } from "next/navigation";

import { AnsibleHostsPage } from "@/components/ansible-hosts-page";
import { projectHref } from "@/lib/project-href";
import { resolveProjectPage } from "@/server/project-page";

export default async function ProjectHostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const project = await resolveProjectPage(projectId);
  if (query.tab === "ansible_config") {
    redirect(projectHref(project.id, "/ansible-config"));
  }
  return <AnsibleHostsPage projectId={project.id} kind={project.kind} />;
}
