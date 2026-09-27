"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Clock,
  Code2,
  Cog,
  Copy,
  Cpu,
  Ellipsis,
  Globe,
  HardDrive,
  Info,
  LayoutDashboard,
  Loader2,
  MemoryStick,
  Monitor,
  Network,
  Search,
  Server,
  SquareStack,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCan } from "@/lib/authz";
import {
  extractFactsFromResult,
  factsErrorFromResult,
  flattenFacts,
  groupFactRows,
  isHostFactsExecution,
  summarizeHostFacts,
  type FactGroupId,
  type FlatFact,
  type HostFactsMap,
} from "@/lib/host-facts";
import { formatRelativeTime } from "@/lib/project-dashboard";
import { stargateJson } from "@/lib/stargate";

type FactsExecution = {
  id?: string;
  executionId?: string;
  status?: string;
  mode?: string;
  playbookName?: string;
  finishedAt?: string | number | null;
  runParams?: { host?: string; execution_type?: string };
  result?: unknown;
};

const FACT_TABS: {
  id: "overview" | FactGroupId;
  label: string;
  icon: typeof Server;
}[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "system", label: "System", icon: Monitor },
  { id: "hardware", label: "Hardware", icon: Cpu },
  { id: "network", label: "Network", icon: Network },
  { id: "storage", label: "Storage", icon: HardDrive },
  { id: "other", label: "Other", icon: Ellipsis },
];

function executionIdOf(row: FactsExecution | null | undefined): string | null {
  const id = row?.id || row?.executionId;
  return id ? String(id) : null;
}

function FactStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | null;
  icon: typeof Server;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <p className="mt-0.5 truncate text-sm font-medium" title={value}>
          {value}
        </p>
      </div>
    </div>
  );
}

