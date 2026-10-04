"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  Copy,
  Cpu,
  Columns3,
  Database,
  Disc,
  Globe,
  HardDrive,
  Hash,
  Layers,
  MemoryStick,
  Minus,
  Network,
  Plus,
  Search,
  Server,
  Share2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { HostDomainDialog } from "@/components/host-domain-dialog";
import { ChangesReviewDialog } from "@/components/changes-review-dialog";
import { FileFacts, type FileFactsMeta } from "@/components/file-facts";
import { SuggestInput } from "@/components/suggest-input";
import { DistroIcon } from "@/components/distro-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  blankHost,
  cloneNextHost,
  fetchHostsTopology,
  hostTopologyChanges,
  renameHostsDomain,
  saveHostsTopology,
  type HostDisk,
  type HostGroup,
  type HostTopology,
} from "@/lib/atlas-hosts";
import { projectHref } from "@/lib/project-href";
import { fetchProxmoxCatalog, fetchProxmoxVmid, probeHostAddress, storageChoiceLabel, type ProxmoxStorage } from "@/lib/proxmox";
import { useCan } from "@/lib/authz";
import { cn } from "@/lib/utils";

function FieldIcon({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex size-3.5 shrink-0 items-center justify-center text-muted-foreground/80 [&_svg]:size-3.5">
      {children}
    </span>
  );
}

