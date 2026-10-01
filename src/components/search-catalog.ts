import { globalSecretTypeLabel, type GlobalSecretRow } from "@/components/global-secrets/types";
import type { UserRow } from "@/components/users-roles/types";
import type { ClusterRow } from "@/lib/api";
import { projectHref } from "@/lib/project-href";
import type { ProjectKind, StargateProject } from "@/lib/project-types";

export type SearchKind =
  | "page"
  | "project"
  | "cluster"
  | "secret"
  | "user"
  | "action";

export type SearchAction = "plan" | "validate" | "smoke" | "run" | "init";

export type SearchHit = {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle?: string;
  href?: string;
  keywords: string;
  projectId?: string | null;
  clusterId?: string | null;
  projectKind?: ProjectKind;
  archived?: boolean;
  action?: SearchAction;
  permission?: string;
};

export type SearchFilters = {
  types: Record<SearchKind, boolean>;
  projectKind: "any" | ProjectKind;
  includeArchived: boolean;
  scope: "everywhere" | "current";
};

export type SearchContext = {
  projectId: string | null;
  atlasProjectId: string | null;
  clusterId: string | null;
  projectClusterId: string | null;
};

export const SEARCH_KIND_ORDER: SearchKind[] = [
  "page",
  "project",
  "cluster",
  "secret",
  "user",
  "action",
];

export const SEARCH_KIND_LABEL: Record<SearchKind, string> = {
  page: "Page",
  project: "Project",
  cluster: "Cluster",
  secret: "Secret",
  user: "User",
  action: "Action",
};

export const SEARCH_GROUP_LABEL: Record<SearchKind, string> = {
  page: "Pages",
  project: "Projects",
  cluster: "Clusters",
  secret: "Secrets",
  user: "Users",
  action: "Actions",
};

export const SEARCH_TYPE_LABEL: Record<SearchKind, string> = {
  page: "Pages",
  project: "Projects",
  cluster: "Clusters",
  secret: "Secrets",
  user: "Users",
  action: "Actions",
};

export function defaultSearchFilters(): SearchFilters {
  return {
    types: {
      page: true,
      project: true,
      cluster: true,
      secret: true,
      user: true,
      action: false,
    },
    projectKind: "any",
    includeArchived: false,
    scope: "everywhere",
  };
}

