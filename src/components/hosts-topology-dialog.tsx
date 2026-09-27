"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  Copy,
  Cpu,
  Columns3,
  Database,
  Disc,
  HardDrive,
  Hash,
  Layers,
  MemoryStick,
  Minus,
  Network,
  Plus,
  Server,
  Share2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
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
  saveHostsTopology,
  type HostDisk,
  type HostGroup,
  type HostTopology,
} from "@/lib/atlas-hosts";
import { projectHref } from "@/lib/project-href";
import { useCan } from "@/lib/authz";
import { cn } from "@/lib/utils";

function FieldIcon({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex size-3.5 shrink-0 items-center justify-center text-muted-foreground/80 [&_svg]:size-3.5">
      {children}
    </span>
  );
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

  const dirty = JSON.stringify(groups) !== baseline;
  const selected =
    groups.find((group) => group.id === groupId) ?? groups[0] ?? null;
  const fallbackClone = cloneOptions[0] || "";

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setDiscardOpen(false);
    let cancelled = false;
    void fetchHostsTopology(projectId, clusterId)
      .then((data) => {
        if (cancelled) return;
        setGroups(data.groups);
        setBaseline(JSON.stringify(data.groups));
        setCloneOptions(data.cloneOptions);
        setGroupId(data.groups[0]?.id ?? null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : String(err));
        setGroups([]);
        setBaseline("[]");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId, clusterId]);

  function requestClose() {
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    onOpenChange(false);
  }

  async function save() {
    setBusy(true);
    try {
      const data = await saveHostsTopology(projectId, clusterId, groups);
      setGroups(data.groups);
      setBaseline(JSON.stringify(data.groups));
      setCloneOptions(data.cloneOptions);
      toast.success("Hosts saved");
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
                        {group.name}
                      </span>
                      <Badge variant="outline">{group.hosts.length}</Badge>
                    </button>
                  );
                })}
              </nav>
            </aside>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 py-3 pr-14">
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
                <Button
                  nativeButton={false}
                  size="xs"
                  variant="ghost"
                  render={<Link href={yamlHref} />}
                >
                  Open YAML
                </Button>
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
                    cloneOptions={cloneOptions}
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

              <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
                <Button variant="outline" onClick={requestClose}>
                  Cancel
                </Button>
                <Button
                  onClick={() => void save()}
                  disabled={busy || loading || !dirty || !canWrite}
                >
                  Save changes
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmAction
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Discard host changes?"
        description="Unsaved topology edits will be lost."
        confirmLabel="Discard"
        destructive
        onConfirm={() => onOpenChange(false)}
      />
    </>
  );
}

function GroupEditor({
  group,
  cloneOptions,
  onCount,
  onHost,
  onDisk,
  onRemoveHost,
}: {
  group: HostGroup;
  cloneOptions: string[];
  onCount: (count: number) => void;
  onHost: (index: number, patch: Partial<HostTopology>) => void;
  onDisk: (
    hostIndex: number,
    diskIndex: number,
    patch: Partial<HostDisk>,
  ) => void;
  onRemoveHost: (index: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-sm">{group.name}</p>
          {group.id !== group.name ? (
            <p className="font-mono text-[11px] text-muted-foreground">
              {group.id}
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
      {group.hosts.map((host, hostIndex) => (
        <HostCard
          key={`${group.id}-${hostIndex}`}
          host={host}
          cloneOptions={cloneList(cloneOptions, host.clone)}
          onChange={(patch) => onHost(hostIndex, patch)}
          onDiskChange={(diskIndex, patch) =>
            onDisk(hostIndex, diskIndex, patch)
          }
          onRemove={() => onRemoveHost(hostIndex)}
        />
      ))}
    </div>
  );
}

function HostCard({
  host,
  cloneOptions,
  onChange,
  onDiskChange,
  onRemove,
}: {
  host: HostTopology;
  cloneOptions: string[];
  onChange: (patch: Partial<HostTopology>) => void;
  onDiskChange: (index: number, patch: Partial<HostDisk>) => void;
  onRemove: () => void;
}) {
  return (
    <article className="space-y-3 rounded-xl bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Server className="size-3.5 text-primary" />
          <p className="truncate font-mono text-xs text-muted-foreground">
            {host.hostname || host.ip || "New host"}
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
          <Input
            className="h-8 font-mono"
            value={host.ip}
            onChange={(event) => onChange({ ip: event.target.value })}
          />
        </Field>
        <Field icon={<Server />} label="Hostname">
          <Input
            className="h-8 font-mono"
            value={host.hostname}
            onChange={(event) => onChange({ hostname: event.target.value })}
          />
        </Field>
        <Field icon={<Hash />} label="VMID">
          <Input
            className="h-8 font-mono"
            value={host.vmid}
            onChange={(event) => onChange({ vmid: event.target.value })}
          />
        </Field>
        <Field icon={<Layers />} label="Sockets">
          <Input
            className="h-8"
            type="number"
            min={1}
            value={host.sockets}
            onChange={(event) =>
              onChange({ sockets: Number(event.target.value) || 1 })
            }
          />
        </Field>
        <Field icon={<Cpu />} label="Cores">
          <Input
            className="h-8"
            type="number"
            min={1}
            value={host.cores}
            onChange={(event) =>
              onChange({ cores: Number(event.target.value) || 1 })
            }
          />
        </Field>
        <Field icon={<MemoryStick />} label="Memory (MB)">
          <Input
            className="h-8"
            type="number"
            min={256}
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
              <SelectTrigger className="h-8 w-full rounded-md" size="sm">
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  {host.clone ? <DistroIcon name={host.clone} /> : null}
                  <SelectValue placeholder="Select clone" />
                </span>
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger>
                {cloneOptions.map((name) => (
                  <SelectItem key={name} value={name}>
                    <DistroIcon name={name} className="size-4" />
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex items-center gap-1.5">
              <DistroIcon name={host.clone} />
              <Input
                className="h-8 font-mono"
                value={host.clone}
                onChange={(event) => onChange({ clone: event.target.value })}
              />
            </div>
          )}
        </Field>
        <label className="flex items-center gap-2 self-end pb-1 text-sm">
          <Checkbox
            checked={host.numa}
            onCheckedChange={(value) => onChange({ numa: value === true })}
          />
          <FieldIcon>
            <Share2 />
          </FieldIcon>
          NUMA
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
              <Input
                className="h-8 min-w-0 flex-1"
                placeholder="Size GB"
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
              <Input
                className="h-8 w-16 shrink-0"
                type="number"
                min={0}
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
              <Input
                className="h-8 min-w-0 flex-1 font-mono"
                placeholder="Storage"
                value={disk.storage}
                onChange={(event) =>
                  onDiskChange(diskIndex, { storage: event.target.value })
                }
              />
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
