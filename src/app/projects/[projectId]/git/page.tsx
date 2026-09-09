import { redirect } from "next/navigation";

import { projectHref } from "@/lib/project-href";

export default async function GitSourcesRedirectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(projectHref(decodeURIComponent(projectId), "/settings"));
}
