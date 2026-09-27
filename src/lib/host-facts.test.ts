import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cpuModel,
  extractFactsFromResult,
  factGroup,
  factsErrorFromResult,
  flattenFacts,
  formatMemoryMb,
  formatUptime,
  groupFactRows,
  isHostFactsExecution,
  summarizeHostFacts,
} from "./host-facts.ts";

describe("extractFactsFromResult", () => {
  it("reads result.facts from HOST_FACTS", () => {
    const facts = extractFactsFromResult({
      facts: { ansible_hostname: "infra2", ansible_distribution: "Debian" },
    });
    assert.equal(facts?.ansible_hostname, "infra2");
  });

  it("unwraps ansible_facts", () => {
    const facts = extractFactsFromResult({
      facts: { ansible_facts: { ansible_hostname: "box" } },
    });
    assert.equal(facts?.ansible_hostname, "box");
  });
});

describe("factsErrorFromResult", () => {
  it("returns the message when facts are missing", () => {
    assert.equal(
      factsErrorFromResult({ error: "Could not extract facts from output" }),
      "Could not extract facts from output",
    );
  });

  it("ignores message when facts exist", () => {
    assert.equal(
      factsErrorFromResult({
        facts: { ansible_hostname: "infra2" },
        message: "ok",
      }),
      null,
    );
  });
});

describe("summarizeHostFacts", () => {
  it("builds overview fields", () => {
    const summary = summarizeHostFacts({
      ansible_hostname: "infra2",
      ansible_fqdn: "infra2.example.com",
      ansible_distribution: "Debian",
      ansible_distribution_version: "13.5",
      ansible_kernel: "6.12.90",
      ansible_architecture: "x86_64",
      ansible_processor_vcpus: 2,
      ansible_processor: [
        "0",
        "GenuineIntel",
        "Intel(R) Xeon(R) CPU E5-2690 v2 @ 3.00GHz",
      ],
      ansible_memtotal_mb: 7851,
      ansible_default_ipv4: { address: "192.168.1.219", interface: "eth0" },
      ansible_virtualization_type: "kvm",
      ansible_virtualization_role: "guest",
      ansible_python_version: "3.13.5",
      ansible_uptime_seconds: 670,
    });
    assert.equal(summary.os, "Debian 13.5");
    assert.equal(summary.ipv4, "192.168.1.219");
    assert.equal(summary.iface, "eth0");
    assert.equal(summary.memory, "7.7 GiB");
    assert.equal(summary.uptime, "11m");
    assert.equal(summary.virt, "kvm · guest");
    assert.match(summary.cpu || "", /Xeon/);
  });
});

describe("format helpers", () => {
  it("formats memory and uptime", () => {
    assert.equal(formatMemoryMb(512), "512 MiB");
    assert.equal(formatMemoryMb(20480), "20 GiB");
    assert.equal(formatUptime(45), "45s");
    assert.equal(formatUptime(90000), "1d 1h");
  });

  it("picks a cpu model from ansible_processor", () => {
    assert.equal(
      cpuModel({
        ansible_processor: ["0", "GenuineIntel", "Intel Core i7"],
      }),
      "Intel Core i7",
    );
  });
});

describe("flattenFacts", () => {
  it("flattens nested ipv4", () => {
    const rows = flattenFacts({
      ansible_default_ipv4: { address: "10.0.0.2", interface: "eth0" },
    });
    assert.deepEqual(
      rows.map((row) => row.path),
      ["ansible_default_ipv4.address", "ansible_default_ipv4.interface"],
    );
    assert.equal(rows[0]?.group, "network");
  });

  it("expands object arrays for mounts", () => {
    const rows = flattenFacts({
      ansible_mounts: [
        { mount: "/", fstype: "ext4" },
        { mount: "/boot", fstype: "vfat" },
      ],
    });
    assert.equal(
      rows.some((row) => row.path === "ansible_mounts[0].mount" && row.value === "/"),
      true,
    );
    assert.equal(rows.every((row) => row.group === "storage"), true);
  });
});

describe("factGroup", () => {
  it("splits facts into system hardware network storage", () => {
    assert.equal(factGroup("ansible_hostname"), "system");
    assert.equal(factGroup("ansible_memtotal_mb"), "hardware");
    assert.equal(factGroup("ansible_eth0.ipv4.address"), "network");
    assert.equal(factGroup("ansible_mounts[0].mount"), "storage");
    assert.equal(factGroup("gather_subset"), "other");
  });

  it("groups flattened rows", () => {
    const grouped = groupFactRows(
      flattenFacts({
        ansible_hostname: "infra2",
        ansible_memtotal_mb: 1024,
        ansible_default_ipv4: { address: "10.0.0.2" },
      }),
    );
    assert.equal(grouped.system.length, 1);
    assert.equal(grouped.hardware.length, 1);
    assert.equal(grouped.network.length, 1);
  });
});

describe("isHostFactsExecution", () => {
  it("matches HOST_FACTS for the same host", () => {
    assert.equal(
      isHostFactsExecution(
        {
          mode: "HOST_FACTS",
          playbookName: "get_facts_192.168.1.219",
          runParams: { host: "192.168.1.219", execution_type: "HOST_FACTS" },
        },
        "192.168.1.219",
      ),
      true,
    );
    assert.equal(
      isHostFactsExecution(
        { playbookName: "get_facts_10.0.0.1", runParams: { host: "10.0.0.1" } },
        "192.168.1.219",
      ),
      false,
    );
  });
});
