import { cookies, headers } from "next/headers";

import { AppShell } from "@/components/app-shell";
import {
  ATLAS_CLUSTER_COOKIE,
  ATLAS_PATHNAME_HEADER,
  LAST_PROJECT_COOKIE,
  parseAtlasClusterCookie,
} from "@/lib/nav-cookies";
import { projectIdFromPath } from "@/lib/project-href";
import { loadProjectCached } from "@/server/load-project";

export async function AppFrame({ children }: { children: React.ReactNode }) {
  const headerStore = await headers();
  const pathname = headerStore.get(ATLAS_PATHNAME_HEADER) || "";
  const authPage = pathname === "/login" || pathname === "/change-password";
  const jar = await cookies();
  const pathProjectId = projectIdFromPath(pathname);
  const lastProjectId = jar.get(LAST_PROJECT_COOKIE)?.value ?? null;
  const loadId = authPage ? null : (pathProjectId ?? lastProjectId);
  const initialProject = loadId ? await loadProjectCached(loadId) : null;
  const initialClusterId =
    initialProject?.kind === "atlas"
      ? parseAtlasClusterCookie(
          jar.get(ATLAS_CLUSTER_COOKIE)?.value,
          initialProject.id,
        )
      : null;

  return (
    <AppShell
      initialProject={initialProject}
      initialClusterId={initialClusterId}
    >
      {children}
    </AppShell>
  );
}
