import { AtlasSessionWorkspacePage } from "@/components/atlas-session-cluster-view";
import { resolveProjectPage } from "@/server/project-page";
import { redirect } from "next/navigation";
import { projectHref } from "@/lib/project-href";
import { stargateApiUrl } from "@/server/stargate";

export default async function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await resolveProjectPage(projectId);
  if (project.kind === "ansible") {
    redirect(projectHref(projectId));
  }
  return (
    <AtlasSessionWorkspacePage
      projectId={project.id}
      hub={Boolean(stargateApiUrl())}
    />
  );
}
