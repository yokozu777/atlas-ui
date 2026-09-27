import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildFleetCard,
  executionIdOf,
  factsNeedHydration,
  filterFleetCards,
  latestFactsExecutionByHost,
  type FleetFactsExecution,
  type FleetHostInput,
} from "./host-fleet.ts";

const WEB: FleetHostInput = {
  name: "web1",
  groups: ["web", "prod"],
  status: "online",
  lastCheckedAt: "2026-09-20T10:00:00Z",
  ansibleUser: "root",
  ansiblePort: "22",
  connectionSecret: "lab-ssh",
};

const FACTS = {
  ansible_hostname: "web1",
  ansible_fqdn: "web1.lab.local",
  ansible_distribution: "Ubuntu",
  ansible_distribution_version: "24.04",
  ansible_architecture: "x86_64",
  ansible_processor_vcpus: 4,
  ansible_memtotal_mb: 8192,
  ansible_default_ipv4: { address: "10.0.0.11", interface: "eth0" },
  ansible_virtualization_type: "kvm",
  ansible_virtualization_role: "guest",
};

function factsExec(
  host: string,
  extra: Partial<FleetFactsExecution> = {},
): FleetFactsExecution {
  return {
    id: `exec-${host}`,
    mode: "HOST_FACTS",
    playbookName: "HOST_FACTS",
    finishedAt: "2026-09-20T12:00:00Z",
    runParams: { host, execution_type: "HOST_FACTS" },
    result: { facts: FACTS },
    ...extra,
  };
}

describe("latestFactsExecutionByHost", () => {
  it("keeps the first HOST_FACTS match per host", () => {
    const older: FleetFactsExecution = {
      id: "old",
      mode: "HOST_FACTS",
      runParams: { host: "web1", execution_type: "HOST_FACTS" },
    };
    const newer = factsExec("web1", { id: "new" });
    const other = factsExec("db1", {
      result: { facts: { ansible_distribution: "Debian" } },
    });
    const setup: FleetFactsExecution = {
      id: "setup",
      mode: "SETUP",
      runParams: { host: "web1", execution_type: "SETUP" },
    };
    const map = latestFactsExecutionByHost(
      [setup, newer, older, other],
      ["web1", "db1", "empty"],
    );
    assert.equal(map.get("web1")?.id, "new");
    assert.equal(map.get("db1")?.id, "exec-db1");
    assert.equal(map.has("empty"), false);
  });

  it("matches get_facts_${host} playbooks", () => {
    const row: FleetFactsExecution = {
      id: "pb",
      playbookName: "get_facts_edge1",
    };
    const map = latestFactsExecutionByHost([row], ["edge1"]);
    assert.equal(map.get("edge1")?.id, "pb");
  });
});

describe("buildFleetCard", () => {
  it("fills summary and ubuntu kind from facts", () => {
    const card = buildFleetCard(WEB, factsExec("web1"));
    assert.equal(card.hasFacts, true);
    assert.equal(card.distroKind, "ubuntu");
    assert.equal(card.summary?.os, "Ubuntu 24.04");
    assert.equal(card.summary?.ipv4, "10.0.0.11");
    assert.equal(card.summary?.vcpus, 4);
    assert.equal(card.displayName, "web1");
    assert.equal(card.fqdn, "web1.lab.local");
    assert.deepEqual(card.groups, ["web", "prod"]);
    assert.equal(card.factsExecutionId, "exec-web1");
  });

  it("uses a generic icon when facts are missing", () => {
    const card = buildFleetCard(WEB, null);
    assert.equal(card.hasFacts, false);
    assert.equal(card.distroKind, "generic");
    assert.equal(card.summary, null);
    assert.equal(card.displayName, "web1");
    assert.equal(card.collectedAt, null);
  });

  it("hydrates via executionId when list payload has no facts", () => {
    const listed = factsExec("web1", { result: undefined, executionId: "e1", id: undefined });
    assert.equal(factsNeedHydration(listed), true);
    assert.equal(executionIdOf(listed), "e1");
  });
});

describe("filterFleetCards", () => {
  const cards = [
    buildFleetCard(WEB, factsExec("web1")),
    buildFleetCard(
      { name: "db1", groups: ["db"], status: "offline" },
      factsExec("db1", {
        result: { facts: { ansible_distribution: "Debian", ansible_hostname: "db1" } },
      }),
    ),
  ];

  it("filters by group, distro, status, and search", () => {
    assert.equal(
      filterFleetCards(cards, {
        search: "",
        group: "web",
        distro: "",
        status: "",
      }).map((row) => row.name).join(),
      "web1",
    );
    assert.equal(
      filterFleetCards(cards, {
        search: "",
        group: "",
        distro: "debian",
        status: "",
      }).map((row) => row.name).join(),
      "db1",
    );
    assert.equal(
      filterFleetCards(cards, {
        search: "10.0.0.11",
        group: "",
        distro: "",
        status: "online",
      }).map((row) => row.name).join(),
      "web1",
    );
  });
});
