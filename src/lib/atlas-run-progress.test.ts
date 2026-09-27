import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseAnsibleLine, parseLogLine } from "./execution-log/parse-ansible.ts";
import { parseLogText } from "./execution-log/ingest.ts";
import {
  atlasRunProgress,
  atlasRunProgressFromText,
  logPhaseSlices,
  matchPhaseIndex,
  packMapFocusFromProgress,
  packMapPhaseAliases,
  packMapRoleMarks,
  packMapRoleProgress,
  packMapRoleProgressByPhase,
  phaseStepLabel,
} from "./atlas-run-progress.ts";

describe("parse markers", () => {
  it("tags atlas preamble", () => {
    const meta = parseAnsibleLine(
      "atlas: clusterctl=/atlas/clusterctl clusters=/atlas/clusters",
    );
    assert.equal(meta.kind, "atlas");
  });

  it("tags docker lines", () => {
    const meta = parseAnsibleLine(
      "docker: chown -R 1000:1000 → /tmp/clusterctl-home",
    );
    assert.equal(meta.kind, "docker");
  });

  it("tags clusterctl phase headers", () => {
    const phase = parseAnsibleLine(
      "--- phase atlas-compute-provision/templates (playbooks/build_templates.yaml) ---",
    );
    assert.equal(phase.kind, "phase");
    assert.equal(phase.task, "atlas-compute-provision/templates");
    const inv = parseAnsibleLine(
      "--- atlas-compute-provision/templates [1/6] tags=00_ensure_workspace ---",
    );
    assert.equal(inv.kind, "phase");
    assert.equal(inv.task, "atlas-compute-provision/templates");
  });
});

describe("matchPhaseIndex", () => {
  it("matches alias to phase_ref tail", () => {
    assert.equal(
      matchPhaseIndex(["templates"], "atlas-compute-provision/templates"),
      0,
    );
  });

  it("matches k8s alias to the repo when the entry id differs", () => {
    const phases = ["provision", "init", "k8s-core", "k8s-addons"];
    assert.equal(matchPhaseIndex(phases, "atlas-compute-provision/provision"), 0);
    assert.equal(matchPhaseIndex(phases, "atlas-node-foundation/init"), 1);
    assert.equal(matchPhaseIndex(phases, "atlas-k8s-core/cluster"), 2);
    assert.equal(matchPhaseIndex(phases, "atlas-k8s-addons/addons"), 3);
  });
});

