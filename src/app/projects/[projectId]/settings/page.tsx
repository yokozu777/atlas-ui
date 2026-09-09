import { redirect } from "next/navigation";

import { AnsibleProjectSettingsPage } from "@/app/projects/[projectId]/settings/ansible-settings";
import { projectHref } from "@/lib/project-href";
import { resolveProjectPage } from "@/server/project-page";

export default async function ProjectSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const project = await resolveProjectPage(projectId);
  if (query.tab === "vaults") {
    redirect(projectHref(project.id, "/vault"));
  }
  return <AnsibleProjectSettingsPage projectId={project.id} />;
}
