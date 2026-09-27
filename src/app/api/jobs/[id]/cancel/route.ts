import { NextResponse } from "next/server";

import { requireHubApiSession } from "@/server/hub-api-session";
import { cancelJob } from "@/server/jobs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = await requireHubApiSession();
  if (denied) {
    return denied;
  }
  const { id } = await context.params;
  try {
    return NextResponse.json(cancelJob(id));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
