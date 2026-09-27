import { redirect } from "next/navigation";

import { PlaybookSchedulePage } from "@/components/playbook-schedule-page";
import { projectHref } from "@/lib/project-href";
import { resolveProjectPage } from "@/server/project-page";

export default async function ProjectPlaybookSchedulePage({
  params,
}: {
  params: Promise<{ projectId: string; playbookId: string }>;
}) {
  const { projectId, playbookId } = await params;
  const project = await resolveProjectPage(projectId);
  if (project.kind === "atlas") {
    redirect(projectHref(project.id, "/cluster-yaml?tab=health"));
  }
  return (
    <PlaybookSchedulePage
      projectId={project.id}
      playbookId={decodeURIComponent(playbookId)}
    />
  );
}
