"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { fetchJob, runClusterctl } from "@/lib/api";
import type { JobSnapshot } from "@/server/jobs";

type RunInput = {
  argv: string[];
  clusterId?: string;
  wait?: boolean;
};

type JobSessionValue = {
  job: JobSnapshot | null;
  log: string;
  attach: (job: JobSnapshot) => void;
  startJob: (input: RunInput) => Promise<JobSnapshot & { log?: string }>;
};

const JobSessionContext = createContext<JobSessionValue | null>(null);

export function JobSessionProvider({ children }: { children: ReactNode }) {
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const [log, setLog] = useState("");
  const running = job?.status === "running";
  const jobId = job?.id ?? null;

  const attach = useCallback((next: JobSnapshot) => {
    setJob(next);
  }, []);

  const startJob = useCallback(async (input: RunInput) => {
    const result = await runClusterctl(input);
    if (input.wait === false || result.status === "running") {
      setLog("");
      setJob(result);
    }
    return result;
  }, []);

  useEffect(() => {
    if (!jobId || !running) {
      return;
    }
    let cancelled = false;
    let started = false;
    const source = new EventSource(`/api/jobs/${jobId}/stream`);
    source.onmessage = (event) => {
      try {
        const chunk = JSON.parse(event.data) as string;
        if (!chunk || cancelled) {
          return;
        }
        if (!started) {
          started = true;
          setLog(chunk);
        } else {
          setLog((prev) => prev + chunk);
        }
      } catch {
        // ignore malformed SSE payloads
      }
    };
    source.addEventListener("done", () => {
      source.close();
      void fetchJob(jobId)
        .then((next) => {
          if (cancelled) return;
          setJob(next);
          if (typeof next.log === "string") {
            setLog(next.log);
          }
        })
        .catch(() => {
          if (cancelled) return;
          setJob((current) =>
            current && current.id === jobId
              ? { ...current, status: "exited" }
              : current,
          );
        });
    });
    return () => {
      cancelled = true;
      source.close();
    };
  }, [jobId, running]);

  const value = useMemo(
    () => ({ job, log, attach, startJob }),
    [job, log, attach, startJob],
  );

  return (
    <JobSessionContext.Provider value={value}>{children}</JobSessionContext.Provider>
  );
}

export function useJobSession() {
  const ctx = useContext(JobSessionContext);
  if (!ctx) {
    throw new Error("useJobSession must be used within JobSessionProvider");
  }
  return ctx;
}
