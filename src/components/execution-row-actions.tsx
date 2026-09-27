"use client";

import { useState } from "react";
import { Ban, RotateCcw, Square } from "lucide-react";
import { toast } from "sonner";

import { ExecutionMapButton } from "@/components/execution-map-button";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  cancelOrStopExecution,
  canReplayExecution,
  executionRowAction,
  isAtlasKind,
  queueExecutionReplay,
  type AtlasExecution,
} from "@/lib/atlas-run";
import { useCan } from "@/lib/authz";
import { cn } from "@/lib/utils";
import { phasesFromRunParams } from "@/lib/atlas-run-progress";

export type ExecutionActionRow = AtlasExecution & {
  id: string;
  rawStatus?: string | null;
};

function stopClick(event: { preventDefault(): void; stopPropagation(): void }) {
  event.preventDefault();
  event.stopPropagation();
}

export function ExecutionRowActions({
  projectId,
  execution,
  liveStatus,
  fallbackClusterId,
  onQueued,
  onStopped,
  size = "icon-xs",
  className,
}: {
  projectId: string;
  execution: ExecutionActionRow | null;
  liveStatus?: string | null;
  fallbackClusterId?: string;
  onQueued?: (executionId: string) => void;
  onStopped?: () => void;
  size?: "icon-xs" | "icon-sm";
  className?: string;
}) {
  const can = useCan();
  const [busy, setBusy] = useState(false);

  if (!execution || !execution.id) {
    return null;
  }

  const status = liveStatus || execution.rawStatus || execution.status || "";
  const action = executionRowAction(status);
  const atlas = isAtlasKind(execution);
  const clusterId = execution.runParams?.cluster_id || fallbackClusterId || "";
  const showMap = atlas && Boolean(clusterId);
  const canStop = can("atlas.execute") || can("playbooks.execute");
  const canRerun = atlas ? can("atlas.execute") : can("playbooks.execute");
  const showAction = Boolean(
    action &&
      (action === "rerun"
        ? canRerun && canReplayExecution(execution)
        : canStop),
  );
  if (!showMap && !showAction) {
    return null;
  }

  const apiStatus = status.toUpperCase() === "PENDING" ? "QUEUED" : status.toUpperCase();
  const label =
    action === "rerun" ? "Rerun" : action === "cancel" ? "Cancel" : "Stop";
  const variant =
    action === "rerun" ? (size === "icon-sm" ? "outline" : "ghost") : "destructive";
  const row = execution;

  async function run() {
    setBusy(true);
    try {
      if (action === "rerun") {
        const id = await queueExecutionReplay(
          projectId,
          row,
          fallbackClusterId,
        );
        onQueued?.(id);
        return;
      }
      await cancelOrStopExecution(projectId, row.id, apiStatus);
      toast.success(
        action === "cancel" ? "Cancel requested" : "Stop requested",
      );
      onStopped?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("relative z-10 flex items-center justify-end gap-1", className)} onClick={stopClick}>
      {showMap ? (
        <ExecutionMapButton
          projectId={projectId}
          clusterId={clusterId}
          executionId={execution.id}
          status={status}
          phases={phasesFromRunParams(execution.runParams)}
          title={execution.playbookName || execution.id}
          size={size}
        />
      ) : null}
      {showAction && action ? (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              size={size}
              variant={variant}
              disabled={busy}
              aria-label={label}
              onClick={() => void run()}
            />
          }
        >
          {action === "rerun" ? (
            <RotateCcw />
          ) : action === "cancel" ? (
            <Ban />
          ) : (
            <Square />
          )}
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      ) : null}
    </div>
  );
}
