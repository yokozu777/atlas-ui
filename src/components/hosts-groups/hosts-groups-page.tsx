"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderTree, Server } from "lucide-react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { AddGroupDialog } from "@/components/hosts-groups/add-group-dialog";
import { AddHostDialog } from "@/components/hosts-groups/add-host-dialog";
import { AssignGroupDialog } from "@/components/hosts-groups/assign-group-dialog";
import { ConnectionDialog } from "@/components/hosts-groups/connection-dialog";
import { EditHostsDialog } from "@/components/hosts-groups/edit-hosts-dialog";
import { GroupsTab } from "@/components/hosts-groups/groups-tab";
import { useAtlasClusterSelection } from "@/components/atlas-cluster-selection";
import {
  inventoryFilesQuery,
  inventoryKey,
  invertHostGroups,
  projectApiQuery,
  readStoredInventoryFiles,
  reconcileSelectedInventoryFiles,
  writeStoredInventoryFiles,
} from "@/components/hosts-groups/helpers";
import { HostsTab, buildHostRows, type HostTableRow } from "@/components/hosts-groups/hosts-tab";
import type {
  CfgFile,
  GroupInfo,
  HostsGroupsTab,
  HostStatus,
  InvFile,
  SecretRow,
} from "@/components/hosts-groups/types";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useExecutionStream } from "@/hooks/use-execution-stream";
import { projectHref } from "@/lib/project-href";
import { fetchProject, stargateJson } from "@/lib/stargate";
import type { StargateProject } from "@/lib/project-types";

const LEGACY_TABS: Record<string, string> = {
  vars: "/vars",
  inventory: "/inventory",
  ansible_config: "/ansible-config",
};

function parseTab(value: string | null): HostsGroupsTab {
  return value === "groups" ? "groups" : "hosts";
}

