import { isProjectKind, type ProjectKind } from "@/lib/project-types";

export const LAST_PROJECT_COOKIE = "atlas-ui-last-project";
export const LAST_PROJECT_KIND_COOKIE = "atlas-ui-last-project-kind";
export const ATLAS_CLUSTER_COOKIE = "atlas-ui-atlas-cluster";
export const ATLAS_PATHNAME_HEADER = "x-atlas-pathname";

export const NAV_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function navCookieOptions(secure: boolean) {
  return {
    path: "/",
    sameSite: "lax" as const,
    secure,
    maxAge: NAV_COOKIE_MAX_AGE,
    httpOnly: false,
  };
}

export function requestCookieSecure(request: {
  nextUrl: { protocol: string };
  headers: Headers;
}): boolean {
  if (
    process.env.HUB_COOKIE_SECURE === "1" ||
    process.env.HUB_COOKIE_SECURE === "true"
  ) {
    return true;
  }
  const proto = request.headers.get("x-forwarded-proto");
  if (proto) {
    return proto.split(",")[0]?.trim() === "https";
  }
  return request.nextUrl.protocol === "https:";
}

export function serializeAtlasClusterCookie(
  projectId: string,
  clusterId: string,
): string {
  return `${encodeURIComponent(projectId)}|${encodeURIComponent(clusterId)}`;
}

export function parseAtlasClusterCookie(
  value: string | undefined | null,
  projectId: string,
): string | null {
  if (!value) {
    return null;
  }
  const pipe = value.indexOf("|");
  if (pipe === -1) {
    return null;
  }
  try {
    const pid = decodeURIComponent(value.slice(0, pipe));
    const clusterId = decodeURIComponent(value.slice(pipe + 1)).trim();
    if (pid !== projectId || !clusterId) {
      return null;
    }
    return clusterId;
  } catch {
    return null;
  }
}

export function parseProjectKindCookie(
  value: string | undefined | null,
): ProjectKind | null {
  return isProjectKind(value) ? value : null;
}

function writeBrowserCookie(name: string, value: string) {
  if (typeof document === "undefined") {
    return;
  }
  document.cookie = `${name}=${value}; Path=/; Max-Age=${NAV_COOKIE_MAX_AGE}; SameSite=Lax`;
}

function clearBrowserCookie(name: string) {
  if (typeof document === "undefined") {
    return;
  }
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function writeLastProjectCookies(
  projectId: string | null,
  kind?: ProjectKind | null,
) {
  if (!projectId) {
    clearBrowserCookie(LAST_PROJECT_COOKIE);
    clearBrowserCookie(LAST_PROJECT_KIND_COOKIE);
    clearBrowserCookie(ATLAS_CLUSTER_COOKIE);
    return;
  }
  writeBrowserCookie(LAST_PROJECT_COOKIE, projectId);
  if (kind) {
    writeBrowserCookie(LAST_PROJECT_KIND_COOKIE, kind);
  }
}

export function writeLastProjectKindCookie(kind: ProjectKind) {
  writeBrowserCookie(LAST_PROJECT_KIND_COOKIE, kind);
}

export function writeAtlasClusterBrowserCookie(
  projectId: string,
  clusterId: string,
) {
  writeBrowserCookie(
    ATLAS_CLUSTER_COOKIE,
    serializeAtlasClusterCookie(projectId, clusterId),
  );
}
