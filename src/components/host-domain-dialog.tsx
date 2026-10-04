"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  renameHostsDomain,
  type HostDomainResult,
  type HostGroup,
  type HostsTopology,
} from "@/lib/atlas-hosts";
import { fetchAtlasProjectClusters } from "@/lib/api";
import {
  dnsDomainInvalid,
  domainChoices,
  renameHostGroups,
} from "@/lib/host-domain";

const PREVIEW_LIMIT = 8;

type DomainScope = "group" | "leaf" | "all";

function hostnamesFor(groups: HostGroup[], scope: DomainScope, groupId: string | null): string[] {
  const source =
    scope === "group" ? groups.filter((group) => group.id === groupId) : groups;
  return source.flatMap((group) => group.hosts.map((host) => host.hostname));
}

export function HostDomainDialog({
  open,
  onOpenChange,
  projectId,
  clusterId,
  groups,
  groupId,
  groupName,
  onGroup,
  onLeaf,
  onAll,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  clusterId: string;
  groups: HostGroup[];
  groupId: string | null;
  groupName: string;
  onGroup: (groups: HostGroup[]) => void;
  onLeaf: (groups: HostGroup[], dns: { from: string; to: string }) => void;
  onAll: (topology: HostsTopology) => void;
}) {
  const [fromDomain, setFromDomain] = useState("");
  const [toDomain, setToDomain] = useState("");
  const [scope, setScope] = useState<DomainScope>("group");
  const [clusterCount, setClusterCount] = useState<number | null>(null);
  const [remote, setRemote] = useState<HostDomainResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(false);
  if (open !== opened) {
    setOpened(open);
    if (open) {
      const initial: DomainScope = groupId ? "group" : "leaf";
      const next = domainChoices(hostnamesFor(groups, initial, groupId));
      setFromDomain(next[0]?.domain ?? "");
      setToDomain("");
      setScope(initial);
      setRemote(null);
      setClusterCount(null);
    }
  }

  const choices = useMemo(
    () => domainChoices(hostnamesFor(groups, scope, groupId)),
    [groups, scope, groupId],
  );
  const trimmedTo = toDomain.trim();
  const invalid = trimmedTo ? dnsDomainInvalid(trimmedTo) : null;
  const same =
    Boolean(fromDomain) &&
    Boolean(trimmedTo) &&
    fromDomain.toLowerCase() === trimmedTo.toLowerCase();
  const ready = Boolean(fromDomain) && !invalid && !same && Boolean(trimmedTo);
  const local = useMemo(
    () =>
      renameHostGroups(
        groups,
        fromDomain,
        trimmedTo,
        scope === "group" ? (groupId ?? undefined) : undefined,
      ),
    [groups, fromDomain, trimmedTo, scope, groupId],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetchAtlasProjectClusters(projectId)
      .then((data) => {
        if (!cancelled) setClusterCount(data.clusters.length);
      })
      .catch(() => {
        if (!cancelled) setClusterCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  useEffect(() => {
    if (!open || !ready || scope === "group") return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void renameHostsDomain(projectId, clusterId, {
        from: fromDomain,
        to: trimmedTo,
        scope: scope === "all" ? "all" : "leaf",
        dryRun: true,
        groups,
      })
        .then((data) => {
          if (!cancelled) setRemote(data);
        })
        .catch(() => {
          if (!cancelled) setRemote(null);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, ready, fromDomain, trimmedTo, scope, groups, projectId, clusterId]);

  const previewRemote =
    ready &&
    remote &&
    remote.scope === scope &&
    remote.from.toLowerCase() === fromDomain.toLowerCase() &&
    remote.to.toLowerCase() === trimmedTo.toLowerCase()
      ? remote
      : null;
  const preview =
    scope === "all" && previewRemote
      ? previewRemote.clusters.flatMap((row) =>
          row.changes.map((change) => ({ ...change, clusterId: row.clusterId })),
        )
      : local.changes.map((change) => ({ ...change, clusterId }));
  const skippedCount =
    scope === "all" && previewRemote
      ? previewRemote.clusters.reduce((sum, row) => sum + row.skipped.length, 0)
      : local.skipped.length;
  const dnsCount =
    previewRemote?.clusters.reduce((sum, row) => sum + row.dnsFiles.length, 0) ?? 0;
  const shown = preview.slice(0, PREVIEW_LIMIT);
  const hidden = Math.max(preview.length - shown.length, 0);

  async function apply() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      if (scope === "group" || scope === "leaf") {
        const renamed = renameHostGroups(
          groups,
          fromDomain,
          trimmedTo,
          scope === "group" ? (groupId ?? undefined) : undefined,
        );
        if (renamed.changes.length === 0) {
          toast("Nothing matched that domain");
          return;
        }
        if (scope === "group") {
          onGroup(renamed.groups);
          toast.success(
            `Hostnames in ${groupName || "this group"} updated. Save changes to write them.`,
          );
        } else {
          onLeaf(renamed.groups, { from: fromDomain, to: trimmedTo });
          toast.success("Hostnames updated in this cluster. Save changes to write them.");
        }
        onOpenChange(false);
        return;
      }
      const result = await renameHostsDomain(projectId, clusterId, {
        from: fromDomain,
        to: trimmedTo,
        scope,
        groups,
      });
      const names = result.clusters.reduce((sum, row) => sum + row.changes.length, 0);
      const dns = result.clusters.reduce((sum, row) => sum + row.dnsFiles.length, 0);
      if (!result.topology) {
        toast.error("Hosts were not saved");
        return;
      }
      onAll(result.topology);
      const clusters = result.clusters.filter(
        (row) => row.changes.length > 0 || row.dnsFiles.length > 0,
      ).length;
      toast.success(
        names > 0
          ? `Updated ${names} hostname${names === 1 ? "" : "s"} on ${clusters} cluster${clusters === 1 ? "" : "s"}${dns > 0 ? ". DNS suffix updated." : "."}`
          : dns > 0
            ? "DNS suffix updated."
            : "Nothing matched that domain.",
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="z-[90] bg-black/50 supports-backdrop-filter:backdrop-blur-none"
        className="z-[90] flex max-h-[min(36rem,85vh)] flex-col gap-0 overflow-hidden !bg-[#1c1c1f] p-0 sm:max-w-lg"
        style={{ backgroundColor: "#1c1c1f" }}
      >
        <div className="px-4 pt-4 pr-12 pb-3">
          <DialogTitle>Change domain</DialogTitle>
          <DialogDescription className="mt-1">
            Replaces the domain on hostnames. The short name stays.
          </DialogDescription>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto border-t border-border px-4 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="host-domain-current">Current domain</Label>
            {choices.length > 1 ? (
              <Select
                value={fromDomain || null}
                onValueChange={(value) => {
                  if (typeof value === "string") setFromDomain(value);
                }}
              >
                <SelectTrigger id="host-domain-current" className="w-full font-mono">
                  <SelectValue placeholder="Domain" />
                </SelectTrigger>
                <SelectContent>
                  {choices.map((choice) => (
                    <SelectItem key={choice.domain} value={choice.domain}>
                      {choice.domain}
                      <span className="text-muted-foreground"> ({choice.count})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="host-domain-current"
                readOnly
                value={fromDomain}
                placeholder="No domain on these hosts"
                className="font-mono"
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="host-domain-next">New domain</Label>
            <Input
              id="host-domain-next"
              value={toDomain}
              onChange={(event) => setToDomain(event.target.value)}
              placeholder="lab.example"
              className="font-mono"
              autoComplete="off"
              aria-invalid={Boolean(invalid)}
            />
            {invalid ? <p className="text-xs text-destructive">{invalid}</p> : null}
            {same ? (
              <p className="text-xs text-muted-foreground">
                New domain matches the current domain.
              </p>
            ) : null}
          </div>
          <RadioGroup
            value={scope}
            onValueChange={(value) => {
              if (value !== "group" && value !== "leaf" && value !== "all") return;
              if (value === "group" && !groupId) return;
              setScope(value);
              const nextChoices = domainChoices(hostnamesFor(groups, value, groupId));
              if (
                !nextChoices.some(
                  (choice) => choice.domain.toLowerCase() === fromDomain.toLowerCase(),
                )
              ) {
                setFromDomain(nextChoices[0]?.domain ?? "");
              }
            }}
            className="gap-2"
          >
            <Label className="font-normal">
              <RadioGroupItem value="group" disabled={!groupId} />
              This group{groupName ? ` (${groupName})` : ""}
            </Label>
            <Label className="font-normal">
              <RadioGroupItem value="leaf" />
              This cluster
            </Label>
            <Label className="font-normal">
              <RadioGroupItem value="all" />
              All clusters{clusterCount != null ? ` (${clusterCount})` : ""}
            </Label>
          </RadioGroup>
          <p className="text-xs text-muted-foreground">
            {scope === "group"
              ? `Only hostnames in ${groupName || "this group"}. Save changes to write them.`
              : scope === "leaf"
                ? "Hostnames and the DNS suffix are written when you click Save changes. dns_domain_suffix is updated where it still equals the current domain."
                : "Writes every cluster now, including unsaved edits on this one. dns_domain_suffix is updated where it still equals the current domain."}
          </p>
          {ready ? (
            <div className="space-y-1">
              {shown.length === 0 ? (
                <p className="text-xs text-muted-foreground">No hostnames to change.</p>
              ) : (
                <ul className="space-y-0.5">
                  {shown.map((row) => (
                    <li
                      key={`${row.clusterId}:${row.from}`}
                      className="truncate font-mono text-[11px]"
                    >
                      {scope === "all" ? (
                        <span className="text-muted-foreground">{row.clusterId} </span>
                      ) : null}
                      <span className="text-muted-foreground">{row.from}</span>
                      <span className="px-1 text-muted-foreground/70">→</span>
                      <span>{row.to}</span>
                    </li>
                  ))}
                </ul>
              )}
              {hidden > 0 ? (
                <p className="text-xs text-muted-foreground">and {hidden} more</p>
              ) : null}
              {skippedCount > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {skippedCount} hostname{skippedCount === 1 ? "" : "s"} left unchanged.
                </p>
              ) : null}
              {dnsCount > 0 ? (
                <p className="text-xs text-muted-foreground">
                  DNS suffix in {dnsCount} file{dnsCount === 1 ? "" : "s"}.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!ready || local.changes.length === 0 || busy}
            onClick={() => void apply()}
          >
            {busy ? "Applying…" : "Apply"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
