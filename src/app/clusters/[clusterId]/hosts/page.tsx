"use client";

import { use, useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { useClusterOverlays } from "@/components/cluster-overlays";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { runClusterctl } from "@/lib/api";
import { parseJobJson } from "@/lib/job-output";

type LimitHost = {
  key: string;
  hostname?: string | null;
  group?: string | null;
};

type LimitsJson = {
  cluster_id?: string;
  groups?: string[];
  hosts?: LimitHost[];
};

type HostRow = {
  limit: string;
  group: string;
  host: string;
  hostname: string;
};

function rowsFromLimits(data: LimitsJson): HostRow[] {
  const groups = data.groups ?? [];
  const hosts = data.hosts ?? [];
  const rows: HostRow[] = groups.map((group) => ({
    limit: group,
    group,
    host: "—",
    hostname: "—",
  }));
  for (const host of hosts) {
    rows.push({
      limit: host.key,
      group: host.group ?? "—",
      host: host.key,
      hostname: host.hostname ?? "—",
    });
  }
  return rows;
}

export default function HostsPage({
  params,
}: {
  params: Promise<{ clusterId: string }>;
}) {
  const clusterId = decodeURIComponent(use(params).clusterId);
  return <ClusterHostsView key={clusterId} clusterId={clusterId} />;
}

export function ClusterHostsView({ clusterId }: { clusterId: string }) {
  const { openRun } = useClusterOverlays();
  const [rows, setRows] = useState<HostRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void runClusterctl({ argv: ["limits", "--json"], clusterId, wait: true })
      .then((result) => {
        if (cancelled) return;
        if (result.exitCode && result.exitCode !== 0) {
          throw new Error(result.log || `limits exit ${result.exitCode}`);
        }
        const data = parseJobJson<LimitsJson>(result.log ?? "{}");
        const next = rowsFromLimits(data);
        setRows(next);
        setEmpty((data.hosts ?? []).length === 0 && (data.groups ?? []).length === 0);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRows([]);
        setEmpty(false);
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [clusterId]);

  let body;
  if (error) {
    body = <p className="font-mono text-xs whitespace-pre-wrap text-destructive">{error}</p>;
  } else if (empty || rows.length === 0) {
    body = (
      <EmptyState
        title="No hosts"
        description="Inventory has no groups or host keys for --limit."
      />
    );
  } else {
    body = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Group</TableHead>
            <TableHead>Host</TableHead>
            <TableHead>Hostname</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow
              key={`${row.limit}-${index}`}
              className="cursor-pointer"
              onClick={() => openRun({ limit: row.limit })}
            >
              <TableCell>
                <Badge variant="secondary">{row.group}</Badge>
              </TableCell>
              <TableCell className="font-mono font-medium text-chart-1">
                {row.host}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {row.hostname}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Cluster"
        title="Hosts"
        description="Inventory groups and host keys. Click a row to prefill Run --limit."
      />
      {body}
    </div>
  );
}
