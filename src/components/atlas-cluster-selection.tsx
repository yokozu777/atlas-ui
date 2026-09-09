"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ClusterOverlaysProvider } from "@/components/cluster-overlays";
import {
  fetchAtlasProjectClusters,
  type ClusterRow,
} from "@/lib/api";

export const ATLAS_CLUSTER_STORAGE_PREFIX = "atlas-ui:atlas-cluster:";

type AtlasClusterSelectionValue = {
  projectId: string | null;
  clusterId: string | null;
  clusters: ClusterRow[];
  setClusterId: (id: string) => void;
};

const AtlasClusterSelectionContext =
  createContext<AtlasClusterSelectionValue | null>(null);

function storageKey(projectId: string) {
  return `${ATLAS_CLUSTER_STORAGE_PREFIX}${projectId}`;
}

function readStored(projectId: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.sessionStorage.getItem(storageKey(projectId));
  } catch {
    return null;
  }
}

function writeStored(projectId: string, clusterId: string) {
  try {
    window.sessionStorage.setItem(storageKey(projectId), clusterId);
  } catch {
    /* quota / private mode */
  }
}

function pickClusterId(
  clusters: ClusterRow[],
  preferred: string | null,
  fallback: string | null,
): string | null {
  const ids = clusters.map((row) => row.id);
  if (ids.length === 0) {
    return preferred ?? fallback ?? null;
  }
  if (preferred && ids.includes(preferred)) {
    return preferred;
  }
  if (fallback && ids.includes(fallback)) {
    return fallback;
  }
  return ids[0] ?? null;
}

export function AtlasClusterSelectionProvider({
  projectId,
  fallbackClusterId,
  children,
}: {
  projectId: string | null;
  fallbackClusterId: string | null;
  children: ReactNode;
}) {
  const [clusters, setClusters] = useState<ClusterRow[]>([]);
  const [clusterId, setClusterIdState] = useState<string | null>(
    fallbackClusterId,
  );

  useEffect(() => {
    if (!projectId) {
      setClusters([]);
      setClusterIdState(fallbackClusterId);
      return;
    }
    const stored = readStored(projectId);
    setClusterIdState(pickClusterId([], stored, fallbackClusterId));
    let cancelled = false;
    void fetchAtlasProjectClusters()
      .then((data) => {
        if (cancelled) {
          return;
        }
        setClusters(data.clusters);
        setClusterIdState((current) =>
          pickClusterId(data.clusters, current ?? stored, fallbackClusterId),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setClusters([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, fallbackClusterId]);

  const setClusterId = useCallback(
    (id: string) => {
      const next = id.trim();
      if (!next) {
        return;
      }
      setClusterIdState(next);
      if (projectId) {
        writeStored(projectId, next);
      }
    },
    [projectId],
  );

  const value = useMemo(
    () => ({
      projectId,
      clusterId,
      clusters,
      setClusterId,
    }),
    [projectId, clusterId, clusters, setClusterId],
  );

  return (
    <AtlasClusterSelectionContext.Provider value={value}>
      {children}
    </AtlasClusterSelectionContext.Provider>
  );
}

export function useAtlasClusterSelection(): AtlasClusterSelectionValue {
  const ctx = useContext(AtlasClusterSelectionContext);
  if (!ctx) {
    throw new Error(
      "useAtlasClusterSelection must be used within AtlasClusterSelectionProvider",
    );
  }
  return ctx;
}

export function AtlasClusterOverlays({ children }: { children: ReactNode }) {
  const { clusterId } = useAtlasClusterSelection();
  return (
    <ClusterOverlaysProvider clusterId={clusterId}>
      {children}
    </ClusterOverlaysProvider>
  );
}
