export type PhaseRunState = "pending" | "running" | "ok" | "fail" | "skipped";

const PHASE_START = /^--- phase (.+?) \(/;
const PHASE_FAIL = /ansible-playbook failed \(exit \d+\) phase=(\S+)/;

export function derivePhaseStates(opts: {
  phases: string[];
  skipped: Map<string, string>;
  log: string;
  exitCode: number | null;
  running: boolean;
}): Map<string, PhaseRunState> {
  const states = new Map<string, PhaseRunState>();
  for (const phase of opts.phases) {
    states.set(phase, opts.skipped.has(phase) ? "skipped" : "pending");
  }

  let current: string | null = null;
  for (const raw of opts.log.split(/\r?\n/)) {
    const start = raw.match(PHASE_START);
    if (start) {
      const name = start[1];
      if (current && states.get(current) === "running") {
        states.set(current, "ok");
      }
      if (states.has(name) && states.get(name) !== "skipped") {
        states.set(name, "running");
        current = name;
      } else {
        current = null;
      }
      continue;
    }
    const fail = raw.match(PHASE_FAIL);
    if (fail) {
      const name = fail[1];
      if (states.has(name) && states.get(name) !== "skipped") {
        states.set(name, "fail");
      }
      if (current === name) {
        current = null;
      }
    }
  }

  if (current && states.get(current) === "running") {
    if (opts.exitCode === 0) {
      states.set(current, "ok");
    } else if (opts.exitCode !== null) {
      states.set(current, "fail");
    } else if (!opts.running) {
      states.set(current, "fail");
    }
  }

  return states;
}
