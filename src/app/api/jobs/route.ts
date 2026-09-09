import { NextResponse } from "next/server";

import { listJobs, readJobLog, snapshotOf, startJob, waitForJob } from "@/server/jobs";

export async function GET() {
  return NextResponse.json({ jobs: listJobs() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    argv?: string[];
    clusterId?: string;
    wait?: boolean;
    source?: string;
    executionId?: string;
  };
  if (body.source === "stargate" || body.executionId) {
    return NextResponse.json(
      {
        error:
          "Hub executions use /api/hub (worker). Local clusterctl jobs are /api/jobs only.",
      },
      { status: 400 },
    );
  }
  try {
    const job = await startJob({ argv: body.argv ?? [], clusterId: body.clusterId });
    if (body.wait === false) {
      return NextResponse.json(snapshotOf(job), { status: 202 });
    }
    const done = await waitForJob(job);
    const log = await readJobLog(done.id);
    return NextResponse.json({ ...done, log });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
