import { Suspense } from "react";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { HandbookView } from "@/components/handbook-view";
import { projectHref } from "@/lib/project-href";
import { resolveProjectPage } from "@/server/project-page";

export default async function HandbookPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await resolveProjectPage(projectId);
  if (project.kind === "atlas") {
    redirect(projectHref(project.id, "/roles?view=handbook"));
  }
  return (
    <Suspense fallback={<EmptyState title="Loading handbook" />}>
      <HandbookView projectId={project.id} />
    </Suspense>
  );
}
