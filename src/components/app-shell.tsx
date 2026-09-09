"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  Boxes,
  ChevronDown,
  Code,
  Eye,
  FileCode,
  FileText,
  Folder,
  Home,
  KeyRound,
  Layers,
  Library,
  Lock,
  Notebook,
  Play,
  Rocket,
  Search,
  Server,
  Settings,
  Shield,
  Users,
} from "lucide-react";

import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import {
  AtlasClusterOverlays,
  AtlasClusterSelectionProvider,
  useAtlasClusterSelection,
} from "@/components/atlas-cluster-selection";
import { ClusterHeaderSwitcher } from "@/components/cluster-header-switcher";
import { ClusterctlUser } from "@/components/clusterctl-user";
import { CommandPalette } from "@/components/command-palette";
import { NotificationsBell } from "@/components/notifications-bell";
import { ProjectSwitcher } from "@/components/project-switcher";
import { JobSessionProvider } from "@/components/job-session";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Kbd } from "@/components/ui/kbd";
import { Button } from "@/components/ui/button";
import {
  LAST_PROJECT_EVENT,
  projectHref,
  projectIdFromPath,
  readLastProjectId,
  setNavProjectId,
  writeLastProjectId,
} from "@/lib/project-href";
import { projectApiQuery } from "@/components/hosts-groups/helpers";
import { fetchMe, fetchProject, stargateJson } from "@/lib/stargate";
import type { StargateProject } from "@/lib/project-types";

function clusterIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/clusters\/([^/]+)/);
  if (!match) return null;
  return decodeURIComponent(match[1]);
}

