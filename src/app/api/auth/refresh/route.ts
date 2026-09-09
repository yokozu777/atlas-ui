import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  STARGATE_COOKIE,
  STARGATE_REFRESH_COOKIE,
  sessionCookieOptions,
  stargateApiUrl,
} from "@/server/stargate";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const base = stargateApiUrl();
  if (!base) {
    return NextResponse.json({ error: "HUB_API_URL is not set" }, { status: 400 });
  }
  const jar = await cookies();
  const refresh = jar.get(STARGATE_REFRESH_COOKIE)?.value;
  if (!refresh) {
    return NextResponse.json({ error: "no refresh token" }, { status: 401 });
  }
  const upstream = await fetch(`${base}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
    cache: "no-store",
  });
  const data = (await upstream.json()) as {
    success?: boolean;
    error?: string;
    detail?: string;
    access_token?: string;
  };
  if (!upstream.ok || !data.access_token) {
    return NextResponse.json(
      { error: data.error || data.detail || "refresh failed" },
      { status: 401 },
    );
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(
    STARGATE_COOKIE,
    data.access_token,
    sessionCookieOptions(request, 60 * 60 * 24),
  );
  return res;
}
