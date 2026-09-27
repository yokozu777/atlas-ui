import { writeLastProjectCookies } from "@/lib/nav-cookies";
import type { StargateProject } from "@/lib/project-types";
import { isProjectKind } from "@/lib/project-types";

const PREFIX = "atlas-ui:project-kind:";

export function readCachedProject(id: string): StargateProject | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(`${PREFIX}${id}`);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as {
      id?: string;
      name?: string;
      kind?: string;
    };
    if (parsed.id !== id || !isProjectKind(parsed.kind)) {
      return null;
    }
    return {
      id: parsed.id,
      name: parsed.name || parsed.id,
      kind: parsed.kind,
    };
  } catch {
    return null;
  }
}

export function writeCachedProject(project: StargateProject): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(
      `${PREFIX}${project.id}`,
      JSON.stringify({
        id: project.id,
        name: project.name,
        kind: project.kind,
      }),
    );
  } catch {
    /* quota / private mode */
  }
  writeLastProjectCookies(project.id, project.kind);
}
