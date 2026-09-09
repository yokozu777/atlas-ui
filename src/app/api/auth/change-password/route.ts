import { NextResponse } from "next/server";

import {
  STARGATE_COOKIE,
  STARGATE_REFRESH_COOKIE,
  sessionCookieOptions,
  stargateAccessToken,
  stargateApiUrl,
} from "@/server/stargate";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const base = stargateApiUrl();
  if (!base) {
    return NextResponse.json(
      { error: "HUB_API_URL is not set; local mode does not require login" },
      { status: 400 },
    );
  }
  const token = await stargateAccessToken();
  if (!token) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const body = await request.json();
  const upstream = await fetch(`${base}/api/auth/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await upstream.json()) as {
    success?: boolean;
    error?: string;
    detail?: string;
    access_token?: string;
    refresh_token?: string;
    user?: unknown;
  };
  if (!upstream.ok || !data.access_token) {
    return NextResponse.json(
      { error: data.error || data.detail || "password change failed" },
      { status: upstream.status === 200 ? 401 : upstream.status },
    );
  }
  const res = NextResponse.json({ ok: true, user: data.user });
  res.cookies.set(
    STARGATE_COOKIE,
    data.access_token,
    sessionCookieOptions(request, 60 * 60 * 24),
  );
  if (data.refresh_token) {
    res.cookies.set(
      STARGATE_REFRESH_COOKIE,
      data.refresh_token,
      sessionCookieOptions(request, 60 * 60 * 24 * 7),
    );
  }
  return res;
}
