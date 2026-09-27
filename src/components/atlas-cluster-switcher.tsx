"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Layers, Plus, Server } from "lucide-react";

import { useAtlasClusterSelection } from "@/components/atlas-cluster-selection";
import {
  ContextCombobox,
  ContextSwitcher,
  type ContextSwitcherGroup,
} from "@/components/context-switcher";
import { Button } from "@/components/ui/button";
import type { ClusterRow } from "@/lib/api";
import {
  clusterMatchesQuery,
  groupClusters,
  isCascadeDefaultCluster,
} from "@/lib/cluster-groups";
import { projectHref } from "@/lib/project-href";
import { readRecentClusterIds } from "@/lib/recent-context";

type ClusterHit = {
  key: string;
  cluster: ClusterRow;
};

function selectableClusters(rows: ClusterRow[]): ClusterRow[] {
  return rows.filter(
    (row) => !isCascadeDefaultCluster(row.id) && !row.archived,
  );
}

function clusterRowMatches(row: ClusterRow, query: string): boolean {
  if (clusterMatchesQuery(row.id, query)) {
    return true;
  }
  const name = row.display_name?.trim().toLowerCase();
  const q = query.trim().toLowerCase();
  return Boolean(name && q && name.includes(q));
}

export function AtlasClusterSwitcher() {
  const router = useRouter();
  const {
    projectId,
    clusterId,
    clusters,
    clustersLoading,
    clustersError,
    setClusterId,
  } = useAtlasClusterSelection();
  const [open, setOpen] = useState(false);

  const visible = useMemo(() => selectableClusters(clusters), [clusters]);

  const items = useMemo<ClusterHit[]>(
    () => visible.map((cluster) => ({ key: cluster.id, cluster })),
    [visible],
  );

  const groups = useMemo<ContextSwitcherGroup<ClusterHit>[]>(() => {
    const recentIds = projectId ? readRecentClusterIds(projectId) : [];
    const recentHits = recentIds
      .map((id) => items.find((hit) => hit.cluster.id === id))
      .filter((hit): hit is ClusterHit => Boolean(hit));
    const recentSet = new Set(recentHits.map((hit) => hit.cluster.id));
    const rest = items.filter((hit) => !recentSet.has(hit.cluster.id));
    const sections: ContextSwitcherGroup<ClusterHit>[] = [];
    if (recentHits.length > 0) {
      sections.push({ id: "recent", label: "Recent", items: recentHits });
    }
    for (const group of groupClusters(rest.map((hit) => hit.cluster))) {
      sections.push({
        id: group.key,
        label: group.label,
        items: group.items.map((cluster) => ({ key: cluster.id, cluster })),
      });
    }
    return sections;
  }, [items, projectId]);

  const selected = useMemo(() => {
    if (!clusterId) {
      return null;
    }
    return items.find((hit) => hit.cluster.id === clusterId) ?? null;
  }, [clusterId, items]);

  if (!projectId) {
    return null;
  }

  const triggerLabel =
    selected?.cluster.id || (clustersLoading ? "Loading…" : "Select cluster");

  return (
    <ContextSwitcher
      items={items}
      groups={groups}
      value={selected}
      open={open}
      onOpenChange={setOpen}
      onValueChange={(hit) => {
        setClusterId(hit.cluster.id);
        setOpen(false);
      }}
      filter={(item, query) => clusterRowMatches(item.cluster, query)}
      itemToStringLabel={(hit) => hit.cluster.id}
      itemKey={(hit) => hit.key}
      isItemEqualToValue={(a, b) => a.key === b.key}
      emptyLabel={
        clustersLoading ? "Loading…" : clustersError || "No clusters"
      }
      placeholder="Search clusters…"
      status={clustersLoading ? "Loading…" : clustersError}
      align="end"
      popupClassName="w-72 min-w-64"
      trigger={
        <ContextCombobox.Trigger
          aria-label="Select cluster"
          title={clusterId ?? "Select cluster"}
          className="flex h-8 max-w-[16rem] min-w-0 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-left text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Server className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate font-mono">{triggerLabel}</span>
          <ContextCombobox.Icon
            render={
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            }
          />
        </ContextCombobox.Trigger>
      }
      renderItem={(hit) => {
        const current = hit.cluster.id === clusterId;
        return (
          <>
            <span
              className="min-w-0 flex-1 truncate font-mono text-xs"
              title={hit.cluster.id}
            >
              {hit.cluster.id}
            </span>
            {hit.cluster.kind === "broken" ? (
              <span className="shrink-0 text-[10px] text-warning">missing</span>
            ) : null}
            {current ? <Check className="size-3.5 shrink-0" /> : null}
          </>
        );
      }}
      footer={
        <div className="flex flex-col gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="w-full rounded-md"
            onClick={() => {
              setOpen(false);
              router.push(projectHref(projectId, "/clusters"));
            }}
          >
            <Layers className="size-3.5" />
            Manage clusters
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="w-full rounded-md"
            onClick={() => {
              setOpen(false);
              router.push(projectHref(projectId, "/init"));
            }}
          >
            <Plus className="size-3.5" />
            New cluster
          </Button>
        </div>
      }
    />
  );
}
