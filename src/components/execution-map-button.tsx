"use client";

import { useEffect, useState } from "react";
import { Map as MapIcon } from "lucide-react";

import { AtlasPackMapLive } from "@/components/atlas-pack-map-live";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fetchExecutionLogExcerpt } from "@/lib/api";

function progressStatus(status: string): string {
  const raw = status.toUpperCase();
  if (raw === "OK") return "SUCCESS";
  if (raw === "FAIL") return "FAILED";
  if (raw === "PENDING") return "QUEUED";
  return raw;
}

export function ExecutionMapButton({
  projectId,
  clusterId,
  executionId,
  status,
  phases,
  title,
  size = "icon-xs",
}: {
  projectId: string;
  clusterId: string;
  executionId: string;
  status: string;
  phases?: string[];
  title: string;
  size?: "icon-xs" | "icon-sm";
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetchExecutionLogExcerpt(projectId, executionId, 1024 * 1024)
      .then((log) => {
        if (!cancelled) setText(log);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setText("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [executionId, open, projectId]);

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              size={size}
              variant="ghost"
              aria-label="View map"
              onClick={() => {
                setText(null);
                setError(null);
                setOpen(true);
              }}
            />
          }
        >
          <MapIcon />
        </TooltipTrigger>
        <TooltipContent>View map</TooltipContent>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-3 sm:max-w-5xl">
          <DialogHeader className="pr-8">
            <DialogTitle>Run map</DialogTitle>
            <DialogDescription className="truncate">{title}</DialogDescription>
          </DialogHeader>
          {text == null && !error ? (
            <Skeleton className="h-96 w-full" />
          ) : error ? (
            <p className="font-mono text-xs text-destructive">{error}</p>
          ) : (
            <AtlasPackMapLive
              projectId={projectId}
              clusterId={clusterId}
              status={progressStatus(status)}
              text={text ?? ""}
              phases={phases}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
