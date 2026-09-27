"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { ClusterConfigView } from "@/app/clusters/[clusterId]/config/page";
import { ClusterHomeView } from "@/app/clusters/[clusterId]/page";
import { ClusterHostsView } from "@/app/clusters/[clusterId]/hosts/page";
import { ClusterLogStampView } from "@/app/clusters/[clusterId]/logs/[stamp]/page";
import { ClusterLogsView } from "@/app/clusters/[clusterId]/logs/page";
import { ClusterReposView } from "@/app/clusters/[clusterId]/repos/page";
import { ClusterRunView } from "@/app/clusters/[clusterId]/run/page";
import { ClusterVarsView } from "@/app/clusters/[clusterId]/vars/page";
import { ClusterWorkspaceView } from "@/app/clusters/[clusterId]/workspace/page";
import { useAtlasClusterSelection } from "@/components/atlas-cluster-selection";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { projectHref, projectIdFromPath } from "@/lib/project-href";

function AtlasSessionClusterGuard({
  children,
}: {
  children: (clusterId: string) => ReactNode;
}) {
  const { clusterId, clustersLoading } = useAtlasClusterSelection();
  const pathname = usePathname();
  const projectId = projectIdFromPath(pathname);
  if (!clusterId) {
    if (clustersLoading) {
      return <EmptyState title="Loading cluster" />;
    }
    return (
      <EmptyState
        title="No cluster selected"
        description={
          <div className="space-y-3">
            <p>
              Choose a cluster from the header list. Bind clusters.path in
              Console if the list is empty.
            </p>
            {projectId ? (
              <Button
                size="sm"
                render={<Link href={projectHref(projectId, "/init")} />}
              >
                New cluster
              </Button>
            ) : null}
          </div>
        }
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

export function AtlasSessionLogsPage({ hideHeader = false }: { hideHeader?: boolean }) {
  return (
    <AtlasSessionClusterGuard>
      {(clusterId) => (
        <ClusterLogsView key={clusterId} clusterId={clusterId} hideHeader={hideHeader} />
      )}
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
  projectId: _projectId,
  hub,
}: {
  projectId: string;
  hub: boolean;
}) {
  return (
    <AtlasSessionClusterGuard>
      {(clusterId) =>
        hub ? null : (
          <ClusterRunView key={clusterId} clusterId={clusterId} />
        )
      }
    </AtlasSessionClusterGuard>
  );
}

export function AtlasSessionWorkspacePage({
  projectId,
  hub,
  hideHeader = false,
}: {
  projectId: string;
  hub: boolean;
  hideHeader?: boolean;
}) {
  return (
    <AtlasSessionClusterGuard>
      {(clusterId) => (
        <ClusterWorkspaceView
          key={clusterId}
          clusterId={clusterId}
          projectId={projectId}
          hub={hub}
          hideHeader={hideHeader}
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
