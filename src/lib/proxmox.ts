import { stargateJson } from "@/lib/stargate";

export type LibraryGitStatus = {
  success?: boolean;
  gitUrl?: string;
  dest?: string;
  libraryRoot?: string;
  exists?: boolean;
  isRepo?: boolean;
  configured?: boolean;
  version?: string;
  ref?: string;
  fetchedAt?: string | null;
  ignoreHostKey?: boolean;
  ok?: boolean;
  error?: string | null;
};

export type LibraryRefs = {
  success?: boolean;
  gitUrl?: string;
  refs?: string[];
  refDates?: Record<string, string>;
  ignoreHostKey?: boolean;
  error?: string;
};

export type Hypervisor = {
  id: string;
  name: string;
  host: string;
  port: number;
  apiUser: string;
  sshUser: string;
  hasPassword: boolean;
};

export type ProxmoxStorage = {
  id: string;
  type: string;
  content?: string[];
};

export type ProxmoxCatalog = {
  matched: boolean;
  host: string;
  hypervisorId: string | null;
  sshUser: string;
  nodes: string[];
  storages: ProxmoxStorage[];
  bridges: string[];
  inventoryGroups: string[];
  error: string | null;
};

export type ProxmoxVmid = {
  checked: boolean;
  free: boolean | null;
  vmid?: number;
  error: string | null;
};

export const DEFAULT_LIBRARY_GIT_URL =
  "https://github.com/yokozu777/atlas-proxmox-library.git";

export function fetchLibraryGit(): Promise<LibraryGitStatus> {
  return stargateJson<LibraryGitStatus>("/atlas/library");
}

export function listLibraryRefs(input: {
  url?: string;
  ignoreHostKey?: boolean;
}): Promise<LibraryRefs> {
  const params = new URLSearchParams();
  if (input.url) params.set("url", input.url);
  if (input.ignoreHostKey) params.set("ignoreHostKey", "true");
  const query = params.toString() ? `?${params.toString()}` : "";
  return stargateJson<LibraryRefs>(`/atlas/library/refs${query}`);
}

export function installLibraryGit(input: {
  url?: string;
  dest?: string;
  ref: string;
  ignoreHostKey?: boolean;
}): Promise<LibraryGitStatus> {
  return stargateJson<LibraryGitStatus>("/atlas/library/install", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function probeLibraryGit(input: {
  url?: string;
  dest?: string;
}): Promise<LibraryGitStatus> {
  return stargateJson<LibraryGitStatus>("/atlas/library/probe", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function saveLibraryIgnoreHostKey(ignoreHostKey: boolean): Promise<{
  success?: boolean;
  ignoreHostKey?: boolean;
}> {
  return stargateJson("/atlas/library/options", {
    method: "POST",
    body: JSON.stringify({ ignoreHostKey }),
  });
}

export async function listHypervisors(): Promise<Hypervisor[]> {
  const data = await stargateJson<{ hypervisors?: Hypervisor[] }>("/hypervisors");
  return data.hypervisors ?? [];
}

export function createHypervisor(input: {
  name: string;
  host: string;
  port: number;
  apiUser: string;
  sshUser: string;
  password: string;
}): Promise<{ hypervisor: Hypervisor }> {
  return stargateJson("/hypervisors", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateHypervisor(
  id: string,
  input: {
    name: string;
    host: string;
    port: number;
    apiUser: string;
    sshUser: string;
    password?: string;
  },
): Promise<{ hypervisor: Hypervisor }> {
  return stargateJson(`/hypervisors/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteHypervisor(id: string): Promise<{ ok: boolean }> {
  return stargateJson(`/hypervisors/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function testHypervisor(id: string): Promise<{ ok: boolean; nodes: string[] }> {
  return stargateJson(`/hypervisors/${encodeURIComponent(id)}/test`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function fetchProxmoxCatalog(input: {
  projectId: string;
  clusterId: string;
  host?: string;
  node?: string;
}): Promise<ProxmoxCatalog> {
  const params = new URLSearchParams();
  if (input.clusterId) params.set("cluster_id", input.clusterId);
  if (input.host) params.set("host", input.host);
  if (input.node) params.set("node", input.node);
  const query = params.toString() ? `?${params.toString()}` : "";
  return stargateJson<ProxmoxCatalog>(
    `/projects/${encodeURIComponent(input.projectId)}/proxmox/catalog${query}`,
  );
}

export function fetchProxmoxVmid(input: {
  projectId: string;
  clusterId: string;
  vmid: string;
  host?: string;
}): Promise<ProxmoxVmid> {
  const params = new URLSearchParams({ vmid: input.vmid });
  if (input.clusterId) params.set("cluster_id", input.clusterId);
  if (input.host) params.set("host", input.host);
  return stargateJson<ProxmoxVmid>(
    `/projects/${encodeURIComponent(input.projectId)}/proxmox/vmid?${params.toString()}`,
  );
}

export function createProxmoxToken(input: {
  projectId: string;
  clusterId: string;
  host?: string;
  password?: string;
  tokenId?: string;
}): Promise<{ tokenId: string; secret: string }> {
  return stargateJson(
    `/projects/${encodeURIComponent(input.projectId)}/proxmox/token`,
    {
      method: "POST",
      body: JSON.stringify({
        cluster_id: input.clusterId,
        host: input.host || "",
        password: input.password || "",
        tokenId: input.tokenId || "",
      }),
    },
  );
}
