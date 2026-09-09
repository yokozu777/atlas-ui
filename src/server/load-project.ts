import { listLocalProjects, getLocalProject } from "@/server/projects-local";
import { stargateAccessToken, stargateApiUrl } from "@/server/stargate";
import type { StargateProject } from "@/lib/project-types";

export async function loadProject(
  projectId: string,
): Promise<StargateProject | null> {
  const base = stargateApiUrl();
  if (!base) {
    return getLocalProject(projectId);
  }
  const token = await stargateAccessToken();
  const res = await fetch(`${base}/api/projects/${encodeURIComponent(projectId)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as { project?: StargateProject };
  return data.project ?? null;
}

export async function loadProjectsList(): Promise<StargateProject[]> {
  const base = stargateApiUrl();
  if (!base) {
    return listLocalProjects();
  }
  const token = await stargateAccessToken();
  const res = await fetch(`${base}/api/projects`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    return [];
  }
  const data = (await res.json()) as { projects?: StargateProject[] };
  return data.projects ?? [];
}
