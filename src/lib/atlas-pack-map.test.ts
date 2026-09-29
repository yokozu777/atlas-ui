import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPackMapGraph,
  layoutPackMapCopy,
  packMapActiveEntryId,
  packMapColumnOverlaps,
  packMapEntryRuntime,
  packMapHref,
  packMapStatusLabel,
  packMountState,
} from "./atlas-pack-map.ts";
import { parseClusterYaml } from "./cluster-yaml-model.ts";

const FIXTURE = `
schema_version: 2
id: lab/k8s
display_name: Lab k8s
playbooks:
  atlas-compute-provision:
    source: git
    layout: roles/
    path: atlas-compute-provision
    entries:
      templates:
        file: playbooks/build_templates.yaml
        invocations:
        - tags: 00_ensure_workspace
        - tags: 05_create_pve_templates
      provision:
        file: playbooks/provision_nodes.yaml
        invocations:
        - tags: 10_tf_apply
        - tags: provision_wait_ssh
          root_ssh: true
        git_ssh: true
        ansible:
          strategy: linear
          forks: 100
  atlas-k8s-core:
    source: git
    layout: roles/
    entries:
      cluster:
        file: playbooks/cluster.yaml
        invocations:
        - tags: 00_kubeadm
          limit: k8s_masters:k8s_workers
        git_ssh: true
        when:
          inventory_groups_any:
          - k8s_masters
          - k8s_workers
phases:
- provision: atlas-compute-provision/provision
- ghost: atlas-missing/nope
- k8s-core: atlas-k8s-core/cluster
execution:
  mode: docker
  image: harbor.mxhash.com/library/krang
  tag: latest
`;

function draft() {
  const parsed = parseClusterYaml(FIXTURE);
  assert.equal(parsed.ok, true);
  return parsed.draft;
}

describe("packMountState", () => {
  it("is unknown until repos status loads", () => {
    assert.equal(packMountState({ state: "ready" }, undefined, false), "unknown");
  });

  it("treats a declared pack with no record as missing", () => {
    assert.equal(packMountState(undefined, undefined, true), "missing");
  });

  it("flags lock drift when head and pin differ", () => {
    assert.equal(
      packMountState(
        { state: "ready", head: "aaa" },
        { resolved_sha: "bbb" },
        true,
      ),
      "drift",
    );
  });
});

