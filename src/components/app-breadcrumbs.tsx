"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { projectHref, projectIdFromPath } from "@/lib/project-href";
import type { ProjectKind } from "@/lib/project-types";

const crumbLink = "min-w-0 truncate transition-colors hover:text-foreground";

const PROJECT_LABELS: Record<string, string> = {
  vars: "Vars",
  hosts: "Hosts & Groups",
  inventory: "Inventory",
  "ansible-config": "Ansible Config",
  "cluster-yaml": "Cluster setup",
  map: "Map",
  limits: "Hosts",
  logs: "Logs",
  run: "Run",
  repos: "Repos",
  config: "Config",
  workspace: "Runtime",
  playbooks: "Playbooks",
  runs: "Runs",
  executions: "Executions",
  git: "Git",
  vault: "Vaults",
  secrets: "Secrets",
  roles: "Roles",
  handbook: "Handbook",
  settings: "Project Settings",
  dashboard: "Dashboard",
  preview: "Preview",
  init: "New cluster",
  clusters: "Clusters",
};

function projectPageLabel(first: string, kind: ProjectKind | null): string | undefined {
  if (kind === "atlas") {
    if (first === "hosts") return "Inventory";
    if (first === "settings") return "Project Settings";
    if (first === "cluster-yaml") return "Cluster setup";
  }
  return PROJECT_LABELS[first];
}

function projectRootLabel(kind: ProjectKind | null): string {
  if (kind === "atlas") return "Overview";
  if (kind === "ansible") return "Dashboard";
  return "Project";
}

export function AppBreadcrumbs({ kind }: { kind: ProjectKind | null }) {
  const pathname = usePathname();
  const projectId = projectIdFromPath(pathname);

  if (pathname === "/login") {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Sign in</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  if (pathname === "/projects/new") {
    return (
      <Breadcrumb>
        <BreadcrumbList className="flex-nowrap overflow-hidden">
          <BreadcrumbItem>
            <Link href="/projects" className={crumbLink}>
              Projects
            </Link>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  if (!projectId) {
    const leaf =
      pathname === "/init"
        ? "New cluster"
        : pathname === "/setup"
          ? "Setup"
          : pathname === "/settings"
            ? "Console"
            : pathname === "/workers"
              ? "Workers"
              : pathname === "/users"
                ? "Users"
                : pathname === "/server-logs"
                  ? "Server logs"
                  : pathname === "/secrets"
                    ? "Secrets Manager"
                    : pathname === "/docs"
                      ? "Docs"
                      : pathname === "/about"
                        ? "About"
                        : "Projects";
    return (
      <Breadcrumb>
        <BreadcrumbList className="flex-nowrap overflow-hidden">
          <BreadcrumbItem>
            <Link href="/projects" className={crumbLink}>
              Projects
            </Link>
          </BreadcrumbItem>
          {pathname !== "/projects" ? (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{leaf}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : null}
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  const rest = pathname.slice(projectHref(projectId).length).replace(/^\//, "");
  const first = rest.split("/")[0] ?? "";
  const page = projectPageLabel(first, kind) ?? projectRootLabel(kind);

  return (
    <Breadcrumb>
      <BreadcrumbList className="flex-nowrap overflow-hidden">
        <BreadcrumbItem>
          <Link href="/projects" className={crumbLink}>
            Projects
          </Link>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem className="min-w-0">
          <BreadcrumbPage className="truncate">{page}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
