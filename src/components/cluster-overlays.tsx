"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { InspectSheet, type InspectKind } from "@/components/inspect-sheet";
import { RunSheet } from "@/components/run-sheet";

type RunOpenOpts = { phases?: string; limit?: string };

type ClusterOverlaysValue = {
  openRun: (opts?: RunOpenOpts) => void;
  openInspect: (kind: InspectKind) => void;
};

const ClusterOverlaysContext = createContext<ClusterOverlaysValue | null>(null);

export function ClusterOverlaysProvider({
  clusterId,
  children,
}: {
  clusterId: string | null;
  children: ReactNode;
}) {
  const [runOpen, setRunOpen] = useState(false);
  const [runPhases, setRunPhases] = useState("");
  const [runLimit, setRunLimit] = useState("");
  const [inspect, setInspect] = useState<InspectKind | null>(null);

  const openRun = useCallback((opts?: RunOpenOpts) => {
    setRunPhases(opts?.phases ?? "");
    setRunLimit(opts?.limit ?? "");
    setRunOpen(true);
  }, []);

  const openInspect = useCallback((kind: InspectKind) => {
    setInspect(kind);
  }, []);

  const value = useMemo(
    () => ({ openRun, openInspect }),
    [openRun, openInspect],
  );

  return (
    <ClusterOverlaysContext.Provider value={value}>
      {children}
      {clusterId ? (
        <>
          <RunSheet
            key={`${clusterId}:${runOpen}:${runPhases}:${runLimit}`}
            clusterId={clusterId}
            open={runOpen}
            onOpenChange={setRunOpen}
            initialPhases={runPhases}
            initialLimit={runLimit}
          />
          <InspectSheet
            clusterId={clusterId}
            kind={inspect}
            onOpenChange={(open) => {
              if (!open) setInspect(null);
            }}
          />
        </>
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
