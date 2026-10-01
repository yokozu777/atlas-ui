import { parseLogText, type LogCounts, type ParsedLogLine } from "./execution-log";

export type AtlasRunStepState = "pending" | "running" | "ok" | "fail";

export type AtlasRunStep = {
  id: string;
  label: string;
  detail?: string;
  state: AtlasRunStepState;
};

export type AtlasRunProgress = {
  steps: AtlasRunStep[];
  currentLabel?: string;
};

export type AtlasRunProgressInput = {
  status?: string | null;
  lines: ParsedLogLine[];
  phases?: string[];
  executor?: string | null;
};

function normalizePhaseKey(value: string): string {
  const trimmed = value.trim().replace(/\\/g, "/");
  const base = trimmed.split("/").filter(Boolean).pop() || trimmed;
  return base.toLowerCase();
}

function repoPhaseKeys(value: string): string[] {
  const parts = value.trim().replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length < 2) {
    return [];
  }
  const repo = parts[0]?.toLowerCase() ?? "";
  if (!repo) {
    return [];
  }
  const keys = [repo];
  if (repo.startsWith("atlas-")) {
    const stripped = repo.slice("atlas-".length);
    if (stripped) {
      keys.push(stripped);
    }
  }
  return keys;
}

export function matchPhaseIndex(phases: string[], seen: string): number {
  const exact = phases.findIndex((item) => item === seen);
  if (exact >= 0) {
    return exact;
  }
  const key = normalizePhaseKey(seen);
  const byTail = phases.findIndex((item) => normalizePhaseKey(item) === key);
  if (byTail >= 0) {
    return byTail;
  }
  const repoKeys = repoPhaseKeys(seen);
  if (repoKeys.length === 0) {
    return -1;
  }
  return phases.findIndex((item) => repoKeys.includes(normalizePhaseKey(item)));
}

function detectExecutor(
  lines: ParsedLogLine[],
  executor?: string | null,
): "docker" | "local" | null {
  const raw = (executor || "").trim().toLowerCase();
  if (raw === "docker" || raw === "local") {
    return raw;
  }
  for (const line of lines) {
    if (line.kind === "docker") {
      return "docker";
    }
    if (line.kind === "atlas") {
      if (/\bexecutor=docker\b/.test(line.plain)) {
        return "docker";
      }
      if (/\bexecutor=local\b/.test(line.plain)) {
        return "local";
      }
    }
  }
  return null;
}

function step(
  id: string,
  label: string,
  state: AtlasRunStepState,
): AtlasRunStep {
  return { id, label, state };
}

function markRunning(steps: AtlasRunStep[], runningId: string): AtlasRunStep[] {
  let passed = false;
  return steps.map((item) => {
    if (item.id === runningId) {
      passed = true;
      return { ...item, state: "running" };
    }
    if (!passed) {
      return { ...item, state: "ok" };
    }
    return { ...item, state: "pending" };
  });
}

function lastNonPendingIndex(steps: AtlasRunStep[]): number {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    if (steps[index]?.state !== "pending") {
      return index;
    }
  }
  return 0;
}