export function HostsGroupsPage({ projectId }: { projectId: string }) {
  const { clusterId } = useAtlasClusterSelection();
  const q = projectApiQuery(projectId, clusterId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const legacyDest = LEGACY_TABS[searchParams.get("tab") ?? ""];
  const tab = parseTab(searchParams.get("tab"));
  const [project, setProject] = useState<StargateProject | null>(null);
  const [files, setFiles] = useState<InvFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>(() =>
    readStoredInventoryFiles(projectId),
  );
  const [hosts, setHosts] = useState<string[]>([]);
  const [groups, setGroups] = useState<Record<string, GroupInfo>>({});
  const [secrets, setSecrets] = useState<SecretRow[]>([]);
  const [ansibleConfig, setAnsibleConfig] = useState("ansible-config/ansible.cfg");
  const [hostVars, setHostVars] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<Record<string, HostStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hostSearch, setHostSearch] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [selectedHosts, setSelectedHosts] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [addHostOpen, setAddHostOpen] = useState(false);
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [assignHost, setAssignHost] = useState<string | null>(null);
  const [connectionHost, setConnectionHost] = useState<HostTableRow | null>(null);
  const [editGroup, setEditGroup] = useState<string | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<string | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [checkingHost, setCheckingHost] = useState<string | null>(null);
  const [logHost, setLogHost] = useState<string | null>(null);
  const { text, running } = useExecutionStream(projectId, executionId);

  const fileParam = selectedFiles[0] || inventoryKey(files[0] ?? {}) || "inventory.yml";
  const extra = inventoryFilesQuery(selectedFiles);

  useEffect(() => {
    if (!legacyDest) return;
    router.replace(projectHref(projectId, legacyDest));
  }, [legacyDest, projectId, router]);

  const loadLists = useCallback(async () => {
    const [fileData, secretData, cfg] = await Promise.all([
      stargateJson<{ files?: InvFile[] }>(`/inventory/list?${q}`).catch(() => ({
        files: [] as InvFile[],
      })),
      stargateJson<{ secrets?: SecretRow[] }>(`/secrets?${q}`).catch(() => ({
        secrets: [] as SecretRow[],
      })),
      stargateJson<{ selected_config?: string; files?: CfgFile[] }>(
        `/ansible_config/list?${q}`,
      ).catch(() => ({
        selected_config: "ansible-config/ansible.cfg",
        files: [] as CfgFile[],
      })),
    ]);
    const listed = fileData.files ?? [];
    setFiles(listed);
    setSecrets((secretData.secrets ?? []).filter((row) => row.name));
    if (cfg.selected_config) setAnsibleConfig(cfg.selected_config);
    setSelectedFiles((current) =>
      reconcileSelectedInventoryFiles(listed, current, projectId),
    );
  }, [projectId, q]);

  const loadInventory = useCallback(async () => {
    const [hostData, groupData, preview, statusData] = await Promise.all([
      stargateJson<{ hosts?: string[] }>(`/inventory/hosts?${q}${extra}`),
      stargateJson<{ groups?: Record<string, GroupInfo> }>(
        `/inventory/groups?${q}${extra}`,
      ).catch(() => ({ groups: {} })),
      stargateJson<{ host_vars?: Record<string, string> }>(`/inventory/preview?${q}`).catch(
        () => ({ host_vars: {} }),
      ),
      stargateJson<{ hosts?: Record<string, HostStatus> }>(
        `/inventory/host-status?${q}`,
      ).catch(() => ({ hosts: {} })),
    ]);
    const names = (hostData.hosts ?? []).map((host) =>
      typeof host === "string" ? host : String(host),
    );
    setHosts(names);
    setGroups(groupData.groups ?? {});
    setHostVars(preview.host_vars ?? {});
    setStatuses(statusData.hosts ?? {});
  }, [q, extra]);

  useEffect(() => {
    void fetchProject(projectId)
      .then(setProject)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, [projectId]);

  useEffect(() => {
    void loadLists().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [loadLists]);

  useEffect(() => {
    void loadInventory().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [loadInventory]);

  useEffect(() => {
    writeStoredInventoryFiles(projectId, selectedFiles);
  }, [projectId, selectedFiles]);

  const groupNames = useMemo(() => {
    const names = Object.keys(groups);
    return names.includes("all") ? names : ["all", ...names];
  }, [groups]);

  const hostRows = useMemo(
    () =>
      buildHostRows(
        hosts,
        invertHostGroups(groups),
        fileParam,
        hostVars,
        statuses,
      ),
    [hosts, groups, fileParam, hostVars, statuses],
  );

  function setTab(next: string) {
    const parsed = parseTab(next);
    const href =
      parsed === "hosts"
        ? projectHref(projectId, "/hosts")
        : projectHref(projectId, "/hosts?tab=groups");
    router.replace(href, { scroll: false });
  }

  async function queueHost(path: string, host: string, body: Record<string, unknown>) {
    setCheckingHost(host);
    setLogHost(host);
    try {
      const data = await stargateJson<{ executionId?: string }>(path, {
        method: "POST",
        body: JSON.stringify({
          host,
          project_id: projectId,
          cluster_id: clusterId || undefined,
          ansible_config: ansibleConfig,
          inventory_files: selectedFiles.length ? selectedFiles : [fileParam],
          ...body,
        }),
      });
      if (!data.executionId) throw new Error("Did not return executionId");
      setExecutionId(data.executionId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setCheckingHost(null);
    }
  }

  async function checkHost(host: string) {
    await queueHost("/check_host", host, {});
  }

  async function factsHost(host: string) {
    await queueHost(`/hosts/${encodeURIComponent(host)}/facts`, host, {});
  }

  async function checkAll() {
    const targets = selectedHosts.length ? selectedHosts : hosts;
    if (!targets.length) {
      toast.error("No hosts to check");
      return;
    }
    setBusy(true);
    try {
      for (const host of targets) {
        await checkHost(host);
      }
      toast.success(`Queued ${targets.length} host check${targets.length === 1 ? "" : "s"}`);
    } finally {
      setBusy(false);
    }
  }

  async function removeGroup(name: string) {
    await stargateJson(
      `/inventory/groups/${encodeURIComponent(name)}?${q}&inventory_file=${encodeURIComponent(fileParam)}`,
      { method: "DELETE" },
    );
    toast.success(`Group ${name} deleted`);
    await loadInventory();
  }

  if (legacyDest) {
    return <EmptyState title="Redirecting" />;
  }

  if (error) {
    return <EmptyState title="Hosts unavailable" description={error} />;
  }

  return (
    <div>
      <PageHeader
        kicker="Infrastructure"
        title="Hosts & Groups"
        description={
          <div className="space-y-3">
            <p>Inventory management: hosts, groups and their attributes</p>
            {project ? (
              <Badge variant="success">Project: {project.name}</Badge>
            ) : null}
          </div>
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line">
          <TabsTrigger value="hosts">
            <Server />
            Hosts
          </TabsTrigger>
          <TabsTrigger value="groups">
            <FolderTree />
            Groups
          </TabsTrigger>
        </TabsList>
        <TabsContent value="hosts" className="mt-6">
          <HostsTab
            rows={hostRows}
            selected={selectedHosts}
            onSelectedChange={setSelectedHosts}
            search={hostSearch}
            onSearchChange={setHostSearch}
            onAddHost={() => setAddHostOpen(true)}
            onCheckAll={() => void checkAll()}
            onCheck={(host) => void checkHost(host)}
            onFacts={(host) => void factsHost(host)}
            onAssign={setAssignHost}
            onConnection={setConnectionHost}
            busy={busy}
            running={running}
            checkingHost={checkingHost}
            executionId={executionId}
            logText={text}
            logRunning={running}
            logHost={logHost}
          />
        </TabsContent>
        <TabsContent value="groups" className="mt-6">
          <GroupsTab
            groups={groups}
            inventoryFile={fileParam}
            search={groupSearch}
            onSearchChange={setGroupSearch}
            selected={selectedGroups}
            onSelectedChange={setSelectedGroups}
            onAddGroup={() => setAddGroupOpen(true)}
            onEditHosts={setEditGroup}
            onDelete={setDeleteGroup}
          />
        </TabsContent>
      </Tabs>
      <AddHostDialog
        projectId={projectId}
        open={addHostOpen}
        onOpenChange={setAddHostOpen}
        groups={groupNames}
        files={files}
        inventoryFile={fileParam}
        onAdded={loadInventory}
      />
      <AddGroupDialog
        projectId={projectId}
        open={addGroupOpen}
        onOpenChange={setAddGroupOpen}
        files={files}
        inventoryFile={fileParam}
        onAdded={loadInventory}
      />
      <AssignGroupDialog
        projectId={projectId}
        open={Boolean(assignHost)}
        onOpenChange={(open) => {
          if (!open) setAssignHost(null);
        }}
        host={assignHost || ""}
        groups={groupNames}
        inventoryFile={fileParam}
        onAssigned={loadInventory}
      />
      <ConnectionDialog
        projectId={projectId}
        open={Boolean(connectionHost)}
        onOpenChange={(open) => {
          if (!open) setConnectionHost(null);
        }}
        host={connectionHost?.name || ""}
        secrets={secrets}
        inventoryFile={fileParam}
        initialSecret={connectionHost?.connectionSecret}
        initialUser={connectionHost?.ansibleUser}
        initialPort={connectionHost?.ansiblePort}
        onSaved={loadInventory}
      />
      <EditHostsDialog
        projectId={projectId}
        open={Boolean(editGroup)}
        onOpenChange={(open) => {
          if (!open) setEditGroup(null);
        }}
        group={editGroup || ""}
        hosts={hosts}
        selected={editGroup ? groups[editGroup]?.hosts ?? [] : []}
        inventoryFile={fileParam}
        onSaved={loadInventory}
      />
      <ConfirmAction
        open={Boolean(deleteGroup)}
        onOpenChange={(open) => {
          if (!open) setDeleteGroup(null);
        }}
        title="Delete this group?"
        description={deleteGroup || ""}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteGroup) void removeGroup(deleteGroup);
        }}
      />
    </div>
  );
}
