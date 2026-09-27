import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { atlasCan, atlasIsAdmin } from "./authz-can.ts";

describe("atlasCan local mode", () => {
  it("grants all when remote is false", () => {
    const me = { username: "local", remote: false as const };
    assert.equal(atlasIsAdmin(me), true);
    assert.equal(atlasCan(me, "projects.create"), true);
    assert.equal(atlasCan(me, "playbooks.execute"), true);
  });
});

describe("atlasCan remote RBAC", () => {
  it("denies without permissions", () => {
    const me = { username: "user", remote: true, permissions: [] as string[] };
    assert.equal(atlasIsAdmin(me), false);
    assert.equal(atlasCan(me, "projects.create"), false);
  });

  it("allows listed permissions", () => {
    const me = {
      username: "user",
      remote: true,
      permissions: ["projects.create"],
    };
    assert.equal(atlasCan(me, "projects.create"), true);
    assert.equal(atlasCan(me, "projects.delete"), false);
  });

  it("allows admin everything", () => {
    const me = { username: "admin", remote: true, isAdmin: true, permissions: [] };
    assert.equal(atlasIsAdmin(me), true);
    assert.equal(atlasCan(me, "users.delete"), true);
  });

  it("does not treat missing remote as local", () => {
    const me = { username: "user", permissions: [] as string[] };
    assert.equal(atlasIsAdmin(me), false);
    assert.equal(atlasCan(me, "projects.create"), false);
  });

  it("denies when me is null", () => {
    assert.equal(atlasCan(null, "projects.create"), false);
    assert.equal(atlasCan(undefined, "projects.create"), false);
    assert.equal(atlasCan(null, ""), true);
  });
});
