"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { useAtlasClusterSelection } from "@/components/atlas-cluster-selection";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { projectHref } from "@/lib/project-href";
import { fetchProject, stargateJson } from "@/lib/stargate";
import type { StargateProject } from "@/lib/project-types";

type Playbook = {
  id: string;
  name?: string;
  description?: string;
  tags?: string[] | string;
  disabled?: boolean;
  metadata?: { disabled?: boolean; tags?: string[] | string };
};

type Execution = {
  playbookId?: string;
  playbook_id?: string;
  playbookName?: string;
  queuedAt?: string | number | null;
  startedAt?: string | number | null;
  createdAt?: string | number | null;
  created_at?: string | number | null;
  selectionSnapshot?: { playbookId?: string; playbookName?: string };
  runParams?: {
    inventory_files?: string[];
    ansible_config?: string;
  };
};

function playbookTags(pb: Playbook): string[] {
  const raw = pb.tags ?? pb.metadata?.tags ?? [];
  if (Array.isArray(raw)) {
    return raw.map((tag) => String(tag).trim()).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [];
}

function isDisabled(pb: Playbook): boolean {
  return Boolean(pb.disabled || pb.metadata?.disabled);
}

function toMs(value: string | number | null | undefined): number | null {
  if (value == null || value === "") {
    return null;
  }
  if (typeof value === "number") {
    return value < 1e12 ? value * 1000 : value;
  }
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    return n < 1e12 ? n * 1000 : n;
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

function execStamp(exec: Execution): number {
  return (
    toMs(exec.queuedAt) ??
    toMs(exec.startedAt) ??
    toMs(exec.createdAt) ??
    toMs(exec.created_at) ??
    0
  );
}

function playbookIdOf(exec: Execution, playbooks: Playbook[]): string {
  const fromSnap = exec.selectionSnapshot?.playbookId;
  const direct = exec.playbookId || exec.playbook_id || fromSnap;
  if (direct) {
    return direct;
  }
  const name = exec.playbookName || exec.selectionSnapshot?.playbookName;
  if (name) {
    const match = playbooks.find((pb) => pb.name === name);
    if (match) {
      return match.id;
    }
  }
  return "unknown";
}

export default function PlaybooksCatalogPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const projectId = decodeURIComponent(use(params).projectId);
  const { clusterId } = useAtlasClusterSelection();
  const [project, setProject] = useState<StargateProject | null>(null);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const atlas = project?.kind === "atlas";

  async function load() {
    const clusterQuery = clusterId
      ? `?cluster_id=${encodeURIComponent(clusterId)}`
      : "";
    const [pb, exec] = await Promise.all([
      stargateJson<{ playbooks?: Playbook[] }>(
        `/projects/${projectId}/playbooks${clusterQuery}`,
      ),
      stargateJson<{ executions?: Execution[] }>(
        `/executions?project_id=${encodeURIComponent(projectId)}`,
      ),
    ]);
    setPlaybooks(pb.playbooks ?? []);
    setExecutions(exec.executions ?? []);
  }

  useEffect(() => {
    void fetchProject(projectId)
      .then(setProject)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, [projectId]);

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
  }, [projectId, clusterId]);

  const lastByPlaybook = useMemo(() => {
    const map = new Map<string, Execution>();
    const sorted = [...executions].sort((a, b) => execStamp(b) - execStamp(a));
    for (const exec of sorted) {
      const id = playbookIdOf(exec, playbooks);
      if (!map.has(id)) {
        map.set(id, exec);
      }
    }
    return map;
  }, [executions, playbooks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return playbooks.filter((pb) => {
      if (!q) {
        return true;
      }
      const hay = `${pb.name ?? ""} ${pb.description ?? ""} ${playbookTags(pb).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [playbooks, search]);

  async function createPlaybook() {
    const name = newName.trim();
    if (!name) {
      toast.error("Name is required");
      return;
    }
    setCreating(true);
    try {
      await stargateJson(`/projects/${projectId}/playbooks`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setNewName("");
      toast.success("Playbook created");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function runPlaybook(pb: Playbook) {
    const last = lastByPlaybook.get(pb.id);
    const inventory = last?.runParams?.inventory_files?.filter(Boolean) ?? [];
    setBusyId(pb.id);
    try {
      const data = await stargateJson<{
        executionId?: string;
        execution_id?: string;
      }>(`/projects/${projectId}/playbooks/${pb.id}/run`, {
        method: "POST",
        body: JSON.stringify({
          ansible_config:
            last?.runParams?.ansible_config || "ansible-config/ansible.cfg",
          inventory_files: inventory.length ? inventory : undefined,
        }),
      });
      const exec = data.executionId || data.execution_id;
      toast.success(exec ? `Queued ${exec.slice(0, 8)}` : "Queued on worker");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  if (error) {
    return <EmptyState title="Playbooks unavailable" description={error} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Infrastructure"
        title="Playbooks"
        description={
          atlas
            ? "Playbook files from the selected cluster.yaml. Edit opens YAML in the sibling repo."
            : "Catalog of saved playbooks. Run queues a worker job; edit opens the visual editor."
        }
      />
      <Panel className="flex flex-wrap items-center gap-3 p-4">
        <Input
          placeholder="Search playbooks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {atlas ? null : (
            <>
              <Input
                placeholder="New playbook name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="max-w-48"
              />
              <Button
                variant="outline"
                disabled={creating}
                onClick={() => void createPlaybook()}
              >
                <Plus />
                Create
              </Button>
            </>
          )}
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw />
            Reload
          </Button>
        </div>
      </Panel>
      {filtered.length === 0 ? (
        <EmptyState
          title={atlas ? "No playbooks in this cluster" : "No playbooks yet"}
          description={
            atlas
              ? "cluster.yaml has no playbook entries, or sibling repos are missing."
              : "Create a playbook, then edit YAML or run it on a worker."
          }
        />
      ) : (
        <Panel className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                {atlas ? null : <TableHead>Status</TableHead>}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((pb) => {
                const disabled = isDisabled(pb);
                return (
                  <TableRow key={pb.id}>
                    <TableCell>
                      <div className="font-medium">{pb.name || pb.id}</div>
                      {pb.description ? (
                        <div className="text-xs text-muted-foreground">
                          {pb.description}
                        </div>
                      ) : null}
                    </TableCell>
                    {atlas ? null : (
                      <TableCell>
                        <Badge variant={disabled ? "outline" : "success"}>
                          {disabled ? "Disabled" : "Enabled"}
                        </Badge>
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          render={
                            <Link
                              href={projectHref(
                                projectId,
                                `/playbooks/${encodeURIComponent(pb.id)}`,
                              )}
                            />
                          }
                        >
                          Edit
                        </Button>
                        {atlas ? null : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              render={
                                <Link
                                  href={projectHref(
                                    projectId,
                                    `/playbooks/${encodeURIComponent(pb.id)}/schedule`,
                                  )}
                                />
                              }
                            >
                              Schedule
                            </Button>
                            <Button
                              size="sm"
                              disabled={disabled || busyId === pb.id}
                              onClick={() => void runPlaybook(pb)}
                            >
                              Run
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Panel>
      )}
    </div>
  );
}
