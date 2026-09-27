import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyClusterYamlDraft,
  parseClusterYaml,
  type ClusterYamlDraft,
} from "./cluster-yaml-model.ts";

const FIXTURE = `# keep this comment
schema_version: 2
id: build30/infra
display_name: build30/infra
playbooks:
  atlas-compute-provision:
    source: git
    layout: roles/
    shallow: true
    sync: always
    url: git@gitea.mxhash.com:root/atlas-compute-provision.git
    ref: main
    entries:
      provision:
        file: playbooks/provision_nodes.yaml
        invocations:
        - tags: 00_ensure_workspace
        - tags: provision_wait_ssh
          root_ssh: true
        git_ssh: true
        ansible:
          strategy: linear
          forks: 100
    path: atlas-compute-provision
    path_relative_to: sibling
phases:
- provision: atlas-compute-provision/provision
execution:
  mode: docker
  image: harbor.mxhash.com/library/krang
  tag: latest
`;

describe("parseClusterYaml", () => {
  it("reads schema v2 identity, playbooks, phases, and execution", () => {
    const parsed = parseClusterYaml(FIXTURE);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.schemaOk, true);
    assert.equal(parsed.draft.displayName, "build30/infra");
    assert.equal(parsed.draft.id, "build30/infra");
    assert.equal(parsed.draft.playbooks.length, 1);
    assert.equal(parsed.draft.playbooks[0].name, "atlas-compute-provision");
    assert.equal(parsed.draft.playbooks[0].entries[0].name, "provision");
    assert.equal(parsed.draft.playbooks[0].entries[0].gitSsh, true);
    assert.equal(parsed.draft.playbooks[0].entries[0].ansibleStrategy, "linear");
    assert.equal(parsed.draft.playbooks[0].entries[0].ansibleForks, "100");
    assert.equal(
      parsed.draft.playbooks[0].entries[0].invocations[1].rootSsh,
      true,
    );
    assert.equal(parsed.draft.phases[0].alias, "provision");
    assert.equal(parsed.draft.execution.mode, "docker");
  });

  it("rejects invalid YAML", () => {
    const parsed = parseClusterYaml("playbooks: [");
    assert.equal(parsed.ok, false);
    assert.ok(parsed.error);
  });

  it("marks non-v2 schema as not form-safe", () => {
    const parsed = parseClusterYaml("schema_version: 1\nid: x\n");
    assert.equal(parsed.ok, true);
    assert.equal(parsed.schemaOk, false);
  });
});

describe("applyClusterYamlDraft", () => {
  it("updates known fields without dropping extra keys or comments", () => {
    const parsed = parseClusterYaml(FIXTURE);
    const draft: ClusterYamlDraft = structuredClone(parsed.draft);
    draft.displayName = "Infra platform";
    const invocation = draft.playbooks[0].entries[0].invocations[0];
    invocation.tags = "00_ensure_workspace,99_extra";
    const next = applyClusterYamlDraft(FIXTURE, draft, parsed.draft);
    assert.match(next, /# keep this comment/);
    assert.match(next, /display_name: Infra platform/);
    assert.match(next, /00_ensure_workspace,99_extra/);
    assert.match(next, /git_ssh: true/);
    assert.match(next, /strategy: linear/);
    assert.match(next, /forks: 100/);
    assert.match(next, /path_relative_to: sibling/);
    assert.match(next, /root_ssh: true/);
  });
});