function parseGroups(raw: string): HostGroup[] {
  try {
    const value = JSON.parse(raw) as HostGroup[];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function cloneList(options: string[], current: string): string[] {
  const values = [...options];
  if (current && !values.includes(current)) values.unshift(current);
  return values;
}

function setHost(
  groups: HostGroup[],
  groupId: string,
  index: number,
  patch: Partial<HostTopology>,
): HostGroup[] {
  return groups.map((group) =>
    group.id !== groupId
      ? group
      : {
          ...group,
          hosts: group.hosts.map((host, hostIndex) =>
            hostIndex === index ? { ...host, ...patch } : host,
          ),
        },
  );
}

function setDisk(
  groups: HostGroup[],
  groupId: string,
  hostIndex: number,
  diskIndex: number,
  patch: Partial<HostDisk>,
): HostGroup[] {
  return groups.map((group) => {
    if (group.id !== groupId) return group;
    return {
      ...group,
      hosts: group.hosts.map((host, index) =>
        index !== hostIndex
          ? host
          : {
              ...host,
              disks: host.disks.map((disk, inner) =>
                inner === diskIndex ? { ...disk, ...patch } : disk,
              ),
            },
      ),
    };
  });
}

function setGroupCount(
  groups: HostGroup[],
  groupId: string,
  count: number,
  fallbackClone: string,
): HostGroup[] {
  const next = Math.max(0, count);
  return groups.map((group) => {
    if (group.id !== groupId) return group;
    const hosts = [...group.hosts];
    while (hosts.length < next) {
      const last = hosts[hosts.length - 1];
      hosts.push(last ? cloneNextHost(last) : blankHost(fallbackClone));
    }
    if (hosts.length > next) hosts.length = next;
    return { ...group, hosts };
  });
}

function hostSearchText(host: HostTopology): string {
  return [
    host.ip,
    host.hostname,
    host.vmid,
    host.clone,
    String(host.sockets),
    String(host.cores),
    String(host.memory),
    host.numa ? "numa" : "",
    ...host.disks.flatMap((disk) => [disk.size, String(disk.slot), disk.storage]),
  ]
    .join(" ")
    .toLowerCase();
}

function groupMatchesQuery(group: HostGroup, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    group.name.toLowerCase().includes(needle) ||
    group.id.toLowerCase().includes(needle)
  );
}

function hostMatchesQuery(host: HostTopology, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return hostSearchText(host).includes(needle);
}

function groupMatchCount(group: HostGroup, query: string): number {
  if (!query.trim()) return group.hosts.length;
  if (groupMatchesQuery(group, query)) return group.hosts.length;
  return group.hosts.filter((host) => hostMatchesQuery(host, query)).length;
}

export function HostsTopologyDialog({
  open,
  onOpenChange,
  projectId,
  clusterId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  clusterId: string;
}) {
  const can = useCan();
  const canWrite = can("inventory.update");
  const yamlHref = projectHref(projectId, "/hosts?tab=files");
  const [groups, setGroups] = useState<HostGroup[]>([]);
  const [baseline, setBaseline] = useState("[]");
  const [cloneOptions, setCloneOptions] = useState<string[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [fileMeta, setFileMeta] = useState<FileFactsMeta | undefined>();
  const [storages, setStorages] = useState<ProxmoxStorage[]>([]);
  const [domainOpen, setDomainOpen] = useState(false);
  const [pendingDns, setPendingDns] = useState<{ from: string; to: string } | null>(
    null,
  );
  const [trackedOpen, setTrackedOpen] = useState(open);
  if (open !== trackedOpen) {
    setTrackedOpen(open);
    if (!open) {
      setDomainOpen(false);
      setPendingDns(null);
    }
  }

  const changeGroups = useMemo(
    () => hostTopologyChanges(parseGroups(baseline), groups),
    [baseline, groups],
  );
  const reviewGroups = useMemo(() => {
    if (!pendingDns) return changeGroups;
    return [
      ...changeGroups,
      {
        id: "dns-domain-suffix",
        title: "DNS suffix",
        lines: [
          {
            id: "dns_domain_suffix",
            label: "dns_domain_suffix",
            from: pendingDns.from,
            to: pendingDns.to,
          },
        ],
      },
    ];
  }, [changeGroups, pendingDns]);
  const pendingCount = changeGroups.reduce(
    (sum, group) => sum + group.lines.length,
    0,
  );
  const dirty = pendingCount > 0 || pendingDns != null;
  const selected =
    groups.find((group) => group.id === groupId) ?? groups[0] ?? null;
  const fallbackClone = cloneOptions[0] || "";

  function applyQuery(value: string) {
    setQuery(value);
    const needle = value.trim();
    if (!needle) return;
    const current = groups.find((group) => group.id === (groupId ?? groups[0]?.id));
    if (current && groupMatchCount(current, needle) > 0) return;
    const next = groups.find((group) => groupMatchCount(group, needle) > 0);
    if (next) setGroupId(next.id);
  }

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setDiscardOpen(false);
    setReviewOpen(false);
    setQuery("");
    let cancelled = false;
    void fetchHostsTopology(projectId, clusterId)
      .then((data) => {
        if (cancelled) return;
        setGroups(data.groups);
        setBaseline(JSON.stringify(data.groups));
        setCloneOptions(data.cloneOptions);
        setFileMeta(data.fileMeta);
        setPendingDns(null);
        setGroupId(data.groups[0]?.id ?? null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : String(err));
        setGroups([]);
        setBaseline("[]");
        setFileMeta(undefined);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId, clusterId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetchProxmoxCatalog({ projectId, clusterId })
      .then((data) => {
        if (cancelled) return;
        const ready = Boolean(data.matched && !data.error);
        setStorages(ready ? data.storages : []);
      })
      .catch(() => {
        if (cancelled) return;
        setStorages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId, clusterId]);

  function requestClose() {
    if (domainOpen) {
      setDomainOpen(false);
      return;
    }
    if (reviewOpen) {
      setReviewOpen(false);
      return;
    }
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    onOpenChange(false);
  }

  function resetAll() {
    setGroups(parseGroups(baseline));
    setPendingDns(null);
    setReviewOpen(false);
  }

  async function save() {
    setBusy(true);
    try {
      const data = await saveHostsTopology(projectId, clusterId, groups);
      if (pendingDns) {
        await renameHostsDomain(projectId, clusterId, {
          from: pendingDns.from,
          to: pendingDns.to,
          scope: "leaf",
          groups: data.groups,
        });
      }
      setGroups(data.groups);
      setBaseline(JSON.stringify(data.groups));
      setCloneOptions(data.cloneOptions);
      setFileMeta(data.fileMeta);
      setPendingDns(null);
      toast.success("Hosts saved");
      setReviewOpen(false);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && domainOpen) {
            setDomainOpen(false);
            return;
          }
          if (!next && reviewOpen) return;
          if (!next) requestClose();
        }}
      >
        <DialogContent
          overlayClassName="bg-black/50 supports-backdrop-filter:backdrop-blur-none"
          className="flex h-[min(44rem,90vh)] max-h-[90vh] min-h-0 flex-col gap-0 overflow-hidden !bg-[#1c1c1f] p-0 shadow-[0_24px_80px_rgba(0,0,0,0.65)] ring-1 ring-foreground/15 sm:max-w-[min(72rem,calc(100vw-2rem))]"
          style={{
            maxWidth: "72rem",
            width: "min(72rem, calc(100vw - 2rem))",
            backgroundColor: "#1c1c1f",
          }}
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col sm:flex-row">
            <aside className="flex max-h-40 shrink-0 flex-col border-b border-border bg-[#151517] sm:max-h-none sm:w-60 sm:border-r sm:border-b-0">
              <p className="px-3 pt-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Groups
              </p>
              <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {groups.map((group) => {
                  const active = group.id === selected?.id;
                  const needle = query.trim();
                  const matches = groupMatchCount(group, query);
                  return (
                    <button
                      key={group.id}
                      type="button"
                      className={cn(
                        "mb-0.5 flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                        active
                          ? "bg-white/10 text-foreground"
                          : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                      )}
                      onClick={() => setGroupId(group.id)}
                    >
                      <span className="min-w-0 truncate font-mono text-xs">
                        <HighlightText text={group.name} query={query} />
                      </span>
                      {needle ? (
                        matches > 0 ? (
                          <Badge variant="info" title="Search matches">
                            {matches}
                          </Badge>
                        ) : null
                      ) : (
                        <Badge variant="outline">{group.hosts.length}</Badge>
                      )}
                    </button>
                  );
                })}
              </nav>
            </aside>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 py-3 pr-14">
                <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-6 gap-y-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Hosts
                    </p>
                    <DialogTitle className="mt-1 truncate font-mono text-sm font-medium">
                      {clusterId}
                    </DialogTitle>
                    <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
                      Groups, IPs, and VM resources from the cluster hosts file
                    </DialogDescription>
                  </div>
                  <FileFacts meta={fileMeta} />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    disabled={!canWrite || loading}
                    onClick={() => setDomainOpen(true)}
                  >
                    <Globe />
                    Change domain
                  </Button>
                  <Button
                    nativeButton={false}
                    size="xs"
                    variant="ghost"
                    render={<Link href={yamlHref} />}
                  >
                    Open YAML
                  </Button>
                </div>
              </div>

              <div className="flex shrink-0 border-b border-border bg-muted/40 px-4 py-2.5">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => applyQuery(event.target.value)}
                    placeholder="Search hosts"
                    aria-label="Search hosts"
                    className="h-8 bg-background pl-8 font-normal"
                  />
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <fieldset disabled={!canWrite} className="min-w-0 border-0 p-0">
                {loading ? (
                  <p className="text-sm text-muted-foreground">Loading hosts…</p>
                ) : !selected ? (
                  <p className="text-sm text-muted-foreground">
                    No host groups in this cluster yet.
                  </p>
                ) : (
                  <GroupEditor
                    group={selected}
                    peers={groups.flatMap((item) =>
                      item.hosts.map((host, index) => ({
                        key: `${item.id}:${index}`,
                        ip: host.ip,
                        hostname: host.hostname,
                        vmid: host.vmid,
                      })),
                    )}
                    query={query}
                    cloneOptions={cloneOptions}
                    storages={storages}
                    projectId={projectId}
                    clusterId={clusterId}
                    onCount={(count) =>
                      setGroups(
                        setGroupCount(groups, selected.id, count, fallbackClone),
                      )
                    }
                    onHost={(index, patch) =>
                      setGroups(setHost(groups, selected.id, index, patch))
                    }
                    onDisk={(hostIndex, diskIndex, patch) =>
                      setGroups(
                        setDisk(groups, selected.id, hostIndex, diskIndex, patch),
                      )
                    }
                    onRemoveHost={(index) =>
                      setGroups(
                        groups.map((group) =>
                          group.id === selected.id
                            ? {
                                ...group,
                                hosts: group.hosts.filter(
                                  (_host, hostIndex) => hostIndex !== index,
                                ),
                              }
                            : group,
                        ),
                      )
                    }
                  />
                )}
                </fieldset>
              </div>

              <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-[#161618] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {pendingCount
                    ? `${pendingCount} unsaved change${pendingCount === 1 ? "" : "s"}`
                    : pendingDns
                      ? "DNS suffix not written yet"
                      : "No unsaved changes"}
                </span>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={(pendingCount === 0 && !pendingDns) || busy || loading}
                    onClick={resetAll}
                  >
                    Reset
                  </Button>
                  <Button variant="ghost" onClick={requestClose}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => setReviewOpen(true)}
                    disabled={busy || loading || (pendingCount === 0 && !pendingDns) || !canWrite}
                  >
                    {busy ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <HostDomainDialog
        open={open && domainOpen}
        onOpenChange={setDomainOpen}
        projectId={projectId}
        clusterId={clusterId}
        groups={groups}
        groupId={selected?.id ?? null}
        groupName={selected?.name ?? ""}
        onGroup={setGroups}
        onLeaf={(next, dns) => {
          setGroups(next);
          setPendingDns((current) =>
            current && current.to.toLowerCase() === dns.from.toLowerCase()
              ? { from: current.from, to: dns.to }
              : dns,
          );
        }}
        onAll={(topology) => {
          setGroups(topology.groups);
          setBaseline(JSON.stringify(topology.groups));
          setCloneOptions(topology.cloneOptions);
          setFileMeta(topology.fileMeta);
          setPendingDns(null);
          setReviewOpen(false);
        }}
      />
      <ChangesReviewDialog
        open={open && reviewOpen && reviewGroups.length > 0}
        onOpenChange={setReviewOpen}
        groups={reviewGroups}
        busy={busy}
        onConfirm={() => void save()}
      />
      <ConfirmAction
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Discard host changes?"
        description="Unsaved topology edits will be lost."
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          setReviewOpen(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}

function GroupEditor({
  group,
  peers,
  query,
  cloneOptions,
  storages,
  projectId,
  clusterId,
  onCount,
  onHost,
  onDisk,
  onRemoveHost,
}: {
  group: HostGroup;
  peers: HostPeer[];
  query: string;
  cloneOptions: string[];
  storages: ProxmoxStorage[];
  projectId: string;
  clusterId: string;
  onCount: (count: number) => void;
  onHost: (index: number, patch: Partial<HostTopology>) => void;
  onDisk: (
    hostIndex: number,
    diskIndex: number,
    patch: Partial<HostDisk>,
  ) => void;
  onRemoveHost: (index: number) => void;
}) {
  const showAll = groupMatchesQuery(group, query);
  const visible = group.hosts
    .map((host, index) => ({ host, index }))
    .filter(({ host }) => showAll || hostMatchesQuery(host, query));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-sm">
            <HighlightText text={group.name} query={query} />
          </p>
          {group.id !== group.name ? (
            <p className="font-mono text-[11px] text-muted-foreground">
              <HighlightText text={group.id} query={query} />
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <FieldIcon>
              <Layers />
            </FieldIcon>
            Count
          </span>
          <Button
            type="button"
            size="icon-xs"
            variant="outline"
            className="rounded-md"
            disabled={group.hosts.length === 0}
            onClick={() => onCount(group.hosts.length - 1)}
            aria-label="Remove host"
          >
            <Minus />
          </Button>
          <Input
            className="h-7 w-14 text-center font-mono"
            value={String(group.hosts.length)}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!Number.isFinite(next)) return;
              onCount(next);
            }}
            aria-label="Host count"
          />
          <Button
            type="button"
            size="icon-xs"
            variant="outline"
            className="rounded-md"
            onClick={() => onCount(group.hosts.length + 1)}
            aria-label="Add host"
          >
            <Plus />
          </Button>
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matching hosts.</p>
      ) : null}
      {visible.map(({ host, index }) => (
        <HostCard
          key={`${group.id}-${index}`}
          host={host}
          selfKey={`${group.id}:${index}`}
          peers={peers}
          query={query}
          cloneOptions={cloneList(cloneOptions, host.clone)}
          storages={storages}
          projectId={projectId}
          clusterId={clusterId}
          onChange={(patch) => onHost(index, patch)}
          onDiskChange={(diskIndex, patch) =>
            onDisk(index, diskIndex, patch)
          }
          onRemove={() => onRemoveHost(index)}
        />
      ))}
    </div>
  );
}

