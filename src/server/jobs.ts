import { randomUUID } from "node:crypto";
import { mkdir, appendFile, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ChildProcess } from "node:child_process";

import { assertSafeArgv, isMutatingArgv } from "@/server/argv";
import { loadConfig } from "@/server/config";
import { resolveClusterctlRoot, spawnClusterctl } from "@/server/clusterctl";

export type JobStatus = "running" | "exited" | "error" | "canceled";

export type JobSnapshot = {
  id: string;
  argv: string[];
  clusterId: string | null;
  mutating: boolean;
  status: JobStatus;
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  logPath: string;
  error: string | null;
};

type JobRecord = JobSnapshot & {
  pid: number | null;
  child: ChildProcess | null;
  done: Promise<JobSnapshot>;
  resolveDone: (job: JobSnapshot) => void;
};

type Store = {
  jobs: Map<string, JobRecord>;
  mutatingId: string | null;
};

const globalStore = globalThis as typeof globalThis & { __atlasUiJobs?: Store };

function store(): Store {
  if (!globalStore.__atlasUiJobs) {
    globalStore.__atlasUiJobs = { jobs: new Map(), mutatingId: null };
  }
  return globalStore.__atlasUiJobs;
}

function jobsDir(): string {
  return path.join(os.homedir(), ".cache", "atlas-ui", "jobs");
}

export function snapshotOf(job: JobRecord): JobSnapshot {
  return {
    id: job.id,
    argv: job.argv,
    clusterId: job.clusterId,
    mutating: job.mutating,
    status: job.status,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    exitCode: job.exitCode,
    logPath: job.logPath,
    error: job.error,
  };
}

function finishJob(
  st: Store,
  job: JobRecord,
  status: JobStatus,
  exitCode: number | null,
  error: string | null,
) {
  if (job.status !== "running") {
    return;
  }
  job.status = status;
  job.exitCode = exitCode;
  job.error = error;
  job.finishedAt = new Date().toISOString();
  job.child = null;
  if (st.mutatingId === job.id) {
    st.mutatingId = null;
  }
  job.resolveDone(snapshotOf(job));
}

export async function startJob(input: {
  argv: string[];
  clusterId?: string;
}): Promise<JobRecord> {
  const argv = assertSafeArgv(input.argv);
  const mutating = isMutatingArgv(argv);
  const cfg = await loadConfig();
  if (!cfg) {
    throw new Error("clusterctl path is not configured");
  }
  const root = await resolveClusterctlRoot(cfg.clusterctlRoot);
  const st = store();
  if (mutating && st.mutatingId) {
    const existing = st.jobs.get(st.mutatingId);
    if (existing && existing.status === "running") {
      throw new Error(
        `mutating job already running (${existing.id}: ${existing.argv.join(" ")})`,
      );
    }
  }

  const id = randomUUID();
  await mkdir(/* turbopackIgnore: true */ jobsDir(), { recursive: true });
  const logPath = path.join(jobsDir(), `${id}.log`);
  await writeFile(/* turbopackIgnore: true */ logPath, "", "utf8");

  let resolveDone!: (job: JobSnapshot) => void;
  const done = new Promise<JobSnapshot>((resolve) => {
    resolveDone = resolve;
  });

  const job: JobRecord = {
    id,
    argv,
    clusterId: input.clusterId ?? null,
    mutating,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    logPath,
    error: null,
    pid: null,
    child: null,
    done,
    resolveDone,
  };

  await appendFile(logPath, `$ ./cluster ${argv.join(" ")}\n`, "utf8");

  const child = spawnClusterctl({
    root,
    argv,
    clusterId: input.clusterId,
    onStdout: (chunk) => {
      void appendFile(logPath, chunk, "utf8");
    },
    onStderr: (chunk) => {
      void appendFile(logPath, chunk, "utf8");
    },
  });
  job.child = child;
  job.pid = child.pid ?? null;
  st.jobs.set(id, job);
  if (mutating) {
    st.mutatingId = id;
  }

  child.on("error", (err) => {
    void appendFile(logPath, `\n[spawn error] ${err.message}\n`, "utf8");
    finishJob(st, job, "error", null, err.message);
  });
  child.on("exit", (code, signal) => {
    const exitCode = code ?? (signal ? 128 : 1);
    void appendFile(
      logPath,
      `\n[exit ${exitCode}${signal ? ` signal=${signal}` : ""}]\n`,
      "utf8",
    );
    finishJob(st, job, "exited", exitCode, null);
  });

  return job;
}

export function getJob(id: string): JobRecord | undefined {
  return store().jobs.get(id);
}

export function listJobs(): JobSnapshot[] {
  return [...store().jobs.values()]
    .map(snapshotOf)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function waitForJob(
  job: JobRecord,
  timeoutMs = 180_000,
): Promise<JobSnapshot> {
  if (job.status !== "running") {
    return snapshotOf(job);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<JobSnapshot>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("timed out waiting for clusterctl (use wait:false and stream)"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([job.done, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function cancelJob(id: string): JobSnapshot {
  const st = store();
  const job = st.jobs.get(id);
  if (!job) {
    throw new Error("job not found");
  }
  if (job.status !== "running" || !job.pid) {
    return snapshotOf(job);
  }
  try {
    process.kill(-job.pid, "SIGTERM");
  } catch {
    try {
      process.kill(job.pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  void appendFile(job.logPath, "\n[canceled SIGTERM — ansible children may outlive the wrapper]\n", "utf8");
  finishJob(st, job, "canceled", 130, "canceled");
  return snapshotOf(job);
}

export async function readJobLog(id: string): Promise<string> {
  const job = store().jobs.get(id);
  if (!job) {
    throw new Error("job not found");
  }
  return readFile(/* turbopackIgnore: true */ job.logPath, "utf8");
}

export function followJobLog(id: string): ReadableStream<Uint8Array> {
  const job = store().jobs.get(id);
  if (!job) {
    throw new Error("job not found");
  }
  const encoder = new TextEncoder();
  let closed = false;
  let offset = 0;
  let interval: ReturnType<typeof setInterval> | undefined;

  return new ReadableStream({
    start(controller) {
      const send = (payload: string) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      const pump = async () => {
        try {
          const buf = await readFile(/* turbopackIgnore: true */ job.logPath);
          if (buf.length > offset) {
            const text = buf.subarray(offset).toString("utf8");
            offset = buf.length;
            send(text);
          }
        } catch {
          // log not ready
        }
      };
      void pump();
      interval = setInterval(() => {
        void pump();
        if (job.status !== "running") {
          void pump().finally(() => {
            if (closed) return;
            controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
            closed = true;
            if (interval) clearInterval(interval);
            controller.close();
          });
        }
      }, 400);
    },
    cancel() {
      closed = true;
      if (interval) clearInterval(interval);
    },
  });
}