export function atlasRunProgress(input: AtlasRunProgressInput): AtlasRunProgress {
  const status = (input.status || "UNKNOWN").toUpperCase();
  const lines = input.lines;
  const phaseNames = (input.phases ?? [])
    .map((item) => item.trim())
    .filter(Boolean);
  const executor = detectExecutor(lines, input.executor);
  const includeDocker =
    executor === "docker" || lines.some((line) => line.kind === "docker");

  let lastTask: string | null = null;
  let lastPhase: string | null = null;
  let currentPhaseIndex = -1;
  let sawPlaybooks = false;

  for (const line of lines) {
    if (line.kind === "task" && line.task) {
      lastTask = line.task;
      sawPlaybooks = true;
      if (currentPhaseIndex < 0) {
        currentPhaseIndex = 0;
      }
    }
    if (line.kind === "play" && line.task && !lastTask) {
      lastTask = line.task;
      sawPlaybooks = true;
    }
    if (line.kind === "phase" && line.task) {
      lastPhase = line.task;
      sawPlaybooks = true;
      if (phaseNames.length > 0) {
        const idx = matchPhaseIndex(phaseNames, line.task);
        if (idx >= 0) {
          currentPhaseIndex = Math.max(currentPhaseIndex, idx);
        } else if (currentPhaseIndex < 0) {
          currentPhaseIndex = 0;
        }
      } else {
        currentPhaseIndex = 0;
      }
    }
  }

  const playbookSteps =
    phaseNames.length > 0
      ? phaseNames.map((name) => step(`phase:${name}`, name, "pending"))
      : [step("playbooks", "Run playbooks", "pending")];

  const steps: AtlasRunStep[] = [
    step("queue", "Queue", "pending"),
    step("worker", "Start worker", "pending"),
  ];
  if (includeDocker) {
    steps.push(step("docker", "Docker executor", "pending"));
  }
  steps.push(...playbookSteps);

  if (status === "QUEUED") {
    return {
      steps: steps.map((item) =>
        item.id === "queue" ? { ...item, state: "running" } : item,
      ),
      currentLabel: "Waiting for worker…",
    };
  }

  if (status === "SUCCESS") {
    return {
      steps: steps.map((item) => ({ ...item, state: "ok" })),
      currentLabel: "Done",
    };
  }

  const sawDocker = lines.some((line) => line.kind === "docker");
  const inPlaybooks = sawPlaybooks || currentPhaseIndex >= 0;
  let runningId = "worker";
  if (inPlaybooks) {
    runningId =
      phaseNames.length > 0
        ? (playbookSteps[Math.max(0, currentPhaseIndex)]?.id ?? "playbooks")
        : "playbooks";
  } else if (sawDocker) {
    runningId = "docker";
  }

  let next = markRunning(steps, runningId);
  if (inPlaybooks && phaseNames.length > 0) {
    const active = Math.max(0, currentPhaseIndex);
    next = next.map((item) => {
      const match = /^phase:(.+)$/.exec(item.id);
      if (!match) {
        return item;
      }
      const idx = matchPhaseIndex(phaseNames, match[1] ?? "");
      if (idx < 0) {
        return item;
      }
      if (idx < active) {
        return { ...item, state: "ok" };
      }
      if (idx === active) {
        return { ...item, state: "running" };
      }
      return { ...item, state: "pending" };
    });
  }

  if (status === "FAILED" || status === "CANCELED") {
    const runningIdx = next.findIndex((item) => item.state === "running");
    const failAt = runningIdx >= 0 ? runningIdx : lastNonPendingIndex(next);
    next = next.map((item, index) =>
      index === failAt ? { ...item, state: "fail" } : item,
    );
  }

  const running = next.find((item) => item.state === "running");
  const failed = next.find((item) => item.state === "fail");
  const currentLabel =
    lastTask || lastPhase || failed?.label || running?.label || undefined;

  return { steps: next, currentLabel };
}

export function phasesFromRunParams(runParams: unknown): string[] {
  if (!runParams || typeof runParams !== "object") {
    return [];
  }
  const phases = (runParams as { phases?: unknown }).phases;
  if (!Array.isArray(phases)) {
    return [];
  }
  return phases
    .map((item) => String(item).trim())
    .filter(Boolean);
}

export function atlasRunProgressFromText(input: {
  status?: string | null;
  text: string;
  phases?: string[];
  executor?: string | null;
}): AtlasRunProgress {
  return atlasRunProgress({
    status: input.status,
    lines: parseLogText(input.text),
    phases: input.phases,
    executor: input.executor,
  });
}

export type PackMapRunFocus = {
  alias: string | null;
  state: "running" | "fail" | "done" | null;
};

function phaseAlias(step: AtlasRunStep): string | null {
  return step.id.startsWith("phase:") ? step.id.slice("phase:".length) : null;
}

export type PackMapRoleMark = "pending" | "running" | "done" | "fail";

export type PackMapRoleProgress = {
  done: string[];
  running: string[];
  failed: string[];
  settled: "ok" | "fail" | null;
};

const INVOCATION_HEADER = /^---\s+\S+\s+\[\d+\/\d+\]\s+tags=(.*?)\s*---\s*$/;
const TASK_ROLE = /^TASK \[([^\]:]+?)(?:\s*:.*)?\]/;

