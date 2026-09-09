"use client";

import { use, useEffect, useState } from "react";

import { LogViewer } from "@/components/log-viewer";
import { PageHeader } from "@/components/page-header";
import { fetchClusterRunLog } from "@/lib/api";

export default function LogStampPage({
  params,
}: {
  params: Promise<{ clusterId: string; stamp: string }>;
}) {
  const resolved = use(params);
  const clusterId = decodeURIComponent(resolved.clusterId);
  const stamp = decodeURIComponent(resolved.stamp);
  return (
    <ClusterLogStampView
      key={`${clusterId}:${stamp}`}
      clusterId={clusterId}
      stamp={stamp}
    />
  );
}

export function ClusterLogStampView({
  clusterId,
  stamp,
}: {
  clusterId: string;
  stamp: string;
}) {
  const [log, setLog] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchClusterRunLog(clusterId, stamp)
      .then(setLog)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, [clusterId, stamp]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <PageHeader
        kicker="Logs"
        title={<span className="font-mono tracking-tight">{stamp}</span>}
        description="Full workspace log for this stamp."
        className="shrink-0"
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <LogViewer jobId={null} text={log} running={false} fill label={stamp} />
    </div>
  );
}
