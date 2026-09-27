import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { clusterIdFromPathname, legacyClusterDest } from "@/lib/legacy-cluster-path";
import {
  ATLAS_ACCESS_COOKIE,
  ATLAS_REFRESH_COOKIE,
  atlasLoginRedirectPath,
  hubAuthMeUrl,
  hubAuthRefreshUrl,
  hubSessionGateApplies,
  hubSessionUnavailable,
  hubSessionIsAuthenticated,
  isPublicAtlasPath,
  shouldAttemptHubRefresh,
} from "@/lib/hub-session-gate";
import {
  ATLAS_CLUSTER_COOKIE,
  ATLAS_PATHNAME_HEADER,
  LAST_PROJECT_COOKIE,
  LAST_PROJECT_KIND_COOKIE,
  navCookieOptions,
  parseProjectKindCookie,
  requestCookieSecure,
  serializeAtlasClusterCookie,
} from "@/lib/nav-cookies";
import { projectIdFromPath } from "@/lib/project-href";

const HUB_SESSION_TIMEOUT_MS = 4000;

function withPathname(request: NextRequest, response: NextResponse) {
  response.headers.set(ATLAS_PATHNAME_HEADER, request.nextUrl.pathname);
  return response;
}

function accessCookieOptions(request: NextRequest) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: requestCookieSecure(request),
    maxAge: 60 * 60,
  };
}

function refreshCookieOptions(request: NextRequest) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: requestCookieSecure(request),
    maxAge: 60 * 60 * 24 * 7,
  };
}

function attachSessionCookies(
  response: NextResponse,
  tokens: { access?: string; refresh?: string } | undefined,
  request: NextRequest,
) {
  if (!tokens?.access && !tokens?.refresh) {
    return response;
  }
  if (tokens.access) {
    response.cookies.set(
      ATLAS_ACCESS_COOKIE,
      tokens.access,
      accessCookieOptions(request),
    );
  }
  if (tokens.refresh) {
    response.cookies.set(
      ATLAS_REFRESH_COOKIE,
      tokens.refresh,
      refreshCookieOptions(request),
    );
  }
  return response;
}

function nextWithNav(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(ATLAS_PATHNAME_HEADER, request.nextUrl.pathname);
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  const projectId = projectIdFromPath(request.nextUrl.pathname);
  if (projectId) {
    response.cookies.set(
      LAST_PROJECT_COOKIE,
      projectId,
      navCookieOptions(requestCookieSecure(request)),
    );
  }
  return response;
}

function loginRedirect(request: NextRequest, clearAccess = true) {
  const login = new URL(atlasLoginRedirectPath(request.nextUrl.pathname), request.url);
  const response = NextResponse.redirect(login);
  if (clearAccess) {
    response.cookies.set(ATLAS_ACCESS_COOKIE, "", { path: "/", maxAge: 0 });
  }
  return withPathname(request, response);
}

async function probeHubMe(apiUrl: string, token: string): Promise<number> {
  try {
    const res = await fetch(hubAuthMeUrl(apiUrl), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(HUB_SESSION_TIMEOUT_MS),
    });
    return res.status;
  } catch {
    return 0;
  }
}

async function refreshHubAccess(
  apiUrl: string,
  refreshToken: string,
): Promise<{ access: string; refresh?: string } | null> {
  try {
    const res = await fetch(hubAuthRefreshUrl(apiUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(HUB_SESSION_TIMEOUT_MS),
    });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
    };
    const access = data.access_token?.trim();
    if (!access) {
      return null;
    }
    return { access, refresh: data.refresh_token?.trim() || undefined };
  } catch {
    return null;
  }
}

type HubSessionOk = {
  ok: true;
  accessToken: string;
  refreshed?: { access: string; refresh?: string };
};

async function enforceHubSession(
  request: NextRequest,
  apiUrl: string,
): Promise<HubSessionOk | { ok: false; response: NextResponse }> {
  const access = request.cookies.get(ATLAS_ACCESS_COOKIE)?.value?.trim();
  if (!access) {
    return { ok: false, response: loginRedirect(request) };
  }
  const status = await probeHubMe(apiUrl, access);
  if (hubSessionIsAuthenticated(status)) {
    return { ok: true, accessToken: access };
  }
  if (hubSessionUnavailable(status)) {
    return { ok: false, response: loginRedirect(request, false) };
  }
  const refresh = request.cookies.get(ATLAS_REFRESH_COOKIE)?.value?.trim();
  if (shouldAttemptHubRefresh(status, Boolean(refresh)) && refresh) {
    const rotated = await refreshHubAccess(apiUrl, refresh);
    if (rotated) {
      return {
        ok: true,
        accessToken: rotated.access,
        refreshed: rotated,
      };
    }
  }
  return { ok: false, response: loginRedirect(request) };
}

async function lastProjectKind(
  request: NextRequest,
  projectId: string,
  accessToken?: string,
): Promise<"atlas" | "ansible" | null> {
  const fromCookie = parseProjectKindCookie(
    request.cookies.get(LAST_PROJECT_KIND_COOKIE)?.value,
  );
  if (fromCookie) {
    return fromCookie;
  }
  const apiUrl = (
    process.env.HUB_API_URL || process.env.STARGATE_API_URL
  )?.trim();
  const token = accessToken || request.cookies.get(ATLAS_ACCESS_COOKIE)?.value;
  if (!apiUrl || !token) {
    return null;
  }
  try {
    const res = await fetch(
      `${apiUrl.replace(/\/$/, "")}/api/projects/${encodeURIComponent(projectId)}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as { project?: { kind?: string } };
    return parseProjectKindCookie(data.project?.kind ?? null);
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const apiUrl = (
    process.env.HUB_API_URL || process.env.STARGATE_API_URL
  )?.trim();

  if (isPublicAtlasPath(pathname)) {
    return nextWithNav(request);
  }

  let accessToken = request.cookies.get(ATLAS_ACCESS_COOKIE)?.value;
  let refreshed: { access: string; refresh?: string } | undefined;
  if (hubSessionGateApplies(pathname, apiUrl) && apiUrl) {
    const gated = await enforceHubSession(request, apiUrl);
    if (!gated.ok) {
      return gated.response;
    }
    accessToken = gated.accessToken;
    refreshed = gated.refreshed;
  }

  if (pathname === "/clusters" || pathname.startsWith("/clusters/")) {
    const lastProjectId =
      request.cookies.get(LAST_PROJECT_COOKIE)?.value ?? null;
    const kind = lastProjectId
      ? await lastProjectKind(request, lastProjectId, accessToken)
      : null;
    const dest = legacyClusterDest({
      pathname,
      lastProjectId,
      lastKind: kind,
    });
    const redirect = NextResponse.redirect(new URL(dest, request.url));
    const opts = navCookieOptions(requestCookieSecure(request));
    if (lastProjectId) {
      redirect.cookies.set(LAST_PROJECT_COOKIE, lastProjectId, opts);
    }
    if (kind) {
      redirect.cookies.set(LAST_PROJECT_KIND_COOKIE, kind, opts);
    }
    const clusterId = clusterIdFromPathname(pathname);
    if (kind === "atlas" && lastProjectId && clusterId) {
      redirect.cookies.set(
        ATLAS_CLUSTER_COOKIE,
        serializeAtlasClusterCookie(lastProjectId, clusterId),
        opts,
      );
    }
    return attachSessionCookies(redirect, refreshed, request);
  }

  return attachSessionCookies(nextWithNav(request), refreshed, request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.png$).*)"],
};
