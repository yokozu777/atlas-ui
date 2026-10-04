import { projectApiQuery, withClusterId } from "@/components/hosts-groups/helpers";
import { stargateJson } from "@/lib/stargate";

export {
  hostTopologyChanges,
  type HostChangeGroup,
  type HostChangeLine,
} from "@/lib/host-topology-changes";

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
  fileMeta?: {
    modifiedAt?: string | null;
    createdAt?: string | null;
    editedBy?: string | null;
    absolutePath?: string | null;
  };
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
    fileMeta: data.fileMeta,
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
    fileMeta: data.fileMeta,
    groups: (data.groups ?? groups).map((group) => ({
      id: String(group.id),
      name: String(group.name || group.id),
      path: Array.isArray(group.path) ? group.path.map(String) : [String(group.id)],
      hosts: (group.hosts ?? []).map((host) => asHost(host)),
    })),
    cloneOptions: (data.cloneOptions ?? []).map(String).filter(Boolean),
  };
}

export type HostDomainCluster = {
  clusterId: string;
  changes: { from: string; to: string }[];
  skipped: string[];
  dnsFiles: string[];
};

export type HostDomainResult = {
  scope: "leaf" | "all";
  from: string;
  to: string;
  dryRun: boolean;
  clusters: HostDomainCluster[];
  topology?: HostsTopology;
};

export async function renameHostsDomain(
  projectId: string,
  clusterId: string,
  body: {
    from: string;
    to: string;
    scope: "leaf" | "all";
    dryRun?: boolean;
    groups?: HostGroup[];
  },
): Promise<HostDomainResult> {
  const data = await stargateJson<
    Partial<HostsTopology> & {
      scope?: string;
      from?: string;
      to?: string;
      dryRun?: boolean;
      clusters?: Partial<HostDomainCluster>[];
    }
  >(`/projects/${encodeURIComponent(projectId)}/atlas/hosts/domain`, {
    method: "POST",
    body: JSON.stringify(
      withClusterId(
        {
          from: body.from,
          to: body.to,
          scope: body.scope,
          dry_run: Boolean(body.dryRun),
          groups: body.groups,
        },
        clusterId,
      ),
    ),
  });
  const wroteHosts = body.scope === "all" && !body.dryRun && Array.isArray(data.groups);
  return {
    scope: data.scope === "all" ? "all" : "leaf",
    from: String(data.from || body.from),
    to: String(data.to || body.to),
    dryRun: Boolean(data.dryRun),
    clusters: (data.clusters ?? []).map((row) => ({
      clusterId: String(row.clusterId || ""),
      changes: (row.changes ?? []).map((change) => ({
        from: String(change.from || ""),
        to: String(change.to || ""),
      })),
      skipped: (row.skipped ?? []).map(String),
      dnsFiles: (row.dnsFiles ?? []).map(String),
    })),
    topology: wroteHosts
      ? {
          clusterId: String(data.clusterId || clusterId),
          file: String(data.file || "hosts"),
          fileMeta: data.fileMeta,
          groups: (data.groups ?? []).map((group) => ({
            id: String(group.id),
            name: String(group.name || group.id),
            path: Array.isArray(group.path) ? group.path.map(String) : [String(group.id)],
            hosts: (group.hosts ?? []).map((host) => asHost(host)),
          })),
          cloneOptions: (data.cloneOptions ?? []).map(String).filter(Boolean),
        }
      : undefined,
  };
}
