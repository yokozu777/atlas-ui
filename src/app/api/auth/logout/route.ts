import { NextResponse } from "next/server";

import { STARGATE_COOKIE, STARGATE_REFRESH_COOKIE } from "@/server/stargate";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(STARGATE_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(STARGATE_REFRESH_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
