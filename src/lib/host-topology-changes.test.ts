import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hostTopologyChanges } from "./host-topology-changes.ts";
import type { HostGroup, HostTopology } from "./atlas-hosts.ts";

function host(patch: Partial<HostTopology> = {}): HostTopology {
  return {
    ip: "192.168.1.220",
    hostname: "lb1.example.com",
    vmid: "220",
    sockets: 1,
    cores: 2,
    memory: 4096,
    numa: false,
    clone: "ubuntu-base",
    disks: [{ size: "70", slot: 0, storage: "local-zfs" }],
    ...patch,
  };
}

function group(hosts: HostTopology[]): HostGroup {
  return { id: "k8s_lbs", name: "k8s_lbs", path: ["k8s_lbs"], hosts };
}

describe("host topology changes", () => {
  it("reports an IP edit, an added host, and a disk size edit", () => {
    const before = [group([host()])];
    const after = [
      group([
        host({
          ip: "192.168.1.230",
          disks: [{ size: "80", slot: 0, storage: "local-zfs" }],
        }),
        host({ ip: "192.168.1.221", hostname: "lb2.example.com", vmid: "221" }),
      ]),
    ];
    const [changes] = hostTopologyChanges(before, after);
    assert.equal(changes.title, "k8s_lbs");
    const byLabel = Object.fromEntries(changes.lines.map((line) => [line.label, line]));
    assert.equal(byLabel["lb1.example.com · IP"].from, "192.168.1.220");
    assert.equal(byLabel["lb1.example.com · IP"].to, "192.168.1.230");
    assert.equal(byLabel["lb1.example.com · Disk 1 size"].from, "70");
    assert.equal(byLabel["lb1.example.com · Disk 1 size"].to, "80");
    assert.equal(byLabel["lb2.example.com"].note, "added");
    assert.equal(hostTopologyChanges(before, before).length, 0);
  });

  it("reports a removed host", () => {
    const before = [group([host(), host({ hostname: "lb2.example.com", ip: "192.168.1.221" })])];
    const after = [group([host()])];
    const [changes] = hostTopologyChanges(before, after);
    assert.equal(changes.lines.at(-1)?.label, "lb2.example.com");
    assert.equal(changes.lines.at(-1)?.note, "removed");
  });
});
