export type RoleFileKind =
  | "defaults"
  | "tasks"
  | "handlers"
  | "meta"
  | "files"
  | "templates"
  | "other";

export type RoleFileRef = {
  path: string;
  name: string;
};

export type RoleFileGroup = {
  kind: RoleFileKind;
  label: string;
  files: RoleFileRef[];
};

const KIND_ORDER: RoleFileKind[] = [
  "defaults",
  "tasks",
  "handlers",
  "meta",
  "files",
  "templates",
  "other",
];

const KIND_LABELS: Record<RoleFileKind, string> = {
  defaults: "Defaults",
  tasks: "Tasks",
  handlers: "Handlers",
  meta: "Meta",
  files: "Files",
  templates: "Templates",
  other: "Other",
};

const KEEP_UPPER = new Set([
  "ca",
  "dns",
  "git",
  "ip",
  "k8s",
  "os",
  "pve",
  "ssh",
  "tf",
  "vm",
  "yaml",
  "yml",
]);

export function packLabel(pack: string): string {
  const trimmed = pack.trim();
  if (!trimmed || trimmed === "root") {
    return "Roles";
  }
  return trimmed.replace(/^atlas-/i, "") || trimmed;
}

export function humanizeRoleName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "";
  }
  const stripped = trimmed.replace(/^\d+[a-z]?_/i, "");
  const tokens = stripped.split(/[_-]+/).filter(Boolean);
  if (tokens.length === 0) {
    return trimmed;
  }
  return tokens
    .map((token) => {
      const lower = token.toLowerCase();
      if (KEEP_UPPER.has(lower)) {
        return lower.toUpperCase();
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export function fileKind(path: string): RoleFileKind {
  const first = path.split("/")[0]?.toLowerCase() ?? "";
  if (
    first === "defaults" ||
    first === "tasks" ||
    first === "handlers" ||
    first === "meta" ||
    first === "files" ||
    first === "templates"
  ) {
    return first;
  }
  return "other";
}

export function fileKindLabel(kind: RoleFileKind): string {
  return KIND_LABELS[kind];
}

export function groupRoleFiles(files: RoleFileRef[]): RoleFileGroup[] {
  const buckets = new Map<RoleFileKind, RoleFileRef[]>();
  for (const kind of KIND_ORDER) {
    buckets.set(kind, []);
  }
  for (const file of files) {
    buckets.get(fileKind(file.path))?.push(file);
  }
  return KIND_ORDER.map((kind) => ({
    kind,
    label: KIND_LABELS[kind],
    files: buckets.get(kind) ?? [],
  })).filter((group) => group.files.length > 0);
}

export type RoleFileTreeNode =
  | {
      type: "dir";
      name: string;
      path: string;
      children: RoleFileTreeNode[];
    }
  | {
      type: "file";
      name: string;
      path: string;
    };

type MutableDir = {
  name: string;
  path: string;
  dirs: Map<string, MutableDir>;
  files: Extract<RoleFileTreeNode, { type: "file" }>[];
};

function dirKindIndex(name: string): number {
  const index = KIND_ORDER.indexOf(name as RoleFileKind);
  if (index < 0 || name === "other") {
    return KIND_ORDER.length;
  }
  return index;
}

function freezeDir(dir: MutableDir): RoleFileTreeNode[] {
  const dirs = [...dir.dirs.values()].sort((left, right) => {
    const byKind = dirKindIndex(left.name) - dirKindIndex(right.name);
    return byKind !== 0 ? byKind : left.name.localeCompare(right.name);
  });
  const files = [...dir.files].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  return [
    ...dirs.map((child) => ({
      type: "dir" as const,
      name: child.name,
      path: child.path,
      children: freezeDir(child),
    })),
    ...files,
  ];
}

export function roleFileTree(files: RoleFileRef[]): RoleFileTreeNode[] {
  const root: MutableDir = {
    name: "",
    path: "",
    dirs: new Map(),
    files: [],
  };
  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    if (parts.length === 0) {
      continue;
    }
    let node = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const name = parts[i];
      const path = parts.slice(0, i + 1).join("/");
      let child = node.dirs.get(name);
      if (!child) {
        child = { name, path, dirs: new Map(), files: [] };
        node.dirs.set(name, child);
      }
      node = child;
    }
    node.files.push({
      type: "file",
      name: parts[parts.length - 1],
      path: file.path,
    });
  }
  return freezeDir(root);
}

export function roleFileTreeDirPaths(nodes: RoleFileTreeNode[]): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.type === "dir") {
      out.push(node.path);
      out.push(...roleFileTreeDirPaths(node.children));
    }
  }
  return out;
}

export function defaultRoleFile(files: RoleFileRef[]): string | null {
  const defaultsMain = files.find((file) =>
    /^defaults\/main\.ya?ml$/i.test(file.path),
  );
  return defaultsMain?.path ?? files[0]?.path ?? null;
}

export function rolePackId(fullPath: string): string {
  const parts = fullPath.split("/").filter(Boolean);
  return parts[0] || fullPath;
}

export function roleShortName(fullPath: string, fallback = fullPath): string {
  const parts = fullPath.split("/").filter(Boolean);
  return parts[parts.length - 1] || fallback;
}