function valueHits(value: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return needle.length > 0 && value.toLowerCase().includes(needle);
}

function HighlightText({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (!needle) return text;
  const lower = text.toLowerCase();
  const target = needle.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const index = lower.indexOf(target, cursor);
    if (index < 0) {
      parts.push(text.slice(cursor));
      break;
    }
    if (index > cursor) parts.push(text.slice(cursor, index));
    parts.push(
      <mark
        key={index}
        className="rounded-sm bg-amber-400/45 text-foreground"
      >
        {text.slice(index, index + target.length)}
      </mark>,
    );
    cursor = index + target.length;
  }
  return parts;
}

function MatchInput({
  value,
  query,
  className,
  ...props
}: ComponentProps<typeof Input> & { query: string }) {
  const text = value == null ? "" : String(value);
  const hit = valueHits(text, query);
  const mono = className?.includes("font-mono");
  return (
    <div className={cn("relative min-w-0", className)}>
      <Input
        {...props}
        value={text}
        className={cn(
          className,
          "w-full",
          hit &&
            "border-amber-400/80 text-transparent caret-foreground ring-2 ring-amber-400/40",
        )}
      />
      {hit ? (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 left-0 flex items-center overflow-hidden px-3 text-sm",
            mono && "font-mono",
          )}
        >
          <span className="truncate">
            <HighlightText text={text} query={query} />
          </span>
        </span>
      ) : null}
    </div>
  );
}

