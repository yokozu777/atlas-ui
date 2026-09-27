"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Cpu,
  Info,
  Loader2,
  MemoryStick,
  Network,
  Search,
  Server,
} from "lucide-react";
import { toast } from "sonner";

import { DistroIcon } from "@/components/distro-icon";
import { EmptyState } from "@/components/empty-state";
import {
  groupBadgeVariant,
  hostStatusKind,
  hostStatusLabel,
} from "@/components/hosts-groups/helpers";
import type { AtlasSshDisplay, HostTableRow } from "@/components/hosts-groups/hosts-tab";
import { StatusBadge } from "@/components/status-badge";
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
import { useCan } from "@/lib/authz";
import { DISTRO_LABELS, type DistroKind } from "@/lib/distro-kind";
import {
  buildFleetCard,
  executionIdOf,
  factsNeedHydration,
  filterFleetCards,
  latestFactsExecutionByHost,
  type FleetFactsExecution,
  type FleetFilters,
} from "@/lib/host-fleet";
import { formatRelativeTime } from "@/lib/project-dashboard";
import { stargateJson } from "@/lib/stargate";

function Spec({
  icon: Icon,
  value,
}: {
  icon: typeof Server;
  value?: string | number | null;
}) {
  if (value == null || value === "") return null;
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate text-xs text-foreground">{value}</span>
    </div>
  );
}

