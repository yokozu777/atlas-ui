import { redirect } from "next/navigation";

import { AnsibleProjectSettingsPage } from "@/app/projects/[projectId]/settings/ansible-settings";
import { AtlasSettingsPage } from "@/components/atlas-settings-page";
import { projectHref } from "@/lib/project-href";
import { resolveProjectPage } from "@/server/project-page";

export default async function ProjectSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ tab?: string; panel?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const project = await resolveProjectPage(projectId);
  if (query.tab === "vaults" || query.panel === "vaults") {
    redirect(projectHref(project.id, "/vault"));
  }
  if (query.panel === "ansible" || query.tab === "ansible") {
    redirect(projectHref(project.id, "/ansible-config"));
  }
  if (project.kind === "atlas") {
    if (query.tab === "advanced" || query.panel === "runtime") {
      redirect(projectHref(project.id, "/cluster-yaml?tab=runtime"));
    }
    return <AtlasSettingsPage projectId={project.id} />;
  }
  return <AnsibleProjectSettingsPage projectId={project.id} />;
}
