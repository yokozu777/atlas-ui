export const DISTRO_KINDS = [
  "ubuntu",
  "debian",
  "oracle",
  "rhel",
  "rocky",
  "alma",
  "fedora",
  "alpine",
  "windows",
  "generic",
] as const;

export type DistroKind = (typeof DISTRO_KINDS)[number];

export const DISTRO_LABELS: Record<DistroKind, string> = {
  ubuntu: "Ubuntu",
  debian: "Debian",
  oracle: "Oracle Linux",
  rhel: "RHEL",
  rocky: "Rocky Linux",
  alma: "AlmaLinux",
  fedora: "Fedora",
  alpine: "Alpine",
  windows: "Windows",
  generic: "Other",
};

const CHECKS: { kind: DistroKind; needles: string[] }[] = [
  { kind: "ubuntu", needles: ["ubuntu"] },
  { kind: "debian", needles: ["debian"] },
  { kind: "oracle", needles: ["oracle"] },
  { kind: "rocky", needles: ["rocky"] },
  { kind: "alma", needles: ["alma"] },
  { kind: "fedora", needles: ["fedora"] },
  { kind: "alpine", needles: ["alpine"] },
  { kind: "windows", needles: ["windows", "win32nt", "mswin"] },
  { kind: "rhel", needles: ["rhel", "redhat", "red hat"] },
];

export function distroKindFromName(name?: string | null): DistroKind {
  const value = (name || "").toLowerCase();
  if (!value.trim()) return "generic";
  for (const { kind, needles } of CHECKS) {
    if (needles.some((needle) => value.includes(needle))) return kind;
  }
  return "generic";
}

export function distroKindFromFacts(
  facts?: Record<string, unknown> | null,
): DistroKind {
  if (!facts) return "generic";
  const parts = [
    facts.ansible_distribution,
    facts.ansible_os_family,
    facts.ansible_system,
  ]
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .join(" ");
  return distroKindFromName(parts);
}
