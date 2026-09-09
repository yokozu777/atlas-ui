import { ProjectsCatalog } from "@/components/projects-catalog";
import { listLocalProjects } from "@/server/projects-local";
import { stargateAccessToken, stargateApiUrl } from "@/server/stargate";
import type { StargateProject } from "@/lib/project-types";

export const dynamic = "force-dynamic";

async function loadProjects(): Promise<{
  projects: StargateProject[];
  error: string | null;
}> {
  const base = stargateApiUrl();
  if (!base) {
    return { projects: await listLocalProjects(true), error: null };
  }
  const token = await stargateAccessToken();
  const res = await fetch(`${base}/api/projects?include_archived=true`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store",
  });
  const data = (await res.json()) as {
    projects?: StargateProject[];
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    return {
      projects: [],
      error: data.error || data.detail || "Failed to list projects",
    };
  }
  return { projects: data.projects ?? [], error: null };
}

export default async function ProjectsPage() {
  const { projects, error } = await loadProjects();
  return <ProjectsCatalog initial={projects} loadError={error} />;
}
