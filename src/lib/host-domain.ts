import type { HostGroup } from "@/lib/atlas-hosts";

const DNS_NAME =
  /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

export type HostnameRename = {
  from: string;
  to: string;
};

export type DomainChoice = {
  domain: string;
  count: number;
};

export function hostnameParentDomain(hostname: string): string | null {
  const text = hostname.trim();
  const dot = text.indexOf(".");
  if (dot <= 0 || dot === text.length - 1) return null;
  const parent = text.slice(dot + 1);
  if (/\s/.test(parent) || parent.includes("{{")) return null;
  return parent;
}

export function dnsDomainInvalid(value: string): string | null {
  const text = value.trim();
  if (!text || /\s/.test(text) || text.includes("{{") || !DNS_NAME.test(text)) {
    return "Use a DNS name such as lab.example";
  }
  return null;
}

export function renameHostname(
  hostname: string,
  source: string,
  target: string,
): string | null {
  const parent = hostnameParentDomain(hostname);
  const from = source.trim();
  const to = target.trim();
  if (!parent || !from || parent.toLowerCase() !== from.toLowerCase()) return null;
  if (!to || to.toLowerCase() === from.toLowerCase()) return null;
  const text = hostname.trim();
  return `${text.slice(0, text.indexOf("."))}.${to}`;
}

export function domainChoices(hostnames: string[]): DomainChoice[] {
  const counts = new Map<string, DomainChoice>();
  for (const name of hostnames) {
    const parent = hostnameParentDomain(name);
    if (!parent) continue;
    const key = parent.toLowerCase();
    const row = counts.get(key);
    if (row) row.count += 1;
    else counts.set(key, { domain: parent, count: 1 });
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.domain.localeCompare(b.domain),
  );
}

export function renameHostGroups(
  groups: HostGroup[],
  source: string,
  target: string,
  groupId?: string,
): { groups: HostGroup[]; changes: HostnameRename[]; skipped: string[] } {
  const changes: HostnameRename[] = [];
  const skipped: string[] = [];
  const next = groups.map((group) => {
    if (groupId && group.id !== groupId) return group;
    return {
      ...group,
      hosts: group.hosts.map((host) => {
        const current = host.hostname.trim();
        if (!current) return host;
        const renamed = renameHostname(current, source, target);
        if (!renamed) {
          skipped.push(current);
          return host;
        }
        changes.push({ from: current, to: renamed });
        return { ...host, hostname: renamed };
      }),
    };
  });
  return { groups: next, changes, skipped };
}
