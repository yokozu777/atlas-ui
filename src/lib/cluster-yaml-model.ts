import {
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  Scalar,
  YAMLMap,
  YAMLSeq,
  type Document,
} from "yaml";

const SCHEMA_V2 = 2;
const STRINGIFY = { lineWidth: 0 as const, indentSeq: false as const };

export type ClusterYamlExecution = {
  mode: string;
  image: string;
  tag: string;
};

export type ClusterYamlInvocation = {
  uid: string;
  tags: string;
  limit: string;
  rootSsh: boolean;
};

export type ClusterYamlEntry = {
  uid: string;
  name: string;
  file: string;
  gitSsh: boolean;
  ansibleStrategy: string;
  ansibleForks: string;
  inventoryGroupsAny: string[];
  inventoryGroupsAll: string[];
  invocations: ClusterYamlInvocation[];
};

export type ClusterYamlPlaybook = {
  uid: string;
  name: string;
  source: string;
  url: string;
  path: string;
  ref: string;
  sync: string;
  layout: string;
  shallow: boolean;
  entries: ClusterYamlEntry[];
};

export type ClusterYamlPhase = {
  uid: string;
  alias: string;
  ref: string;
};

export type ClusterYamlDraft = {
  schemaVersion: number | null;
  id: string;
  displayName: string;
  execution: ClusterYamlExecution;
  playbooks: ClusterYamlPlaybook[];
  phases: ClusterYamlPhase[];
};

export type ClusterYamlParseResult = {
  ok: boolean;
  schemaOk: boolean;
  error?: string;
  draft: ClusterYamlDraft;
};

export function newClusterYamlUid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function emptyClusterYamlDraft(): ClusterYamlDraft {
  return {
    schemaVersion: SCHEMA_V2,
    id: "",
    displayName: "",
    execution: { mode: "", image: "", tag: "" },
    playbooks: [],
    phases: [],
  };
}

export function cloneClusterYamlDraft(
  draft: ClusterYamlDraft,
): ClusterYamlDraft {
  return structuredClone(draft);
}

