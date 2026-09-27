"use client";

import { ClusterYamlConfigTab } from "@/components/cluster-yaml-config-tab";
import { ClusterYamlReposTab } from "@/components/cluster-yaml-repos-tab";
import type { ClusterPhase, ClusterPlaybookRepo } from "@/lib/api";

export function ClusterYamlHealthTab({
  projectId,
  clusterId,
  playbooks,
  phases,
  ready,
}: {
  projectId: string;
  clusterId: string | null;
  playbooks: ClusterPlaybookRepo[];
  phases: ClusterPhase[];
  ready: boolean;
}) {
  return (
    <div className="space-y-10">
      <ClusterYamlReposTab
        projectId={projectId}
        clusterId={clusterId}
        playbooks={playbooks}
      />
      <ClusterYamlConfigTab
        clusterId={clusterId}
        phases={phases}
        ready={ready}
      />
    </div>
  );
}
