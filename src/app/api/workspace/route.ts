import { NextResponse } from "next/server";

import { parseJobJson } from "@/lib/job-output";
import { readJobLog, startJob, waitForJob } from "@/server/jobs";
import {
  listWorkspaceDir,
  readWorkspaceFile,
} from "@/server/workspace-fs";

async function workspaceRoot(clusterId: string): Promise<string> {
  const job = await startJob({
    argv: ["workspace", "show", "--json"],
    clusterId,
  });
  const done = await waitForJob(job);
  const log = await readJobLog(done.id);
  if (done.exitCode !== 0) {
    throw new Error(log || `workspace show exit ${done.exitCode}`);
  }
  const payload = parseJobJson<{ workspace_root?: string }>(log);
  const root = payload.workspace_root?.trim();
  if (!root) {
    throw new Error("workspace show did not return workspace_root");
  }
  return root;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clusterId = url.searchParams.get("clusterId") ?? "";
  const rel = url.searchParams.get("rel") ?? "";
  const kind = url.searchParams.get("kind") ?? "ls";
  if (!clusterId) {
    return NextResponse.json({ error: "clusterId required" }, { status: 400 });
  }
  try {
    const root = await workspaceRoot(clusterId);
    if (kind === "file") {
      const payload = await readWorkspaceFile(root, rel);
      return NextResponse.json(payload);
    }
    const payload = await listWorkspaceDir(root, rel);
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
