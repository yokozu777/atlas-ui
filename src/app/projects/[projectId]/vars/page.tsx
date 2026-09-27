import { VarsPage } from "@/components/hosts-groups/vars-page";
import { projectHref } from "@/lib/project-href";
import { resolveProjectPage } from "@/server/project-page";
import { redirect } from "next/navigation";

export default async function ProjectVarsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ file?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const project = await resolveProjectPage(projectId);
  if (project.kind === "atlas") {
    const file = typeof query.file === "string" ? query.file.trim() : "";
    const suffix = file
      ? `/hosts?tab=vars&file=${encodeURIComponent(file)}`
      : "/hosts?tab=vars";
    redirect(projectHref(project.id, suffix));
  }
  return <VarsPage projectId={project.id} />;
}
