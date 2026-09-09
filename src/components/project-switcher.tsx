"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Folder, FolderOpen, Plus } from "lucide-react";
import { Combobox } from "@base-ui/react/combobox";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { projectHref, writeLastProjectId } from "@/lib/project-href";
import { fetchProjects } from "@/lib/stargate";
import type { ProjectKind, StargateProject } from "@/lib/project-types";
import { cn } from "@/lib/utils";

function projectKindLabel(kind?: ProjectKind | string): string {
  if (kind === "atlas") return "Atlas";
  if (kind === "ansible") return "Ansible";
  return kind || "Unknown";
}

function projectKindBadge(kind?: ProjectKind | string) {
  if (kind === "atlas") {
    return (
      <Badge variant="info" className="shrink-0">
        Atlas
      </Badge>
    );
  }
  if (kind === "ansible") {
    return (
      <Badge variant="warning" className="shrink-0">
        Ansible
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="shrink-0 capitalize">
      {kind || "Unknown"}
    </Badge>
  );
}

function truncateMiddle(value: string, max = 22): string {
  if (value.length <= max) {
    return value;
  }
  const keep = Math.max(4, Math.floor((max - 1) / 2));
  return `${value.slice(0, keep)}…${value.slice(-keep)}`;
}

function projectFilter(item: StargateProject, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return `${item.name} ${item.description ?? ""} ${item.id} ${item.kind} ${projectKindLabel(item.kind)}`
    .toLowerCase()
    .includes(q);
}

export function ProjectSwitcher({
  projectId,
  project,
}: {
  projectId: string | null;
  project: StargateProject | null;
}) {
  const router = useRouter();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<StargateProject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const label =
    project?.name || (projectId ? truncateMiddle(projectId) : "Select a project");
  const selected =
    projects.find((row) => row.id === projectId) ?? project ?? null;
  const isActive = Boolean(project && !project.isArchived);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchProjects();
      setProjects(rows.filter((row) => !row.isArchived));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }

  function emptyLabel() {
    if (loading) {
      return "Loading…";
    }
    if (error) {
      return error;
    }
    return "No projects";
  }

  return (
    <Combobox.Root
      items={projects}
      value={selected}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          void load();
        }
      }}
      onValueChange={(row) => {
        if (!row) {
          return;
        }
        setOpen(false);
        writeLastProjectId(row.id);
        router.push(projectHref(row.id));
      }}
      itemToStringLabel={(row) => row.name}
      isItemEqualToValue={(a, b) => a.id === b.id}
      filter={projectFilter}
      autoHighlight
    >
      <Combobox.Trigger
        aria-label="Select project"
        title={collapsed ? label : undefined}
        className={cn(
          "flex w-full min-w-0 items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar px-2.5 py-2 text-left outline-none",
          "ring-sidebar-ring transition-colors hover:bg-sidebar-accent focus-visible:ring-2",
          "data-popup-open:bg-sidebar-accent",
          "group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-2",
        )}
      >
        <Folder className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium group-data-[collapsible=icon]:hidden">
          {label}
        </span>
        {isActive ? (
          <span className="ml-auto shrink-0 rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-emerald-400 ring-1 ring-emerald-500/35 bg-emerald-500/15 group-data-[collapsible=icon]:hidden">
            Active
          </span>
        ) : null}
        <Combobox.Icon
          render={
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
          }
        />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner
          className="isolate z-50 outline-none"
          side={collapsed ? "right" : "bottom"}
          align="start"
          sideOffset={4}
          collisionPadding={8}
        >
          <Combobox.Popup
            data-slot="project-switcher-popup"
            className="flex max-h-[min(24rem,calc(100vh-2rem))] w-[min(18rem,calc(100vw-1rem))] min-w-64 origin-(--transform-origin) flex-col overflow-hidden rounded-lg bg-background p-2 text-foreground shadow-lg ring-1 ring-foreground/15 backdrop-blur-none duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          >
            <Combobox.Input
              placeholder="Search projects..."
              className="mb-2 h-8 w-full rounded-lg border border-input bg-transparent px-3 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <Combobox.Empty className="px-2.5 py-3 text-center text-xs text-muted-foreground">
              {emptyLabel()}
            </Combobox.Empty>
            <Combobox.List className="min-h-0 flex-1 overflow-y-auto outline-none">
              {(row: StargateProject) => {
                const itemSubtitle =
                  row.description?.trim() || truncateMiddle(row.id);
                return (
                  <Combobox.Item
                    key={row.id}
                    value={row}
                    className="flex w-full cursor-default items-center gap-2 rounded-md px-2.5 py-2 text-left outline-none data-highlighted:bg-white/10 data-selected:bg-primary/15 data-selected:ring-1 data-selected:ring-primary/30"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="min-w-0 truncate text-sm font-medium">
                          {row.name}
                        </span>
                        {projectKindBadge(row.kind)}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {itemSubtitle}
                      </span>
                    </span>
                    <Combobox.ItemIndicator>
                      <Check className="size-3.5 shrink-0 text-primary" />
                    </Combobox.ItemIndicator>
                  </Combobox.Item>
                );
              }}
            </Combobox.List>
            <div className="mt-2 flex flex-col gap-1.5 border-t border-white/10 pt-2">
              <Button
                size="sm"
                className="w-full rounded-md"
                onClick={() => {
                  setOpen(false);
                  router.push("/projects/new");
                }}
              >
                <Plus className="size-3.5" />
                Create Project
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full rounded-md"
                onClick={() => {
                  setOpen(false);
                  router.push("/projects");
                }}
              >
                <FolderOpen className="size-3.5" />
                View All Projects
              </Button>
            </div>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
