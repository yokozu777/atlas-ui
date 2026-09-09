"use client";

import { use } from "react";

import { ProjectSecretsPage } from "@/components/project-secrets/project-secrets-page";

export default function SecretsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const projectId = decodeURIComponent(use(params).projectId);
  return <ProjectSecretsPage projectId={projectId} />;
}
