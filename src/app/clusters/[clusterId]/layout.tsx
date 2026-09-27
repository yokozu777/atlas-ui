import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";

import { legacyClusterDest } from "@/lib/legacy-cluster-path";
import {
  ATLAS_PATHNAME_HEADER,
  LAST_PROJECT_COOKIE,
  LAST_PROJECT_KIND_COOKIE,
  parseProjectKindCookie,
} from "@/lib/nav-cookies";
import { loadProjectCached } from "@/server/load-project";

export default async function LegacyClusterLayout({
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clusterId: string }>;
}) {
  const { clusterId } = await params;
  const headerStore = await headers();
  const pathname =
    headerStore.get(ATLAS_PATHNAME_HEADER) ||
    `/clusters/${encodeURIComponent(clusterId)}`;
  const jar = await cookies();
  const lastProjectId = jar.get(LAST_PROJECT_COOKIE)?.value ?? null;
  let lastKind = parseProjectKindCookie(
    jar.get(LAST_PROJECT_KIND_COOKIE)?.value,
  );
  if (lastProjectId && !lastKind) {
    const project = await loadProjectCached(lastProjectId);
    lastKind = project?.kind ?? null;
  }
  redirect(
    legacyClusterDest({
      pathname,
      lastProjectId,
      lastKind,
    }),
  );
}
