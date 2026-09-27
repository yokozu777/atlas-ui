import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  distroKindFromFacts,
  distroKindFromName,
} from "./distro-kind.ts";

describe("distroKindFromName", () => {
  it("maps ansible_distribution and clone template names", () => {
    assert.equal(distroKindFromName("Ubuntu"), "ubuntu");
    assert.equal(distroKindFromName("ubuntu-base"), "ubuntu");
    assert.equal(distroKindFromName("Debian"), "debian");
    assert.equal(distroKindFromName("OracleLinux"), "oracle");
    assert.equal(distroKindFromName("RedHat"), "rhel");
    assert.equal(distroKindFromName("Red Hat Enterprise Linux"), "rhel");
    assert.equal(distroKindFromName("Rocky"), "rocky");
    assert.equal(distroKindFromName("AlmaLinux"), "alma");
    assert.equal(distroKindFromName("Fedora"), "fedora");
    assert.equal(distroKindFromName("Alpine"), "alpine");
    assert.equal(distroKindFromName("Windows"), "windows");
  });

  it("falls back to generic", () => {
    assert.equal(distroKindFromName(""), "generic");
    assert.equal(distroKindFromName(null), "generic");
    assert.equal(distroKindFromName("CentOS"), "generic");
  });

  it("prefers Oracle/Rocky/Alma over RedHat family", () => {
    assert.equal(distroKindFromName("OracleLinux RedHat"), "oracle");
    assert.equal(distroKindFromName("Rocky Linux RedHat"), "rocky");
    assert.equal(distroKindFromName("AlmaLinux RedHat"), "alma");
  });
});

describe("distroKindFromFacts", () => {
  it("reads ansible_distribution", () => {
    assert.equal(
      distroKindFromFacts({ ansible_distribution: "Debian" }),
      "debian",
    );
  });

  it("uses os_family when distribution is missing", () => {
    assert.equal(
      distroKindFromFacts({ ansible_os_family: "Windows" }),
      "windows",
    );
  });

  it("is generic without facts", () => {
    assert.equal(distroKindFromFacts(null), "generic");
    assert.equal(distroKindFromFacts({}), "generic");
  });
});
