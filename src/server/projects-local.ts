import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

import {
  isProjectKind,
  type ProjectKind,
  type StargateProject,
} from "@/lib/project-types";
import { configFilePath } from "@/server/config";

function projectsFilePath(): string {
  const override = process.env.ATLAS_UI_PROJECTS?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(path.dirname(configFilePath()), "projects.json");
}

async function readAll(): Promise<StargateProject[]> {
  try {
    const raw = await readFile(/* turbopackIgnore: true */ projectsFilePath(), "utf8");
    const parsed = JSON.parse(raw) as { projects?: StargateProject[] };
    return (parsed.projects ?? []).map((project) => ({
      ...project,
      kind: isProjectKind(project.kind) ? project.kind : "ansible",
    }));
  } catch {
    return [];
  }
}

async function writeAll(projects: StargateProject[]): Promise<void> {
  const file = projectsFilePath();
  await mkdir(/* turbopackIgnore: true */ path.dirname(file), { recursive: true });
  await writeFile(
    /* turbopackIgnore: true */ file,
    JSON.stringify({ projects }, null, 2) + "\n",
    "utf8",
  );
}

export async function listLocalProjects(includeArchived = false): Promise<StargateProject[]> {
  const projects = await readAll();
  if (includeArchived) {
    return projects;
  }
  return projects.filter((p) => !p.isArchived);
}

export async function getLocalProject(id: string): Promise<StargateProject | null> {
  const projects = await readAll();
  return projects.find((p) => p.id === id) ?? null;
}

export async function createLocalProject(input: {
  name: string;
  description?: string;
  kind: ProjectKind;
  cluster_id?: string;
  clusterctlRoot?: string;
}): Promise<StargateProject> {
  if (!input.name.trim()) {
    throw new Error("Project name is required");
  }
  if (input.kind === "atlas" && !input.cluster_id?.trim()) {
    throw new Error("atlas projects require cluster_id");
  }
  const projects = await readAll();
  if (projects.some((p) => p.name === input.name.trim() && !p.isArchived)) {
    throw new Error("Project with this name already exists");
  }
  const project: StargateProject = {
    id: randomUUID(),
    name: input.name.trim(),
    description: input.description?.trim() ?? "",
    kind: input.kind,
    cluster_id: input.cluster_id?.trim(),
    clusterctlRoot: input.clusterctlRoot?.trim(),
    createdAt: Date.now() / 1000,
    updatedAt: Date.now() / 1000,
    isArchived: false,
  };
  projects.push(project);
  await writeAll(projects);
  return project;
}

export function localModeHome(): string {
  return path.join(homedir(), ".config", "atlas-ui");
}
