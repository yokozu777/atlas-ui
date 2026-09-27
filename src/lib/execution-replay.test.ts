import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  atlasReplayBody,
  canReplayExecution,
  executionRowAction,
  isAtlasPipelineRun,
} from "./execution-replay";

describe("executionRowAction", () => {
  it("cancels queued and pending jobs", () => {
    assert.equal(executionRowAction("QUEUED"), "cancel");
    assert.equal(executionRowAction("pending"), "cancel");
  });

  it("stops running jobs", () => {
    assert.equal(executionRowAction("RUNNING"), "stop");
  });

  it("hides actions while canceling", () => {
    assert.equal(executionRowAction("CANCELING"), null);
    assert.equal(executionRowAction("CANCELLING"), null);
  });

  it("reruns finished jobs", () => {
    assert.equal(executionRowAction("SUCCESS"), "rerun");
    assert.equal(executionRowAction("FAILED"), "rerun");
    assert.equal(executionRowAction("CANCELED"), "rerun");
    assert.equal(executionRowAction("ok"), "rerun");
  });
});

describe("isAtlasPipelineRun", () => {
  it("replays clusterctl run argv", () => {
    assert.equal(
      isAtlasPipelineRun({
        kind: "atlas",
        runParams: {
          argv: ["--cluster", "lab/default", "run", "--phases", "provision"],
          cluster_id: "lab/default",
        },
      }),
      true,
    );
  });

  it("does not replay workspace reset", () => {
    assert.equal(
      isAtlasPipelineRun({
        kind: "atlas",
        playbookName: "workspace reset",
        runParams: {
          argv: ["workspace", "reset", "--yes"],
          cluster_id: "lab/default",
        },
      }),
      false,
    );
  });

  it("does not replay repos sync", () => {
    assert.equal(
      isAtlasPipelineRun({
        kind: "atlas",
        playbookName: "repos sync",
        runParams: { argv: ["repos", "sync"], cluster_id: "lab/default" },
      }),
      false,
    );
  });
});

describe("canReplayExecution", () => {
  it("requires a playbook id for ansible", () => {
    assert.equal(canReplayExecution({ playbookName: "site" }), false);
    assert.equal(
      canReplayExecution({ playbookId: "pb-1", playbookName: "site" }),
      true,
    );
  });
});

describe("atlasReplayBody", () => {
  it("rebuilds phases, extra args, and cluster id", () => {
    assert.deepEqual(
      atlasReplayBody(
        {
          kind: "atlas",
          runParams: {
            cluster_id: "lab/default",
            phases: ["provision"],
            root_ssh: true,
            argv: [
              "--cluster",
              "lab/default",
              "run",
              "--phases",
              "provision",
              "--root-ssh",
              "--dry-run",
              "--tags",
              "00_ensure_workspace",
              "--executor",
              "docker",
            ],
          },
        },
        "other/cluster",
      ),
      {
        phases: ["provision"],
        root_ssh: true,
        dry_run: true,
        cluster_id: "lab/default",
        extra_args: ["--tags", "00_ensure_workspace", "--executor", "docker"],
      },
    );
  });

  it("uses the page cluster when runParams omit cluster_id", () => {
    assert.equal(
      atlasReplayBody(
        {
          kind: "atlas",
          runParams: { phases: [], argv: ["--cluster", "x", "run"] },
        },
        "lab/default",
      ).cluster_id,
      "lab/default",
    );
  });
});
