import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  atlasLoginRedirectPath,
  hubAuthMeUrl,
  hubAuthRefreshUrl,
  hubSessionGateApplies,
  hubSessionUnavailable,
  hubSessionIsAuthenticated,
  isAtlasApiPath,
  isPublicAtlasPath,
  atlasPostLoginPath,
  safeAtlasNextPath,
  shouldAttemptHubRefresh,
  shouldRestoreSessionFromRefresh,
} from "./hub-session-gate.ts";

describe("isPublicAtlasPath", () => {
  it("allows login and auth probes", () => {
    assert.equal(isPublicAtlasPath("/login"), true);
    assert.equal(isPublicAtlasPath("/login?next=/projects"), true);
    assert.equal(isPublicAtlasPath("/api/auth/me"), true);
    assert.equal(isPublicAtlasPath("/api/auth/refresh"), true);
    assert.equal(isPublicAtlasPath("/_next/static/chunk.js"), true);
  });

  it("does not treat app pages as public", () => {
    assert.equal(isPublicAtlasPath("/projects/p1"), false);
    assert.equal(isPublicAtlasPath("/"), false);
  });
});

describe("hubSessionGateApplies", () => {
  it("skips local mode without Hub URL", () => {
    assert.equal(hubSessionGateApplies("/projects/p1", ""), false);
    assert.equal(hubSessionGateApplies("/projects/p1", null), false);
    assert.equal(hubSessionGateApplies("/projects/p1", undefined), false);
  });

  it("skips public and /api paths when Hub URL is set", () => {
    const hub = "http://hub:8000";
    assert.equal(hubSessionGateApplies("/login", hub), false);
    assert.equal(hubSessionGateApplies("/api/auth/me", hub), false);
    assert.equal(hubSessionGateApplies("/api/projects", hub), false);
    assert.equal(hubSessionGateApplies("/api", hub), false);
    assert.equal(isAtlasApiPath("/api/projects/p1/hosts"), true);
  });

  it("gates HTML pages when Hub URL is set", () => {
    assert.equal(hubSessionGateApplies("/projects/p1", "http://hub:8000"), true);
    assert.equal(hubSessionGateApplies("/", " http://hub:8000 "), true);
  });
});

describe("hub session status helpers", () => {
  it("builds login next and Hub URLs", () => {
    assert.equal(
      atlasLoginRedirectPath("/projects/p1"),
      "/login?next=%2Fprojects%2Fp1",
    );
    assert.equal(hubAuthMeUrl("http://hub:8000/"), "http://hub:8000/api/auth/me");
    assert.equal(
      hubAuthRefreshUrl("http://hub:8000"),
      "http://hub:8000/api/auth/refresh",
    );
  });

  it("refreshes on 401/403 when a refresh cookie exists", () => {
    assert.equal(hubSessionIsAuthenticated(200), true);
    assert.equal(shouldAttemptHubRefresh(401, true), true);
    assert.equal(shouldAttemptHubRefresh(403, true), true);
    assert.equal(shouldAttemptHubRefresh(401, false), false);
    assert.equal(shouldAttemptHubRefresh(404, true), false);
    assert.equal(hubSessionUnavailable(0), true);
    assert.equal(hubSessionUnavailable(503), true);
    assert.equal(hubSessionUnavailable(401), false);
    assert.equal(hubSessionUnavailable(200), false);
  });
});

describe("safeAtlasNextPath", () => {
  it("keeps same-origin relative paths", () => {
    assert.equal(safeAtlasNextPath("/projects/p1"), "/projects/p1");
    assert.equal(safeAtlasNextPath("/"), "/");
  });

  it("rejects open redirects", () => {
    assert.equal(safeAtlasNextPath("https://evil.example"), "/projects");
    assert.equal(safeAtlasNextPath("//evil.example"), "/projects");
    assert.equal(safeAtlasNextPath("/\\evil"), "/projects");
    assert.equal(safeAtlasNextPath(""), "/projects");
    assert.equal(safeAtlasNextPath(null), "/projects");
  });
});

describe("atlasPostLoginPath", () => {
  it("follows next after a normal sign-in", () => {
    assert.equal(
      atlasPostLoginPath("/projects/p1/cluster-yaml", false),
      "/projects/p1/cluster-yaml",
    );
  });

  it("does not send the user back to the login page", () => {
    assert.equal(atlasPostLoginPath("/login", false), "/projects");
    assert.equal(atlasPostLoginPath("/login?next=%2Fprojects", false), "/projects");
    assert.equal(atlasPostLoginPath(null, false), "/projects");
  });

  it("sends a first-login account to change password", () => {
    assert.equal(atlasPostLoginPath("/projects/p1", true), "/change-password");
  });
});

describe("shouldRestoreSessionFromRefresh", () => {
  it("mints a new access cookie when only the refresh cookie remains", () => {
    assert.equal(shouldRestoreSessionFromRefresh(false, true), true);
    assert.equal(shouldRestoreSessionFromRefresh(true, true), false);
    assert.equal(shouldRestoreSessionFromRefresh(false, false), false);
  });
});