type HostPeer = {
  key: string;
  ip: string;
  hostname: string;
  vmid: string;
};

type CheckNote = {
  tone: "ok" | "bad" | "warn";
  text: string;
};

function HostCard({
  host,
  selfKey,
  peers,
  query,
  cloneOptions,
  storages,
  projectId,
  clusterId,
  onChange,
  onDiskChange,
  onRemove,
}: {
  host: HostTopology;
  selfKey: string;
  peers: HostPeer[];
  query: string;
  cloneOptions: string[];
  storages: ProxmoxStorage[];
  projectId: string;
  clusterId: string;
  onChange: (patch: Partial<HostTopology>) => void;
  onDiskChange: (index: number, patch: Partial<HostDisk>) => void;
  onRemove: () => void;
}) {
  const cloneHit = valueHits(host.clone, query);
  const numaHit = host.numa && valueHits("numa", query);
  const [ipNote, setIpNote] = useState<CheckNote | null>(null);
  const [ipBusy, setIpBusy] = useState(false);
  const [vmidNote, setVmidNote] = useState<CheckNote | null>(null);
  const [vmidBusy, setVmidBusy] = useState(false);

  async function checkIp() {
    const ip = host.ip.trim();
    if (!ip) {
      setIpNote({ tone: "warn", text: "Enter an IP address" });
      return;
    }
    const duplicate = peers.find(
      (peer) => peer.key !== selfKey && peer.ip.trim() === ip,
    );
    if (duplicate) {
      const name = duplicate.hostname.trim() || "another host";
      setIpNote({
        tone: "bad",
        text: `${ip} is already assigned to ${name}`,
      });
      return;
    }
    setIpBusy(true);
    try {
      const result = await probeHostAddress({ projectId, ip });
      if (!result.checked) {
        setIpNote({
          tone: "warn",
          text: result.error || "Could not ping this address",
        });
        return;
      }
      setIpNote(
        result.reachable
          ? { tone: "bad", text: `${ip} answers. The address is in use.` }
          : { tone: "ok", text: `${ip} does not answer. The address looks free.` },
      );
    } catch (err) {
      setIpNote({
        tone: "warn",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIpBusy(false);
    }
  }

  async function checkVmid() {
    const trimmed = host.vmid.trim();
    if (!/^\d+$/.test(trimmed)) {
      setVmidNote({ tone: "warn", text: "Enter a numeric VMID" });
      return;
    }
    const duplicate = peers.find(
      (peer) => peer.key !== selfKey && peer.vmid.trim() === trimmed,
    );
    if (duplicate) {
      const name = duplicate.hostname.trim() || duplicate.ip.trim() || "another host";
      setVmidNote({
        tone: "bad",
        text: `VMID ${trimmed} is already used by ${name}`,
      });
      return;
    }
    setVmidBusy(true);
    try {
      const result = await fetchProxmoxVmid({
        projectId,
        clusterId,
        vmid: trimmed,
      });
      if (!result.checked) {
        setVmidNote({
          tone: "warn",
          text: result.error || "Could not check this VMID",
        });
        return;
      }
      setVmidNote(
        result.free
          ? { tone: "ok", text: `VMID ${trimmed} is free` }
          : { tone: "bad", text: `VMID ${trimmed} is already used` },
      );
    } catch (err) {
      setVmidNote({
        tone: "warn",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setVmidBusy(false);
    }
  }

  return (
    <article className="space-y-3 rounded-xl bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Server className="size-3.5 text-primary" />
          <p className="truncate font-mono text-xs text-muted-foreground">
            <HighlightText
              text={host.hostname || host.ip || "New host"}
              query={query}
            />
          </p>
        </div>
        <Button
          type="button"
          size="icon-xs"
          variant="outline"
          className="rounded-md border-destructive/50 text-destructive hover:bg-destructive/15"
          aria-label="Remove this host"
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field icon={<Network />} label="IP">
          <div className="flex items-center gap-1.5">
            <MatchInput
              className="h-8 min-w-0 flex-1 font-mono"
              query={query}
              value={host.ip}
              onChange={(event) => {
                setIpNote(null);
                onChange({ ip: event.target.value });
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={ipBusy}
              aria-label="Check whether this IP address is free"
              onClick={() => void checkIp()}
            >
              {ipBusy ? "Checking…" : "Check"}
            </Button>
          </div>
          <CheckLine note={ipNote} />
        </Field>
        <Field icon={<Server />} label="Hostname">
          <MatchInput
            className="h-8 font-mono"
            query={query}
            value={host.hostname}
            onChange={(event) => onChange({ hostname: event.target.value })}
          />
        </Field>
        <Field icon={<Hash />} label="VMID">
          <div className="flex items-center gap-1.5">
            <MatchInput
              className="h-8 min-w-0 flex-1 font-mono"
              query={query}
              value={host.vmid}
              onChange={(event) => {
                setVmidNote(null);
                onChange({ vmid: event.target.value });
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={vmidBusy}
              aria-label="Check whether this VMID is free"
              onClick={() => void checkVmid()}
            >
              {vmidBusy ? "Checking…" : "Check"}
            </Button>
          </div>
          <CheckLine note={vmidNote} />
        </Field>
        <Field icon={<Layers />} label="Sockets">
          <MatchInput
            className="h-8"
            type="number"
            min={1}
            query={query}
            value={host.sockets}
            onChange={(event) =>
              onChange({ sockets: Number(event.target.value) || 1 })
            }
          />
        </Field>
        <Field icon={<Cpu />} label="Cores">
          <MatchInput
            className="h-8"
            type="number"
            min={1}
            query={query}
            value={host.cores}
            onChange={(event) =>
              onChange({ cores: Number(event.target.value) || 1 })
            }
          />
        </Field>
        <Field icon={<MemoryStick />} label="Memory (MB)">
          <MatchInput
            className="h-8"
            type="number"
            min={256}
            query={query}
            value={host.memory}
            onChange={(event) =>
              onChange({ memory: Number(event.target.value) || 1024 })
            }
          />
        </Field>
        <Field icon={<Copy />} label="Clone">
          {cloneOptions.length > 0 ? (
            <Select
              value={host.clone || null}
              onValueChange={(value) => {
                if (typeof value === "string") onChange({ clone: value });
              }}
            >
              <SelectTrigger
                className={cn(
                  "h-8 w-full rounded-md",
                  cloneHit && "border-amber-400/80 ring-2 ring-amber-400/40",
                )}
                size="sm"
              >
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  {host.clone ? <DistroIcon name={host.clone} /> : null}
                  {cloneHit ? (
                    <HighlightText text={host.clone} query={query} />
                  ) : (
                    <SelectValue placeholder="Select clone" />
                  )}
                </span>
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger>
                {cloneOptions.map((name) => (
                  <SelectItem key={name} value={name}>
                    <DistroIcon name={name} className="size-4" />
                    <HighlightText text={name} query={query} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex items-center gap-1.5">
              <DistroIcon name={host.clone} />
              <MatchInput
                className="h-8 font-mono"
                query={query}
                value={host.clone}
                onChange={(event) => onChange({ clone: event.target.value })}
              />
            </div>
          )}
        </Field>
        <label
          className={cn(
            "flex items-center gap-2 self-end pb-1 text-sm",
            numaHit && "rounded-md bg-amber-400/15 px-1 text-foreground",
          )}
        >
          <Checkbox
            checked={host.numa}
            onCheckedChange={(value) => onChange({ numa: value === true })}
          />
          <FieldIcon>
            <Share2 />
          </FieldIcon>
          <HighlightText text="NUMA" query={query} />
        </label>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <FieldIcon>
              <HardDrive />
            </FieldIcon>
            Disks
          </p>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() =>
              onChange({
                disks: [
                  ...host.disks,
                  {
                    size: "70",
                    slot: host.disks.length,
                    storage: host.disks[0]?.storage || "local-zfs",
                  },
                ],
              })
            }
          >
            <Plus />
            Disk
          </Button>
        </div>
        {host.disks.map((disk, diskIndex) => (
          <div key={diskIndex} className="flex items-center gap-2">
            <span className="inline-flex min-w-0 flex-1 items-center gap-1.5">
              <FieldIcon>
                <Disc />
              </FieldIcon>
              <MatchInput
                className="h-8 min-w-0 flex-1"
                placeholder="Size GB"
                query={query}
                value={disk.size}
                onChange={(event) =>
                  onDiskChange(diskIndex, { size: event.target.value })
                }
              />
            </span>
            <span className="inline-flex w-20 shrink-0 items-center gap-1.5">
              <FieldIcon>
                <Columns3 />
              </FieldIcon>
              <MatchInput
                className="h-8 w-16 shrink-0"
                type="number"
                min={0}
                query={query}
                value={disk.slot}
                onChange={(event) =>
                  onDiskChange(diskIndex, {
                    slot: Number(event.target.value) || 0,
                  })
                }
              />
            </span>
            <span className="inline-flex min-w-0 flex-1 items-center gap-1.5">
              <FieldIcon>
                <Database />
              </FieldIcon>
              {storages.length > 0 ? (
                <div className="min-w-0 flex-1">
                  <SuggestInput
                    value={disk.storage}
                    options={storages.map((row) => ({
                      value: row.id,
                      label: storageChoiceLabel(row),
                    }))}
                    highlight={valueHits(disk.storage, query)}
                    ariaLabel="Storage"
                    placeholder="Storage"
                    onChange={(next) =>
                      onDiskChange(diskIndex, { storage: next })
                    }
                  />
                </div>
              ) : (
                <MatchInput
                  className="h-8 min-w-0 flex-1 font-mono"
                  placeholder="Storage"
                  query={query}
                  value={disk.storage}
                  onChange={(event) =>
                    onDiskChange(diskIndex, { storage: event.target.value })
                  }
                />
              )}
            </span>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              disabled={host.disks.length < 2}
              aria-label="Remove disk"
              onClick={() =>
                onChange({
                  disks: host.disks.filter(
                    (_disk, index) => index !== diskIndex,
                  ),
                })
              }
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
    </article>
  );
}

function CheckLine({ note }: { note: CheckNote | null }) {
  if (!note) return null;
  return (
    <p
      className={cn(
        "text-xs",
        note.tone === "ok" && "text-emerald-500",
        note.tone === "bad" && "text-red-500",
        note.tone === "warn" && "text-amber-500",
      )}
    >
      {note.text}
    </p>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="gap-1.5 text-xs text-muted-foreground">
        <FieldIcon>{icon}</FieldIcon>
        {label}
      </Label>
      {children}
    </div>
  );
}
