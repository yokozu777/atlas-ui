"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  Code,
  Eye,
  FileCode,
  FileText,
  Folder,
  Home,
  Info,
  KeyRound,
  Layers,
  Library,
  ListChecks,
  Lock,
  Map,
  Notebook,
  Play,
  ScrollText,
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
import { AtlasClusterSwitcher } from "@/components/atlas-cluster-switcher";
import { WorkingContextSwitcher } from "@/components/working-context-switcher";
import { ClusterctlUser } from "@/components/clusterctl-user";
import { CommandPalette } from "@/components/command-palette";
import { NotificationsBell } from "@/components/notifications-bell";
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
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
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
import { readCachedProject, writeCachedProject } from "@/lib/project-kind-cache";
import { AuthzProvider, useAuthz, useCan } from "@/lib/authz";
import { fetchProject } from "@/lib/stargate";
import type { StargateProject } from "@/lib/project-types";

function openPalette() {
  window.dispatchEvent(new Event("atlas-ui:palette"));
}

export function AppShell({
  children,
  initialProject,
  initialClusterId,
}: {
  children: React.ReactNode;
  initialProject: StargateProject | null;
  initialClusterId: string | null;
}) {
  const pathname = usePathname();
  const pathProjectId = projectIdFromPath(pathname);
  const [storedProjectId, setStoredProjectId] = useState<string | null>(
    () => pathProjectId ?? initialProject?.id ?? null,
  );
  const projectId = pathProjectId ?? storedProjectId;
  setNavProjectId(projectId);
  const [project, setProject] = useState<StargateProject | null>(() => {
    if (!initialProject) {
      return null;
    }
    if (pathProjectId) {
      return initialProject.id === pathProjectId ? initialProject : null;
    }
    return initialProject;
  });

  useEffect(() => {
    if (pathProjectId) {
      writeLastProjectId(pathProjectId);
      setStoredProjectId(pathProjectId);
      return;
    }
    setStoredProjectId(readLastProjectId() ?? initialProject?.id ?? null);
  }, [pathProjectId, initialProject?.id]);

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
    if (project?.id !== projectId) {
      const cached = readCachedProject(projectId);
      if (cached) {
        setProject(cached);
      } else if (initialProject?.id === projectId) {
        setProject(initialProject);
      }
    }
    let cancelled = false;
    void fetchProject(projectId)
      .then((next) => {
        if (cancelled) {
          return;
        }
        writeCachedProject(next);
        setProject(next);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        if (project?.id === projectId) {
          return;
        }
        const cached = readCachedProject(projectId);
        if (cached) {
          setProject(cached);
          return;
        }
        if (initialProject?.id === projectId) {
          setProject(initialProject);
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
    // Keep SSR kind on screen until the matching fetch returns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, pathProjectId, initialProject?.id]);

  if (pathname === "/login" || pathname === "/change-password") {
    return <>{children}</>;
  }

  const kind = project?.kind;
  const atlasProjectId = kind === "atlas" ? projectId : null;
  const fallbackClusterId =
    kind === "atlas" ? project?.cluster_id ?? null : null;

  return (
    <AuthzProvider>
    <PasswordGate />
    <JobSessionProvider>
      <AtlasClusterSelectionProvider
        key={atlasProjectId ?? "none"}
        projectId={atlasProjectId}
        fallbackClusterId={fallbackClusterId}
        initialClusterId={
          kind === "atlas" ? initialClusterId ?? fallbackClusterId : null
        }
      >
        <AtlasClusterOverlays>
          <SidebarProvider className="h-full min-h-0">
          <Sidebar>
            <SidebarHeader className="gap-0 px-2 py-3">
              <WorkingContextSwitcher projectId={projectId} project={project} />
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
                <Suspense fallback={null}>
                  <AtlasNav projectId={projectId} pathname={pathname} />
                </Suspense>
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
              <SystemNav pathname={pathname} />
            </SidebarContent>
            <SidebarFooter>
              <ClusterctlUser />
            </SidebarFooter>
            <SidebarRail />
          </Sidebar>
          <SidebarInset className="min-h-0 overflow-hidden bg-transparent">
            <header
              data-slot="content-header"
              className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b bg-card px-3"
            >
              <SidebarTrigger />
              <Separator orientation="vertical" className="h-4" />
              <div className="min-w-0 flex-1 overflow-hidden">
                <AppBreadcrumbs kind={kind ?? null} />
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <AtlasClusterSwitcher />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-muted-foreground"
                  onClick={openPalette}
                  aria-label="Search"
                >
                  <Search />
                  <span className="hidden lg:inline">Search</span>
                  <span className="hidden md:flex items-center gap-1">
                    <Kbd>⌘</Kbd>
                    <Kbd>K</Kbd>
                  </span>
                </Button>
                <NotificationsBell />
              </div>
            </header>
            <div
              className={
                /\/projects\/[^/]+\/executions\/[^/]+\/?$/.test(pathname) ||
                /\/(projects|clusters)\/[^/]+\/logs\/[^/]+\/?$/.test(pathname) ||
                /\/projects\/[^/]+\/map\/?$/.test(pathname)
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
    </AuthzProvider>
  );
}

function PasswordGate() {
  const router = useRouter();
  const { me, ready } = useAuthz();
  useEffect(() => {
    if (ready && me?.must_change_password) {
      router.replace("/change-password");
    }
  }, [me, ready, router]);
  return null;
}

function SystemNav({ pathname }: { pathname: string }) {
  const can = useCan();
  return (
    <SidebarGroup>
      <SidebarGroupLabel>System</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {can("settings.read") ? (
            <NavItem
              href="/server-logs"
              pathname={pathname}
              icon={<FileText />}
              label="Server logs"
            />
          ) : null}
          {can("global_secrets.read") ? (
            <NavItem
              href="/secrets"
              pathname={pathname}
              icon={<KeyRound />}
              label="Secrets Manager"
            />
          ) : null}
          {can("users.read") ? (
            <NavItem
              href="/users"
              pathname={pathname}
              icon={<Users />}
              label="Users"
            />
          ) : null}
          {can("settings.read") ? (
            <NavItem
              href="/settings"
              pathname={pathname}
              icon={<Shield />}
              label="Console"
            />
          ) : null}
          <NavItem
            href="/docs"
            pathname={pathname}
            icon={<Library />}
            label="Docs"
          />
          <NavItem
            href="/about"
            pathname={pathname}
            icon={<Info />}
            label="About"
          />
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
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

function pathMatches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function AtlasNav({
  projectId,
  pathname,
}: {
  projectId: string;
  pathname: string;
}) {
  const can = useCan();
  const hostsHref = projectHref(projectId, "/hosts");
  const inventoryHref = projectHref(projectId, "/inventory");
  const varsHref = projectHref(projectId, "/vars");
  const executionsHref = projectHref(projectId, "/executions");
  const executionsLogsHref = projectHref(projectId, "/executions?tab=logs");
  const logsHref = projectHref(projectId, "/logs");
  const rolesHref = projectHref(projectId, "/roles");
  const handbookHref = projectHref(projectId, "/handbook");
  const settingsHref = projectHref(projectId, "/settings");
  const ansibleConfigHref = projectHref(projectId, "/ansible-config");
  const vaultHref = projectHref(projectId, "/vault");
  const clustersHref = projectHref(projectId, "/clusters");
  const searchParams = useSearchParams();
  const logsTab = searchParams.get("tab") === "logs";

  const inventoryActive =
    pathMatches(pathname, hostsHref) ||
    pathMatches(pathname, inventoryHref) ||
    pathMatches(pathname, varsHref);
  const onExecutions = pathMatches(pathname, executionsHref);
  const executionsActive = onExecutions && !logsTab;
  const logsActive =
    (onExecutions && logsTab) || pathMatches(pathname, logsHref);
  const rolesActive =
    pathMatches(pathname, rolesHref) || pathMatches(pathname, handbookHref);

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>Cluster</SidebarGroupLabel>
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
              icon={<ListChecks />}
              label="Setup"
            />
            <NavItem
              href={projectHref(projectId, "/map")}
              pathname={pathname}
              icon={<Map />}
              label="Map"
            />
            <NavItem
              href={hostsHref}
              pathname={pathname}
              icon={<Server />}
              label="Inventory"
              active={inventoryActive}
            />
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>Operate</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <NavItem
              href={executionsHref}
              pathname={pathname}
              icon={<FileText />}
              label="Executions"
              active={executionsActive}
            />
            <NavItem
              href={executionsLogsHref}
              pathname={pathname}
              icon={<ScrollText />}
              label="Logs"
              active={logsActive}
            />
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>Project</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <NavItem
              href={clustersHref}
              pathname={pathname}
              icon={<Layers />}
              label="Clusters"
            />
            <NavItem
              href={rolesHref}
              pathname={pathname}
              icon={<BookOpen />}
              label="Roles"
              active={rolesActive}
            />
            {can("secrets.read") ? (
            <NavItem
              href={projectHref(projectId, "/secrets")}
              pathname={pathname}
              icon={<KeyRound />}
              label="Secrets"
            />
            ) : null}
            <NavItem
              href={ansibleConfigHref}
              pathname={pathname}
              icon={<FileCode />}
              label="Ansible Config"
            />
            {can("secrets.read") ? (
            <NavItem
              href={vaultHref}
              pathname={pathname}
              icon={<Lock />}
              label="Vaults"
            />
            ) : null}
            <NavItem
              href={settingsHref}
              pathname={pathname}
              icon={<Settings />}
              label="Project Settings"
            />
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}

function InfrastructureNav({
  projectId,
  pathname,
}: {
  projectId: string;
  pathname: string;
}) {
  const can = useCan();
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
            {can("secrets.read") ? (
            <NavItem
              href={projectHref(projectId, "/vault")}
              pathname={pathname}
              icon={<Lock />}
              label="Vaults"
            />
            ) : null}
            {can("secrets.read") ? (
            <NavItem
              href={projectHref(projectId, "/secrets")}
              pathname={pathname}
              icon={<KeyRound />}
              label="Secrets"
            />
            ) : null}
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
