import { NextResponse } from "next/server";

import { stargateApiUrl } from "@/server/stargate";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = stargateApiUrl();
  if (!base) {
    return NextResponse.json({
      success: true,
      showDefaultCredentials: false,
      remote: false,
    });
  }
  try {
    const upstream = await fetch(`${base}/api/auth/bootstrap`, {
      cache: "no-store",
    });
    const data = (await upstream.json()) as {
      success?: boolean;
      showDefaultCredentials?: boolean;
      error?: string;
    };
    if (!upstream.ok) {
      return NextResponse.json(
        { success: true, showDefaultCredentials: false, remote: true },
        { status: 200 },
      );
    }
    return NextResponse.json({
      success: true,
      showDefaultCredentials: Boolean(data.showDefaultCredentials),
      remote: true,
    });
  } catch {
    return NextResponse.json({
      success: true,
      showDefaultCredentials: false,
      remote: true,
    });
  }
}
