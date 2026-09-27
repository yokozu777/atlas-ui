import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  defaultRoleFile,
  fileKind,
  groupRoleFiles,
  humanizeRoleName,
  packLabel,
  roleFileTree,
  rolePackId,
  roleShortName,
} from "./ansible-role-display.ts";

describe("humanizeRoleName", () => {
  it("strips a numeric prefix and title-cases tokens", () => {
    assert.equal(humanizeRoleName("00_check_pve_templates"), "Check PVE Templates");
    assert.equal(humanizeRoleName("00_ensure_workspace"), "Ensure Workspace");
    assert.equal(humanizeRoleName("21_grow_disk_to_full"), "Grow Disk To Full");
  });

  it("keeps short tokens uppercase", () => {
    assert.equal(humanizeRoleName("08_generate_tf_vars"), "Generate TF Vars");
    assert.equal(humanizeRoleName("09a_tf_destroy_dns"), "TF Destroy DNS");
  });
});

describe("packLabel", () => {
  it("strips the atlas- prefix", () => {
    assert.equal(packLabel("atlas-compute-provision"), "compute-provision");
  });

  it("falls back for empty or root packs", () => {
    assert.equal(packLabel("root"), "Roles");
    assert.equal(packLabel("  "), "Roles");
  });
});

describe("fileKind", () => {
  it("reads the first path segment", () => {
    assert.equal(fileKind("defaults/main.yml"), "defaults");
    assert.equal(fileKind("tasks/main.yaml"), "tasks");
    assert.equal(fileKind("files/detect_linked_clones.sh"), "files");
    assert.equal(fileKind("README.md"), "other");
  });
});

describe("groupRoleFiles", () => {
  it("keeps kind order and drops empty groups", () => {
    const groups = groupRoleFiles([
      { path: "tasks/main.yaml", name: "main.yaml" },
      { path: "defaults/main.yml", name: "main.yml" },
      { path: "files/detect.sh", name: "detect.sh" },
    ]);
    assert.deepEqual(
      groups.map((group) => group.kind),
      ["defaults", "tasks", "files"],
    );
  });
});

describe("roleFileTree", () => {
  it("nests files under first-segment folders in kind order", () => {
    const tree = roleFileTree([
      { path: "tasks/create_dirs.yaml", name: "create_dirs.yaml" },
      { path: "tasks/main.yaml", name: "main.yaml" },
      { path: "defaults/main.yml", name: "main.yml" },
      { path: "README.md", name: "README.md" },
    ]);
    assert.deepEqual(
      tree.map((node) => `${node.type}:${node.name}`),
      ["dir:defaults", "dir:tasks", "file:README.md"],
    );
    const tasks = tree[1];
    assert.equal(tasks.type, "dir");
    if (tasks.type === "dir") {
      assert.deepEqual(
        tasks.children.map((node) => node.name),
        ["create_dirs.yaml", "main.yaml"],
      );
    }
  });
});

describe("defaultRoleFile", () => {
  it("prefers defaults/main.yml", () => {
    assert.equal(
      defaultRoleFile([
        { path: "tasks/main.yaml", name: "main.yaml" },
        { path: "defaults/main.yml", name: "main.yml" },
      ]),
      "defaults/main.yml",
    );
  });
});

describe("role path helpers", () => {
  it("splits pack and short name", () => {
    assert.equal(
      rolePackId("atlas-compute-provision/00_check_pve_templates"),
      "atlas-compute-provision",
    );
    assert.equal(
      roleShortName("atlas-compute-provision/00_check_pve_templates"),
      "00_check_pve_templates",
    );
  });
});
