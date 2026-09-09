export type PlayStrategy = "linear" | "free" | "debug";
export type TaskPlacement = "pre_tasks" | "post_tasks";

export type InlineTask = {
  id?: string;
  name?: string;
  module?: string;
  args?: Record<string, unknown> | string;
  when?: string | null;
  tags?: string[];
  become?: boolean;
  placement?: TaskPlacement | string;
};

export type PlayRole = {
  role_name?: string;
  tag?: string;
  auto?: boolean;
  vars_override?: Record<string, unknown> | null;
};

export type Play = {
  id?: string;
  name?: string;
  hosts?: string | string[];
  remote_user?: string | null;
  become?: boolean;
  strategy?: string;
  roles?: PlayRole[];
  pre_tasks?: InlineTask[];
  post_tasks?: InlineTask[];
};

export type PlaybookDoc = {
  id?: string;
  name?: string;
  description?: string;
  plays?: Play[];
  tags?: string[] | string;
  tag?: string;
  disabled?: boolean;
  metadata?: {
    tags?: string[] | string;
    tag?: string;
    disabled?: boolean;
  };
};

export type ValidationIssue = {
  level?: string;
  code?: string;
  message?: string;
  field?: string;
  play_id?: string;
};

export type PlayValidation = {
  play_id?: string;
  valid?: boolean;
  errors?: ValidationIssue[];
  warnings?: ValidationIssue[];
};

export type PlaybookValidation = {
  playbook?: { valid?: boolean; errors?: ValidationIssue[]; warnings?: ValidationIssue[] };
  plays?: PlayValidation[];
  summary?: {
    total_errors?: number;
    total_warnings?: number;
    playbook_can_run?: boolean;
  };
};

export type RoleNode = {
  type?: string;
  name?: string;
  id?: string;
  path?: string;
  children?: RoleNode[];
};

export type RoleOption = {
  name: string;
  folder: string;
  fullPath: string;
};

export type GroupInfo = { hosts?: string[]; children?: string[] };

export function hostsList(hosts?: string | string[] | null): string[] {
  if (Array.isArray(hosts)) {
    return hosts.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof hosts === "string" && hosts.trim()) {
    return [hosts.trim()];
  }
  return [];
}

export function playTags(playbook: PlaybookDoc): string[] {
  const raw = playbook.tags ?? playbook.metadata?.tags ?? playbook.tag ?? playbook.metadata?.tag;
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function isPlaybookDisabled(playbook: PlaybookDoc): boolean {
  return Boolean(playbook.disabled || playbook.metadata?.disabled);
}

export function parseTagInput(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createPlay(): Play {
  return {
    id: crypto.randomUUID(),
    name: "New Play",
    hosts: [],
    remote_user: null,
    become: false,
    strategy: "linear",
    roles: [],
    pre_tasks: [],
    post_tasks: [],
  };
}

export function createTask(placement: TaskPlacement = "pre_tasks"): InlineTask {
  return {
    id: crypto.randomUUID(),
    name: "New Task",
    module: "command",
    args: {},
    when: null,
    tags: [],
    become: false,
    placement,
  };
}

export function normalizePlay(play: Play): Play {
  const strategy = play.strategy;
  return {
    ...play,
    id: play.id || crypto.randomUUID(),
    name: play.name || "Unnamed Play",
    hosts: hostsList(play.hosts),
    remote_user: play.remote_user ?? null,
    become: Boolean(play.become),
    strategy: strategy === "free" || strategy === "debug" ? strategy : "linear",
    roles: Array.isArray(play.roles) ? play.roles : [],
    pre_tasks: Array.isArray(play.pre_tasks) ? play.pre_tasks : [],
    post_tasks: Array.isArray(play.post_tasks) ? play.post_tasks : [],
  };
}

export function normalizePlaybook(raw: PlaybookDoc): PlaybookDoc {
  return {
    ...raw,
    name: raw.name || "Unnamed Playbook",
    description: raw.description ?? "",
    plays: (raw.plays ?? []).map(normalizePlay),
    tags: playTags(raw),
    disabled: isPlaybookDisabled(raw),
  };
}

export function flattenRoles(
  nodes: RoleNode[] | undefined,
  folder = "",
  packId = "",
): RoleOption[] {
  const out: RoleOption[] = [];
  for (const node of nodes ?? []) {
    if (node.type === "role" && node.name) {
      const fullPath =
        node.path ||
        node.id ||
        (packId ? `${packId}/${node.name}` : folder ? `${folder}/${node.name}` : node.name);
      out.push({ name: node.name, folder: folder || "root", fullPath });
    }
    const currentPack = node.type === "pack" ? node.id || node.name || packId : packId;
    if (node.children?.length) {
      const nextFolder = folder ? `${folder}/${node.name || ""}` : node.name || "";
      out.push(...flattenRoles(node.children, nextFolder, currentPack));
    }
  }
  return out;
}

export function rolePaths(nodes: RoleNode[] | undefined): string[] {
  return flattenRoles(nodes).map((row) => row.fullPath);
}

export function moveItem<T>(list: T[], index: number, delta: number): T[] {
  const next = index + delta;
  if (next < 0 || next >= list.length) return list;
  const copy = [...list];
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item);
  return copy;
}

export function fieldIssue(
  issues: ValidationIssue[] | undefined,
  field: string,
): ValidationIssue | undefined {
  return issues?.find((item) => item.field === field);
}

export function playValidationOf(
  validation: PlaybookValidation | null,
  playId?: string,
): PlayValidation | undefined {
  if (!validation || !playId) return undefined;
  return validation.plays?.find((row) => row.play_id === playId);
}
