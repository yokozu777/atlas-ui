import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { HostGroup } from "./atlas-hosts.ts";
import {
  dnsDomainInvalid,
  domainChoices,
  hostnameParentDomain,
  renameHostGroups,
  renameHostname,
} from "./host-domain.ts";

function group(hosts: { hostname: string; ip?: string }[]): HostGroup {
  return {
    id: "k8s_lbs",
    name: "k8s_lbs",
    path: ["k8s_lbs"],
    hosts: hosts.map((host, index) => ({
      ip: host.ip ?? `192.168.1.${220 + index}`,
      hostname: host.hostname,
      vmid: "",
      sockets: 1,
      cores: 2,
      memory: 4096,
      numa: false,
      clone: "ubuntu-base",
      disks: [],
    })),
  };
}

describe("hostname domain suffix", () => {
  it("keeps the short name and replaces the parent domain", () => {
    assert.equal(hostnameParentDomain("lb1.example1.com"), "example1.com");
    assert.equal(
      renameHostname("kubemaster01.example.com", "example.com", "lab.example"),
      "kubemaster01.lab.example",
    );
    assert.equal(
      renameHostname("LB1.Example.COM", "example.com", "lab.example"),
      "LB1.lab.example",
    );
  });

  it("leaves a different suffix and a name without a dot", () => {
    assert.equal(renameHostname("edge.other.test", "example.com", "lab.example"), null);
    assert.equal(renameHostname("bare", "example.com", "lab.example"), null);
    assert.equal(hostnameParentDomain("node.{{ dns_domain_suffix }}"), null);
    assert.equal(renameHostname("lb1.example.com", "example.com", "example.com"), null);
  });

  it("rejects a new domain without a dot", () => {
    assert.equal(dnsDomainInvalid("lab"), "Use a DNS name such as lab.example");
    assert.equal(dnsDomainInvalid(" lab.example "), null);
    assert.equal(dnsDomainInvalid("lab example.com"), "Use a DNS name such as lab.example");
  });

  it("picks the most common parent domain and skips the rest", () => {
    const choices = domainChoices([
      "lb1.example.com",
      "lb2.example.com",
      "edge.other.test",
      "bare",
    ]);
    assert.deepEqual(choices, [
      { domain: "example.com", count: 2 },
      { domain: "other.test", count: 1 },
    ]);
    const renamed = renameHostGroups(
      [group([{ hostname: "lb1.example.com" }, { hostname: "edge.other.test" }, { hostname: "bare" }])],
      "example.com",
      "lab.example",
    );
    assert.deepEqual(renamed.changes, [
      { from: "lb1.example.com", to: "lb1.lab.example" },
    ]);
    assert.deepEqual(renamed.skipped, ["edge.other.test", "bare"]);
    assert.equal(renamed.groups[0].hosts[1].hostname, "edge.other.test");
    assert.equal(renamed.groups[0].hosts[0].ip, "192.168.1.220");
  });

  it("renames only the selected group", () => {
    const groups = [
      group([{ hostname: "lb1.example.com" }, { hostname: "lb2.example.com" }]),
      {
        ...group([{ hostname: "kubemaster01.example.com" }]),
        id: "k8s_masters",
        name: "k8s_masters",
        path: ["k8s_masters"],
      },
    ];
    const renamed = renameHostGroups(groups, "example.com", "lab.example", "k8s_lbs");
    assert.deepEqual(
      renamed.changes.map((change) => change.to),
      ["lb1.lab.example", "lb2.lab.example"],
    );
    assert.equal(renamed.groups[1].hosts[0].hostname, "kubemaster01.example.com");
  });
});
