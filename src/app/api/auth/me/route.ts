import { NextResponse } from "next/server";

import { stargateAccessToken, stargateApiUrl } from "@/server/stargate";

export const dynamic = "force-dynamic";

export async function GET() {
  const remote = Boolean(stargateApiUrl());
  const token = await stargateAccessToken();
  if (!remote) {
    return NextResponse.json({ username: "local", remote: false });
  }
  if (!token) {
    return NextResponse.json({ error: "unauthenticated", remote: true }, { status: 401 });
  }
  const upstream = await fetch(`${stargateApiUrl()}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!upstream.ok) {
    return NextResponse.json({ error: "unauthenticated", remote: true }, { status: 401 });
  }
  const data = await upstream.json();
  return NextResponse.json({ ...data, remote: true });
}
