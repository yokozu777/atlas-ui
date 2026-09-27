import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  STARGATE_COOKIE,
  STARGATE_REFRESH_COOKIE,
  stargateAccessToken,
  stargateApiUrl,
} from "@/server/stargate";

export async function POST() {
  const base = stargateApiUrl();
  const jar = await cookies();
  const token = await stargateAccessToken();
  const refresh = jar.get(STARGATE_REFRESH_COOKIE)?.value;
  if (base && (token || refresh)) {
    try {
      await fetch(`${base}/api/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ refresh_token: refresh || "" }),
        cache: "no-store",
      });
    } catch {
      // Still clear cookies if Hub is unreachable.
    }
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(STARGATE_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(STARGATE_REFRESH_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
