"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { ChevronRight, History, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatSeconds } from "@/lib/format-time";
import { projectHref } from "@/lib/project-href";
import { stargateJson } from "@/lib/stargate";
import { cn } from "@/lib/utils";

type Playbook = {
  id: string;
  name?: string;
  description?: string;
  tags?: string[] | string;
  disabled?: boolean;
  metadata?: { disabled?: boolean; tags?: string[] | string };
};

type Execution = {
  id?: string;
  executionId?: string;
  status?: string;
  playbookId?: string;
  playbookName?: string;
  playbook_id?: string;
  queuedAt?: string | number | null;
  startedAt?: string | number | null;
  createdAt?: string | number | null;
  created_at?: string | number | null;
  finishedAt?: string | number | null;
  duration?: number | null;
  workerName?: string;
  workerTags?: string[];
  selectionSnapshot?: { playbookId?: string; playbookName?: string };
  runParams?: {
    inventory_files?: string[];
    ansible_config?: string;
  };
};

type StatusTone = "success" | "destructive" | "warning" | "outline";

const PAGE_SIZE = 10;

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

function formatExactTime(value: string | number | null | undefined): string {
  const ms = toMs(value);
  if (ms == null) {
    return "—";
  }
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) {
    return "—";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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

function executionIdOf(exec: Execution): string {
  return exec.id || exec.executionId || "";
}

function statusKind(
  status?: string,
): "ok" | "fail" | "running" | "canceling" | "canceled" | "queued" | "unknown" {
  const s = (status || "").toLowerCase();
  if (s === "success" || s === "completed" || s === "complete") {
    return "ok";
  }
  if (s === "failed" || s === "fail" || s === "error") {
    return "fail";
  }
  if (s === "running" || s === "run") {
    return "running";
  }
  if (s === "canceling" || s === "cancelling") {
    return "canceling";
  }
  if (s === "canceled" || s === "cancelled") {
    return "canceled";
  }
  if (s === "queued" || s === "pending") {
    return "queued";
  }
  return "unknown";
}

function statusLabel(kind: ReturnType<typeof statusKind>): string {
  if (kind === "ok") return "SUCCESS";
  if (kind === "fail") return "FAILED";
  if (kind === "running") return "RUNNING";
  if (kind === "canceling") return "CANCELING";
  if (kind === "canceled") return "CANCELED";
  if (kind === "queued") return "QUEUED";
  return "UNKNOWN";
}

function statusTone(kind: ReturnType<typeof statusKind>): StatusTone {
  if (kind === "ok") return "success";
  if (kind === "fail") return "destructive";
  if (kind === "running" || kind === "canceling") return "warning";
  return "outline";
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

function durationLabel(exec: Execution): string {
  if (typeof exec.duration === "number" && Number.isFinite(exec.duration)) {
    return formatSeconds(exec.duration);
  }
  const start = toMs(exec.startedAt) ?? toMs(exec.createdAt);
  const end = toMs(exec.finishedAt);
  if (start != null && end != null && end >= start) {
    return formatSeconds((end - start) / 1000);
  }
  if (start != null && statusKind(exec.status) === "running") {
    return `${formatSeconds((Date.now() - start) / 1000)} (running)`;
  }
  return "—";
}

export default function AnsibleRunsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const projectId = decodeURIComponent(use(params).projectId);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [newName, setNewName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [pages, setPages] = useState<Record<string, number>>({});

  async function load() {
    const [pb, exec] = await Promise.all([
      stargateJson<{ playbooks?: Playbook[] }>(
        `/projects/${projectId}/playbooks`,
      ),
      stargateJson<{ executions?: Execution[] }>(
        `/executions?project_id=${encodeURIComponent(projectId)}`,
      ),
    ]);
    setPlaybooks(pb.playbooks ?? []);
    setExecutions(exec.executions ?? []);
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

  const enabled = useMemo(
    () => playbooks.filter((pb) => !isDisabled(pb)),
    [playbooks],
  );

  const byPlaybook = useMemo(() => {
    const map = new Map<string, Execution[]>();
    for (const exec of executions) {
      const id = playbookIdOf(exec, playbooks);
      const list = map.get(id) ?? [];
      list.push(exec);
      map.set(id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => execStamp(b) - execStamp(a));
    }
    return map;
  }, [executions, playbooks]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const pb of enabled) {
      for (const tag of playbookTags(pb)) {
        tags.add(tag);
      }
    }
    return [...tags].sort((a, b) => a.localeCompare(b));
  }, [enabled]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enabled.filter((pb) => {
      if (tagFilter && !playbookTags(pb).includes(tagFilter)) {
        return false;
      }
      if (!q) {
        return true;
      }
      const hay = `${pb.name ?? ""} ${pb.description ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [enabled, search, tagFilter]);

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

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
    const last = (byPlaybook.get(pb.id) ?? [])[0];
    const inventory =
      last?.runParams?.inventory_files?.filter(Boolean) ?? [];
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
      setOpenIds((prev) => new Set(prev).add(pb.id));
      setPages((prev) => ({ ...prev, [pb.id]: 1 }));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  if (error) {
    return <EmptyState title="Runs unavailable" description={error} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Ansible"
        title="Runs"
        description="Playbooks grouped with recent executions. Run queues a worker job."
      />

      <Panel className="flex flex-wrap items-center gap-3 p-4">
        <Input
          placeholder="Search playbooks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={tagFilter || "All Tags"}
          onValueChange={(value) =>
            setTagFilter(!value || value === "All Tags" ? "" : value)
          }
        >
          <SelectTrigger className="w-44" aria-label="Filter by tag">
            <SelectValue placeholder="All Tags" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All Tags">All Tags</SelectItem>
            {allTags
              .filter((tag) => tag !== "All Tags")
              .map((tag) => (
              <SelectItem key={tag} value={tag}>
                {tag}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex flex-wrap items-center gap-2">
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
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw />
            Reload
          </Button>
          <Button
            variant="outline"
            render={<Link href={projectHref(projectId, "/executions")} />}
          >
            <History />
            History
          </Button>
        </div>
      </Panel>

      {filtered.length === 0 ? (
        <EmptyState
          title="No playbooks yet"
          description="Create a playbook to start running executions."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((pb) => {
            const execs = byPlaybook.get(pb.id) ?? [];
            const last = execs[0];
            const lastKind = last ? statusKind(last.status) : null;
            const open = openIds.has(pb.id);
            const page = pages[pb.id] ?? 1;
            const totalPages = Math.max(1, Math.ceil(execs.length / PAGE_SIZE));
            const safePage = Math.min(page, totalPages);
            const slice = execs.slice(
              (safePage - 1) * PAGE_SIZE,
              safePage * PAGE_SIZE,
            );
            const successCount = execs.filter(
              (row) => statusKind(row.status) === "ok",
            ).length;
            const failedCount = execs.filter(
              (row) => statusKind(row.status) === "fail",
            ).length;
            return (
              <Panel key={pb.id}>
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-expanded={open}
                      aria-label={open ? "Collapse runs" : "Expand runs"}
                      onClick={() => toggle(pb.id)}
                    >
                      <ChevronRight
                        className={cn(
                          "size-4 text-muted-foreground transition-transform",
                          open && "rotate-90",
                        )}
                      />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto min-w-0 flex-1 justify-start rounded-none px-0 py-0 font-normal"
                      onClick={() => toggle(pb.id)}
                    >
                      <span className="block truncate font-medium">
                        {pb.name || pb.id}
                      </span>
                      {pb.description ? (
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {pb.description}
                        </span>
                      ) : null}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      render={
                        <Link
                          href={projectHref(projectId, `/playbooks/${pb.id}`)}
                        />
                      }
                    >
                      Edit
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {lastKind ? (
                      <Badge variant={statusTone(lastKind)}>
                        {statusLabel(lastKind)}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Never run</Badge>
                    )}
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {last
                        ? formatExactTime(
                            last.queuedAt ??
                              last.startedAt ??
                              last.createdAt ??
                              last.created_at,
                          )
                        : "—"}
                    </span>
                    <Button
                      size="sm"
                      disabled={busyId === pb.id}
                      onClick={() => void runPlaybook(pb)}
                    >
                      Run
                    </Button>
                  </div>
                </div>
                {open ? (
                  <div className="border-t border-foreground/10">
                    {execs.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-muted-foreground">
                        This playbook has not been executed yet.
                      </p>
                    ) : (
                      <>
                        <p className="px-4 py-3 text-xs text-muted-foreground">
                          {execs.length} total
                          {successCount > 0 ? ` · ${successCount} success` : ""}
                          {failedCount > 0 ? ` · ${failedCount} failed` : ""}
                        </p>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-8" />
                              <TableHead>Run</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Worker</TableHead>
                              <TableHead>Time</TableHead>
                              <TableHead>Duration</TableHead>
                              <TableHead />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {slice.map((exec, index) => {
                              const kind = statusKind(exec.status);
                              const id = executionIdOf(exec);
                              const runNumber =
                                execs.length - ((safePage - 1) * PAGE_SIZE + index);
                              const pills = [
                                exec.workerName,
                                ...(exec.workerTags ?? []),
                              ].filter(Boolean) as string[];
                              return (
                                <TableRow key={id || String(runNumber)}>
                                  <TableCell>
                                    <span
                                      className={cn(
                                        "inline-block size-2 rounded-full",
                                        kind === "ok"
                                          ? "bg-success"
                                          : kind === "fail"
                                            ? "bg-destructive"
                                            : kind === "running"
                                              ? "bg-warning"
                                              : "bg-muted-foreground/40",
                                      )}
                                    />
                                  </TableCell>
                                  <TableCell className="font-mono text-xs">
                                    #{runNumber}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={statusTone(kind)}>
                                      {statusLabel(kind)}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex flex-wrap gap-1">
                                      {pills.length
                                        ? pills.map((tag) => (
                                            <Badge
                                              key={tag}
                                              variant="info"
                                              className="max-w-[8rem] truncate"
                                            >
                                              {tag}
                                            </Badge>
                                          ))
                                        : "—"}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs tabular-nums text-muted-foreground">
                                    {formatExactTime(
                                      exec.queuedAt ??
                                        exec.startedAt ??
                                        exec.createdAt ??
                                        exec.created_at,
                                    )}
                                  </TableCell>
                                  <TableCell className="text-xs tabular-nums">
                                    {durationLabel(exec)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {id ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        render={
                                          <Link
                                            href={projectHref(
                                              projectId,
                                              `/executions/${id}`,
                                            )}
                                          />
                                        }
                                      >
                                        View log
                                      </Button>
                                    ) : null}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                        {totalPages > 1 ? (
                          <div className="flex items-center justify-center gap-3 px-4 py-3">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={safePage <= 1}
                              onClick={() =>
                                setPages((prev) => ({
                                  ...prev,
                                  [pb.id]: safePage - 1,
                                }))
                              }
                            >
                              Previous
                            </Button>
                            <span className="text-xs text-muted-foreground">
                              Page {safePage} of {totalPages}
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={safePage >= totalPages}
                              onClick={() =>
                                setPages((prev) => ({
                                  ...prev,
                                  [pb.id]: safePage + 1,
                                }))
                              }
                            >
                              Next
                            </Button>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