describe("buildPackMapGraph", () => {
  it("wires cluster → packs → entries → phases and marks unused/broken", () => {
    const graph = buildPackMapGraph({
      clusterId: "lab/k8s",
      draft: draft(),
      repos: {
        repos: [
          { name: "atlas-compute-provision", state: "ready", head: "abc" },
          { name: "atlas-k8s-core", state: "missing" },
        ],
        lock: {
          repos: {
            "atlas-compute-provision": { resolved_sha: "abc" },
          },
        },
      },
      bootstrap: {
        missing: [],
        docker_image: "harbor.mxhash.com/library/krang:latest",
        docker_image_present: true,
        workspace_root: "/atlas/workspace/lab/k8s",
      },
      varsFiles: [
        {
          name: "atlas-compute-provision.yml",
          path: "group_vars/all/atlas-compute-provision.yml",
          exists: true,
        },
        {
          name: "atlas-k8s-core.yml",
          path: "group_vars/all/atlas-k8s-core.yml",
          exists: false,
        },
      ],
    });

    const byId = Object.fromEntries(graph.nodes.map((node) => [node.id, node]));
    assert.equal(byId["pack:atlas-compute-provision"]?.status, "ready");
    assert.equal(byId["pack:atlas-k8s-core"]?.status, "missing");
    assert.equal(byId["entry:atlas-compute-provision/templates"]?.status, "unused");
    assert.equal(byId["entry:atlas-compute-provision/provision"]?.status, "ready");
    assert.equal(byId["phase:1:ghost"]?.status, "broken");
    assert.equal(byId["overlay:atlas-k8s-core:atlas-k8s-core.yml"]?.status, "missing");
    assert.equal(
      byId["overlay:atlas-compute-provision:atlas-compute-provision.yml"]?.status,
      "ready",
    );
    assert.ok(
      graph.edges.some(
        (row) =>
          row.source === "entry:atlas-compute-provision/provision" &&
          row.target === "phase:0:provision" &&
          row.kind === "calls",
      ),
    );
    assert.ok(
      graph.edges.some(
        (row) =>
          row.source === "phase:0:provision" &&
          row.target === "phase:1:ghost" &&
          row.kind === "next",
      ),
    );
    assert.equal(graph.counts.unused, 1);
    assert.equal(graph.counts.broken, 1);
    assert.ok(graph.counts.missing >= 2);
    assert.equal(byId["pack:atlas-compute-provision"]?.column, "pack");
    assert.ok(
      (byId["pack:atlas-k8s-core"]?.x ?? 0) >
        (byId["cluster:leaf"]?.x ?? 0),
    );
    assert.deepEqual(packMapColumnOverlaps(graph.nodes), []);
    const templates = byId["entry:atlas-compute-provision/templates"];
    const provision = byId["entry:atlas-compute-provision/provision"];
    assert.ok(
      (templates?.y ?? 0) + (templates?.h ?? 0) <= (provision?.y ?? 0),
    );
    const phase0 = byId["phase:0:provision"];
    const phase1 = byId["phase:1:ghost"];
    assert.ok((phase0?.y ?? 0) + (phase0?.h ?? 0) <= (phase1?.y ?? 0));
  });

  it("wires SSH, ansible.cfg, overlay passwords, and inventory groups", () => {
    const graph = buildPackMapGraph({
      clusterId: "lab/k8s",
      draft: draft(),
      repos: {
        repos: [
          {
            name: "atlas-compute-provision",
            state: "ready",
            path: "/atlas/workspace/lab/k8s/atlas-compute-provision",
          },
          { name: "atlas-k8s-core", state: "ready" },
        ],
      },
      varsFiles: [
        {
          name: "atlas-compute-provision.yml",
          path: "group_vars/all/atlas-compute-provision.yml",
          exists: true,
        },
        {
          name: "atlas-compute-provision.secrets.yml",
          path: "group_vars/all/atlas-compute-provision.secrets.yml",
          exists: true,
        },
      ],
      auth: {
        sshKey: "/run/atlas/ssh/id_ed25519",
        sshKeyOk: true,
      },
      inventoryGroups: ["k8s_masters", "k8s_lbs"],
    });
    const byId = Object.fromEntries(graph.nodes.map((node) => [node.id, node]));
    assert.equal(byId["cluster:ssh"]?.title, "id_ed25519");
    assert.equal(byId["cluster:ssh"]?.status, "ready");
    assert.equal(byId["cfg:atlas-compute-provision"]?.kind, "cfg");
    assert.equal(
      byId["cfg:atlas-compute-provision"]?.detail,
      "/atlas/workspace/lab/k8s/atlas-compute-provision/ansible.cfg",
    );
    assert.deepEqual(byId["entry:atlas-compute-provision/provision"]?.auth, [
      "root_ssh",
      "git_ssh",
    ]);
    assert.ok(
      byId["phase:0:provision"]?.groups?.includes("all hosts"),
    );
    assert.equal(byId["group:k8s_masters"]?.status, "ready");
    assert.equal(byId["group:k8s_workers"]?.status, "missing");
    assert.equal(byId["group:all hosts"]?.kind, "group");
    assert.ok(
      graph.edges.some(
        (row) =>
          row.source === "cluster:ssh" &&
          row.target === "phase:0:provision" &&
          row.kind === "auth" &&
          row.label === "SSH",
      ),
    );
    assert.ok(
      graph.edges.some(
        (row) =>
          row.source === "overlay:atlas-compute-provision:atlas-compute-provision.secrets.yml" &&
          row.target === "phase:0:provision" &&
          row.label === "passwords",
      ),
    );
    assert.ok(
      graph.edges.some(
        (row) =>
          row.source === "cfg:atlas-k8s-core" &&
          row.target === "entry:atlas-k8s-core/cluster" &&
          row.kind === "cfg",
      ),
    );
    assert.ok(
      graph.edges.some(
        (row) =>
          row.source === "phase:2:k8s-core" &&
          row.target === "group:k8s_masters" &&
          row.kind === "limit",
      ),
    );
    assert.ok(
      graph.edges.some(
        (row) =>
          row.source === "phase:2:k8s-core" &&
          row.target === "group:k8s_workers" &&
          row.kind === "limit",
      ),
    );
    assert.deepEqual(byId["phase:2:k8s-core"]?.groups, [
      "k8s_masters",
      "k8s_workers",
    ]);
    assert.equal(packMapHref("p1", "secrets"), "/projects/p1/secrets");
    assert.equal(packMapHref("p1", "hosts"), "/projects/p1/hosts");
    assert.equal(
      packMapHref("p1", "ansible-config"),
      "/projects/p1/ansible-config",
    );
  });

  it("keeps overlay unknown when vars-setup has not loaded", () => {
    const graph = buildPackMapGraph({
      clusterId: "lab/k8s",
      draft: draft(),
    });
    const overlay = graph.nodes.find((node) => node.kind === "overlay");
    assert.equal(overlay?.status, "unknown");
    assert.equal(graph.nodes.find((node) => node.kind === "pack")?.status, "unknown");
  });

  it("surfaces bootstrap workspace and lock gaps", () => {
    const graph = buildPackMapGraph({
      clusterId: "lab/k8s",
      draft: draft(),
      bootstrap: {
        missing: [
          { kind: "workspace", label: "no workspace" },
          { kind: "lock", name: "playbooks.lock" },
        ],
        docker_image_present: false,
        docker_image: "harbor.mxhash.com/library/krang:latest",
      },
    });
    assert.equal(
      graph.nodes.find((node) => node.id === "cluster:workspace")?.status,
      "missing",
    );
    assert.equal(
      graph.nodes.find((node) => node.id === "cluster:lock")?.status,
      "missing",
    );
    assert.equal(
      graph.nodes.find((node) => node.id === "cluster:executor")?.status,
      "missing",
    );
  });
});

