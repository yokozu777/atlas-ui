import { NextResponse } from "next/server";

import { stargateAccessToken, stargateApiUrl } from "@/server/stargate";

export const dynamic = "force-dynamic";

async function hubAvatar(method: string, init?: RequestInit) {
  const base = stargateApiUrl();
  if (!base) {
    return NextResponse.json(
      { error: "HUB_API_URL is not set; local mode has no avatar" },
      { status: 400 },
    );
  }
  const token = await stargateAccessToken();
  if (!token) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  return fetch(`${base}/api/auth/avatar`, {
    method,
    cache: "no-store",
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
}

export async function GET() {
  const upstream = await hubAvatar("GET");
  if (upstream instanceof NextResponse) {
    return upstream;
  }
  if (upstream.status === 404) {
    return new NextResponse(null, { status: 404 });
  }
  if (!upstream.ok) {
    return NextResponse.json({ error: "avatar failed" }, { status: upstream.status });
  }
  const body = await upstream.arrayBuffer();
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "image/png",
      "Cache-Control": "private, no-store",
    },
  });
}

export async function PUT(request: Request) {
  const buf = await request.arrayBuffer();
  const upstream = await hubAvatar("PUT", {
    body: buf,
    headers: {
      "Content-Type": request.headers.get("content-type") || "application/octet-stream",
    },
  });
  if (upstream instanceof NextResponse) {
    return upstream;
  }
  const data = (await upstream.json()) as { error?: string; detail?: unknown };
  if (!upstream.ok) {
    const message =
      (typeof data.detail === "string" && data.detail) ||
      data.error ||
      "avatar upload failed";
    return NextResponse.json({ error: message }, { status: upstream.status });
  }
  return NextResponse.json(data);
}

export async function DELETE() {
  const upstream = await hubAvatar("DELETE");
  if (upstream instanceof NextResponse) {
    return upstream;
  }
  const data = (await upstream.json()) as { error?: string; detail?: unknown };
  if (!upstream.ok) {
    const message =
      (typeof data.detail === "string" && data.detail) ||
      data.error ||
      "avatar delete failed";
    return NextResponse.json({ error: message }, { status: upstream.status });
  }
  return NextResponse.json(data);
}
