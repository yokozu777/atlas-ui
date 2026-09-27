"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Folder, FolderTree, LayoutGrid, Server } from "lucide-react";
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
import { HostFactsDialog } from "@/components/hosts-groups/host-facts-dialog";
import { FleetTab } from "@/components/hosts-groups/fleet-tab";
import { HostsTab, buildHostRows, type HostTableRow } from "@/components/hosts-groups/hosts-tab";
import { InventoryTab } from "@/components/hosts-groups/inventory-tab";
import { VarsTab } from "@/components/hosts-groups/vars-tab";
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
import { fetchClusterctlSsh, type ClusterctlSshInfo } from "@/lib/clusterctl-ssh";
import { notifyExecution } from "@/lib/notification-inbox";
import { projectHref } from "@/lib/project-href";
import { fetchProject, stargateJson } from "@/lib/stargate";
import type { ProjectKind, StargateProject } from "@/lib/project-types";

const LEGACY_TABS: Record<string, string> = {
  vars: "/vars",
  inventory: "/inventory",
  ansible_config: "/ansible-config",
};

function parseTab(value: string | null): HostsGroupsTab {
  if (value === "fleet") return "fleet";
  if (value === "groups") return "groups";
  if (value === "files" || value === "inventory") return "files";
  if (value === "vars") return "vars";
  return "hosts";
}

