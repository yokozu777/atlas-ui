"use client";

import Link from "next/link";

import { WorkspaceFsBrowser } from "@/components/workspace-fs-browser";
import { projectHref } from "@/lib/project-href";

export function AtlasRuntimeFilesTab({
  projectId,
  clusterId,
  loading = false,
}: {
  projectId: string;
  clusterId: string | null;
  loading?: boolean;
}) {
  if (!clusterId) {
    if (loading) {
      return (
        <p className="text-sm text-muted-foreground">Loading cluster…</p>
      );
    }
    return (
      <p className="text-sm text-muted-foreground">
        No cluster selected. Choose one in the header, or{" "}
        <Link
          href={projectHref(projectId, "/init")}
          className="text-foreground underline-offset-4 hover:underline"
        >
          create a cluster
        </Link>
        .
      </p>
    );
  }

  return <WorkspaceFsBrowser key={clusterId} clusterId={clusterId} variant="page" />;
}
