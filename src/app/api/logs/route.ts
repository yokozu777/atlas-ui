import { NextResponse } from "next/server";

import { parseJobJson } from "@/lib/job-output";
import { listRunLogs, readRunLog } from "@/server/logs";
import { readJobLog, startJob, waitForJob } from "@/server/jobs";

async function workspaceJson(clusterId: string) {
  const job = await startJob({ argv: ["workspace", "show", "--json"], clusterId });
  const done = await waitForJob(job);
  const log = await readJobLog(done.id);
  if (done.exitCode !== 0) {
    throw new Error(log || `workspace show exit ${done.exitCode}`);
  }
  return parseJobJson<{ logs: string }>(log);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clusterId = url.searchParams.get("clusterId") ?? "";
  const stamp = url.searchParams.get("stamp");
  if (!clusterId) {
    return NextResponse.json({ error: "clusterId required" }, { status: 400 });
  }
  try {
    const ws = await workspaceJson(clusterId);
    if (stamp) {
      const text = await readRunLog(ws.logs, stamp);
      return NextResponse.json({ stamp, log: text });
    }
    const runs = await listRunLogs(ws.logs);
    return NextResponse.json({ logsDir: ws.logs, runs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