describe("packMapEntryRuntime", () => {
  it("keeps named limits when another invocation has no limit", () => {
    const parsed = parseClusterYaml(`
schema_version: 2
playbooks:
  pack:
    source: local
    path: pack
    entries:
      init:
        file: playbooks/init.yaml
        invocations:
        - tags: 00_ensure_workspace
        - tags: 00_init
          limit: jslave
          root_ssh: true
        git_ssh: true
        when:
          inventory_groups_any:
          - jslave
phases: []
`);
    assert.equal(parsed.ok, true);
    const runtime = packMapEntryRuntime(parsed.draft.playbooks[0].entries[0]);
    assert.equal(runtime.allHosts, true);
    assert.deepEqual(runtime.groups, ["jslave"]);
    assert.deepEqual(runtime.whenGroups, ["jslave"]);
    assert.deepEqual(runtime.auth, ["root_ssh", "git_ssh"]);
  });
});

describe("packMapHref", () => {
  it("routes packs to health and overlays to setup", () => {
    assert.equal(
      packMapHref("p1", "health"),
      "/projects/p1/cluster-yaml?tab=health",
    );
    assert.equal(packMapHref("p1", "setup"), "/projects/p1/cluster-yaml");
    assert.equal(packMapHref("p1", "secrets"), "/projects/p1/secrets");
    assert.equal(packMapHref("p1", undefined), null);
  });
});

describe("packMapStatusLabel", () => {
  it("labels operator states in English", () => {
    assert.equal(packMapStatusLabel("drift"), "Drift");
    assert.equal(packMapStatusLabel("unused"), "Unused");
  });
});

describe("layoutPackMapCopy", () => {
  it("stacks measured heights without column overlap", () => {
    const graph = buildPackMapGraph({
      clusterId: "lab/k8s",
      draft: draft(),
    });
    const heights = Object.fromEntries(
      graph.nodes.map((node) => [node.id, 220]),
    );
    const laid = layoutPackMapCopy(graph.nodes, heights);
    assert.deepEqual(packMapColumnOverlaps(laid), []);
    const entries = laid
      .filter((node) => node.column === "entry")
      .sort((left, right) => left.y - right.y);
    assert.ok(entries.length >= 2);
    assert.ok((entries[0].y ?? 0) + 220 <= (entries[1].y ?? 0));
  });
});

describe("packMapActiveEntryId", () => {
  it("returns the entry that calls the live phase", () => {
    const graph = buildPackMapGraph({
      clusterId: "lab/k8s",
      draft: draft(),
    });
    assert.equal(
      packMapActiveEntryId(graph.nodes, [
        "phase:0:provision",
        "entry:atlas-compute-provision/provision",
      ]),
      "entry:atlas-compute-provision/provision",
    );
    assert.equal(packMapActiveEntryId(graph.nodes, ["phase:0:provision"]), null);
    assert.equal(packMapActiveEntryId(graph.nodes, []), null);
  });
});
