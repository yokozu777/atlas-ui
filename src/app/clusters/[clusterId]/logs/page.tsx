"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SectionHeader } from "@/components/section-header";
import { MetaStatusBadge } from "@/components/status-badge";
import { WorkspaceFsBrowser } from "@/components/workspace-fs-browser";
import { clusterHref, fetchClusterRuns, type RunLogRow } from "@/lib/api";
import {
  formatAge,
  formatDuration,
  metaExitCode,
  metaString,
  runCommandLabel,
} from "@/lib/format-time";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function LogsPage({
  params,
}: {
  params: Promise<{ clusterId: string }>;
}) {
  const clusterId = decodeURIComponent(use(params).clusterId);
  return <ClusterLogsView key={clusterId} clusterId={clusterId} />;
}

export function ClusterLogsView({ clusterId }: { clusterId: string }) {
  const router = useRouter();
  const [runs, setRuns] = useState<RunLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchClusterRuns(clusterId)
      .then((data) => {
        if (!cancelled) {
          setRuns(data.runs);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [clusterId]);

  let body;
  if (error) {
    body = <p className="text-sm text-destructive">{error}</p>;
  } else if (runs.length === 0) {
    body = (
      <EmptyState
        title="No runs"
        description="cluster run writes timestamped dirs under workspace logs."
      />
    );
  } else {
    body = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Command / phases</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Age</TableHead>
            <TableHead>Exit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => {
            const started = metaString(run.meta, "started_at");
            const finished = metaString(run.meta, "finished_at");
            const exit = metaExitCode(run.meta);
            return (
              <TableRow
                key={run.stamp}
                className="cursor-pointer"
                onClick={() =>
                  router.push(
                    clusterHref(
                      clusterId,
                      `/logs/${encodeURIComponent(run.stamp)}`,
                    ),
                  )
                }
              >
                <TableCell>
                  <MetaStatusBadge meta={run.meta} />
                </TableCell>
                <TableCell className="font-mono text-muted-foreground">
                  {runCommandLabel(run.meta)}
                </TableCell>
                <TableCell className="font-mono">
                  <Link
                    className="font-medium text-chart-1 underline-offset-4 hover:underline"
                    href={clusterHref(
                      clusterId,
                      `/logs/${encodeURIComponent(run.stamp)}`,
                    )}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {started ?? run.stamp}
                  </Link>
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {formatDuration(started, finished) ?? "—"}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {formatAge(started ?? run.stamp) ?? "—"}
                </TableCell>
                <TableCell className="tabular-nums">
                  {exit === null ? "—" : exit}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        kicker="Cluster"
        title="Run history"
        description="Click a row to open the full log. Other files under workspace logs are below."
      />
      {body}
      <div>
        <SectionHeader title="Log files" />
        <WorkspaceFsBrowser
          clusterId={clusterId}
          rootRel="logs"
          runLogHref={(rel) => {
            const match = /^logs\/([^/]+)\/run\.log$/.exec(rel);
            if (!match) {
              return null;
            }
            return clusterHref(
              clusterId,
              `/logs/${encodeURIComponent(match[1])}`,
            );
          }}
        />
      </div>
    </div>
  );
}