describe("atlasRunProgress", () => {
  it("queued with preamble stays on Queue", () => {
    const lines = [
      parseLogLine(1, "atlas: clusterctl=/atlas/clusterctl clusters=/atlas/clusters"),
      parseLogLine(2, "atlas: executor=docker (CLUSTER_EXECUTOR_FORCE_LOCAL unset)"),
    ];
    const progress = atlasRunProgress({
      status: "QUEUED",
      lines,
      executor: "docker",
    });
    assert.equal(progress.steps.find((step) => step.id === "queue")?.state, "running");
    assert.equal(progress.currentLabel, "Waiting for worker…");
    assert.ok(progress.steps.some((step) => step.id === "docker"));
  });

  it("advances through docker then phase templates", () => {
    const progress = atlasRunProgressFromText({
      status: "RUNNING",
      phases: ["templates"],
      text: [
        "atlas: executor=docker",
        "docker: img:tag → run",
        "--- phase atlas-compute-provision/templates (playbooks/build_templates.yaml) ---",
        "",
      ].join("\n"),
    });
    assert.equal(progress.steps.find((step) => step.id === "queue")?.state, "ok");
    assert.equal(progress.steps.find((step) => step.id === "worker")?.state, "ok");
    assert.equal(progress.steps.find((step) => step.id === "docker")?.state, "ok");
    assert.equal(
      progress.steps.find((step) => step.id === "phase:templates")?.state,
      "running",
    );
    assert.equal(progress.currentLabel, "atlas-compute-provision/templates");
  });

  it("uses TASK as currentLabel", () => {
    const progress = atlasRunProgressFromText({
      status: "RUNNING",
      phases: ["templates"],
      text: [
        "--- phase atlas-compute-provision/templates (playbooks/build_templates.yaml) ---",
        "TASK [02_download_images : Wait for cloud image downloads] ***",
        "",
      ].join("\n"),
    });
    assert.equal(
      progress.currentLabel,
      "02_download_images : Wait for cloud image downloads",
    );
  });

  it("advances past init when the k8s entry id is not the alias", () => {
    const progress = atlasRunProgressFromText({
      status: "RUNNING",
      phases: ["provision", "init", "k8s-core", "k8s-addons"],
      text: [
        "--- phase atlas-node-foundation/init (playbooks/init.yaml) ---",
        "--- phase atlas-k8s-core/cluster (playbooks/cluster_core.yaml) ---",
        "--- phase atlas-k8s-addons/addons (playbooks/cluster_addons.yaml) ---",
        "--- atlas-k8s-addons/addons [12/40] tags=330_prometheus_adapter ---",
        "TASK [330_prometheus_adapter : Helming prometheus-adapter] ***",
      ].join("\n"),
    });
    assert.equal(
      progress.steps.find((step) => step.id === "phase:init")?.state,
      "ok",
    );
    assert.equal(
      progress.steps.find((step) => step.id === "phase:k8s-core")?.state,
      "ok",
    );
    assert.equal(
      progress.steps.find((step) => step.id === "phase:k8s-addons")?.state,
      "running",
    );
    assert.equal(progress.currentLabel, "330_prometheus_adapter : Helming prometheus-adapter");
  });

  it("marks the running phase failed", () => {
    const progress = atlasRunProgressFromText({
      status: "FAILED",
      phases: ["templates"],
      text: [
        "--- phase atlas-compute-provision/templates (playbooks/build_templates.yaml) ---",
        "TASK [02_download_images : Wait for cloud image downloads] ***",
        "",
      ].join("\n"),
    });
    assert.equal(
      progress.steps.find((step) => step.id === "phase:templates")?.state,
      "fail",
    );
    assert.equal(
      progress.currentLabel,
      "02_download_images : Wait for cloud image downloads",
    );
  });

  it("single playbooks step when phases unknown", () => {
    const progress = atlasRunProgressFromText({
      status: "RUNNING",
      text: "TASK [ping] ***\n",
    });
    assert.equal(progress.steps.find((step) => step.id === "playbooks")?.state, "running");
    assert.equal(progress.currentLabel, "ping");
  });

  it("focuses the running phase and ignores queue", () => {
    const queued = atlasRunProgressFromText({
      status: "RUNNING",
      phases: ["templates"],
      text: "",
    });
    assert.deepEqual(packMapFocusFromProgress(queued, "RUNNING"), {
      alias: null,
      state: null,
    });
    const running = atlasRunProgressFromText({
      status: "RUNNING",
      phases: ["templates"],
      text: "--- phase atlas-compute-provision/templates (playbooks/build_templates.yaml) ---\n",
    });
    assert.deepEqual(packMapFocusFromProgress(running, "RUNNING"), {
      alias: "templates",
      state: "running",
    });
  });

  it("keeps the failed phase after the run ends", () => {
    const progress = atlasRunProgressFromText({
      status: "FAILED",
      phases: ["templates", "guests"],
      text: "--- phase atlas-compute-provision/templates (playbooks/build_templates.yaml) ---\n",
    });
    assert.deepEqual(packMapFocusFromProgress(progress, "FAILED"), {
      alias: "templates",
      state: "fail",
    });
  });

  it("marks earlier roles done and the current role running", () => {
    const progress = packMapRoleProgress(
      [
        "--- atlas-compute-provision/templates [1/6] tags=00_ensure_workspace ---",
        "--- atlas-compute-provision/templates [2/6] tags=00_check_pve_templates ---",
        "TASK [00_check_pve_templates : Check Proxmox template] ***",
      ].join("\n"),
      "RUNNING",
    );
    assert.deepEqual(
      packMapRoleMarks(
        [
          "00_ensure_workspace",
          "00_check_pve_templates",
          "01_prepare_system",
          "02_download_images",
        ],
        progress,
      ),
      ["done", "running", "pending", "pending"],
    );
  });

  it("splits a run into phase logs and names k8s phases from the repo", () => {
    const lines = parseLogText(
      [
        "atlas: executor=docker",
        "--- phase atlas-compute-provision/provision (playbooks/provision_nodes.yaml) ---",
        "TASK [provision] ***",
        "--- phase atlas-k8s-core/cluster (playbooks/cluster_core.yaml) ---",
        "TASK [core] ***",
        "--- phase atlas-k8s-addons/addons (playbooks/cluster_addons.yaml) ---",
        "fatal: [localhost]: FAILED! => kibana",
      ].join("\n"),
    );
    assert.equal(phaseStepLabel("atlas-k8s-addons/addons"), "k8s-addons");
    assert.equal(phaseStepLabel("atlas-compute-provision/provision"), "provision");
    const slices = logPhaseSlices(lines);
    assert.deepEqual(
      slices.map((slice) => slice.label),
      ["provision", "k8s-core", "k8s-addons"],
    );
    assert.equal(slices[2]?.lines.some((line) => line.plain.includes("kibana")), true);
    assert.equal(slices[0]?.lines.some((line) => line.plain.includes("kibana")), false);
    const progress = atlasRunProgress({
      status: "FAILED",
      lines,
      phases: slices.map((slice) => slice.label),
    });
    assert.equal(progress.steps.find((step) => step.id === "phase:k8s-addons")?.state, "fail");
    assert.equal(progress.steps.find((step) => step.id === "phase:provision")?.state, "ok");
  });

  it("marks finished phases done on a past run", () => {
    const byPhase = packMapRoleProgressByPhase(
      [
        "--- phase atlas-compute-provision/templates (playbooks/build_templates.yaml) ---",
        "--- atlas-compute-provision/templates [1/2] tags=00_ensure_workspace ---",
        "--- phase atlas-compute-provision/guests (playbooks/build_guests.yaml) ---",
        "--- atlas-compute-provision/guests [1/2] tags=10_tf_apply ---",
      ].join("\n"),
      "SUCCESS",
    );
    assert.equal(byPhase.templates?.settled, "ok");
    assert.equal(byPhase.guests?.settled, "ok");
    assert.deepEqual(packMapPhaseAliases(
      "--- phase atlas-compute-provision/templates (playbooks/build_templates.yaml) ---\n",
    ), ["templates"]);
  });
});