function splitRoleTags(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function packMapRoleProgress(
  text: string,
  status: string | null,
): PackMapRoleProgress {
  const invocations: string[][] = [];
  let taskRole: string | null = null;
  for (const line of parseLogText(text)) {
    const header = INVOCATION_HEADER.exec(line.plain.trim());
    if (header) {
      invocations.push(splitRoleTags(header[1] ?? ""));
      continue;
    }
    const task = TASK_ROLE.exec(line.plain.trim());
    if (task?.[1]) {
      taskRole = task[1].trim();
    }
  }
  const upper = (status || "").toUpperCase();
  const settled =
    upper === "SUCCESS" ? "ok" : upper === "FAILED" || upper === "CANCELED" ? "fail" : null;
  if (invocations.length === 0) {
    if (!taskRole) {
      return { done: [], running: [], failed: [], settled };
    }
    if (settled === "ok") {
      return { done: [taskRole], running: [], failed: [], settled };
    }
    if (settled === "fail") {
      return { done: [], running: [], failed: [taskRole], settled };
    }
    return { done: [], running: [taskRole], failed: [], settled };
  }
  const done = invocations.slice(0, -1).flat();
  const current = invocations[invocations.length - 1] ?? [];
  if (settled === "ok") {
    return { done: [...done, ...current], running: [], failed: [], settled };
  }
  if (settled === "fail") {
    return { done, running: [], failed: current, settled };
  }
  return { done, running: current, failed: [], settled };
}

const PHASE_HEADER = /^--- phase (\S+)/;
const INVOCATION_PHASE = /^---\s+(\S+)\s+\[\d+\/\d+\]\s+tags=(.*?)\s*---\s*$/;

function phaseAliasOf(ref: string): string {
  const parts = ref.trim().replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] || ref.trim();
}

function phaseRepoAlias(ref: string): string | null {
  const parts = ref.trim().replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  const repo = parts[0] ?? "";
  const stripped = repo.toLowerCase().startsWith("atlas-")
    ? repo.slice("atlas-".length)
    : repo;
  if (!stripped || stripped.toLowerCase() === phaseAliasOf(ref).toLowerCase()) {
    return null;
  }
  return stripped;
}

const GENERIC_PHASE_ENTRIES = new Set(["cluster", "addons"]);

export function phaseStepLabel(ref: string): string {
  const tail = phaseAliasOf(ref);
  if (!GENERIC_PHASE_ENTRIES.has(tail.toLowerCase())) {
    return tail;
  }
  return phaseRepoAlias(ref) ?? tail;
}

export type LogPhaseSlice = {
  label: string;
  lines: ParsedLogLine[];
};

export function logPhaseSlices(lines: ParsedLogLine[]): LogPhaseSlice[] {
  const starts: { label: string; index: number }[] = [];
  lines.forEach((line, index) => {
    const header = PHASE_HEADER.exec(line.plain.trim());
    if (!header?.[1]) {
      return;
    }
    starts.push({ label: phaseStepLabel(header[1]), index });
  });
  return starts.map((start, position) => ({
    label: start.label,
    lines: lines.slice(start.index, starts[position + 1]?.index ?? lines.length),
  }));
}

export function logCountsFor(lines: ParsedLogLine[]): LogCounts {
  let errors = 0;
  let warnings = 0;
  for (const line of lines) {
    if (line.severity === "error") {
      errors += 1;
    } else if (line.severity === "warning") {
      warnings += 1;
    }
  }
  return { errors, warnings, lines: lines.length };
}

export function logErrorIndexes(lines: ParsedLogLine[]): number[] {
  const indexes: number[] = [];
  lines.forEach((line, index) => {
    if (line.severity === "error") {
      indexes.push(index);
    }
  });
  return indexes;
}

export function packMapPhaseAliases(text: string): string[] {
  const seen: string[] = [];
  for (const line of parseLogText(text)) {
    const header = PHASE_HEADER.exec(line.plain.trim());
    if (!header?.[1]) continue;
    const alias = phaseAliasOf(header[1]);
    if (!seen.includes(alias)) seen.push(alias);
  }
  return seen;
}