function openPalette() {
  window.dispatchEvent(new Event("atlas-ui:palette"));
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const pathProjectId = projectIdFromPath(pathname);
  const [storedProjectId, setStoredProjectId] = useState<string | null>(null);
  const projectId = pathProjectId ?? storedProjectId;
  setNavProjectId(projectId);
  const clusterId = clusterIdFromPath(pathname);
  const [project, setProject] = useState<StargateProject | null>(null);

  useEffect(() => {
    if (pathProjectId) {
      writeLastProjectId(pathProjectId);
      setStoredProjectId(pathProjectId);
      return;
    }
    setStoredProjectId(readLastProjectId());
  }, [pathProjectId]);

  useEffect(() => {
    function syncStored() {
      if (!pathProjectId) {
        setStoredProjectId(readLastProjectId());
      }
    }
    window.addEventListener(LAST_PROJECT_EVENT, syncStored);
    window.addEventListener("storage", syncStored);
    return () => {
      window.removeEventListener(LAST_PROJECT_EVENT, syncStored);
      window.removeEventListener("storage", syncStored);
    };
  }, [pathProjectId]);

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      return;
    }
    let cancelled = false;
    void fetchProject(projectId)
      .then((next) => {
        if (!cancelled) {
          setProject(next);
        }
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setProject(null);
        if (!pathProjectId) {
          writeLastProjectId(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, pathProjectId]);

  useEffect(() => {
    if (pathname === "/login" || pathname === "/change-password") {
      return;
    }
    let cancelled = false;
    void fetchMe().then((me) => {
      if (cancelled || !me?.must_change_password) {
        return;
      }
      router.replace("/change-password");
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (pathname === "/login" || pathname === "/change-password") {
    return <>{children}</>;
  }

  const kind = project?.kind;
  const atlasProjectId = kind === "atlas" ? projectId : null;
  const fallbackClusterId =
    kind === "atlas" ? project?.cluster_id ?? null : clusterId;

  return (
    <JobSessionProvider>
      <AtlasClusterSelectionProvider
        projectId={atlasProjectId}
        fallbackClusterId={fallbackClusterId}
      >
        <AtlasClusterOverlays>
          <SidebarProvider className="h-full min-h-0">
          <Sidebar>
            <SidebarHeader className="gap-0 px-2 py-3">
              <ProjectSwitcher projectId={projectId} project={project} />
            </SidebarHeader>
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Workspace</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <NavItem
                      href="/projects"
                      pathname={pathname}
                      icon={<Folder />}
                      label="Projects"
                      active={
                        pathname === "/projects" || pathname === "/projects/new"
                      }
                    />
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
              {projectId && kind === "atlas" ? (
                <>
                  <SidebarGroup>
                    <SidebarGroupLabel>Atlas</SidebarGroupLabel>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        <NavItem
                          href={projectHref(projectId)}
                          pathname={pathname}
                          icon={<Home />}
                          label="Overview"
                          exact
                        />
                        <NavItem
                          href={projectHref(projectId, "/cluster-yaml")}
                          pathname={pathname}
                          icon={<FileCode />}
                          label="Cluster definition"
                        />
                        <NavItem
                          href={projectHref(projectId, "/logs")}
                          pathname={pathname}
                          icon={<FileText />}
                          label="Logs"
                        />
                        <NavItem
                          href={projectHref(projectId, "/run")}
                          pathname={pathname}
                          icon={<Play />}
                          label="Run"
                        />
                        <NavItem
                          href={projectHref(projectId, "/workspace")}
                          pathname={pathname}
                          icon={<Layers />}
                          label="Workspace"
                        />
                        <NavItem
                          href={projectHref(projectId, "/init")}
                          pathname={pathname}
                          icon={<Rocket />}
                          label="Init"
                        />
                        <NavItem
                          href={projectHref(projectId, "/settings")}
                          pathname={pathname}
                          icon={<Settings />}
                          label="Settings"
                        />
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </SidebarGroup>
                  <InfrastructureNav
                    projectId={projectId}
                    pathname={pathname}
                  />
                </>
              ) : null}
              {projectId && kind === "ansible" ? (
                <>
                  <SidebarGroup>
                    <SidebarGroupLabel>Project</SidebarGroupLabel>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        <NavItem
                          href={projectHref(projectId)}
                          pathname={pathname}
                          icon={<Home />}
                          label="Dashboard"
                          exact
                        />
                        <NavItem
                          href={projectHref(projectId, "/runs")}
                          pathname={pathname}
                          icon={<Play />}
                          label="Runs"
                        />
                        <NavItem
                          href={projectHref(projectId, "/executions")}
                          pathname={pathname}
                          icon={<FileText />}
                          label="Executions"
                        />
                        <NavItem
                          href={projectHref(projectId, "/preview")}
                          pathname={pathname}
                          icon={<Eye />}
                          label="Preview"
                        />
                        <NavItem
                          href={projectHref(projectId, "/settings")}
                          pathname={pathname}
                          icon={<Settings />}
                          label="Project Settings"
                        />
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </SidebarGroup>
                  <InfrastructureNav
                    projectId={projectId}
                    pathname={pathname}
                  />
                </>
              ) : null}
              {clusterId && !projectId ? (
                <SidebarGroup>
                  <SidebarGroupLabel>Legacy cluster</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton render={<Link href="/projects" />}>
                          <Boxes />
                          <span>Go to projects</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ) : null}
              {projectId ? (
                <Suspense fallback={null}>
                  <RoleSettingsNav projectId={projectId} pathname={pathname} />
                </Suspense>
              ) : null}
              <SidebarGroup>
                <SidebarGroupLabel>System</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <NavItem
                      href="/workers"
                      pathname={pathname}
                      icon={<Server />}
                      label="Workers"
                    />
                    <NavItem
                      href="/server-logs"
                      pathname={pathname}
                      icon={<FileText />}
                      label="Server logs"
                    />
                    <NavItem
                      href="/secrets"
                      pathname={pathname}
                      icon={<KeyRound />}
                      label="Secrets"
                    />
                    <NavItem
                      href="/users"
                      pathname={pathname}
                      icon={<Users />}
                      label="Users"
                    />
                    <NavItem
                      href="/settings"
                      pathname={pathname}
                      icon={<Shield />}
                      label="Settings"
                    />
                    <NavItem
                      href="/docs"
                      pathname={pathname}
                      icon={<Library />}
                      label="Docs"
                    />
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
            <SidebarFooter>
              <ClusterctlUser />
            </SidebarFooter>
            <SidebarRail />
          </Sidebar>
          <SidebarInset className="min-h-0 overflow-hidden bg-transparent">
            <header
              data-slot="content-header"
              className="flex h-12 shrink-0 items-center gap-2 border-b bg-card px-3"
            >
              <SidebarTrigger />
              <Separator orientation="vertical" className="h-4" />
              <AppBreadcrumbs />
              <div className="ml-auto flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-muted-foreground"
                  onClick={openPalette}
                  aria-label="Search"
                >
                  <Search />
                  <span>Search</span>
                  <span className="flex items-center gap-1">
                    <Kbd>⌘</Kbd>
                    <Kbd>K</Kbd>
                  </span>
                </Button>
                <NotificationsBell />
                {kind === "atlas" ? <ClusterHeaderSwitcher /> : null}
              </div>
            </header>
            <div
              className={
                /\/projects\/[^/]+\/executions\/[^/]+\/?$/.test(pathname) ||
                /\/(projects|clusters)\/[^/]+\/logs\/[^/]+\/?$/.test(pathname)
                  ? "flex min-h-0 flex-1 flex-col overflow-hidden p-4"
                  : "min-h-0 flex-1 overflow-y-auto p-8"
              }
            >
              {children}
            </div>
          </SidebarInset>
          <SessionCommandPalette
            projectId={projectId}
            atlasProjectId={kind === "atlas" ? projectId : null}
          />
        </SidebarProvider>
        </AtlasClusterOverlays>
      </AtlasClusterSelectionProvider>
    </JobSessionProvider>
  );
}

function SessionCommandPalette({
  projectId,
  atlasProjectId,
}: {
  projectId: string | null;
  atlasProjectId: string | null;
}) {
  const { clusterId } = useAtlasClusterSelection();
  return (
    <CommandPalette
      clusterId={clusterId}
      projectId={projectId}
      atlasProjectId={atlasProjectId}
    />
  );
}

function InfrastructureNav({
  projectId,
  pathname,
}: {
  projectId: string;
  pathname: string;
}) {
  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>Automation</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <NavItem
              href={projectHref(projectId, "/playbooks")}
              pathname={pathname}
              icon={<FileCode />}
              label="Playbooks"
            />
            <NavItem
              href={projectHref(projectId, "/roles")}
              pathname={pathname}
              icon={<BookOpen />}
              label="Roles"
              exact
            />
            <NavItem
              href={projectHref(projectId, "/handbook")}
              pathname={pathname}
              icon={<Notebook />}
              label="Handbook"
            />
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>Configuration</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <NavItem
              href={projectHref(projectId, "/ansible-config")}
              pathname={pathname}
              icon={<Settings />}
              label="Ansible Config"
            />
            <NavItem
              href={projectHref(projectId, "/vault")}
              pathname={pathname}
              icon={<Lock />}
              label="Vaults"
            />
            <NavItem
              href={projectHref(projectId, "/secrets")}
              pathname={pathname}
              icon={<KeyRound />}
              label="Secrets"
            />
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>Inventory</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <NavItem
              href={projectHref(projectId, "/hosts")}
              pathname={pathname}
              icon={<Server />}
              label="Hosts & Groups"
            />
            <NavItem
              href={projectHref(projectId, "/inventory")}
              pathname={pathname}
              icon={<Folder />}
              label="Inventory"
            />
            <NavItem
              href={projectHref(projectId, "/vars")}
              pathname={pathname}
              icon={<Code />}
              label="Vars"
            />
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}

function NavItem({
  href,
  pathname,
  icon,
  label,
  exact,
  active: activeOverride,
}: {
  href: string;
  pathname: string;
  icon: ReactNode;
  label: string;
  exact?: boolean;
  active?: boolean;
}) {
  const active =
    activeOverride ??
    (exact
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={active} render={<Link href={href} />}>
        {icon}
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

type RoleNode = {
  type?: string;
  name?: string;
  id?: string;
  path?: string;
  children?: RoleNode[];
};

function roleNodeId(node: RoleNode): string {
  return node.id || node.path || node.name || "";
}

function nodeHasRoles(node: RoleNode): boolean {
  if (node.type === "role") {
    return true;
  }
  return (node.children ?? []).some(nodeHasRoles);
}

function visibleChildren(node: RoleNode): RoleNode[] {
  return (node.children ?? []).filter(
    (child) => child.type === "role" || nodeHasRoles(child),
  );
}

function ancestorFolderIds(
  nodes: RoleNode[],
  roleId: string,
  trail: string[] = [],
): string[] | null {
  for (const node of nodes) {
    const id = roleNodeId(node);
    if (node.type === "role") {
      if (id === roleId) {
        return trail;
      }
      continue;
    }
    const found = ancestorFolderIds(node.children ?? [], roleId, [...trail, id]);
    if (found) {
      return found;
    }
  }
  return null;
}

function roleSidebarLabel(name: string): string {
  const match = name.match(/^(\d+)/);
  const number = match ? match[1] : "";
  const rest = name.replace(/^\d+_/, "").replace(/_/g, " ");
  return number ? `${number} ${rest}` : rest;
}

function RoleSettingsNav({
  projectId,
  pathname,
}: {
  projectId: string;
  pathname: string;
}) {
  const { clusterId } = useAtlasClusterSelection();
  const searchParams = useSearchParams();
  const selected = searchParams.get("role") ?? "";
  const [tree, setTree] = useState<RoleNode[]>([]);
  const [open, setOpen] = useState(false);
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const q = projectApiQuery(projectId, clusterId);

  useEffect(() => {
    let cancelled = false;
    void stargateJson<{ tree?: RoleNode[] }>(`/roles/storage?${q}`)
      .then((data) => {
        if (!cancelled) {
          setTree(data.tree ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTree([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [q]);

  useEffect(() => {
    if (!selected || tree.length === 0) {
      return;
    }
    const ancestors = ancestorFolderIds(tree, selected);
    if (!ancestors) {
      return;
    }
    setOpen(true);
    setOpenIds((prev) => {
      const next = new Set(prev);
      for (const id of ancestors) {
        next.add(id);
      }
      return next;
    });
  }, [selected, tree]);

  function toggleFolder(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const rolesHref = projectHref(projectId, "/roles");
  const onRoles = pathname === rolesHref || pathname.startsWith(`${rolesHref}/`);
  const items = tree.filter((node) => node.type === "role" || nodeHasRoles(node));

  return (
    <SidebarGroup>
      <SidebarGroupLabel
        render={<button type="button" />}
        className="w-full cursor-pointer justify-between hover:text-sidebar-foreground"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Role Settings
        <ChevronDown
          className={cn(
            "transition-transform",
            open ? "rotate-180" : "rotate-0",
          )}
        />
      </SidebarGroupLabel>
      {open ? (
        <SidebarGroupContent>
          <SidebarMenu>
            {items.length === 0 ? (
              <SidebarMenuItem>
                <SidebarMenuButton disabled>
                  <Settings />
                  <span>No roles</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : (
              items.map((node) =>
                node.type === "role" ? (
                  <RoleNavLeaf
                    key={roleNodeId(node)}
                    node={node}
                    nested={false}
                    rolesHref={rolesHref}
                    selected={selected}
                    onRoles={onRoles}
                  />
                ) : (
                  <RoleNavFolder
                    key={roleNodeId(node)}
                    node={node}
                    nested={false}
                    rolesHref={rolesHref}
                    selected={selected}
                    onRoles={onRoles}
                    openIds={openIds}
                    onToggle={toggleFolder}
                  />
                ),
              )
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      ) : null}
    </SidebarGroup>
  );
}

function RoleNavFolder({
  node,
  nested,
  rolesHref,
  selected,
  onRoles,
  openIds,
  onToggle,
}: {
  node: RoleNode;
  nested: boolean;
  rolesHref: string;
  selected: string;
  onRoles: boolean;
  openIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const id = roleNodeId(node);
  const expanded = openIds.has(id);
  const kids = visibleChildren(node);
  const label = node.name || id;
  const toggle = (
    <>
      <Folder />
      <span>{label}</span>
      <ChevronDown
        className={cn(
          "ml-auto transition-transform",
          expanded ? "rotate-180" : "rotate-0",
        )}
      />
    </>
  );
  const body = (
    <>
      {nested ? (
        <SidebarMenuSubButton
          render={<button type="button" />}
          className="w-full cursor-pointer"
          aria-expanded={expanded}
          onClick={() => onToggle(id)}
        >
          {toggle}
        </SidebarMenuSubButton>
      ) : (
        <SidebarMenuButton
          className="cursor-pointer"
          aria-expanded={expanded}
          onClick={() => onToggle(id)}
        >
          {toggle}
        </SidebarMenuButton>
      )}
      {expanded ? (
        <SidebarMenuSub>
          {kids.map((child) =>
            child.type === "role" ? (
              <RoleNavLeaf
                key={roleNodeId(child)}
                node={child}
                nested
                rolesHref={rolesHref}
                selected={selected}
                onRoles={onRoles}
              />
            ) : (
              <RoleNavFolder
                key={roleNodeId(child)}
                node={child}
                nested
                rolesHref={rolesHref}
                selected={selected}
                onRoles={onRoles}
                openIds={openIds}
                onToggle={onToggle}
              />
            ),
          )}
        </SidebarMenuSub>
      ) : null}
    </>
  );
  return nested ? (
    <SidebarMenuSubItem>{body}</SidebarMenuSubItem>
  ) : (
    <SidebarMenuItem>{body}</SidebarMenuItem>
  );
}

function RoleNavLeaf({
  node,
  nested,
  rolesHref,
  selected,
  onRoles,
}: {
  node: RoleNode;
  nested: boolean;
  rolesHref: string;
  selected: string;
  onRoles: boolean;
}) {
  const id = roleNodeId(node);
  const href = `${rolesHref}?role=${encodeURIComponent(id)}`;
  const active = onRoles && selected === id;
  const label = roleSidebarLabel(node.name || id);
  if (nested) {
    return (
      <SidebarMenuSubItem>
        <SidebarMenuSubButton isActive={active} render={<Link href={href} />}>
          <Settings />
          <span>{label}</span>
        </SidebarMenuSubButton>
      </SidebarMenuSubItem>
    );
  }
  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={active} render={<Link href={href} />}>
        <Settings />
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
