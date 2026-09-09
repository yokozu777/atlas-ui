"use client";

import { useState } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { JsonBlock } from "@/components/json-block";
import { LogViewer } from "@/components/log-viewer";
import { useJobSession } from "@/components/job-session";
import { Panel, TerminalChrome } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { parseJobJson } from "@/lib/job-output";
import { runClusterctl } from "@/lib/api";
import type { JobSnapshot } from "@/server/jobs";

export function CommandPanel({
  clusterId,
  argv,
  label,
  wait = true,
  json = false,
  confirm,
  confirmDestructive = false,
}: {
  clusterId?: string;
  argv: string[];
  label: string;
  wait?: boolean;
  json?: boolean;
  confirm?: string;
  confirmDestructive?: boolean;
}) {
  const { startJob } = useJobSession();
  const [job, setJob] = useState<(JobSnapshot & { log?: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const result = wait
        ? await runClusterctl({ argv, clusterId, wait })
        : await startJob({ argv, clusterId, wait: false });
      if (wait) {
        setJob(result);
      }
      if (wait && result.exitCode && result.exitCode !== 0) {
        toast.error(`${label} exit ${result.exitCode}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  let jsonValue: unknown = null;
  if (json && job?.log && job.status !== "running") {
    try {
      jsonValue = parseJobJson(job.log);
    } catch {
      jsonValue = null;
    }
  }

  return (
    <Panel className="flex min-h-0 flex-col">
      <TerminalChrome
        label={`./cluster ${argv.join(" ")}`}
        actions={
          <Button
            type="button"
            size="sm"
            onClick={() => {
              if (confirm) {
                setConfirmOpen(true);
                return;
              }
              void run();
            }}
            disabled={busy}
          >
            {busy ? "Running…" : label}
          </Button>
        }
      />
      {jsonValue ? <JsonBlock value={jsonValue} framed={false} /> : null}
      {wait && job && !jsonValue ? (
        <LogViewer
          jobId={job.id}
          text={job.log ?? ""}
          running={false}
          framed={false}
        />
      ) : null}
      {confirm ? (
        <ConfirmAction
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={label}
          description={confirm}
          confirmLabel="Run"
          destructive={confirmDestructive}
          onConfirm={run}
        />
      ) : null}
    </Panel>
  );
}
