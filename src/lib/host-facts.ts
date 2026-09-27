export type HostFactsMap = Record<string, unknown>;

export type HostFactsSummary = {
  hostname: string | null;
  fqdn: string | null;
  os: string | null;
  kernel: string | null;
  arch: string | null;
  cpu: string | null;
  vcpus: number | null;
  memory: string | null;
  ipv4: string | null;
  iface: string | null;
  virt: string | null;
  python: string | null;
  uptime: string | null;
};

export type FactGroupId = "system" | "hardware" | "network" | "storage" | "other";

export type FlatFact = {
  path: string;
  label: string;
  value: string;
  group: FactGroupId;
};

const HARDWARE_KEYS = new Set([
  "architecture",
  "bios_date",
  "bios_vendor",
  "bios_version",
  "board_asset_tag",
  "board_name",
  "board_serial",
  "board_vendor",
  "board_version",
  "chassis_asset_tag",
  "chassis_serial",
  "chassis_vendor",
  "chassis_version",
  "form_factor",
  "loadavg",
  "machine",
  "memfree_mb",
  "memory_mb",
  "memtotal_mb",
  "processor",
  "processor_cores",
  "processor_count",
  "processor_nproc",
  "processor_threads_per_core",
  "processor_vcpus",
  "product_name",
  "product_serial",
  "product_uuid",
  "product_version",
  "swapfree_mb",
  "swaptotal_mb",
  "system_vendor",
  "userspace_architecture",
  "userspace_bits",
]);

const NETWORK_KEYS = new Set([
  "all_ipv4_addresses",
  "all_ipv6_addresses",
  "default_ipv4",
  "default_ipv6",
  "dns",
  "interfaces",
  "locally_reachable_ips",
]);

const STORAGE_KEYS = new Set(["device_links", "devices", "lvm", "mounts"]);

const OTHER_KEYS = new Set([
  "fibre_channel_wwn",
  "gather_subset",
  "hostnqn",
  "iscsi_iqn",
  "local",
  "module_setup",
]);

const INTERFACE_RE =
  /^(eth|ens|enp|eno|enx|wlan|wlp|wlx|br|bond|team|tun|tap|wg|vtnet|em|igb|ix|lo)\d*$/i;

export function factGroup(path: string): FactGroupId {
  const key = path.replace(/^ansible_/, "").split(".")[0]?.split("[")[0] || path;
  const lower = key.toLowerCase();
  if (STORAGE_KEYS.has(lower)) return "storage";
  if (HARDWARE_KEYS.has(lower)) return "hardware";
  if (
    NETWORK_KEYS.has(lower) ||
    INTERFACE_RE.test(lower) ||
    lower.startsWith("ssh_host_key")
  ) {
    return "network";
  }
  if (OTHER_KEYS.has(lower)) return "other";
  return "system";
}

export function groupFactRows(
  rows: FlatFact[],
): Record<FactGroupId, FlatFact[]> {
  const grouped: Record<FactGroupId, FlatFact[]> = {
    system: [],
    hardware: [],
    network: [],
    storage: [],
    other: [],
  };
  for (const row of rows) {
    grouped[row.group].push(row);
  }
  return grouped;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function looksLikeFacts(value: Record<string, unknown>): boolean {
  return Boolean(
    value.ansible_hostname ||
      value.ansible_distribution ||
      value.ansible_os_family ||
      value.ansible_fqdn ||
      value.ansible_kernel,
  );
}

function unwrapFacts(value: unknown): HostFactsMap | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (row.ansible_facts && typeof row.ansible_facts === "object" && !Array.isArray(row.ansible_facts)) {
    return row.ansible_facts as HostFactsMap;
  }
  if (looksLikeFacts(row) || Object.keys(row).some((key) => key.startsWith("ansible_"))) {
    return row;
  }
  return null;
}

export function extractFactsFromResult(result: unknown): HostFactsMap | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return null;
  }
  const row = result as Record<string, unknown>;
  return unwrapFacts(row.facts) ?? unwrapFacts(row);
}

