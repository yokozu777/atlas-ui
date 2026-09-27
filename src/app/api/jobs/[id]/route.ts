import { NextResponse } from "next/server";

import { requireHubApiSession } from "@/server/hub-api-session";
import { getJob, readJobLog, snapshotOf } from "@/server/jobs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = await requireHubApiSession();
  if (denied) {
    return denied;
  }
  const { id } = await context.params;
  const job = getJob(id);
  if (!job) {
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  }
  const log = await readJobLog(id);
  return NextResponse.json({ ...snapshotOf(job), log });
}
