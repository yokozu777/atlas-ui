"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { projectHref } from "@/lib/project-href";
import { stargateJson } from "@/lib/stargate";

type Execution = {
  id?: string;
  executionId?: string;
  status?: string;
  playbookName?: string;
  kind?: string;
};

export default function ExecutionsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const projectId = decodeURIComponent(use(params).projectId);
  const [rows, setRows] = useState<Execution[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await stargateJson<{ executions?: Execution[] }>(
      `/executions?project_id=${encodeURIComponent(projectId)}`,
    );
    setRows(data.executions ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    void load().catch((err: unknown) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function cancel(id: string, status?: string) {
    try {
      if (status === "QUEUED") {
        await stargateJson(
          `/projects/${projectId}/executions/${id}/cancel`,
          { method: "POST", body: JSON.stringify({}) },
        );
      } else if (status === "RUNNING") {
        await stargateJson(
          `/projects/${projectId}/executions/${id}/stop`,
          { method: "POST", body: JSON.stringify({}) },
        );
      } else {
        await stargateJson(
          `/executions/${id}?project_id=${encodeURIComponent(projectId)}`,
          { method: "PATCH", body: JSON.stringify({ status: "CANCELING" }) },
        );
      }
      toast.success("Cancel requested");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  if (error) {
    return <EmptyState title="Executions unavailable" description={error} />;
  }

  return (
    <div>
      <PageHeader
        kicker="Ansible"
        title="Executions"
        description="Worker runs. Cancel queued jobs; stop sends CANCELING to a running worker."
      />
      <Panel>
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No executions" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Id</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const id = row.id || row.executionId || "";
                const active =
                  row.status === "QUEUED" ||
                  row.status === "RUNNING" ||
                  row.status === "CANCELING";
                return (
                  <TableRow key={id}>
                    <TableCell className="font-mono text-xs">{id}</TableCell>
                    <TableCell>{row.playbookName ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.kind ?? "ansible"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.status ?? "—"}</Badge>
                    </TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        render={
                          <Link
                            href={projectHref(projectId, `/executions/${id}`)}
                          />
                        }
                      >
                        Log
                      </Button>
                      {active && row.status !== "CANCELING" ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void cancel(id, row.status)}
                        >
                          {row.status === "QUEUED" ? "Cancel" : "Stop"}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
