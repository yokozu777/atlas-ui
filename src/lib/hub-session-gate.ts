export const ATLAS_ACCESS_COOKIE = "atlas_access";
export const ATLAS_REFRESH_COOKIE = "atlas_refresh";

export const PUBLIC_ATLAS_PREFIXES = [
  "/login",
  "/change-password",
  "/setup",
  "/api/setup",
  "/api/auth/login",
  "/api/auth/bootstrap",
  "/api/auth/refresh",
  "/api/auth/change-password",
  "/api/auth/me",
  "/_next",
  "/favicon",
  "/icon",
  "/apple-icon",
  "/atlas-logo",
  "/atlas-mark",
];

export function isPublicAtlasPath(pathname: string): boolean {
  return PUBLIC_ATLAS_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isAtlasApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function hubSessionGateApplies(
  pathname: string,
  apiUrl: string | null | undefined,
): boolean {
  if (!apiUrl?.trim()) {
    return false;
  }
  if (isPublicAtlasPath(pathname) || isAtlasApiPath(pathname)) {
    return false;
  }
  return true;
}

export function atlasLoginRedirectPath(pathname: string): string {
  const next = pathname || "/";
  return `/login?next=${encodeURIComponent(next)}`;
}

export function safeAtlasNextPath(raw: string | null | undefined): string {
  const value = String(raw || "").trim();
  if (!value.startsWith("/")) {
    return "/projects";
  }
  if (value.startsWith("//") || value.includes("://") || value.includes("\\")) {
    return "/projects";
  }
  return value;
}

export function hubAuthMeUrl(apiUrl: string): string {
  return `${apiUrl.replace(/\/$/, "")}/api/auth/me`;
}

export function hubAuthRefreshUrl(apiUrl: string): string {
  return `${apiUrl.replace(/\/$/, "")}/api/auth/refresh`;
}

export function hubSessionIsAuthenticated(status: number): boolean {
  return status === 200;
}

export function shouldAttemptHubRefresh(
  status: number,
  hasRefreshCookie: boolean,
): boolean {
  return (status === 401 || status === 403) && hasRefreshCookie;
}

export function hubSessionUnavailable(status: number): boolean {
  return status === 0 || status >= 500;
}