export function HostsGroupsPage({
  projectId,
  kind: kindProp,
}: {
  projectId: string;
  kind?: ProjectKind;
}) {
  const { clusterId } = useAtlasClusterSelection();
  const q = projectApiQuery(projectId, clusterId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const [project, setProject] = useState<StargateProject | null>(null);
  const kind = project?.kind ?? kindProp;
  const ansible = kind === "ansible";
  const atlas = kind === "atlas";
  const legacyDest = ansible ? LEGACY_TABS[rawTab ?? ""] : undefined;
  const tab = parseTab(rawTab);
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
  const [atlasSsh, setAtlasSsh] = useState<ClusterctlSshInfo | null>(null);
  const probeRef = useRef<{
    host: string;
    kind: "check";
    executionId: string;
  } | null>(null);
  const running = Boolean(checkingHost);
  const [factsHost, setFactsHost] = useState<string | null>(null);
  const [fleetReload, setFleetReload] = useState(0);

  const fileParam = selectedFiles[0] || inventoryKey(files[0] ?? {}) || "inventory.yml";
  const extra = inventoryFilesQuery(selectedFiles);

  useEffect(() => {
    if (!legacyDest) return;
    router.replace(projectHref(projectId, legacyDest));
  }, [legacyDest, projectId, router]);

  useEffect(() => {
    if (!atlas || rawTab !== "ansible_config") return;
    router.replace(projectHref(projectId, "/ansible-config"));
  }, [atlas, rawTab, projectId, router]);

  const loadLists = useCallback(async () => {
    const [fileData, secretData, cfg, ssh] = await Promise.all([
      stargateJson<{ files?: InvFile[] }>(`/inventory/list?${q}`),
      stargateJson<{ secrets?: SecretRow[] }>(`/secrets?${q}`),
      stargateJson<{ selected_config?: string; files?: CfgFile[] }>(
        `/ansible_config/list?${q}`,
      ),
      atlas ? fetchClusterctlSsh() : Promise.resolve(null),
    ]);
    const listed = fileData.files ?? [];
    setFiles(listed);
    setSecrets((secretData.secrets ?? []).filter((row) => row.name));
    setAtlasSsh(ssh);
    if (cfg.selected_config) setAnsibleConfig(cfg.selected_config);
    setSelectedFiles((current) =>
      reconcileSelectedInventoryFiles(listed, current, projectId),
    );
  }, [projectId, q, atlas]);

  const loadHostStatuses = useCallback(async () => {
    const statusData = await stargateJson<{ hosts?: Record<string, HostStatus> }>(
      `/inventory/host-status?${q}`,
    );
    const hostsMap = statusData.hosts ?? {};
    setStatuses(hostsMap);
    return hostsMap;
  }, [q]);

  const loadInventory = useCallback(async () => {
    const [hostData, groupData, preview, statusData] = await Promise.all([
      stargateJson<{ hosts?: string[] }>(`/inventory/hosts?${q}${extra}`),
      stargateJson<{ groups?: Record<string, GroupInfo> }>(
        `/inventory/groups?${q}${extra}`,
      ),
      stargateJson<{ host_vars?: Record<string, string> }>(`/inventory/preview?${q}`),
      stargateJson<{ hosts?: Record<string, HostStatus> }>(
        `/inventory/host-status?${q}`,
      ),
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

  useEffect(() => {
    if (!executionId) return;
    let cancelled = false;
    void (async () => {
      for (let i = 0; i < 90; i += 1) {
        if (cancelled) return;
        const data = await stargateJson<{ execution?: { status?: string } }>(
          `/executions/${encodeURIComponent(executionId)}?project_id=${encodeURIComponent(projectId)}`,
        ).catch(() => ({ execution: undefined }));
        const status = String(data.execution?.status || "").toUpperCase();
        if (
          status &&
          !["QUEUED", "RUNNING", "CANCELING", "CANCELLING"].includes(status)
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      if (cancelled) return;
      let hostsMap: Record<string, HostStatus> = {};
      for (const delay of [0, 400, 1000, 2000]) {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        if (cancelled) return;
        try {
          hostsMap = await loadHostStatuses();
        } catch (err: unknown) {
          toast.error(err instanceof Error ? err.message : String(err));
          break;
        }
        const probe = probeRef.current;
        const hostStatus = (probe?.host ? hostsMap[probe.host]?.status : "") || "";
        if (
          probe?.kind !== "check" ||
          (hostStatus && hostStatus !== "unknown" && hostStatus !== "checking")
        ) {
          break;
        }
      }
      if (cancelled) return;
      const probe = probeRef.current;
      if (probe?.kind === "check" && probe.host) {
        const status = (hostsMap[probe.host]?.status || "unknown").toLowerCase();
        if (status === "online" || status === "ok") {
          toast.success(`${probe.host} is online`);
        } else if (status === "offline" || status === "fail" || status === "failed") {
          toast.error(`${probe.host} is offline`);
        }
      }
      if (probeRef.current?.executionId === executionId) {
        probeRef.current = null;
        setCheckingHost(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [executionId, projectId, loadHostStatuses]);

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
        : projectHref(projectId, `/hosts?tab=${parsed}`);
    router.replace(href, { scroll: false });
  }

  async function queueHost(path: string, host: string, body: Record<string, unknown>) {
    setCheckingHost(host);
    setStatuses((current) => ({
      ...current,
      [host]: {
        status: "checking",
        last_checked_at: current[host]?.last_checked_at,
      },
    }));
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
      probeRef.current = { host, kind: "check", executionId: data.executionId };
      setExecutionId(data.executionId);
      notifyExecution("info", `Checking ${host}`, projectId, data.executionId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      probeRef.current = null;
      setCheckingHost(null);
      await loadHostStatuses().catch(() => undefined);
    }
  }

  async function checkHost(host: string) {
    await queueHost("/check_host", host, {});
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

  if (legacyDest || (atlas && rawTab === "ansible_config")) {
    return <EmptyState title="Redirecting" />;
  }

  if (error) {
    return <EmptyState title="Hosts unavailable" description={error} />;
  }

  const extras = atlas;

  return (
    <div>
      <PageHeader
        kicker={extras ? "Project" : "Infrastructure"}
        title={extras ? "Inventory" : "Hosts & Groups"}
        description={
          <div className="space-y-3">
            <p>
              {extras
                ? "Hosts, groups, inventory files, and variables for this cluster"
                : "Inventory management: hosts, groups and their attributes"}
            </p>
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
          <TabsTrigger value="fleet">
            <LayoutGrid />
            Fleet
          </TabsTrigger>
          <TabsTrigger value="groups">
            <FolderTree />
            Groups
          </TabsTrigger>
          {extras ? (
            <TabsTrigger value="files">
              <Folder />
              Files
            </TabsTrigger>
          ) : null}
          {extras ? (
            <TabsTrigger value="vars">
              Vars
            </TabsTrigger>
          ) : null}
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
            onFacts={setFactsHost}
            onAssign={setAssignHost}
            onConnection={setConnectionHost}
            busy={busy}
            running={running}
            checkingHost={checkingHost}
            atlasSsh={atlas ? atlasSsh : null}
          />
        </TabsContent>
        <TabsContent value="fleet" className="mt-6">
          <FleetTab
            projectId={projectId}
            clusterId={clusterId}
            rows={hostRows}
            onFacts={setFactsHost}
            onCheck={(host) => void checkHost(host)}
            busy={busy}
            running={running}
            checkingHost={checkingHost}
            atlasSsh={atlas ? atlasSsh : null}
            ansibleConfig={ansibleConfig}
            inventoryFiles={selectedFiles.length ? selectedFiles : [fileParam]}
            reloadToken={fleetReload}
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
            atlasSsh={atlas ? atlasSsh : null}
          />
        </TabsContent>
        {extras ? (
          <TabsContent value="files" className="mt-6">
            <InventoryTab
              projectId={projectId}
              files={files}
              selected={selectedFiles}
              onSelectedChange={setSelectedFiles}
              busy={busy}
              onRefresh={() => void loadLists()}
            />
          </TabsContent>
        ) : null}
        {extras ? (
          <TabsContent value="vars" className="mt-6">
            <VarsTab projectId={projectId} />
          </TabsContent>
        ) : null}
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
        atlasSshName={atlas ? atlasSsh?.name : null}
        onSaved={loadInventory}
        onSecretsChange={loadLists}
      />
      <HostFactsDialog
        projectId={projectId}
        host={factsHost || ""}
        open={Boolean(factsHost)}
        onOpenChange={(open) => {
          if (!open) {
            setFactsHost(null);
            setFleetReload((value) => value + 1);
          }
        }}
        ansibleConfig={ansibleConfig}
        inventoryFiles={selectedFiles.length ? selectedFiles : [fileParam]}
        clusterId={clusterId}
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
