import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clusterSwitcherGroups, environmentNames } from "./cluster-groups.ts";

describe("environmentNames", () => {
  it("lists each environment once, in order", () => {
    assert.deepEqual(
      environmentNames([
        "build33/k8s",
        "build33/default",
        "demo/infra",
        "bare",
        "Demo/k8s",
      ]),
      ["build33", "demo"],
    );
  });
});

describe("clusterSwitcherGroups", () => {
  it("keeps a recent cluster in its environment group", () => {
    const rows = [
      { id: "build34/infra" },
      { id: "build34/pve" },
      { id: "dek/pve" },
    ];
    const sections = clusterSwitcherGroups(rows, ["build34/pve"]);
    const build34 = sections.find((section) => section.key === "build34");
    assert.deepEqual(
      build34?.items.map((row) => row.id),
      ["build34/infra", "build34/pve"],
    );
    assert.deepEqual(
      sections.find((section) => section.key === "recent")?.items.map((row) => row.id),
      ["build34/pve"],
    );
  });
});