export function FleetTab({
  projectId,
  clusterId,
  rows,
  onFacts,
  onCheck,
  busy,
  running,
  checkingHost,
  atlasSsh,
  ansibleConfig,
  inventoryFiles,
  reloadToken = 0,
}: {
  projectId: string;
  clusterId?: string | null;
  rows: HostTableRow[];
  onFacts: (host: string) => void;
  onCheck: (host: string) => void;
  busy: boolean;
  running: boolean;
  checkingHost: string | null;
  atlasSsh?: AtlasSshDisplay | null;
  ansibleConfig: string;
  inventoryFiles: string[];
  reloadToken?: number;
}) {
  const can = useCan();
  const canCollect = can("playbooks.execute");
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [distro, setDistro] = useState<DistroKind | "">("");
  const [status, setStatus] = useState("");
  const [factsByHost, setFactsByHost] = useState<Map<string, FleetFactsExecution>>(
    () => new Map(),
  );
  const [factsLoading, setFactsLoading] = useState(false);
  const [collectingHost, setCollectingHost] = useState<string | null>(null);

  const hostNamesKey = useMemo(
    () => rows.map((row) => row.name).join("\0"),
    [rows],
  );

  const loadFacts = useCallback(async () => {
    const hosts = hostNamesKey ? hostNamesKey.split("\0") : [];
    if (!hosts.length) {
      setFactsByHost(new Map());
      return;
    }
    setFactsLoading(true);
    try {
      const listed = await stargateJson<{ executions?: FleetFactsExecution[] }>(
        `/executions?project_id=${encodeURIComponent(projectId)}&limit=80`,
      );
      const indexed = latestFactsExecutionByHost(listed.executions ?? [], hosts);
      const next = new Map<string, FleetFactsExecution>();
      for (const [host, row] of indexed) {
        let current = row;
        if (factsNeedHydration(current)) {
          const id = executionIdOf(current);
          if (id) {
            const full = await stargateJson<{ execution?: FleetFactsExecution }>(
              `/executions/${encodeURIComponent(id)}?project_id=${encodeURIComponent(projectId)}`,
            );
            current = full.execution ?? current;
          }
        }
        next.set(host, current);
      }
      setFactsByHost(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setFactsByHost(new Map());
    } finally {
      setFactsLoading(false);
    }
  }, [hostNamesKey, projectId]);

  useEffect(() => {
    void loadFacts();
  }, [loadFacts, reloadToken]);

  const cards = useMemo(
    () => rows.map((row) => buildFleetCard(row, factsByHost.get(row.name))),
    [rows, factsByHost],
  );

  const groupOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of rows) {
      for (const item of row.groups) names.add(item);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const distroOptions = useMemo(() => {
    const kinds = new Set<DistroKind>();
    for (const card of cards) kinds.add(card.distroKind);
    return [...kinds];
  }, [cards]);

  const statusOptions = useMemo(() => {
    const values = new Set<string>();
    for (const row of rows) {
      if (row.status) values.add(row.status.toLowerCase());
    }
    if (checkingHost) values.add("checking");
    return [...values].sort();
  }, [rows, checkingHost]);

  const filters: FleetFilters = { search, group, distro, status };
  const visible = filterFleetCards(cards, filters);

  async function collectFacts(host: string) {
    if (!host || collectingHost) return;
    setCollectingHost(host);
    try {
      const queued = await stargateJson<{ executionId?: string }>(
        `/hosts/${encodeURIComponent(host)}/facts`,
        {
          method: "POST",
          body: JSON.stringify({
            host,
            project_id: projectId,
            cluster_id: clusterId || undefined,
            ansible_config: ansibleConfig,
            inventory_files: inventoryFiles,
          }),
        },
      );
      const executionId = queued.executionId;
      if (!executionId) throw new Error("Did not return executionId");
      let row: FleetFactsExecution | undefined;
      for (let i = 0; i < 90; i += 1) {
        const data = await stargateJson<{ execution?: FleetFactsExecution }>(
          `/executions/${encodeURIComponent(executionId)}?project_id=${encodeURIComponent(projectId)}`,
        );
        row = data.execution;
        const execStatus = String(row?.status || "").toUpperCase();
        if (
          execStatus &&
          !["QUEUED", "RUNNING", "CANCELING", "CANCELLING"].includes(execStatus)
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      if (!row) throw new Error("Facts run did not return a result");
      setFactsByHost((current) => {
        const next = new Map(current);
        next.set(host, row);
        return next;
      });
      toast.success(`Collected facts for ${host}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setCollectingHost(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">Fleet</p>
          {factsLoading ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Loading facts…
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={group || "all"}
            onValueChange={(value) =>
              setGroup(value === "all" || value == null ? "" : String(value))
            }
          >
            <SelectTrigger className="h-8 w-40" size="sm" aria-label="Filter by group">
              <SelectValue>
                {group || "All groups"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All groups</SelectItem>
              {groupOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={distro || "all"}
            onValueChange={(value) =>
              setDistro(
                value === "all" || value == null ? "" : (String(value) as DistroKind),
              )
            }
          >
            <SelectTrigger className="h-8 w-40" size="sm" aria-label="Filter by distro">
              <SelectValue>
                {distro ? DISTRO_LABELS[distro] : "All distros"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All distros</SelectItem>
              {distroOptions.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {DISTRO_LABELS[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status || "all"}
            onValueChange={(value) =>
              setStatus(value === "all" || value == null ? "" : String(value))
            }
          >
            <SelectTrigger className="h-8 w-36" size="sm" aria-label="Filter by status">
              <SelectValue>
                {status ? hostStatusLabel(status) : "All statuses"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {statusOptions.map((item) => (
                <SelectItem key={item} value={item}>
                  {hostStatusLabel(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 w-52 pl-8"
              placeholder="Search fleet..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          title="No hosts"
          description="Add a host or pull Git inventory."
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No matching hosts"
          description="Change filters or search to see fleet cards."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map((card) => {
            const checking = checkingHost === card.name;
            const collecting = collectingHost === card.name;
            const displayStatus = checking ? "checking" : card.status;
            const kind = hostStatusKind(displayStatus);
            const checkedAt = card.lastCheckedAt
              ? formatRelativeTime(card.lastCheckedAt)
              : null;
            const collectedAt = card.collectedAt
              ? formatRelativeTime(card.collectedAt)
              : null;
            const conn = card.connectionSecret
              ? `${card.ansibleUser || "root"}@${card.ansiblePort || "22"} · ${card.connectionSecret}`
              : atlasSsh?.name
                ? `${card.ansibleUser || "root"}@${card.ansiblePort || "22"} · ${atlasSsh.name}`
                : `${card.ansibleUser || "root"}@${card.ansiblePort || "22"}`;
            return (
              <article
                key={card.name}
                className="flex cursor-pointer flex-col rounded-xl bg-card p-4 text-left transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
                role="button"
                tabIndex={0}
                onClick={() => onFacts(card.name)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onFacts(card.name);
                  }
                }}
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted/60">
                    <DistroIcon kind={card.distroKind} className="size-7" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{card.displayName}</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">
                          {card.fqdn || card.name}
                        </p>
                      </div>
                      <StatusBadge status={kind} className="shrink-0">
                        {hostStatusLabel(displayStatus)}
                      </StatusBadge>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {checkedAt
                        ? `Checked ${checkedAt}`
                        : checking
                          ? "Checking…"
                          : "Never checked"}
                      {collectedAt ? ` · Facts ${collectedAt}` : ""}
                    </p>
                  </div>
                </div>
                {card.hasFacts && card.summary ? (
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
                    <Spec icon={Server} value={card.summary.os} />
                    <Spec icon={Cpu} value={card.summary.arch} />
                    <Spec
                      icon={Cpu}
                      value={
                        card.summary.vcpus != null
                          ? `${card.summary.vcpus} vCPU`
                          : null
                      }
                    />
                    <Spec icon={MemoryStick} value={card.summary.memory} />
                    <Spec icon={Network} value={card.summary.ipv4} />
                    <Spec icon={Server} value={card.summary.virt} />
                  </dl>
                ) : (
                  <div className="mt-3 rounded-lg bg-muted/40 px-3 py-2">
                    <p className="text-xs text-muted-foreground">No facts yet</p>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-1">
                  {card.groups.length === 0 ? (
                    <span className="text-xs text-muted-foreground">No groups</span>
                  ) : (
                    card.groups.map((item) => (
                      <Badge key={item} variant={groupBadgeVariant(item)}>
                        {item}
                      </Badge>
                    ))
                  )}
                </div>
                <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground">
                  {conn}
                </p>
                <div
                  className="mt-3 flex flex-wrap gap-1"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  {card.hasFacts ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => onFacts(card.name)}
                    >
                      <Info />
                      Facts
                    </Button>
                  ) : (
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={!canCollect || Boolean(collectingHost)}
                      onClick={() => void collectFacts(card.name)}
                    >
                      {collecting ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Info />
                      )}
                      {collecting ? "Collecting…" : "Collect"}
                    </Button>
                  )}
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={busy || running || !canCollect}
                    onClick={() => onCheck(card.name)}
                  >
                    <Check />
                    {checking ? "Checking…" : "Check"}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
