"use client";

import { useCallback, useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { useAtlasClusterSelection } from "@/components/atlas-cluster-selection";
import {
  projectApiQuery,
  readStoredInventoryFiles,
  reconcileSelectedInventoryFiles,
  writeStoredInventoryFiles,
} from "@/components/hosts-groups/helpers";
import { InventoryTab } from "@/components/hosts-groups/inventory-tab";
import type { InvFile } from "@/components/hosts-groups/types";
import { stargateJson } from "@/lib/stargate";

export function InventoryPage({ projectId }: { projectId: string }) {
  const { clusterId } = useAtlasClusterSelection();
  const q = projectApiQuery(projectId, clusterId);
  const [files, setFiles] = useState<InvFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>(() =>
    readStoredInventoryFiles(projectId),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLists = useCallback(async () => {
    setBusy(true);
    try {
      const fileData = await stargateJson<{ files?: InvFile[] }>(
        `/inventory/list?${q}`,
      ).catch(() => ({ files: [] as InvFile[] }));
      const listed = fileData.files ?? [];
      setFiles(listed);
      setSelectedFiles((current) =>
        reconcileSelectedInventoryFiles(listed, current, projectId),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [projectId, q]);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  useEffect(() => {
    writeStoredInventoryFiles(projectId, selectedFiles);
  }, [projectId, selectedFiles]);

  if (error) {
    return <EmptyState title="Inventory unavailable" description={error} />;
  }

  return (
    <div>
      <PageHeader
        kicker="Infrastructure"
        title="Inventory"
        description="Inventory files for hosts and groups"
      />
      <InventoryTab
        projectId={projectId}
        files={files}
        selected={selectedFiles}
        onSelectedChange={setSelectedFiles}
        busy={busy}
        onRefresh={loadLists}
      />
    </div>
  );
}
