import { NextResponse } from "next/server";

import { stargateAccessToken, stargateApiUrl } from "@/server/stargate";

export const dynamic = "force-dynamic";

function errorMessage(data: { error?: string; detail?: unknown }) {
  if (typeof data.detail === "string" && data.detail) {
    return data.detail;
  }
  return data.error || "profile update failed";
}

export async function PATCH(request: Request) {
  const base = stargateApiUrl();
  if (!base) {
    return NextResponse.json(
      { error: "HUB_API_URL is not set; local mode does not store a profile" },
      { status: 400 },
    );
  }
  const token = await stargateAccessToken();
  if (!token) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const body = await request.json();
  const upstream = await fetch(`${base}/api/auth/profile`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await upstream.json()) as {
    error?: string;
    detail?: unknown;
    email?: string | null;
    username?: string;
    hasAvatar?: boolean;
    user?: unknown;
  };
  if (!upstream.ok) {
    return NextResponse.json(
      { error: errorMessage(data) },
      { status: upstream.status },
    );
  }
  return NextResponse.json(data);
}
