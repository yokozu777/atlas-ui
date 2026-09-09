import { AtlasSessionLogStampPage } from "@/components/atlas-session-cluster-view";
import { resolveProjectPage } from "@/server/project-page";
import { redirect } from "next/navigation";
import { projectHref } from "@/lib/project-href";

export default async function ProjectLogStampPage({
  params,
}: {
  params: Promise<{ projectId: string; stamp: string }>;
}) {
  const { projectId, stamp } = await params;
  const project = await resolveProjectPage(projectId);
  if (project.kind === "ansible") {
    redirect(projectHref(projectId, "/executions"));
  }
  return <AtlasSessionLogStampPage stamp={stamp} />;
}
