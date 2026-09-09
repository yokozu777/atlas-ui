"use client";

import { useCallback, useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { useAtlasClusterSelection } from "@/components/atlas-cluster-selection";
import { AnsibleConfigTab } from "@/components/hosts-groups/ansible-config-tab";
import { projectApiQuery } from "@/components/hosts-groups/helpers";
import type { CfgFile } from "@/components/hosts-groups/types";
import { stargateJson } from "@/lib/stargate";

export function AnsibleConfigPage({ projectId }: { projectId: string }) {
  const { clusterId } = useAtlasClusterSelection();
  const q = projectApiQuery(projectId, clusterId);
  const [files, setFiles] = useState<CfgFile[]>([]);
  const [selected, setSelected] = useState("ansible-config/ansible.cfg");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLists = useCallback(async () => {
    setBusy(true);
    try {
      const cfg = await stargateJson<{ selected_config?: string; files?: CfgFile[] }>(
        `/ansible_config/list?${q}`,
      );
      setFiles(cfg.files ?? []);
      if (cfg.selected_config) setSelected(cfg.selected_config);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [q]);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  if (error) {
    return <EmptyState title="Ansible config unavailable" description={error} />;
  }

  return (
    <div>
      <PageHeader
        kicker="Infrastructure"
        title="Ansible Config"
        description="ansible.cfg files for this project"
      />
      <AnsibleConfigTab
        projectId={projectId}
        files={files}
        selected={selected}
        busy={busy}
        onRefresh={loadLists}
      />
    </div>
  );
}