function tokens(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

export function hitMatchesQuery(hit: SearchHit, query: string): boolean {
  const parts = tokens(query);
  if (parts.length === 0) {
    return true;
  }
  const hay = [hit.title, hit.subtitle, hit.keywords, hit.href, hit.id]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return parts.every((part) => hay.includes(part));
}

export function consolePages(): SearchHit[] {
  return [
    {
      id: "page:projects",
      kind: "page",
      title: "Projects",
      subtitle: "All projects",
      href: "/projects",
      keywords: "projects list catalog workspace",
    },
    {
      id: "page:projects-new",
      kind: "page",
      title: "New project",
      href: "/projects/new",
      keywords: "create add project",
      permission: "projects.create",
    },
    {
      id: "page:secrets",
      kind: "page",
      title: "Secrets Manager",
      subtitle: "Global SSH keys and credentials",
      href: "/secrets",
      keywords: "secrets manager ssh keys credentials",
      permission: "global_secrets.read",
    },
    {
      id: "page:users",
      kind: "page",
      title: "Users",
      subtitle: "Users and roles",
      href: "/users",
      keywords: "users roles permissions accounts",
      permission: "users.read",
    },
    {
      id: "page:settings",
      kind: "page",
      title: "Console",
      href: "/settings",
      keywords: "settings system clusterctl workers console library",
      permission: "settings.read",
    },
    {
      id: "page:hypervisors",
      kind: "page",
      title: "Hypervisors",
      subtitle: "Proxmox servers",
      href: "/hypervisors",
      keywords: "hypervisors proxmox pve servers",
      permission: "settings.read",
    },
    {
      id: "page:workers",
      kind: "page",
      title: "Workers",
      href: "/settings?tab=workers",
      keywords: "workers jobs queue",
      permission: "settings.read",
    },
    {
      id: "page:server-logs",
      kind: "page",
      title: "Server logs",
      href: "/server-logs",
      keywords: "server logs hub",
      permission: "settings.read",
    },
    {
      id: "page:docs",
      kind: "page",
      title: "Docs",
      subtitle: "Console documentation",
      href: "/docs",
      keywords: "docs documentation help",
    },
    {
      id: "page:about",
      kind: "page",
      title: "About",
      subtitle: "Mission, versions, and links",
      href: "/about",
      keywords: "about mission version github license atlas",
    },
  ];
}

function pageHit(
  projectId: string,
  suffix: string,
  title: string,
  keywords: string,
  projectKind: ProjectKind,
  permission?: string,
): SearchHit {
  const href = projectHref(projectId, suffix);
  return {
    id: `page:${href}`,
    kind: "page",
    title,
    subtitle: "This project",
    href,
    keywords,
    projectId,
    projectKind,
    ...(permission ? { permission } : {}),
  };
}

export function projectPages(
  projectId: string,
  kind: ProjectKind,
): SearchHit[] {
  if (kind === "atlas") {
    return [
      pageHit(projectId, "", "Overview", "overview dashboard home", kind),
      pageHit(
        projectId,
        "/cluster-yaml",
        "Cluster setup",
        "cluster.yaml yaml definition repos setup playbooks phases",
        kind,
      ),
      pageHit(
        projectId,
        "/map",
        "Map",
        "map packs mounts overlays phases graph missing",
        kind,
      ),
      pageHit(
        projectId,
        "/cluster-yaml?tab=health",
        "Health",
        "playbooks repos sync cluster.yaml health",
        kind,
      ),
      pageHit(
        projectId,
        "/cluster-yaml?tab=runtime",
        "Runtime",
        "workspace runtime reset kubeconfig cluster",
        kind,
      ),
      pageHit(
        projectId,
        "/cluster-yaml?tab=files",
        "Files",
        "runtime files workspace tree logs kubeconfig",
        kind,
      ),
      pageHit(
        projectId,
        "/hosts",
        "Inventory",
        "hosts groups inventory files vars",
        kind,
      ),
      pageHit(
        projectId,
        "/executions",
        "Executions",
        "executions jobs history worker",
        kind,
      ),
      pageHit(
        projectId,
        "/executions?tab=logs",
        "Logs",
        "logs clusterctl stamps history",
        kind,
      ),
      pageHit(
        projectId,
        "/roles",
        "Roles",
        "roles ansible library handbook defaults",
        kind,
      ),
      pageHit(
        projectId,
        "/roles?view=handbook",
        "Handbook",
        "handbook role docs",
        kind,
      ),
      pageHit(
        projectId,
        "/secrets",
        "Secrets",
        "project secrets credentials",
        kind,
        "secrets.read",
      ),
      pageHit(
        projectId,
        "/settings",
        "Project Settings",
        "project settings sources inventory paths archive",
        kind,
      ),
      pageHit(
        projectId,
        "/ansible-config",
        "Ansible Config",
        "ansible.cfg configuration",
        kind,
      ),
      pageHit(
        projectId,
        "/vault",
        "Vaults",
        "vault ansible secrets",
        kind,
        "secrets.read",
      ),
      pageHit(
        projectId,
        "/clusters",
        "Clusters",
        "clusters catalog archive manage inventory leaves",
        kind,
      ),
      pageHit(
        projectId,
        "/init",
        "New cluster",
        "init cluster bootstrap",
        kind,
        "atlas.execute",
      ),
    ];
  }
  return [
    pageHit(projectId, "", "Dashboard", "dashboard overview home", kind),
    pageHit(projectId, "/runs", "Runs", "runs playbooks", kind),
    pageHit(
      projectId,
      "/executions",
      "Executions",
      "executions jobs history",
      kind,
    ),
    pageHit(projectId, "/preview", "Preview", "preview inventory", kind),
    pageHit(
      projectId,
      "/playbooks",
      "Playbooks",
      "playbooks automation ansible",
      kind,
    ),
    pageHit(
      projectId,
      "/roles",
      "Roles",
      "roles ansible library handbook defaults",
      kind,
    ),
    pageHit(
      projectId,
      "/handbook",
      "Handbook",
      "handbook role docs",
      kind,
    ),
    pageHit(
      projectId,
      "/ansible-config",
      "Ansible Config",
      "ansible.cfg configuration",
      kind,
    ),
    pageHit(
      projectId,
      "/vault",
      "Vaults",
      "vault ansible secrets",
      kind,
      "secrets.read",
    ),
    pageHit(
      projectId,
      "/secrets",
      "Project secrets",
      "project secrets credentials",
      kind,
      "secrets.read",
    ),
    pageHit(
      projectId,
      "/hosts",
      "Hosts & Groups",
      "hosts groups inventory fleet",
      kind,
    ),
    pageHit(
      projectId,
      "/inventory",
      "Inventory",
      "inventory hosts fleet",
      kind,
    ),
    pageHit(projectId, "/vars", "Vars", "vars variables extra", kind),
    pageHit(
      projectId,
      "/settings",
      "Project Settings",
      "project settings",
      kind,
    ),
  ];
}

export function projectHits(projects: StargateProject[]): SearchHit[] {
  return projects.map((row) => ({
    id: `project:${row.id}`,
    kind: "project" as const,
    title: row.name || row.id,
    subtitle: [row.kind === "atlas" ? "Atlas" : "Ansible", row.description]
      .filter(Boolean)
      .join(" · "),
    href: projectHref(row.id),
    keywords: [row.id, row.name, row.description, row.kind, row.cluster_id]
      .filter(Boolean)
      .join(" "),
    projectId: row.id,
    clusterId: row.cluster_id ?? null,
    projectKind: row.kind,
    archived: Boolean(row.isArchived),
  }));
}

export function clusterHits(clusters: ClusterRow[]): SearchHit[] {
  return clusters.map((row) => ({
    id: `cluster:${row.id}`,
    kind: "cluster" as const,
    title: row.display_name || row.id,
    subtitle: [row.id, row.active ? "active" : null, row.kind]
      .filter(Boolean)
      .join(" · "),
    keywords: [row.id, row.display_name, row.kind].filter(Boolean).join(" "),
    clusterId: row.id,
  }));
}

export function secretHits(secrets: GlobalSecretRow[]): SearchHit[] {
  return secrets.map((row) => {
    const typeLabel = globalSecretTypeLabel(row.type);
    return {
      id: `secret:${row.id}`,
      kind: "secret" as const,
      title: row.name || row.id,
      subtitle: [typeLabel, row.description].filter(Boolean).join(" · "),
      href: "/secrets",
      keywords: [
        row.id,
        row.name,
        row.type,
        typeLabel,
        row.description,
        row.username,
        row.metadata?.username,
      ]
        .filter(Boolean)
        .join(" "),
    };
  });
}

export function userHits(users: UserRow[]): SearchHit[] {
  return users.map((row) => {
    const username = row.username || row.id;
    return {
      id: `user:${row.id}`,
      kind: "user" as const,
      title: username,
      subtitle: [row.email, ...(row.role_names ?? [])]
        .filter(Boolean)
        .join(" · "),
      href: "/users",
      keywords: [
        row.id,
        username,
        row.email,
        ...(row.role_names ?? []),
        row.is_active === false ? "inactive" : "active",
      ]
        .filter(Boolean)
        .join(" "),
    };
  });
}

export function actionHits(ctx: SearchContext): SearchHit[] {
  const hits: SearchHit[] = [];
  if (ctx.clusterId) {
    hits.push(
      {
        id: "action:plan",
        kind: "action",
        title: "Plan current cluster",
        subtitle: "Inspect planned changes",
        keywords: "plan inspect dry-run cluster",
        action: "plan",
        clusterId: ctx.clusterId,
        permission: "atlas.execute",
      },
      {
        id: "action:validate",
        kind: "action",
        title: "Validate cluster",
        subtitle: "Check cluster configuration",
        keywords: "validate check config",
        action: "validate",
        clusterId: ctx.clusterId,
        permission: "atlas.execute",
      },
      {
        id: "action:smoke",
        kind: "action",
        title: "Smoke test",
        subtitle: "Run a smoke check",
        keywords: "smoke test health",
        action: "smoke",
        clusterId: ctx.clusterId,
        permission: "atlas.execute",
      },
      {
        id: "action:run",
        kind: "action",
        title: "Run cluster",
        subtitle: "Open the run dialog",
        keywords: "run apply playbook pipeline",
        action: "run",
        clusterId: ctx.clusterId,
        permission: "atlas.execute",
      },
    );
  }
  hits.push({
    id: "action:init",
    kind: "action",
    title: "Initialize cluster",
    subtitle: ctx.atlasProjectId ? "Init this project" : "Init a new cluster",
    href: ctx.atlasProjectId
      ? projectHref(ctx.atlasProjectId, "/init")
      : "/init",
    keywords: "init bootstrap cluster",
    action: "init",
    projectId: ctx.atlasProjectId,
    permission: "atlas.execute",
  });
  return hits;
}

const PER_KIND_CAP = 12;

export function buildSearchHits(
  data: {
    projects: StargateProject[];
    clusters: ClusterRow[];
    secrets: GlobalSecretRow[];
    users: UserRow[];
  },
  ctx: SearchContext,
): SearchHit[] {
  const kind: ProjectKind | null = ctx.atlasProjectId
    ? "atlas"
    : ctx.projectId
      ? "ansible"
      : null;
  return [
    ...consolePages(),
    ...(ctx.projectId && kind ? projectPages(ctx.projectId, kind) : []),
    ...projectHits(data.projects),
    ...clusterHits(data.clusters),
    ...secretHits(data.secrets),
    ...userHits(data.users),
    ...actionHits(ctx),
  ];
}

export function filterSearchHits(
  hits: SearchHit[],
  query: string,
  filters: SearchFilters,
  ctx: SearchContext,
): SearchHit[] {
  const q = query.trim();
  const scoped = hits.filter((hit) => {
    if (!filters.types[hit.kind]) {
      return false;
    }
    if (hit.archived && !filters.includeArchived) {
      return false;
    }
    if (
      hit.kind === "project" &&
      filters.projectKind !== "any" &&
      hit.projectKind !== filters.projectKind
    ) {
      return false;
    }
    if (filters.scope === "current" && ctx.projectId) {
      if (hit.kind === "page") {
        return hit.projectId === ctx.projectId;
      }
      if (hit.kind === "project") {
        return hit.projectId === ctx.projectId;
      }
      if (hit.kind === "cluster") {
        return (
          hit.clusterId === ctx.clusterId ||
          hit.clusterId === ctx.projectClusterId
        );
      }
    }
    return true;
  });

  const matched = q
    ? scoped.filter((hit) => hitMatchesQuery(hit, q))
    : scoped.filter((hit) => {
        if (hit.kind === "page") {
          return true;
        }
        if (hit.kind === "action") {
          return true;
        }
        return !filters.types.page;
      });

  const counts: Partial<Record<SearchKind, number>> = {};
  const limited: SearchHit[] = [];
  for (const hit of matched) {
    const used = counts[hit.kind] ?? 0;
    if (used >= PER_KIND_CAP) {
      continue;
    }
    counts[hit.kind] = used + 1;
    limited.push(hit);
  }
  return limited;
}

export function groupSearchHits(
  hits: SearchHit[],
): { kind: SearchKind; hits: SearchHit[] }[] {
  return SEARCH_KIND_ORDER.map((kind) => ({
    kind,
    hits: hits.filter((hit) => hit.kind === kind),
  })).filter((group) => group.hits.length > 0);
}
