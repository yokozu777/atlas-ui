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

const crumbLink = "transition-colors hover:text-foreground";

const PROJECT_LABELS: Record<string, string> = {
  vars: "Vars",
  hosts: "Hosts & Groups",
  inventory: "Inventory",
  "ansible-config": "Ansible Config",
  "cluster-yaml": "Cluster definition",
  limits: "Hosts",
  logs: "Logs",
  run: "Run",
  repos: "Repos",
  config: "Config",
  workspace: "Workspace",
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
};

export function AppBreadcrumbs() {
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
        <BreadcrumbList>
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
        ? "Init"
        : pathname === "/setup"
          ? "Setup"
          : pathname === "/settings"
            ? "Settings"
            : pathname === "/workers"
              ? "Workers"
              : pathname === "/users"
                ? "Users & roles"
                : pathname === "/server-logs"
                  ? "Server logs"
                  : pathname === "/secrets"
                    ? "Secrets Manager"
                    : pathname === "/docs"
                      ? "Docs"
                      : "Projects";
    return (
      <Breadcrumb>
        <BreadcrumbList>
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
  const page = PROJECT_LABELS[first];

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <Link href="/projects" className={crumbLink}>
            Projects
          </Link>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          {page ? (
            <Link href={projectHref(projectId)} className={crumbLink}>
              Project
            </Link>
          ) : (
            <BreadcrumbPage>Project</BreadcrumbPage>
          )}
        </BreadcrumbItem>
        {page ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{page}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