function FactsTable({ rows }: { rows: FlatFact[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No matching facts
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Fact</th>
            <th className="px-3 py-2 font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.path} className="border-t border-border/70 align-top">
              <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                {row.label}
              </td>
              <td className="px-3 py-1.5 break-all font-mono">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HostFactsDialog({
  projectId,
  host,
  open,
  onOpenChange,
  ansibleConfig,
  inventoryFiles,
  clusterId,
}: {
  projectId: string;
  host: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ansibleConfig: string;
  inventoryFiles: string[];
  clusterId?: string | null;
}) {
  const can = useCan();
  const canCollect = can("playbooks.execute");
  const [facts, setFacts] = useState<HostFactsMap | null>(null);
  const [collectedAt, setCollectedAt] = useState<string | number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingLast, setLoadingLast] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("overview");
  const openRef = useRef(open);
  openRef.current = open;

  const applyExecution = useCallback((row: FactsExecution) => {
    const parsed = extractFactsFromResult(row.result);
    const failed = factsErrorFromResult(row.result);
    if (parsed) {
      setFacts(parsed);
      setCollectedAt(row.finishedAt ?? null);
      setError(null);
      return true;
    }
    if (failed) {
      setError(failed);
      return true;
    }
    const status = String(row.status || "").toUpperCase();
    if (status && !["SUCCESS", "FAILED", "CANCELED", "CANCELLED"].includes(status)) {
      return false;
    }
    if (status === "FAILED" || status === "CANCELED" || status === "CANCELLED") {
      setError(`Facts collection ${status.toLowerCase()}`);
      return true;
    }
    setError("Could not read host facts from this run");
    return true;
  }, []);

  const loadLastFacts = useCallback(async () => {
    if (!host) return;
    setLoadingLast(true);
    setError(null);
    setFacts(null);
    setCollectedAt(null);
    setQuery("");
    setTab("overview");
    try {
      const listed = await stargateJson<{ executions?: FactsExecution[] }>(
        `/executions?project_id=${encodeURIComponent(projectId)}&limit=80`,
      );
      const match = (listed.executions ?? []).find((row) =>
        isHostFactsExecution(row, host),
      );
      if (!match) {
        setFacts(null);
        setCollectedAt(null);
        return;
      }
      let row = match;
      if (!extractFactsFromResult(row.result)) {
        const id = executionIdOf(row);
        if (id) {
          const full = await stargateJson<{ execution?: FactsExecution }>(
            `/executions/${encodeURIComponent(id)}?project_id=${encodeURIComponent(projectId)}`,
          );
          row = full.execution ?? row;
        }
      }
      applyExecution(row);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingLast(false);
    }
  }, [applyExecution, host, projectId]);

  useEffect(() => {
    if (!open || !host) return;
    void loadLastFacts();
  }, [open, host, loadLastFacts]);

  const collectFacts = useCallback(async () => {
    if (!host || collecting) return;
    setCollecting(true);
    setError(null);
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
      let row: FactsExecution | undefined;
      for (let i = 0; i < 90; i += 1) {
        if (!openRef.current) return;
        const data = await stargateJson<{ execution?: FactsExecution }>(
          `/executions/${encodeURIComponent(executionId)}?project_id=${encodeURIComponent(projectId)}`,
        );
        row = data.execution;
        const status = String(row?.status || "").toUpperCase();
        if (
          status &&
          !["QUEUED", "RUNNING", "CANCELING", "CANCELLING"].includes(status)
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      if (!openRef.current) return;
      if (!row) throw new Error("Facts run did not return a result");
      applyExecution(row);
    } catch (err) {
      if (!openRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (openRef.current) setCollecting(false);
    }
  }, [
    ansibleConfig,
    applyExecution,
    clusterId,
    collecting,
    host,
    inventoryFiles,
    projectId,
  ]);

  const summary = useMemo(
    () => (facts ? summarizeHostFacts(facts) : null),
    [facts],
  );
  const grouped = useMemo(
    () => groupFactRows(facts ? flattenFacts(facts) : []),
    [facts],
  );
  const visibleTabs = useMemo(
    () =>
      FACT_TABS.filter(
        (item) => item.id === "overview" || grouped[item.id].length > 0,
      ),
    [grouped],
  );

  const filteredByTab = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (rows: FlatFact[]) =>
      q
        ? rows.filter(
            (row) =>
              row.path.toLowerCase().includes(q) ||
              row.label.toLowerCase().includes(q) ||
              row.value.toLowerCase().includes(q),
          )
        : rows;
    return {
      system: match(grouped.system),
      hardware: match(grouped.hardware),
      network: match(grouped.network),
      storage: match(grouped.storage),
      other: match(grouped.other),
    };
  }, [grouped, query]);

  const collectedLabel = collectedAt
    ? `Collected ${formatRelativeTime(collectedAt)}`
    : null;

  async function copyJson() {
    if (!facts) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(facts, null, 2));
      toast.success("Facts copied");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  const activeTab = visibleTabs.some((item) => item.id === tab)
    ? tab
    : "overview";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(90vh,48rem)] min-h-0 w-full flex-col overflow-hidden sm:max-w-none"
        style={{
          maxWidth: "48rem",
          width: "min(48rem, calc(100vw - 2rem))",
          minHeight: "min(32rem, calc(100vh - 2rem))",
        }}
      >
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>Host facts</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {host}
            {collectedLabel ? ` · ${collectedLabel}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {collecting ? (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Collecting facts…
            </div>
          ) : null}
          {loadingLast && !facts && !collecting ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading last facts…
            </div>
          ) : null}
          {!loadingLast && error ? (
            <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {!loadingLast && !facts && !error && !collecting ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Info className="size-8 text-muted-foreground" />
              <p className="font-medium">No facts yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Collect Ansible facts from this host to see OS, CPU, memory, and
                network details.
              </p>
            </div>
          ) : null}
          {facts ? (
            <Tabs
              value={activeTab}
              onValueChange={(next) => {
                setTab(next);
                setQuery("");
              }}
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
            >
              <div className="flex shrink-0 flex-col gap-2">
                <div className="flex items-start gap-2">
                  <TabsList
                    variant="line"
                    className="h-auto min-h-8 min-w-0 flex-1 flex-wrap justify-start"
                  >
                    {visibleTabs.map((item) => (
                      <TabsTrigger
                        key={item.id}
                        value={item.id}
                        className="flex-none"
                      >
                        <item.icon />
                        {item.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-0.5 shrink-0"
                    onClick={() => void copyJson()}
                  >
                    <Copy />
                    Copy JSON
                  </Button>
                </div>
                {activeTab !== "overview" ? (
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="h-8 pl-8"
                      placeholder="Search this tab..."
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </div>
                ) : null}
              </div>
              <TabsContent
                value="overview"
                className="min-h-0 flex-1 overflow-y-auto outline-none"
              >
                {summary ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <FactStat
                      icon={Server}
                      label="Hostname"
                      value={summary.hostname}
                    />
                    <FactStat icon={Monitor} label="OS" value={summary.os} />
                    <FactStat
                      icon={Network}
                      label="IPv4"
                      value={
                        summary.ipv4
                          ? `${summary.ipv4}${summary.iface ? ` · ${summary.iface}` : ""}`
                          : null
                      }
                    />
                    <FactStat
                      icon={Cpu}
                      label="CPU"
                      value={
                        summary.vcpus != null
                          ? `${summary.vcpus} vCPU${summary.cpu ? ` · ${summary.cpu}` : ""}`
                          : summary.cpu
                      }
                    />
                    <FactStat
                      icon={MemoryStick}
                      label="Memory"
                      value={summary.memory}
                    />
                    <FactStat
                      icon={SquareStack}
                      label="Virtualization"
                      value={summary.virt}
                    />
                    <FactStat icon={Cog} label="Kernel" value={summary.kernel} />
                    <FactStat
                      icon={Cpu}
                      label="Architecture"
                      value={summary.arch}
                    />
                    <FactStat icon={Clock} label="Uptime" value={summary.uptime} />
                    <FactStat icon={Code2} label="Python" value={summary.python} />
                    <FactStat icon={Globe} label="FQDN" value={summary.fqdn} />
                  </div>
                ) : null}
              </TabsContent>
              {(Object.keys(filteredByTab) as FactGroupId[]).map((id) => (
                <TabsContent
                  key={id}
                  value={id}
                  className="min-h-0 flex-1 overflow-y-auto outline-none"
                >
                  <FactsTable rows={filteredByTab[id]} />
                </TabsContent>
              ))}
            </Tabs>
          ) : null}
        </div>
        <DialogFooter className="shrink-0 sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            disabled={collecting || !canCollect}
            onClick={() => void collectFacts()}
          >
            {collecting ? <Loader2 className="animate-spin" /> : <Info />}
            {collecting ? "Collecting…" : "Get facts"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
