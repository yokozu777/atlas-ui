"use client";

import { use, useEffect, useMemo, useState } from "react";

import { useAtlasClusterSelection } from "@/components/atlas-cluster-selection";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { YamlEditor } from "@/components/yaml-editor";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { projectApiQuery } from "@/components/hosts-groups/helpers";
import { stargateJson } from "@/lib/stargate";

type PreviewPayload = {
  group_vars?: Record<string, string>;
  host_vars?: Record<string, string>;
};

export default function InventoryPreviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const projectId = decodeURIComponent(use(params).projectId);
  const { clusterId } = useAtlasClusterSelection();
  const [data, setData] = useState<PreviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("group");
  const [groupKey, setGroupKey] = useState("");
  const [hostKey, setHostKey] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const payload = await stargateJson<PreviewPayload>(
        `/inventory/preview?${projectApiQuery(projectId, clusterId)}`,
      );
      setData(payload);
      const groups = Object.keys(payload.group_vars ?? {});
      const hosts = Object.keys(payload.host_vars ?? {});
      setGroupKey((current) =>
        current && groups.includes(current) ? current : (groups[0] ?? ""),
      );
      setHostKey((current) =>
        current && hosts.includes(current) ? current : (hosts[0] ?? ""),
      );
      setError(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [projectId, clusterId]);

  const groupKeys = useMemo(
    () => Object.keys(data?.group_vars ?? {}),
    [data],
  );
  const hostKeys = useMemo(() => Object.keys(data?.host_vars ?? {}), [data]);

  if (error) {
    return <EmptyState title="Preview unavailable" description={error} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Project"
        title="Preview"
        description="Read-only group_vars and host_vars from repo/inventories."
        actions={
          <Button variant="outline" disabled={busy} onClick={() => void load()}>
            Refresh
          </Button>
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="group">Group Vars</TabsTrigger>
          <TabsTrigger value="host">Host Vars</TabsTrigger>
        </TabsList>
        <TabsContent value="group" className="mt-4 space-y-4">
          <PreviewBody
            keys={groupKeys}
            selected={groupKey}
            onSelect={setGroupKey}
            yaml={data?.group_vars?.[groupKey] ?? ""}
            emptyTitle="No group_vars"
            emptyDescription="Add YAML files under repo/inventories/group_vars."
          />
        </TabsContent>
        <TabsContent value="host" className="mt-4 space-y-4">
          <PreviewBody
            keys={hostKeys}
            selected={hostKey}
            onSelect={setHostKey}
            yaml={data?.host_vars?.[hostKey] ?? ""}
            emptyTitle="No host_vars"
            emptyDescription="Add YAML files under repo/inventories/host_vars."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PreviewBody({
  keys,
  selected,
  onSelect,
  yaml,
  emptyTitle,
  emptyDescription,
}: {
  keys: string[];
  selected: string;
  onSelect: (value: string) => void;
  yaml: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (keys.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <>
      <Select
        value={selected || null}
        onValueChange={(value) => {
          if (value) onSelect(value);
        }}
      >
        <SelectTrigger className="max-w-sm" aria-label="Select vars file">
          <SelectValue placeholder="Select vars file" />
        </SelectTrigger>
        <SelectContent>
          {keys.map((key) => (
            <SelectItem key={key} value={key}>
              {key}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <YamlEditor value={yaml} onChange={() => undefined} readOnly />
    </>
  );
}
