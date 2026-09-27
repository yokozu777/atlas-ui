import {
  distroKindFromFacts,
  type DistroKind,
} from "./distro-kind.ts";
import {
  extractFactsFromResult,
  isHostFactsExecution,
  summarizeHostFacts,
  type HostFactsSummary,
} from "./host-facts.ts";

export type FleetFactsExecution = {
  id?: string;
  executionId?: string;
  status?: string;
  mode?: string;
  playbookName?: string;
  finishedAt?: string | number | null;
  createdAt?: string | number | null;
  runParams?: { host?: string; execution_type?: string };
  result?: unknown;
};

export type FleetHostInput = {
  name: string;
  groups: string[];
  status: string;
  lastCheckedAt?: string | null;
  connectionSecret?: string;
  ansibleUser?: string;
  ansiblePort?: string;
};

export type FleetCard = {
  name: string;
  displayName: string;
  fqdn: string | null;
  groups: string[];
  status: string;
  lastCheckedAt: string | null;
  connectionSecret?: string;
  ansibleUser?: string;
  ansiblePort?: string;
  summary: HostFactsSummary | null;
  distroKind: DistroKind;
  collectedAt: string | number | null;
  hasFacts: boolean;
  factsExecutionId: string | null;
};

export type FleetFilters = {
  search: string;
  group: string;
  distro: DistroKind | "";
  status: string;
};

export function executionIdOf(
  row: FleetFactsExecution | null | undefined,
): string | null {
  const id = row?.id || row?.executionId;
  return id ? String(id) : null;
}

export function latestFactsExecutionByHost(
  executions: FleetFactsExecution[],
  hosts: string[],
): Map<string, FleetFactsExecution> {
  const wanted = new Set(hosts);
  const map = new Map<string, FleetFactsExecution>();
  for (const row of executions) {
    for (const host of wanted) {
      if (map.has(host)) continue;
      if (isHostFactsExecution(row, host)) {
        map.set(host, row);
      }
    }
  }
  return map;
}

export function factsNeedHydration(row: FleetFactsExecution): boolean {
  return !extractFactsFromResult(row.result);
}

export function buildFleetCard(
  host: FleetHostInput,
  execution?: FleetFactsExecution | null,
): FleetCard {
  const facts = execution ? extractFactsFromResult(execution.result) : null;
  const summary = facts ? summarizeHostFacts(facts) : null;
  const fqdn = summary?.fqdn || null;
  const hostname = summary?.hostname || null;
  const displayName = hostname || host.name;
  return {
    name: host.name,
    displayName,
    fqdn: fqdn && fqdn !== displayName ? fqdn : null,
    groups: host.groups,
    status: host.status,
    lastCheckedAt: host.lastCheckedAt ?? null,
    connectionSecret: host.connectionSecret,
    ansibleUser: host.ansibleUser,
    ansiblePort: host.ansiblePort,
    summary,
    distroKind: distroKindFromFacts(facts),
    collectedAt: facts
      ? (execution?.finishedAt ?? execution?.createdAt ?? null)
      : null,
    hasFacts: Boolean(facts),
    factsExecutionId: execution ? executionIdOf(execution) : null,
  };
}

export function filterFleetCards(
  cards: FleetCard[],
  filters: FleetFilters,
): FleetCard[] {
  const search = filters.search.trim().toLowerCase();
  const status = filters.status.trim().toLowerCase();
  return cards.filter((card) => {
    if (search) {
      const hay = [
        card.name,
        card.displayName,
        card.fqdn || "",
        card.summary?.os || "",
        card.summary?.ipv4 || "",
        ...card.groups,
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(search)) return false;
    }
    if (filters.group && !card.groups.includes(filters.group)) return false;
    if (filters.distro && card.distroKind !== filters.distro) return false;
    if (status && card.status.toLowerCase() !== status) return false;
    return true;
  });
}
