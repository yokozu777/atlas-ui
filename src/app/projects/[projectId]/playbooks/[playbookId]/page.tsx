import { redirect } from "next/navigation";

import { PlaybookEditorPage } from "@/components/playbook-editor/playbook-editor-page";
import { projectHref } from "@/lib/project-href";
import { resolveProjectPage } from "@/server/project-page";

export default async function PlaybookPage({
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
    <PlaybookEditorPage
      projectId={project.id}
      playbookId={decodeURIComponent(playbookId)}
    />
  );
}
