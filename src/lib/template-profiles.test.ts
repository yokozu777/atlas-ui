import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { INIT_TEMPLATES } from "./templates.ts";
import { templateProfile } from "./template-profiles.ts";

describe("template profiles", () => {
  it("covers every init template and matches role counts to guest VMs", () => {
    for (const name of INIT_TEMPLATES) {
      const profile = templateProfile(name);
      assert.ok(profile, name);
      const roles = profile.roles.reduce((sum, role) => sum + role.count, 0);
      assert.equal(roles, profile.servers, name);
      for (const group of profile.spec) {
        assert.ok(group.items.length > 0, `${name} ${group.title}`);
        for (const item of group.items) {
          assert.ok(item.version.trim(), `${name} ${item.name}`);
        }
      }
      assert.ok(profile.flow.length > 0, name);
      for (const stage of profile.flow) {
        assert.ok(stage.title.trim(), `${name} stage`);
        assert.ok(stage.nodes.length > 0, `${name} ${stage.title}`);
      }
    }
  });

  it("uses the scaffold sizes", () => {
    assert.equal(templateProfile("k8s_full")?.servers, 8);
    assert.equal(templateProfile("infra_edge")?.servers, 1);
    assert.equal(templateProfile("pve_templates")?.servers, 0);
    assert.equal(templateProfile("redis")?.servers, 10);
    assert.equal(templateProfile("postgresql")?.servers, 9);
    assert.equal(templateProfile("kafka")?.servers, 6);
    assert.equal(templateProfile("jenkins_agent")?.servers, 3);
    assert.equal(templateProfile("gitlab_runner")?.servers, 3);
  });
});
