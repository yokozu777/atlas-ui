"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { AtlasRunDialog } from "@/components/atlas-run-dialog";
import { InspectSheet, type InspectKind } from "@/components/inspect-sheet";
import { RunSheet } from "@/components/run-sheet";
import { parseRunPhasesOpt } from "@/lib/atlas-run";

export type RunOpenOpts = { phases?: string | string[]; limit?: string };

type ClusterOverlaysValue = {
  openRun: (opts?: RunOpenOpts) => void;
  openInspect: (kind: InspectKind) => void;
  liveExecutionId: string | null;
  followExecution: (executionId: string) => void;
};

const ClusterOverlaysContext = createContext<ClusterOverlaysValue | null>(null);

export function ClusterOverlaysProvider({
  clusterId,
  projectId,
  children,
}: {
  clusterId: string | null;
  projectId?: string | null;
  children: ReactNode;
}) {
  const [runOpen, setRunOpen] = useState(false);
  const [runPhases, setRunPhases] = useState("");
  const [runLimit, setRunLimit] = useState("");
  const [inspect, setInspect] = useState<InspectKind | null>(null);
  const [liveExecutionId, setLiveExecutionId] = useState<string | null>(null);
  const clusterKey = `${projectId ?? ""}:${clusterId ?? ""}`;
  const prevClusterKey = useRef(clusterKey);

  useEffect(() => {
    if (prevClusterKey.current === clusterKey) {
      return;
    }
    prevClusterKey.current = clusterKey;
    setLiveExecutionId(null);
    setRunOpen(false);
  }, [clusterKey]);

  const openRun = useCallback((opts?: RunOpenOpts) => {
    const phases = parseRunPhasesOpt(opts?.phases);
    setRunPhases(phases.join(","));
    setRunLimit(opts?.limit ?? "");
    setRunOpen(true);
  }, []);

  const openInspect = useCallback((kind: InspectKind) => {
    setInspect(kind);
  }, []);

  const followExecution = useCallback((executionId: string) => {
    setLiveExecutionId(executionId);
  }, []);

  const value = useMemo(
    () => ({ openRun, openInspect, liveExecutionId, followExecution }),
    [openRun, openInspect, liveExecutionId, followExecution],
  );

  return (
    <ClusterOverlaysContext.Provider value={value}>
      {children}
      {clusterId && projectId ? (
        <AtlasRunDialog
          key={`${clusterId}:${runOpen}:${runPhases}`}
          open={runOpen}
          onOpenChange={setRunOpen}
          projectId={projectId}
          clusterId={clusterId}
          initialPhases={runPhases}
          onQueued={(id) => setLiveExecutionId(id)}
        />
      ) : clusterId ? (
        <RunSheet
          key={`${clusterId}:${runOpen}:${runPhases}:${runLimit}`}
          clusterId={clusterId}
          open={runOpen}
          onOpenChange={setRunOpen}
          initialPhases={runPhases}
          initialLimit={runLimit}
        />
      ) : null}
      {clusterId ? (
        <InspectSheet
          clusterId={clusterId}
          kind={inspect}
          onOpenChange={(open) => {
            if (!open) setInspect(null);
          }}
        />
      ) : null}
    </ClusterOverlaysContext.Provider>
  );
}

export function useClusterOverlays() {
  const ctx = useContext(ClusterOverlaysContext);
  if (!ctx) {
    throw new Error("useClusterOverlays must be used within ClusterOverlaysProvider");
  }
  return ctx;
}
