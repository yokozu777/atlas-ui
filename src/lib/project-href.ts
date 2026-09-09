export function projectHref(projectId: string, suffix = ""): string {
  return `/projects/${encodeURIComponent(projectId)}${suffix}`;
}

export const LAST_PROJECT_STORAGE_KEY = "atlas-ui:last-project-id";
export const LAST_PROJECT_EVENT = "atlas-ui:last-project";

let navProjectId: string | null = null;

export function setNavProjectId(id: string | null) {
  navProjectId = id;
}

export function currentNavProjectId(): string | null {
  return navProjectId;
}

export function projectIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)/);
  if (!match) return null;
  const id = decodeURIComponent(match[1]);
  if (id === "new") return null;
  return id;
}

export function readLastProjectId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage.getItem(LAST_PROJECT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeLastProjectId(id: string | null) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (id) {
      window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, id);
    } else {
      window.localStorage.removeItem(LAST_PROJECT_STORAGE_KEY);
    }
  } catch {
    /* quota / private mode */
  }
  window.dispatchEvent(new Event(LAST_PROJECT_EVENT));
}
