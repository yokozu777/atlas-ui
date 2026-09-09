import { redirect } from "next/navigation";

import AnsibleDashboardPage from "@/app/projects/[projectId]/dashboard/page";
import { AtlasProjectHome } from "@/components/atlas-project-home";
import { projectHref } from "@/lib/project-href";
import { resolveProjectPage } from "@/server/project-page";

export default async function ProjectHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ tab?: string; section?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const project = await resolveProjectPage(projectId);
  if (project.kind === "atlas") {
    if (query.tab === "settings") {
      const suffix = query.section === "project" ? "?tab=project" : "";
      redirect(`${projectHref(project.id, "/settings")}${suffix}`);
    }
    return <AtlasProjectHome />;
  }
  return (
    <AnsibleDashboardPage params={Promise.resolve({ projectId: project.id })} />
  );
}
