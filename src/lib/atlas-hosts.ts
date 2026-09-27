import { projectApiQuery, withClusterId } from "@/components/hosts-groups/helpers";
import { stargateJson } from "@/lib/stargate";

export type HostDisk = {
  size: string;
  slot: number;
  storage: string;
  extra?: Record<string, unknown>;
};

export type HostTopology = {
  ip: string;
  hostname: string;
  vmid: string;
  sockets: number;
  cores: number;
  memory: number;
  numa: boolean;
  clone: string;
  disks: HostDisk[];
  extra?: Record<string, unknown>;
  provisionExtra?: Record<string, unknown>;
};

export type HostGroup = {
  id: string;
  name: string;
  path: string[];
  hosts: HostTopology[];
};

export type HostsTopology = {
  clusterId: string;
  file: string;
  groups: HostGroup[];
  cloneOptions: string[];
};

function asHost(row: Partial<HostTopology> & { ip?: string }): HostTopology {
  return {
    ip: String(row.ip ?? "").trim(),
    hostname: String(row.hostname ?? "").trim(),
    vmid: String(row.vmid ?? "").trim(),
    sockets: Number(row.sockets) || 1,
    cores: Number(row.cores) || 1,
    memory: Number(row.memory) || 1024,
    numa: Boolean(row.numa),
    clone: String(row.clone ?? "").trim(),
    disks: Array.isArray(row.disks)
      ? row.disks.map((disk) => ({
          size: String(disk.size ?? "").trim(),
          slot: Number(disk.slot) || 0,
          storage: String(disk.storage ?? "").trim(),
          extra: disk.extra,
        }))
      : [],
    extra: row.extra,
    provisionExtra: row.provisionExtra,
  };
}

export function blankHost(clone = ""): HostTopology {
  return {
    ip: "",
    hostname: "",
    vmid: "",
    sockets: 1,
    cores: 2,
    memory: 4096,
    numa: false,
    clone,
    disks: [{ size: "70", slot: 0, storage: "local-zfs" }],
  };
}

export function incrementIpv4(ip: string): string | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => Number(part));
  if (nums.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return null;
  }
  if (nums[3] >= 255) return null;
  nums[3] += 1;
  return nums.join(".");
}

export function incrementTrailingNumber(text: string): string {
  const match = /^(.*?)(\d+)(\D*)$/.exec(text);
  if (!match) return text;
  const next = String(Number(match[2]) + 1).padStart(match[2].length, "0");
  return `${match[1]}${next}${match[3]}`;
}

export function cloneNextHost(host: HostTopology): HostTopology {
  const ip = incrementIpv4(host.ip);
  return {
    ...host,
    ip: ip || "",
    hostname: incrementTrailingNumber(host.hostname) || host.hostname,
    vmid: host.vmid ? incrementTrailingNumber(host.vmid) : "",
    disks: host.disks.map((disk) => ({ ...disk })),
    extra: host.extra ? { ...host.extra } : undefined,
    provisionExtra: host.provisionExtra ? { ...host.provisionExtra } : undefined,
  };
}

export async function fetchHostsTopology(
  projectId: string,
  clusterId: string,
): Promise<HostsTopology> {
  const q = projectApiQuery(projectId, clusterId);
  const data = await stargateJson<Partial<HostsTopology> & { error?: string }>(
    `/projects/${encodeURIComponent(projectId)}/atlas/hosts?${q}`,
  );
  return {
    clusterId: String(data.clusterId || clusterId),
    file: String(data.file || "hosts"),
    groups: (data.groups ?? []).map((group) => ({
      id: String(group.id),
      name: String(group.name || group.id),
      path: Array.isArray(group.path) ? group.path.map(String) : [String(group.id)],
      hosts: (group.hosts ?? []).map((host) => asHost(host)),
    })),
    cloneOptions: (data.cloneOptions ?? []).map(String).filter(Boolean),
  };
}

export async function saveHostsTopology(
  projectId: string,
  clusterId: string,
  groups: HostGroup[],
): Promise<HostsTopology> {
  const data = await stargateJson<Partial<HostsTopology>>(
    `/projects/${encodeURIComponent(projectId)}/atlas/hosts`,
    {
      method: "PUT",
      body: JSON.stringify(withClusterId({ groups }, clusterId)),
    },
  );
  return {
    clusterId: String(data.clusterId || clusterId),
    file: String(data.file || "hosts"),
    groups: (data.groups ?? groups).map((group) => ({
      id: String(group.id),
      name: String(group.name || group.id),
      path: Array.isArray(group.path) ? group.path.map(String) : [String(group.id)],
      hosts: (group.hosts ?? []).map((host) => asHost(host)),
    })),
    cloneOptions: (data.cloneOptions ?? []).map(String).filter(Boolean),
  };
}
