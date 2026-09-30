import type { HostDisk, HostGroup, HostTopology } from "./atlas-hosts";

export type HostChangeLine = {
  id: string;
  label: string;
  from: string;
  to: string;
  note?: "added" | "removed";
};

export type HostChangeGroup = {
  id: string;
  title: string;
  lines: HostChangeLine[];
};

const HOST_FIELDS: { key: keyof HostTopology; label: string }[] = [
  { key: "ip", label: "IP" },
  { key: "hostname", label: "Hostname" },
  { key: "vmid", label: "VMID" },
  { key: "sockets", label: "Sockets" },
  { key: "cores", label: "Cores" },
  { key: "memory", label: "Memory" },
  { key: "clone", label: "Clone" },
  { key: "numa", label: "NUMA" },
];

function hostName(host: HostTopology | undefined, index: number): string {
  const name = host?.hostname?.trim() || host?.ip?.trim();
  return name || `Host ${index + 1}`;
}

function showValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "on" : "off";
  if (value == null || value === "") return "empty";
  return String(value);
}

function pushField(
  lines: HostChangeLine[],
  id: string,
  label: string,
  before: unknown,
  after: unknown,
) {
  const from = showValue(before);
  const to = showValue(after);
  if (from === to) return;
  lines.push({ id, label, from, to });
}

function diskLines(
  hostId: string,
  name: string,
  before: HostDisk[],
  after: HostDisk[],
): HostChangeLine[] {
  const lines: HostChangeLine[] = [];
  const count = Math.max(before.length, after.length);
  for (let index = 0; index < count; index += 1) {
    const left = before[index];
    const right = after[index];
    const label = `${name} · Disk ${index + 1}`;
    const id = `${hostId}:disk:${index}`;
    if (!left) {
      lines.push({ id, label, from: "", to: "", note: "added" });
      continue;
    }
    if (!right) {
      lines.push({ id, label, from: "", to: "", note: "removed" });
      continue;
    }
    pushField(lines, `${id}:size`, `${label} size`, left.size, right.size);
    pushField(lines, `${id}:slot`, `${label} slot`, left.slot, right.slot);
    pushField(lines, `${id}:storage`, `${label} storage`, left.storage, right.storage);
  }
  return lines;
}

function hostLines(
  groupId: string,
  index: number,
  before: HostTopology | undefined,
  after: HostTopology | undefined,
): HostChangeLine[] {
  const id = `${groupId}:host:${index}`;
  if (!before && after) {
    return [
      {
        id,
        label: hostName(after, index),
        from: "",
        to: "",
        note: "added",
      },
    ];
  }
  if (before && !after) {
    return [
      {
        id,
        label: hostName(before, index),
        from: "",
        to: "",
        note: "removed",
      },
    ];
  }
  if (!before || !after) return [];
  const name = hostName(after, index);
  const lines: HostChangeLine[] = [];
  for (const field of HOST_FIELDS) {
    pushField(
      lines,
      `${id}:${field.key}`,
      `${name} · ${field.label}`,
      before[field.key],
      after[field.key],
    );
  }
  lines.push(...diskLines(id, name, before.disks, after.disks));
  return lines;
}

export function hostTopologyChanges(
  before: HostGroup[],
  after: HostGroup[],
): HostChangeGroup[] {
  const beforeById = new Map(before.map((group) => [group.id, group]));
  const seen = new Set<string>();
  const order = [...before, ...after].filter((group) => {
    if (seen.has(group.id)) return false;
    seen.add(group.id);
    return true;
  });
  const groups: HostChangeGroup[] = [];
  for (const stub of order) {
    const left = beforeById.get(stub.id);
    const right = after.find((group) => group.id === stub.id);
    const hosts = Math.max(left?.hosts.length ?? 0, right?.hosts.length ?? 0);
    const lines: HostChangeLine[] = [];
    for (let index = 0; index < hosts; index += 1) {
      lines.push(
        ...hostLines(stub.id, index, left?.hosts[index], right?.hosts[index]),
      );
    }
    if (lines.length === 0) continue;
    groups.push({
      id: stub.id,
      title: right?.name || left?.name || stub.id,
      lines,
    });
  }
  return groups;
}
