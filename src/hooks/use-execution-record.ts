"use client";

import { useCallback, useEffect, useState } from "react";

import { ACTIVE_EXECUTION_STATUSES } from "@/lib/execution-log";
import type { RawExecution } from "@/lib/project-dashboard";
import { stargateJson } from "@/lib/stargate";

export type UseExecutionRecordResult = {
  record: RawExecution | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

export function useExecutionRecord(
  projectId: string,
  executionId: string,
  liveStatus?: string | null,
): UseExecutionRecordResult {
  const [record, setRecord] = useState<RawExecution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const data = await stargateJson<{ execution?: RawExecution }>(
      `/executions/${encodeURIComponent(executionId)}?project_id=${encodeURIComponent(projectId)}`,
    );
    setRecord(data.execution ?? null);
  }, [projectId, executionId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void reload()
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  useEffect(() => {
    if (!liveStatus) {
      return;
    }
    setRecord((prev) =>
      prev && prev.status !== liveStatus ? { ...prev, status: liveStatus } : prev,
    );
  }, [liveStatus]);

  const status = liveStatus || record?.status;
  const active = Boolean(status && ACTIVE_EXECUTION_STATUSES.has(status));

  useEffect(() => {
    if (!active) {
      return;
    }
    const timer = window.setInterval(() => {
      void reload().catch(() => {
        /* keep last known record while live */
      });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [active, reload]);

  return { record, loading, error, reload };
}
