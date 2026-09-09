import { NextResponse } from "next/server";

import { parseJobJson } from "@/lib/job-output";
import { readJobLog, startJob, waitForJob } from "@/server/jobs";

export type ClusterListRow = {
  id: string;
  display_name: string | null;
  active: boolean;
  kind: "deployable" | "policy" | "broken";
  error?: string;
};

export async function GET() {
  try {
    const job = await startJob({ argv: ["list", "--json"] });
    const done = await waitForJob(job);
    const log = await readJobLog(done.id);
    if (done.exitCode !== 0) {
      return NextResponse.json({ error: log, exitCode: done.exitCode }, { status: 400 });
    }
    const clusters = parseJobJson<ClusterListRow[]>(log);
    return NextResponse.json({ clusters });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