export function splitInvocationTags(tags: string): string[] {
  return tags
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function splitAnsibleGroups(limit: string): string[] {
  return limit
    .split(/[:,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function joinInvocationTags(tags: string[]): string {
  return tags.join(",");
}

export function playbookEntryRef(repo: string, entry: string): string {
  return `${repo}/${entry}`;
}

export function listPlaybookEntryRefs(draft: ClusterYamlDraft): string[] {
  return draft.playbooks.flatMap((repo) =>
    repo.entries.map((entry) => playbookEntryRef(repo.name, entry.name)),
  );
}

export function uniqueYamlName(existing: string[], base: string): string {
  const root = base.trim() || "untitled";
  if (!existing.includes(root)) return root;
  let index = 2;
  while (existing.includes(`${root}-${index}`)) index += 1;
  return `${root}-${index}`;
}

export function newPlaybookDraft(existingNames: string[]): ClusterYamlPlaybook {
  return {
    uid: newClusterYamlUid(),
    name: uniqueYamlName(existingNames, "playbook"),
    source: "git",
    url: "",
    path: "",
    ref: "main",
    sync: "always",
    layout: "roles/",
    shallow: true,
    entries: [newEntryDraft([])],
  };
}

export function newEntryDraft(existingNames: string[]): ClusterYamlEntry {
  return {
    uid: newClusterYamlUid(),
    name: uniqueYamlName(existingNames, "main"),
    file: "playbooks/site.yaml",
    gitSsh: false,
    ansibleStrategy: "",
    ansibleForks: "",
    inventoryGroupsAny: [],
    inventoryGroupsAll: [],
    invocations: [newInvocationDraft()],
  };
}

export function newInvocationDraft(): ClusterYamlInvocation {
  return {
    uid: newClusterYamlUid(),
    tags: "",
    limit: "",
    rootSsh: false,
  };
}

export function newPhaseDraft(ref = ""): ClusterYamlPhase {
  const alias = ref.includes("/") ? ref.slice(ref.lastIndexOf("/") + 1) : ref;
  return {
    uid: newClusterYamlUid(),
    alias,
    ref,
  };
}

export function parseClusterYaml(text: string): ClusterYamlParseResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: true, schemaOk: true, draft: emptyClusterYamlDraft() };
  }
  const doc = parseDocument(text, { prettyErrors: true });
  if (doc.errors.length) {
    return {
      ok: false,
      schemaOk: false,
      error: doc.errors[0]?.message || "Invalid YAML",
      draft: emptyClusterYamlDraft(),
    };
  }
  if (doc.contents != null && !isMap(doc.contents)) {
    return {
      ok: false,
      schemaOk: false,
      error: "cluster.yaml root must be a mapping",
      draft: emptyClusterYamlDraft(),
    };
  }
  const root = asMap(doc.contents) ?? new YAMLMap();
  const schemaVersion = readSchemaVersion(root.get("schema_version"));
  const draft: ClusterYamlDraft = {
    schemaVersion,
    id: readString(root.get("id")),
    displayName: readString(root.get("display_name")),
    execution: readExecution(asMap(root.get("execution"))),
    playbooks: readPlaybooks(asMap(root.get("playbooks"))),
    phases: readPhases(root.get("phases")),
  };
  const schemaOk =
    schemaVersion === SCHEMA_V2 ||
    (schemaVersion === null &&
      (draft.playbooks.length > 0 || draft.phases.length > 0 || !trimmed));
  return { ok: true, schemaOk, draft };
}

export function applyClusterYamlDraft(
  text: string,
  draft: ClusterYamlDraft,
  from: ClusterYamlDraft,
): string {
  const source = text.trim() ? text : "schema_version: 2\n";
  const doc = parseDocument(source, { prettyErrors: true });
  if (doc.errors.length) {
    throw new Error(doc.errors[0]?.message || "Invalid YAML");
  }
  const root = ensureRootMap(doc);
  if (!root.has("schema_version")) {
    root.set("schema_version", SCHEMA_V2);
  }
  setOrDelete(root, "id", draft.id);
  setOrDelete(root, "display_name", draft.displayName);
  writeExecution(doc, root, draft);
  writePlaybooks(doc, root, draft, from);
  writePhases(doc, root, draft, from);
  return doc.toString(STRINGIFY);
}

function readSchemaVersion(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readExecution(map: YAMLMap | null): ClusterYamlExecution {
  if (!map) return { mode: "", image: "", tag: "" };
  return {
    mode: readString(map.get("mode")),
    image: readString(map.get("image")),
    tag: readString(map.get("tag")),
  };
}

function readPlaybooks(map: YAMLMap | null): ClusterYamlPlaybook[] {
  if (!map) return [];
  const rows: ClusterYamlPlaybook[] = [];
  for (const pair of map.items) {
    const name = nodeKey(pair.key);
    if (!name) continue;
    const spec = asMap(pair.value);
    if (!spec) continue;
    rows.push({
      uid: newClusterYamlUid(),
      name,
      source: readString(spec.get("source")) || "git",
      url: readString(spec.get("url")),
      path: readString(spec.get("path")),
      ref: readString(spec.get("ref")),
      sync: readString(spec.get("sync")),
      layout: readString(spec.get("layout")),
      shallow: readBoolean(spec.get("shallow"), true),
      entries: readEntries(asMap(spec.get("entries"))),
    });
  }
  return rows;
}

function readEntries(map: YAMLMap | null): ClusterYamlEntry[] {
  if (!map) return [];
  const rows: ClusterYamlEntry[] = [];
  for (const pair of map.items) {
    const name = nodeKey(pair.key);
    if (!name) continue;
    const spec = asMap(pair.value);
    if (!spec) continue;
    const ansible = asMap(spec.get("ansible"));
    const when = asMap(spec.get("when"));
    rows.push({
      uid: newClusterYamlUid(),
      name,
      file: readString(spec.get("file")),
      gitSsh: readBoolean(spec.get("git_ssh"), false),
      ansibleStrategy: ansible ? readString(ansible.get("strategy")) : "",
      ansibleForks: ansible ? readString(ansible.get("forks")) : "",
      inventoryGroupsAny: when ? readStringList(when.get("inventory_groups_any")) : [],
      inventoryGroupsAll: when ? readStringList(when.get("inventory_groups_all")) : [],
      invocations: readInvocations(spec.get("invocations")),
    });
  }
  return rows;
}

function readInvocations(value: unknown): ClusterYamlInvocation[] {
  const seq = asSeq(value);
  if (!seq) return [];
  return seq.items.map((item) => {
    const spec = asMap(item);
    return {
      uid: newClusterYamlUid(),
      tags: readTags(spec?.get("tags")),
      limit: spec ? readString(spec.get("limit")) : "",
      rootSsh: spec ? readBoolean(spec.get("root_ssh"), false) : false,
    };
  });
}

function readPhases(value: unknown): ClusterYamlPhase[] {
  const seq = asSeq(value);
  if (!seq) return [];
  const rows: ClusterYamlPhase[] = [];
  for (const item of seq.items) {
    if (isScalar(item)) {
      const ref = readString(item.value);
      rows.push({
        uid: newClusterYamlUid(),
        alias: "",
        ref,
      });
      continue;
    }
    const spec = asMap(item);
    if (!spec || spec.items.length === 0) continue;
    const pair = spec.items[0];
    rows.push({
      uid: newClusterYamlUid(),
      alias: nodeKey(pair.key),
      ref: readString(pair.value),
    });
  }
  return rows;
}

function writeExecution(
  doc: Document,
  root: YAMLMap,
  draft: ClusterYamlDraft,
): void {
  if (!draft.execution.mode && !draft.execution.image && !draft.execution.tag) {
    return;
  }
  let map = asMap(root.get("execution"));
  if (!map) {
    map = newMap(doc);
    root.set("execution", map);
  }
  setOrDelete(map, "mode", draft.execution.mode);
  setOrDelete(map, "image", draft.execution.image);
  setOrDelete(map, "tag", draft.execution.tag);
}

function writePlaybooks(
  doc: Document,
  root: YAMLMap,
  draft: ClusterYamlDraft,
  from: ClusterYamlDraft,
): void {
  let playbooks = asMap(root.get("playbooks"));
  if (!playbooks) {
    playbooks = newMap(doc);
    root.set("playbooks", playbooks);
  }
  const claimed = new Set<YAMLMap>();
  for (const playbook of draft.playbooks) {
    const origin = from.playbooks.find((row) => row.uid === playbook.uid);
    let map = origin ? asMap(playbooks.get(origin.name)) : null;
    if (map && origin && origin.name !== playbook.name) {
      renameMapKey(playbooks, origin.name, playbook.name);
    }
    if (!map) {
      map = newMap(doc);
      playbooks.set(playbook.name, map);
    }
    claimed.add(map);
    writePlaybookFields(map, playbook);
    writeEntries(doc, map, playbook, origin);
  }
  for (const pair of [...playbooks.items]) {
    const node = asMap(pair.value);
    if (node && !claimed.has(node)) {
      playbooks.delete(pair.key);
    }
  }
  if (playbooks.items.length === 0 && !from.playbooks.length) {
    // keep empty mapping if the form cleared everything
  }
}

function writePlaybookFields(map: YAMLMap, playbook: ClusterYamlPlaybook): void {
  setOrDelete(map, "source", playbook.source);
  setOrDelete(map, "layout", playbook.layout);
  map.set("shallow", playbook.shallow);
  setOrDelete(map, "sync", playbook.sync);
  if (playbook.source === "local") {
    setOrDelete(map, "path", playbook.path);
  } else {
    setOrDelete(map, "url", playbook.url);
    setOrDelete(map, "ref", playbook.ref);
  }
}

function writeEntries(
  doc: Document,
  playbookMap: YAMLMap,
  playbook: ClusterYamlPlaybook,
  origin: ClusterYamlPlaybook | undefined,
): void {
  let entries = asMap(playbookMap.get("entries"));
  if (!entries) {
    entries = newMap(doc);
    playbookMap.set("entries", entries);
  }
  const claimed = new Set<YAMLMap>();
  for (const entry of playbook.entries) {
    const fromEntry = origin?.entries.find((row) => row.uid === entry.uid);
    let map = fromEntry ? asMap(entries.get(fromEntry.name)) : null;
    if (map && fromEntry && fromEntry.name !== entry.name) {
      renameMapKey(entries, fromEntry.name, entry.name);
    }
    if (!map) {
      map = newMap(doc);
      entries.set(entry.name, map);
    }
    claimed.add(map);
    setOrDelete(map, "file", entry.file);
    writeInvocations(doc, map, entry);
  }
  for (const pair of [...entries.items]) {
    const node = asMap(pair.value);
    if (node && !claimed.has(node)) {
      entries.delete(pair.key);
    }
  }
}

function writeInvocations(
  doc: Document,
  entryMap: YAMLMap,
  entry: ClusterYamlEntry,
): void {
  let seq = asSeq(entryMap.get("invocations"));
  if (!seq) {
    seq = newSeq(doc);
    entryMap.set("invocations", seq);
  }
  while (seq.items.length > entry.invocations.length) {
    seq.items.pop();
  }
  for (let index = 0; index < entry.invocations.length; index += 1) {
    const invocation = entry.invocations[index];
    let item = asMap(seq.items[index]);
    if (!item) {
      item = newMap(doc);
      seq.items[index] = item;
    }
    item.set("tags", invocation.tags);
    setOrDelete(item, "limit", invocation.limit);
    if (invocation.rootSsh) item.set("root_ssh", true);
    else item.delete("root_ssh");
  }
}

function writePhases(
  doc: Document,
  root: YAMLMap,
  draft: ClusterYamlDraft,
  from: ClusterYamlDraft,
): void {
  const prev = asSeq(root.get("phases"));
  const seq = newSeq(doc);
  for (const phase of draft.phases) {
    const origin = from.phases.find((row) => row.uid === phase.uid);
    const reused = origin && prev ? takePhaseNode(prev, origin) : null;
    seq.add(writePhaseNode(doc, phase, reused));
  }
  root.set("phases", seq);
}

function takePhaseNode(
  seq: YAMLSeq,
  origin: ClusterYamlPhase,
): YAMLMap | Scalar | null {
  const index = seq.items.findIndex((item) => phaseNodeMatches(item, origin));
  if (index < 0) return null;
  const node = seq.items[index];
  seq.items.splice(index, 1);
  if (isMap(node) || isScalar(node)) return node;
  return null;
}

function phaseNodeMatches(item: unknown, origin: ClusterYamlPhase): boolean {
  if (isScalar(item)) {
    return readString(item.value) === origin.ref && !origin.alias;
  }
  const map = asMap(item);
  if (!map || map.items.length === 0) return false;
  return nodeKey(map.items[0].key) === origin.alias;
}

function writePhaseNode(
  doc: Document,
  phase: ClusterYamlPhase,
  reused: YAMLMap | Scalar | null,
): YAMLMap | Scalar {
  if (!phase.alias) {
    if (isScalar(reused)) {
      reused.value = phase.ref;
      return reused;
    }
    return new Scalar(phase.ref);
  }
  const map = isMap(reused) ? reused : newMap(doc);
  const first = map.items[0];
  if (first) {
    if (isScalar(first.key)) first.key.value = phase.alias;
    else first.key = new Scalar(phase.alias);
    if (isScalar(first.value)) first.value.value = phase.ref;
    else first.value = new Scalar(phase.ref);
    return map;
  }
  map.set(phase.alias, phase.ref);
  return map;
}

function ensureRootMap(doc: Document): YAMLMap {
  if (isMap(doc.contents)) return doc.contents;
  const map = newMap(doc);
  doc.contents = map;
  return map;
}

function newMap(doc: Document): YAMLMap {
  return doc.createNode({}) as YAMLMap;
}

function newSeq(doc: Document): YAMLSeq {
  return doc.createNode([]) as YAMLSeq;
}

function asMap(value: unknown): YAMLMap | null {
  return isMap(value) ? value : null;
}

function asSeq(value: unknown): YAMLSeq | null {
  return isSeq(value) ? value : null;
}

function nodeKey(node: unknown): string {
  if (isScalar(node)) return readString(node.value);
  if (typeof node === "string" || typeof node === "number") return String(node);
  return "";
}

function readString(value: unknown): string {
  if (value == null) return "";
  if (isScalar(value)) return readString(value.value);
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return "";
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (isScalar(value)) return readBoolean(value.value, fallback);
  if (value == null) return fallback;
  const text = String(value).trim().toLowerCase();
  if (text === "true" || text === "yes" || text === "1") return true;
  if (text === "false" || text === "no" || text === "0") return false;
  return fallback;
}

function readStringList(value: unknown): string[] {
  const seq = asSeq(value);
  if (seq) {
    return seq.items
      .map((item) => readString(item).trim())
      .filter(Boolean);
  }
  return splitAnsibleGroups(readString(value));
}

function readTags(value: unknown): string {
  const seq = asSeq(value);
  if (seq) {
    return joinInvocationTags(
      seq.items.map((item) => readString(item)).filter(Boolean),
    );
  }
  return readString(value);
}

function setOrDelete(map: YAMLMap, key: string, value: string): void {
  if (value) map.set(key, value);
  else map.delete(key);
}

function renameMapKey(map: YAMLMap, from: string, to: string): void {
  if (!to || from === to) return;
  const pair = map.items.find((item) => nodeKey(item.key) === from);
  if (!pair) return;
  if (isScalar(pair.key)) pair.key.value = to;
  else pair.key = new Scalar(to);
}
