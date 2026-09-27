import { projectHref } from "@/lib/project-href";

export function clusterIdFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/clusters\/([^/]+)/);
  if (!match) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function clusterRestFromPathname(pathname: string): string {
  const match = pathname.match(/^\/clusters\/[^/]+(?:\/(.*))?$/);
  if (!match) {
    return "";
  }
  return (match[1] ?? "").replace(/\/$/, "");
}

export function legacyClusterDest(input: {
  pathname: string;
  lastProjectId: string | null;
  lastKind: string | null;
}): string {
  const { pathname, lastProjectId, lastKind } = input;
  if (pathname === "/clusters" || pathname === "/clusters/") {
    return "/projects";
  }
  if (!lastProjectId || lastKind !== "atlas") {
    return "/projects";
  }
  const rest = clusterRestFromPathname(input.pathname);
  if (!rest) {
    return projectHref(lastProjectId);
  }
  if (rest === "hosts" || rest === "limits") {
    return projectHref(lastProjectId, "/hosts");
  }
  if (rest === "vars") {
    return projectHref(lastProjectId, "/hosts?tab=vars");
  }
  if (rest === "run") {
    return `${projectHref(lastProjectId)}?run=1`;
  }
  if (rest === "logs") {
    return projectHref(lastProjectId, "/executions?tab=logs");
  }
  if (rest.startsWith("logs/")) {
    const stamp = rest.slice("logs/".length);
    return projectHref(lastProjectId, `/logs/${encodeURIComponent(stamp)}`);
  }
  if (rest === "workspace") {
    return projectHref(lastProjectId, "/cluster-yaml?tab=runtime");
  }
  if (rest === "repos") {
    return projectHref(lastProjectId, "/cluster-yaml?tab=health");
  }
  if (rest === "config") {
    return projectHref(lastProjectId, "/cluster-yaml?tab=health");
  }
  return projectHref(lastProjectId);
}
