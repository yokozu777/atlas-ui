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

import { ClusterOverlaysProvider } from "@/components/cluster-overlays";
import {
  fetchAtlasProjectClusters,
  type ClusterRow,
} from "@/lib/api";
import { isCascadeDefaultCluster } from "@/lib/cluster-groups";
import { writeAtlasClusterBrowserCookie } from "@/lib/nav-cookies";
import { pushRecentClusterId, pushRecentContext } from "@/lib/recent-context";

export const ATLAS_CLUSTER_STORAGE_PREFIX = "atlas-ui:atlas-cluster:";
export const ATLAS_CLUSTERS_CHANGED_EVENT = "atlas-ui:clusters-changed";

export function notifyAtlasClustersChanged(clusterId?: string | null) {
  if (typeof window === "undefined") {
    return;
  }
  const id = clusterId?.trim() || null;
  window.dispatchEvent(
    new CustomEvent(ATLAS_CLUSTERS_CHANGED_EVENT, {
      detail: { clusterId: id },
    }),
  );
}

type AtlasClusterSelectionValue = {
  projectId: string | null;
  clusterId: string | null;
  clusters: ClusterRow[];
  clustersLoading: boolean;
  clustersError: string | null;
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
  writeAtlasClusterBrowserCookie(projectId, clusterId);
}

export function readAtlasClusterStored(projectId: string): string | null {
  return readStored(projectId);
}

export function writeAtlasClusterForProject(
  projectId: string,
  clusterId: string,
) {
  const next = clusterId.trim();
  if (!projectId || !next) {
    return;
  }
  writeStored(projectId, next);
  pushRecentClusterId(projectId, next);
  pushRecentContext({ projectId, clusterId: next });
}

function pickClusterId(
  clusters: ClusterRow[],
  preferred: string | null,
  fallback: string | null,
): string | null {
  const ids = clusters
    .filter((row) => !isCascadeDefaultCluster(row.id))
    .map((row) => row.id);
  if (ids.length === 0) {
    return null;
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
  initialClusterId = null,
  children,
}: {
  projectId: string | null;
  fallbackClusterId: string | null;
  initialClusterId?: string | null;
  children: ReactNode;
}) {
  const [clusters, setClusters] = useState<ClusterRow[]>([]);
  const [clustersLoading, setClustersLoading] = useState(Boolean(projectId));
  const [clustersError, setClustersError] = useState<string | null>(null);
  const [clusterId, setClusterIdState] = useState<string | null>(
    initialClusterId ?? fallbackClusterId,
  );
  const requestId = useRef(0);

  const reload = useCallback(
    async (preferred?: string | null) => {
      if (!projectId) {
        setClusters([]);
        setClustersLoading(false);
        setClustersError(null);
        setClusterIdState(fallbackClusterId);
        return;
      }
      const stored = readStored(projectId);
      const hint = preferred?.trim() || null;
      const selected = hint || stored;
      if (hint) {
        writeStored(projectId, hint);
      }
      setClusterIdState(pickClusterId([], selected, fallbackClusterId));
      const mine = ++requestId.current;
      setClustersLoading(true);
      setClustersError(null);
      try {
        const data = await fetchAtlasProjectClusters(projectId);
        if (mine !== requestId.current) {
          return;
        }
        setClusters(data.clusters);
        setClustersError(null);
        setClusterIdState(
          pickClusterId(data.clusters, selected, fallbackClusterId),
        );
      } catch (err) {
        if (mine !== requestId.current) {
          return;
        }
        setClustersError(err instanceof Error ? err.message : String(err));
      } finally {
        if (mine === requestId.current) {
          setClustersLoading(false);
        }
      }
    },
    [projectId, fallbackClusterId],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    function onChanged(event: Event) {
      const hint =
        event instanceof CustomEvent
          ? String(event.detail?.clusterId ?? "").trim() || null
          : null;
      void reload(hint);
    }
    window.addEventListener(ATLAS_CLUSTERS_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener(ATLAS_CLUSTERS_CHANGED_EVENT, onChanged);
    };
  }, [reload]);

  const setClusterId = useCallback(
    (id: string) => {
      const next = id.trim();
      if (!next) {
        return;
      }
      setClusterIdState(next);
      if (projectId) {
        writeStored(projectId, next);
        pushRecentClusterId(projectId, next);
        pushRecentContext({ projectId, clusterId: next });
      }
    },
    [projectId],
  );

  const value = useMemo(
    () => ({
      projectId,
      clusterId,
      clusters,
      clustersLoading,
      clustersError,
      setClusterId,
    }),
    [projectId, clusterId, clusters, clustersLoading, clustersError, setClusterId],
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
  const { clusterId, projectId } = useAtlasClusterSelection();
  return (
    <ClusterOverlaysProvider clusterId={clusterId} projectId={projectId}>
      {children}
    </ClusterOverlaysProvider>
  );
}
