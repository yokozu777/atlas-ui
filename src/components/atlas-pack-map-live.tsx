"use client";

import Link from "next/link";
import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Map as MapIcon } from "lucide-react";

import { AtlasPackMapCanvas } from "@/components/atlas-pack-map-canvas";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAtlasPackMap } from "@/hooks/use-atlas-pack-map";
import {
  atlasRunProgressFromText,
  packMapFocusFromProgress,
  packMapPhaseAliases,
  packMapRoleProgress,
  packMapRoleProgressByPhase,
} from "@/lib/atlas-run-progress";
import { projectHref, executionLogHref } from "@/lib/project-href";
import { cn } from "@/lib/utils";

export function AtlasPackMapLive({
  projectId,
  clusterId,
  status,
  text,
  phases,
  executionId,
}: {
  projectId: string;
  clusterId: string;
  status?: string | null;
  text: string;
  phases?: string[];
  executionId?: string | null;
}) {
  const { graph, parsed, yamlText, yamlError, loading } = useAtlasPackMap(
    projectId,
    clusterId,
  );
  const router = useRouter();
  const openPhaseLog = useCallback(
    (alias: string) => {
      if (!executionId) {
        return;
      }
      router.push(executionLogHref(projectId, executionId, alias));
    },
    [executionId, projectId, router],
  );
  const loggedPhases = useMemo(() => packMapPhaseAliases(text), [text]);
  const mapPhases = phases && phases.length > 0 ? phases : loggedPhases;
  const progress = useMemo(
    () =>
      atlasRunProgressFromText({
        status,
        text,
        phases: mapPhases,
      }),
    [mapPhases, status, text],
  );
  const focus = useMemo(
    () => packMapFocusFromProgress(progress, status ?? null),
    [progress, status],
  );
  const roles = useMemo(
    () => (focus.alias ? packMapRoleProgress(text, status ?? null) : null),
    [focus.alias, status, text],
  );
  const rolesByPhase = useMemo(
    () => packMapRoleProgressByPhase(text, status ?? null),
    [status, text],
  );
  const ready =
    graph &&
    graph.nodes.some((node) => node.kind === "pack" || node.kind === "phase");

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-background/40">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <MapIcon className="size-3.5" />
          Map
        </span>
        <Link
          href={projectHref(projectId, "/map")}
          className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
        >
          Open map
        </Link>
      </div>
      <div className="h-96">
        {loading && yamlText == null ? (
          <div className="flex h-full items-center justify-center p-6">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : yamlError ? (
          <p className="p-4 font-mono text-xs text-destructive">{yamlError}</p>
        ) : parsed && !parsed.ok ? (
          <p className="p-4 text-sm text-muted-foreground">
            cluster.yaml is invalid.
          </p>
        ) : ready && graph ? (
          <AtlasPackMapCanvas
            graph={graph}
            projectId={projectId}
            downloadName={clusterId}
            activeAlias={focus.alias}
            activeState={focus.state}
            activeRoles={roles}
            rolesByPhase={rolesByPhase}
            onPhaseClick={executionId ? openPhaseLog : undefined}
          />
        ) : (
          <p className="p-4 text-sm text-muted-foreground">No packs declared.</p>
        )}
      </div>
    </div>
  );
}
