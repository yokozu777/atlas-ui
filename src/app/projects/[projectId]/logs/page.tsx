import { AtlasSessionLogsPage } from "@/components/atlas-session-cluster-view";
import { resolveProjectPage } from "@/server/project-page";
import { redirect } from "next/navigation";
import { projectHref } from "@/lib/project-href";

export default async function ProjectLogsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await resolveProjectPage(projectId);
  if (project.kind === "ansible") {
    redirect(projectHref(projectId, "/executions"));
  }
  return <AtlasSessionLogsPage />;
}
