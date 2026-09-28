"use client";

import { useState } from "react";
import { Map as MapIcon, RefreshCw } from "lucide-react";

import { useAtlasClusterSelection } from "@/components/atlas-cluster-selection";
import { AtlasPackMapCanvas } from "@/components/atlas-pack-map-canvas";
import { EmptyState } from "@/components/empty-state";
import { SectionHeader } from "@/components/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAtlasMapLiveFocus } from "@/hooks/use-atlas-map-live-focus";
import { useAtlasPackMap } from "@/hooks/use-atlas-pack-map";

function LegendChip({
  label,
  count,
  variant,
}: {
  label: string;
  count: number;
  variant: "success" | "destructive" | "warning" | "info" | "outline";
}) {
  return (
    <Badge variant={count > 0 ? variant : "outline"}>
      {label} {count}
    </Badge>
  );
}

export function AtlasPackMapPage({ projectId }: { projectId: string }) {
  const { clusterId, clustersLoading } = useAtlasClusterSelection();
  const { graph, parsed, yamlText, yamlError, loading, reload } = useAtlasPackMap(
    projectId,
    clusterId,
  );
  const live = useAtlasMapLiveFocus(projectId, clusterId);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }

  const columns = [
    "Cluster",
    "Pack",
    "Overlay",
    "ansible.cfg",
    "Entry",
    "Phase",
    "Group",
  ] as const;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <SectionHeader
        className="mb-0 shrink-0"
        icon={<MapIcon />}
        title="Map"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {clusterId ? <Badge variant="success">{clusterId}</Badge> : null}
            {graph ? (
              <>
                <LegendChip
                  label="Ready"
                  count={graph.counts.ready}
                  variant="success"
                />
                <LegendChip
                  label="Missing"
                  count={graph.counts.missing}
                  variant="destructive"
                />
                <LegendChip
                  label="Drift"
                  count={graph.counts.drift}
                  variant="warning"
                />
                <LegendChip
                  label="Unused"
                  count={graph.counts.unused}
                  variant="info"
                />
                <LegendChip
                  label="Broken"
                  count={graph.counts.broken}
                  variant="destructive"
                />
              </>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={() => void refresh()}
              disabled={!clusterId || loading || refreshing}
            >
              <RefreshCw className={refreshing ? "animate-spin" : undefined} />
              Refresh
            </Button>
          </div>
        }
      />
      <p className="shrink-0 text-sm text-muted-foreground">
        SSH and overlay passwords attach at clone/play time. Each pack has its
        ansible.cfg. Phases target inventory groups through limit and when.
      </p>
      <div className="grid shrink-0 grid-cols-7 gap-2 px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {columns.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border/60 bg-background/40">
        {clustersLoading || (clusterId && loading && yamlText == null) ? (
          <div className="flex h-full items-center justify-center p-8">
            <Skeleton className="h-48 w-full max-w-3xl" />
          </div>
        ) : !clusterId ? (
          <EmptyState
            title="Select a cluster"
            description="Map follows the cluster switcher. Pick a cluster to see packs and phases."
          />
        ) : yamlError ? (
          <EmptyState title="cluster.yaml unavailable" description={yamlError} />
        ) : parsed && !parsed.ok ? (
          <EmptyState
            title="cluster.yaml is invalid"
            description={parsed.error || "Fix YAML in Setup before the map can render."}
          />
        ) : graph &&
          graph.nodes.some(
            (node) => node.kind === "pack" || node.kind === "phase",
          ) ? (
          <AtlasPackMapCanvas
            graph={graph}
            projectId={projectId}
            downloadName={clusterId ?? "pack-map"}
            activeAlias={live.alias}
            activeState={live.state}
            activeRoles={live.roles}
            rolesByPhase={live.rolesByPhase}
          />
        ) : (
          <EmptyState
            title="No packs declared"
            description="This cluster.yaml has no playbooks or phases yet."
          />
        )}
      </div>
    </div>
  );
}
