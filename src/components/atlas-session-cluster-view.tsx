"use client";

import type { ReactNode } from "react";

import { ClusterConfigView } from "@/app/clusters/[clusterId]/config/page";
import { ClusterHomeView } from "@/app/clusters/[clusterId]/page";
import { ClusterHostsView } from "@/app/clusters/[clusterId]/hosts/page";
import { ClusterLogStampView } from "@/app/clusters/[clusterId]/logs/[stamp]/page";
import { ClusterLogsView } from "@/app/clusters/[clusterId]/logs/page";
import { ClusterReposView } from "@/app/clusters/[clusterId]/repos/page";
import { ClusterRunView } from "@/app/clusters/[clusterId]/run/page";
import { ClusterVarsView } from "@/app/clusters/[clusterId]/vars/page";
import { ClusterWorkspaceView } from "@/app/clusters/[clusterId]/workspace/page";
import { AtlasHubRun } from "@/components/atlas-hub-run";
import { useAtlasClusterSelection } from "@/components/atlas-cluster-selection";
import { EmptyState } from "@/components/empty-state";

function AtlasSessionClusterGuard({
  children,
}: {
  children: (clusterId: string) => ReactNode;
}) {
  const { clusterId } = useAtlasClusterSelection();
  if (!clusterId) {
    return (
      <EmptyState
        title="No cluster selected"
        description="Choose a cluster from the header list. Bind clusters.path in Project Settings if the list is empty."
      />
    );
  }
  return <>{children(clusterId)}</>;
}

export function AtlasSessionHomePage() {
  return (
    <AtlasSessionClusterGuard>
      {(clusterId) => <ClusterHomeView key={clusterId} clusterId={clusterId} />}
    </AtlasSessionClusterGuard>
  );
}

export function AtlasSessionHostsPage() {
  return (
    <AtlasSessionClusterGuard>
      {(clusterId) => (
        <ClusterHostsView key={clusterId} clusterId={clusterId} />
      )}
    </AtlasSessionClusterGuard>
  );
}

export function AtlasSessionVarsPage() {
  return (
    <AtlasSessionClusterGuard>
      {(clusterId) => <ClusterVarsView key={clusterId} clusterId={clusterId} />}
    </AtlasSessionClusterGuard>
  );
}

export function AtlasSessionLogsPage() {
  return (
    <AtlasSessionClusterGuard>
      {(clusterId) => <ClusterLogsView key={clusterId} clusterId={clusterId} />}
    </AtlasSessionClusterGuard>
  );
}

export function AtlasSessionLogStampPage({ stamp }: { stamp: string }) {
  return (
    <AtlasSessionClusterGuard>
      {(clusterId) => (
        <ClusterLogStampView
          key={`${clusterId}:${stamp}`}
          clusterId={clusterId}
          stamp={stamp}
        />
      )}
    </AtlasSessionClusterGuard>
  );
}

export function AtlasSessionRunPage({
  projectId,
  hub,
}: {
  projectId: string;
  hub: boolean;
}) {
  return (
    <AtlasSessionClusterGuard>
      {(clusterId) => (
        <>
          {hub ? (
            <AtlasHubRun projectId={projectId} clusterId={clusterId} />
          ) : null}
          {!hub ? (
            <ClusterRunView key={clusterId} clusterId={clusterId} />
          ) : null}
        </>
      )}
    </AtlasSessionClusterGuard>
  );
}

export function AtlasSessionWorkspacePage({
  projectId,
  hub,
}: {
  projectId: string;
  hub: boolean;
}) {
  return (
    <AtlasSessionClusterGuard>
      {(clusterId) => (
        <ClusterWorkspaceView
          key={clusterId}
          clusterId={clusterId}
          projectId={projectId}
          hub={hub}
        />
      )}
    </AtlasSessionClusterGuard>
  );
}

export function AtlasSessionReposPage() {
  return (
    <AtlasSessionClusterGuard>
      {(clusterId) => (
        <ClusterReposView key={clusterId} clusterId={clusterId} />
      )}
    </AtlasSessionClusterGuard>
  );
}

export function AtlasSessionConfigPage() {
  return (
    <AtlasSessionClusterGuard>
      {(clusterId) => (
        <ClusterConfigView key={clusterId} clusterId={clusterId} />
      )}
    </AtlasSessionClusterGuard>
  );
}
