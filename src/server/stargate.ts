import { cookies } from "next/headers";

export const STARGATE_COOKIE = "atlas_access";
export const STARGATE_REFRESH_COOKIE = "atlas_refresh";

export function stargateApiUrl(): string | null {
  const raw = (process.env.HUB_API_URL || process.env.STARGATE_API_URL)?.trim();
  return raw ? raw.replace(/\/$/, "") : null;
}

export function cookieSecure(request?: Request): boolean {
  if (process.env.HUB_COOKIE_SECURE === "1" || process.env.HUB_COOKIE_SECURE === "true") {
    return true;
  }
  const proto = request?.headers.get("x-forwarded-proto");
  if (proto) {
    return proto.split(",")[0]?.trim() === "https";
  }
  return false;
}

export function sessionCookieOptions(request?: Request, maxAge = 60 * 60 * 24) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: cookieSecure(request),
    maxAge,
  };
}

export async function stargateAccessToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(STARGATE_COOKIE)?.value ?? null;
}