export function packMapRoleProgressByPhase(
  text: string,
  status: string | null,
): Record<string, PackMapRoleProgress> {
  const order: string[] = [];
  const invocations = new Map<string, string[][]>();
  const repoAlias = new Map<string, string>();
  const upper = (status || "").toUpperCase();
  const settled =
    upper === "SUCCESS" ? "ok" : upper === "FAILED" || upper === "CANCELED" ? "fail" : null;

  function touch(ref: string) {
    const alias = phaseAliasOf(ref);
    if (!invocations.has(alias)) {
      invocations.set(alias, []);
      order.push(alias);
    }
    const repo = phaseRepoAlias(ref);
    if (repo) {
      repoAlias.set(alias, repo);
    }
  }

  for (const line of parseLogText(text)) {
    const plain = line.plain.trim();
    const phase = PHASE_HEADER.exec(plain);
    if (phase?.[1]) {
      touch(phase[1]);
      continue;
    }
    const header = INVOCATION_PHASE.exec(plain);
    if (header?.[1]) {
      touch(header[1]);
      invocations.get(phaseAliasOf(header[1]))?.push(splitRoleTags(header[2] ?? ""));
    }
  }

  const result: Record<string, PackMapRoleProgress> = {};
  order.forEach((alias, index) => {
    const groups = invocations.get(alias) ?? [];
    const last = index === order.length - 1;
    const done = groups.slice(0, -1).flat();
    const tail = groups[groups.length - 1] ?? [];
    if (!last || settled === "ok") {
      result[alias] = {
        done: groups.flat(),
        running: [],
        failed: [],
        settled: "ok",
      };
      return;
    }
    if (settled === "fail") {
      result[alias] = { done, running: [], failed: tail, settled: "fail" };
      return;
    }
    result[alias] = { done, running: tail, failed: [], settled: null };
  });
  for (const [alias, repo] of repoAlias) {
    const progress = result[alias];
    if (progress && !(repo in result)) {
      result[repo] = progress;
    }
  }
  return result;
}

export function packMapRoleMarks(
  tags: string[],
  progress: PackMapRoleProgress,
): PackMapRoleMark[] {
  if (progress.settled === "ok") {
    return tags.map(() => "done");
  }
  const failed = new Set(progress.failed);
  const running = new Set(progress.running);
  let activeAt = -1;
  for (let index = 0; index < tags.length; index += 1) {
    const tag = tags[index] ?? "";
    if (running.has(tag) || failed.has(tag)) {
      activeAt = index;
      break;
    }
  }
  if (activeAt < 0) {
    const done = new Set(progress.done);
    return tags.map((tag) => (done.has(tag) ? "done" : "pending"));
  }
  return tags.map((tag, index) => {
    if (failed.has(tag)) return "fail";
    if (running.has(tag)) return "running";
    if (index < activeAt) return "done";
    return "pending";
  });
}

export function packMapFocusFromProgress(
  progress: AtlasRunProgress,
  status: string | null,
): PackMapRunFocus {
  const failed = progress.steps.find((step) => step.state === "fail");
  if (failed) {
    const alias =
      phaseAlias(failed) ??
      [...progress.steps].reverse().map(phaseAlias).find(Boolean) ??
      null;
    return alias ? { alias, state: "fail" } : { alias: null, state: null };
  }
  const running = progress.steps.find((step) => step.state === "running");
  const runningAlias = running ? phaseAlias(running) : null;
  if (runningAlias) return { alias: runningAlias, state: "running" };
  const terminal =
    status === "SUCCESS" || status === "FAILED" || status === "CANCELED";
  if (!terminal) return { alias: null, state: null };
  const last =
    [...progress.steps].reverse().map(phaseAlias).find(Boolean) ?? null;
  if (!last) return { alias: null, state: null };
  return { alias: last, state: status === "FAILED" ? "fail" : "done" };
}

export type PackMapPhaseTiming = {
  totalMs: number | null;
  stampMs: number | null;
  byTag: Record<string, number>;
  currentRole: string | null;
  currentTask: string | null;
};

export type PackMapRunTiming = {
  byPhase: Record<string, PackMapPhaseTiming>;
  overall: PackMapPhaseTiming;
};

const TASK_BANNER = /^TASK \[(.+?)\]/;
const TIMING_CLOCK = /(\d+:\d{2}:\d{2}(?:\.\d+)?)\s*(?:\*+)?\s*$/;
const TIMING_PAIR =
  /\((\d+:\d{2}:\d{2}(?:\.\d+)?)\)\s+(\d+:\d{2}:\d{2}(?:\.\d+)?)/;
const TIMING_STAMP =
  /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+(\d{2}:\d{2}:\d{2})\s+([+-]\d{4})/;

function emptyPhaseTiming(): PackMapPhaseTiming {
  return {
    totalMs: null,
    stampMs: null,
    byTag: {},
    currentRole: null,
    currentTask: null,
  };
}

function parseAnsibleClock(value: string): number | null {
  const match = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (minutes > 59 || seconds >= 60) return null;
  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
}

