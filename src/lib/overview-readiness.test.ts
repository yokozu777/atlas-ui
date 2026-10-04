import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { overviewReadiness } from "./overview-readiness.ts";

describe("overviewReadiness", () => {
  it("is ready when repos are synced and the executor image is present", () => {
    const view = overviewReadiness({
      missing: [],
      docker_image: "harbor.example/library/krang:latest",
      docker_image_present: true,
    });
    assert.equal(view.ready, true);
    assert.equal(view.repos.length, 0);
    assert.equal(view.image, null);
    assert.equal(view.sync, false);
    assert.equal(view.pull, false);
    assert.equal(view.summary, "Executor image present, repos ready.");
  });

  it("omits the image when execution is not docker", () => {
    const view = overviewReadiness({
      missing: [],
      docker_image: null,
      docker_image_present: false,
    });
    assert.equal(view.ready, true);
    assert.equal(view.image, null);
    assert.equal(view.pull, false);
    assert.equal(view.summary, "Repos ready.");
  });

  it("flags a missing executor image for pull", () => {
    const view = overviewReadiness({
      missing: [],
      docker_image: "harbor.example/library/krang:latest",
      docker_image_present: false,
    });
    assert.equal(view.ready, false);
    assert.equal(view.pull, true);
    assert.equal(view.sync, false);
    assert.equal(view.image?.id, "docker");
    assert.equal(view.image?.detail, "harbor.example/library/krang:latest");
    assert.match(view.image?.label ?? "", /not pulled/);
  });

  it("groups workspace, lock, and git into one sync action", () => {
    const view = overviewReadiness({
      missing: [
        {
          kind: "workspace",
          label: "Workspace directory is not created yet",
        },
        {
          kind: "lock",
          name: "playbooks.lock",
          label: "playbooks.lock is missing",
        },
        {
          kind: "git_repo",
          name: "atlas-infra-edge",
          label: "Git repo atlas-infra-edge is not synced",
          path: "/ws/atlas-infra-edge",
        },
      ],
      docker_image: "harbor.example/library/krang:337",
      docker_image_present: true,
    });
    assert.equal(view.ready, false);
    assert.equal(view.sync, true);
    assert.equal(view.pull, false);
    assert.equal(view.image, null);
    assert.deepEqual(
      view.repos.map((row) => row.label),
      [
        "Workspace directory is not created yet",
        "playbooks.lock is missing",
        "Git repo atlas-infra-edge is not synced",
      ],
    );
    assert.equal(view.repos[2]?.detail, "/ws/atlas-infra-edge");
  });

  it("treats a missing Atlas SSH key as not ready", () => {
    const view = overviewReadiness({
      missing: [
        {
          kind: "ssh_key",
          name: "clusterctl",
          label: "Atlas SSH key is not selected",
        },
      ],
      docker_image: "harbor.example/library/krang:latest",
      docker_image_present: true,
    });
    assert.equal(view.ready, false);
    assert.equal(view.sync, false);
    assert.equal(view.restorePub, false);
    assert.equal(view.selectKey, true);
    assert.equal(view.pull, false);
  });

  it("restores the operator public key when the Atlas secret is already selected", () => {
    const view = overviewReadiness({
      missing: [
        {
          kind: "operator_pub",
          name: "localuser.pub",
          label: "Operator public key is not installed",
        },
      ],
      docker_image_present: true,
    });
    assert.equal(view.ready, false);
    assert.equal(view.sync, false);
    assert.equal(view.restorePub, true);
    assert.equal(view.selectKey, false);
  });

  it("asks for both sync and pull when image and repos are missing", () => {
    const view = overviewReadiness({
      missing: [{ kind: "git_repo", name: "atlas-k3s", label: "Git repo atlas-k3s is not synced" }],
      docker_image: "harbor.example/library/krang:latest",
      docker_image_present: false,
    });
    assert.equal(view.ready, false);
    assert.equal(view.sync, true);
    assert.equal(view.pull, true);
    assert.equal(view.repos.length, 1);
  });
});
