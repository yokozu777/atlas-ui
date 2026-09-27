import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hostStatusKind, hostStatusLabel } from "./helpers.ts";

describe("hostStatusKind", () => {
  it("maps persisted check results", () => {
    assert.equal(hostStatusKind("online"), "ok");
    assert.equal(hostStatusKind("ONLINE"), "ok");
    assert.equal(hostStatusKind("offline"), "fail");
    assert.equal(hostStatusKind("checking"), "running");
  });

  it("keeps unknown for empty values", () => {
    assert.equal(hostStatusKind(undefined), "unknown");
    assert.equal(hostStatusKind(""), "unknown");
  });
});

describe("hostStatusLabel", () => {
  it("uppercases the stored status", () => {
    assert.equal(hostStatusLabel("online"), "ONLINE");
    assert.equal(hostStatusLabel(undefined), "UNKNOWN");
  });
});
