import { NextResponse } from "next/server";

import { hubAuthMeUrl } from "@/lib/hub-session-gate";
import { stargateAccessToken, stargateApiUrl } from "@/server/stargate";

const HUB_API_SESSION_TIMEOUT_MS = 4000;

export async function requireHubApiSession(): Promise<NextResponse | null> {
  const base = stargateApiUrl();
  if (!base) {
    return null;
  }
  const token = (await stargateAccessToken())?.trim();
  if (!token) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  try {
    const res = await fetch(hubAuthMeUrl(base), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(HUB_API_SESSION_TIMEOUT_MS),
    });
    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    if (!res.ok) {
      return NextResponse.json({ error: "hub unavailable" }, { status: 503 });
    }
    return null;
  } catch {
    return NextResponse.json({ error: "hub unavailable" }, { status: 503 });
  }
}