export function factsErrorFromResult(result: unknown): string | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return null;
  }
  const row = result as Record<string, unknown>;
  if (extractFactsFromResult(result)) {
    return null;
  }
  for (const key of ["error", "message", "msg"] as const) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function nested(facts: HostFactsMap, path: string): unknown {
  let current: unknown = facts;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function formatMemoryMb(mb: unknown): string | null {
  if (typeof mb !== "number" || !Number.isFinite(mb) || mb < 0) {
    return null;
  }
  if (mb >= 1024) {
    const gib = mb / 1024;
    return `${gib >= 10 ? gib.toFixed(0) : gib.toFixed(1)} GiB`;
  }
  return `${Math.round(mb)} MiB`;
}

export function formatUptime(seconds: unknown): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  const total = Math.floor(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${total}s`;
}

export function cpuModel(facts: HostFactsMap): string | null {
  const processor = facts.ansible_processor;
  if (Array.isArray(processor)) {
    const model = processor.find(
      (item) =>
        typeof item === "string" &&
        /[A-Za-z]{3,}/.test(item) &&
        !/^(GenuineIntel|AuthenticAMD|\d+)$/.test(item),
    );
    if (typeof model === "string") return model;
  }
  return asString(processor);
}

export function summarizeHostFacts(facts: HostFactsMap): HostFactsSummary {
  const dist = asString(facts.ansible_distribution);
  const version = asString(facts.ansible_distribution_version);
  const ipv4 = nested(facts, "ansible_default_ipv4");
  const ipv4obj =
    ipv4 && typeof ipv4 === "object" && !Array.isArray(ipv4)
      ? (ipv4 as Record<string, unknown>)
      : null;
  const virtType = asString(facts.ansible_virtualization_type);
  const virtRole = asString(facts.ansible_virtualization_role);
  const vcpus =
    typeof facts.ansible_processor_vcpus === "number"
      ? facts.ansible_processor_vcpus
      : null;
  return {
    hostname: asString(facts.ansible_hostname),
    fqdn: asString(facts.ansible_fqdn),
    os: dist && version ? `${dist} ${version}` : dist || asString(facts.ansible_os_family),
    kernel: asString(facts.ansible_kernel),
    arch: asString(facts.ansible_architecture),
    cpu: cpuModel(facts),
    vcpus,
    memory: formatMemoryMb(facts.ansible_memtotal_mb),
    ipv4: asString(ipv4obj?.address),
    iface: asString(ipv4obj?.interface),
    virt: [virtType, virtRole].filter(Boolean).join(" · ") || null,
    python: asString(facts.ansible_python_version),
    uptime: formatUptime(facts.ansible_uptime_seconds),
  };
}

export function factLabel(path: string): string {
  return path.replace(/^ansible_/, "").replaceAll("_", " ").replaceAll(".", " / ");
}

export function formatFactValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (
      value.every(
        (item) =>
          item == null ||
          typeof item === "string" ||
          typeof item === "number" ||
          typeof item === "boolean",
      )
    ) {
      return value.map((item) => String(item)).join(", ");
    }
    return JSON.stringify(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function factRow(path: string, value: string): FlatFact {
  return { path, label: factLabel(path), value, group: factGroup(path) };
}

export function flattenFacts(facts: HostFactsMap, prefix = ""): FlatFact[] {
  const out: FlatFact[] = [];
  const keys = Object.keys(facts).sort((a, b) => a.localeCompare(b));
  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const value = facts[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nestedRows = flattenFacts(value as HostFactsMap, path);
      out.push(...(nestedRows.length ? nestedRows : [factRow(path, "{}")]));
      continue;
    }
    if (Array.isArray(value) && value.some((item) => item && typeof item === "object")) {
      value.forEach((item, index) => {
        const itemPath = `${path}[${index}]`;
        if (item && typeof item === "object" && !Array.isArray(item)) {
          out.push(...flattenFacts(item as HostFactsMap, itemPath));
          return;
        }
        out.push(factRow(itemPath, formatFactValue(item)));
      });
      continue;
    }
    out.push(factRow(path, formatFactValue(value)));
  }
  return out;
}

export function isHostFactsExecution(
  row: {
    mode?: string;
    playbookName?: string;
    runParams?: { host?: string; execution_type?: string };
  },
  host: string,
): boolean {
  const type = row.runParams?.execution_type || row.mode;
  const playbook = String(row.playbookName || "");
  if (type !== "HOST_FACTS" && !playbook.startsWith("get_facts_")) {
    return false;
  }
  const target = row.runParams?.host;
  return target === host || playbook === `get_facts_${host}`;
}
