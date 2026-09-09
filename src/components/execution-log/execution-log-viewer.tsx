"use client";

import { useEffect, useState } from "react";

import { ExecutionHeader } from "@/components/execution-log/execution-header";
import { LogPane } from "@/components/execution-log/log-pane";
import { useExecutionLog } from "@/hooks/use-execution-log";
import { useExecutionRecord } from "@/hooks/use-execution-record";

function useNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);
  return now;
}

export function ExecutionLogViewer({
  projectId,
  executionId,
}: {
  projectId: string;
  executionId: string;
}) {
  const log = useExecutionLog(projectId, executionId);
  const record = useExecutionRecord(projectId, executionId, log.status);
  const active = Boolean(log.running);
  const now = useNow(active);

  return (
    <LogPane
      lines={log.lines}
      counts={log.counts}
      errorIndexes={log.errorIndexes}
      running={log.running}
      ready={log.ready}
      fill
      error={log.error}
      onRetry={log.retry}
      downloadName={`${executionId}.log`}
      header={(actions) => (
        <ExecutionHeader
          projectId={projectId}
          executionId={executionId}
          record={record.record}
          loading={record.loading}
          liveStatus={log.status}
          now={now}
          onCopyAll={actions.onCopyAll}
          onCopyVisible={actions.onCopyVisible}
          onDownload={actions.onDownload}
        />
      )}
    />
  );
}
