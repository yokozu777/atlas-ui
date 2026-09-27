import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPackMapGraph,
  layoutPackMapCopy,
  PACK_MAP_NODE_W,
} from "./atlas-pack-map.ts";
import { parseClusterYaml } from "./cluster-yaml-model.ts";
import {
  packMapEdgeRoute,
  polylineHitsRects,
  type PackMapRect,
} from "./pack-map-edges.ts";

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
      provision:
        file: playbooks/provision_nodes.yaml
        invocations:
        - tags: 10_tf_apply
          root_ssh: true
        git_ssh: true
  atlas-k8s-core:
    source: git
    layout: roles/
    entries:
      cluster:
        file: playbooks/cluster.yaml
        invocations:
        - tags: 00_kubeadm
          limit: k8s_masters
        git_ssh: true
phases:
- provision: atlas-compute-provision/provision
- k8s-core: atlas-k8s-core/cluster
`;

function draft() {
  const parsed = parseClusterYaml(FIXTURE);
  assert.equal(parsed.ok, true);
  return parsed.draft;
}

describe("packMapEdgeRoute", () => {
  it("keeps a skip-column edge out of a blocking card", () => {
    const block: PackMapRect = { id: "mid", x: 616, y: 80, w: 248, h: 120 };
    const route = packMapEdgeRoute({
      sourceX: 272,
      sourceY: 140,
      targetX: 1504,
      targetY: 140,
      obstacles: [block],
    });
    assert.deepEqual(polylineHitsRects(route.points, [block]), []);
    assert.ok(route.points.some((point) => Math.abs(point.y - 140) > 8));
  });

  it("routes same-column edges in a right-side bracket", () => {
    const card: PackMapRect = { id: "phase", x: 1504, y: 0, w: 248, h: 100 };
    const route = packMapEdgeRoute({
      sourceX: 1752,
      sourceY: 40,
      targetX: 1752,
      targetY: 160,
      obstacles: [card],
    });
    assert.deepEqual(polylineHitsRects(route.points, [card]), []);
    assert.ok(route.points.every((point) => point.x >= 1752 - 0.5));
  });
});

describe("pack map graph edges miss node cards", () => {
  it("does not run any routed edge through another node", () => {
    const graph = buildPackMapGraph({
      clusterId: "lab/k8s",
      draft: draft(),
      repos: {
        repos: [
          { name: "atlas-compute-provision", state: "ready", head: "abc" },
          { name: "atlas-k8s-core", state: "ready", head: "def" },
        ],
      },
      varsFiles: [
        {
          name: "atlas-compute-provision.yml",
          exists: true,
        },
        {
          name: "atlas-compute-provision.secrets.yml",
          exists: true,
        },
      ],
      auth: { sshKey: "/keys/id", sshKeyOk: true },
      inventoryGroups: ["k8s_masters"],
    });
    const laid = layoutPackMapCopy(
      graph.nodes,
      Object.fromEntries(graph.nodes.map((node) => [node.id, node.h ?? 120])),
    );
    const byId = Object.fromEntries(laid.map((node) => [node.id, node]));
    const rects: PackMapRect[] = laid.map((node) => ({
      id: node.id,
      x: node.x,
      w: PACK_MAP_NODE_W,
      y: node.y,
      h: node.h ?? 96,
    }));
    const sameColumn = (source: string, target: string) =>
      byId[source]?.column === byId[target]?.column;
    for (const edge of graph.edges) {
      const source = byId[edge.source];
      const target = byId[edge.target];
      assert.ok(source && target, edge.id);
      const loop = sameColumn(edge.source, edge.target);
      const sourceH = source.h ?? 96;
      const targetH = target.h ?? 96;
      const route = packMapEdgeRoute({
        sourceX: source.x + PACK_MAP_NODE_W,
        sourceY: source.y + sourceH / 2,
        targetX: loop ? target.x + PACK_MAP_NODE_W : target.x,
        targetY: target.y + targetH / 2,
        obstacles: rects.filter(
          (rect) => rect.id !== edge.source && rect.id !== edge.target,
        ),
      });
      const hits = polylineHitsRects(
        route.points,
        rects.filter((rect) => rect.id !== edge.source && rect.id !== edge.target),
      );
      assert.deepEqual(hits, [], edge.id);
    }
  });
});