function splitTaskBanner(raw: string): { role: string; label: string } {
  const name = raw.trim();
  const sep = name.indexOf(" : ");
  if (sep < 0) return { role: name, label: name };
  const role = name.slice(0, sep).trim();
  const title = name.slice(sep + 3).trim();
  return { role, label: title ? `${role} : ${title}` : role };
}

function readTimingLine(line: string): {
  deltaMs: number;
  elapsedMs: number;
  stampMs: number | null;
} | null {
  const pair = TIMING_PAIR.exec(line);
  if (!pair?.[1] || !pair[2] || !TIMING_CLOCK.test(line)) return null;
  const deltaMs = parseAnsibleClock(pair[1]);
  const elapsedMs = parseAnsibleClock(pair[2]);
  if (deltaMs == null || elapsedMs == null) return null;
  const stamp = TIMING_STAMP.exec(line);
  let stampMs: number | null = null;
  if (stamp) {
    const offset = `${stamp[5].slice(0, 3)}:${stamp[5].slice(3)}`;
    const parsed = Date.parse(
      `${stamp[1]} ${stamp[2]} ${stamp[3]} ${stamp[4]} ${offset}`,
    );
    stampMs = Number.isNaN(parsed) ? null : parsed;
  }
  return { deltaMs, elapsedMs, stampMs };
}

function timingFromLines(lines: ParsedLogLine[]): PackMapPhaseTiming {
  const timing = emptyPhaseTiming();
  let previous: { role: string; label: string } | null = null;
  let current: { role: string; label: string } | null = null;
  let timingSeen = true;
  for (const line of lines) {
    const plain = line.plain.trim();
    const banner = TASK_BANNER.exec(plain);
    if (banner?.[1]) {
      const task = splitTaskBanner(banner[1]);
      if (current?.label === task.label) continue;
      previous = current;
      current = task;
      timing.currentRole = task.role;
      timing.currentTask = task.label;
      timingSeen = false;
      continue;
    }
    if (timingSeen) continue;
    const stamp = readTimingLine(plain);
    if (!stamp) continue;
    timingSeen = true;
    if (previous) {
      timing.byTag[previous.role] =
        (timing.byTag[previous.role] ?? 0) + stamp.deltaMs;
    }
    timing.totalMs = stamp.elapsedMs;
    timing.stampMs = stamp.stampMs;
  }
  return timing;
}

export function packMapRunTiming(text: string): PackMapRunTiming {
  const lines = parseLogText(text);
  const slices = logPhaseSlices(lines);
  const byPhase: Record<string, PackMapPhaseTiming> = {};
  for (const slice of slices) {
    const timing = timingFromLines(slice.lines);
    const header = PHASE_HEADER.exec(slice.lines[0]?.plain.trim() ?? "");
    const ref = header?.[1] ?? "";
    const keys = [slice.label, phaseAliasOf(ref), phaseRepoAlias(ref)];
    for (const key of keys) {
      if (key) byPhase[key] = timing;
    }
  }
  return { byPhase, overall: timingFromLines(lines) };
}

export function formatPackMapDuration(ms: number): string {
  const safe = Math.max(0, ms);
  const seconds = safe / 1000;
  if (seconds < 10) {
    return `${(Math.round(seconds * 10) / 10).toFixed(1)}s`;
  }
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  return `${minutes}m ${String(secs).padStart(2, "0")}s`;
}

export function logRoleFocusIndex(
  lines: { plain: string; kind?: string; severity?: string; task?: string | null }[],
  role: string,
): number {
  const wanted = role.trim().toLowerCase();
  if (!wanted) return -1;
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const named = lines[index].task?.trim() || "";
    const banner = TASK_BANNER.exec(lines[index].plain.trim());
    const raw = named || banner?.[1] || "";
    if (!raw || splitTaskBanner(raw).role.toLowerCase() !== wanted) continue;
    if (lines[index].kind === "task" || banner) {
      start = index;
      break;
    }
  }
  if (start < 0) {
    return lines.findIndex((line) => line.plain.toLowerCase().includes(wanted));
  }
  let failAt = -1;
  for (let index = start + 1; index < lines.length; index += 1) {
    const banner = TASK_BANNER.exec(lines[index].plain.trim());
    if (lines[index].kind === "task" || banner) break;
    if (
      lines[index].severity === "error" ||
      lines[index].kind === "fatal" ||
      lines[index].kind === "failed" ||
      lines[index].kind === "unreachable"
    ) {
      failAt = index;
    }
  }
  return failAt >= 0 ? failAt : start;
}
