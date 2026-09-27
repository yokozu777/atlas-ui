"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Folder, FolderOpen, Plus } from "lucide-react";

import {
  readAtlasClusterStored,
  useAtlasClusterSelection,
  writeAtlasClusterForProject,
} from "@/components/atlas-cluster-selection";
import {
  ContextCombobox,
  ContextSwitcher,
  type ContextSwitcherGroup,
} from "@/components/context-switcher";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { projectKindLabel } from "@/components/project-kind-badge";
import { projectHref, writeLastProjectId } from "@/lib/project-href";
import type { StargateProject } from "@/lib/project-types";
import { pushRecentContext, readRecentClusterIds, readRecentContexts } from "@/lib/recent-context";
import { fetchProjects } from "@/lib/stargate";

type ContextHit = {
  key: string;
  source: "recent" | "all";
  project: StargateProject;
  clusterId: string | null;
};

const triggerClass =
  "flex w-full min-w-0 items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar px-2.5 py-2 text-left outline-none ring-sidebar-ring transition-colors hover:bg-sidebar-accent focus-visible:ring-2 data-popup-open:bg-sidebar-accent group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-2";

function truncateMiddle(value: string, max = 22): string {
  if (value.length <= max) {
    return value;
  }
  const keep = Math.max(4, Math.floor((max - 1) / 2));
  return `${value.slice(0, keep)}…${value.slice(-keep)}`;
}

function projectMatches(project: StargateProject, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return `${project.name} ${project.description ?? ""} ${project.id} ${project.kind} ${projectKindLabel(project.kind)}`
    .toLowerCase()
    .includes(q);
}

function storedClusterFor(project: StargateProject): string | null {
  if (project.kind !== "atlas") {
    return null;
  }
  return readAtlasClusterStored(project.id) ?? readRecentClusterIds(project.id)[0] ?? null;
}

export function WorkingContextSwitcher({
  projectId,
  project,
}: {
  projectId: string | null;
  project: StargateProject | null;
}) {
  const router = useRouter();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { projectId: atlasProjectId, clusterId } = useAtlasClusterSelection();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<StargateProject[]>([]);
  const [recent, setRecent] = useState<ContextHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const skipDupRef = useRef(false);

  const selectedProject =
    projects.find((row) => row.id === projectId) ?? project ?? null;
  const name =
    selectedProject?.name ||
    (projectId ? truncateMiddle(projectId) : "Select a project");
  const kind = selectedProject?.kind ?? project?.kind ?? null;
  const subtitle = kind ? projectKindLabel(kind) : null;

  async function loadProjects() {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchProjects();
      const active = rows.filter((row) => !row.isArchived);
      setProjects(active);
      const contexts = readRecentContexts();
      const byId = new Map(active.map((row) => [row.id, row]));
      const hits: ContextHit[] = [];
      const seen = new Set<string>();
      for (const ctx of contexts) {
        const row = byId.get(ctx.projectId);
        if (!row || seen.has(row.id)) {
          continue;
        }
        seen.add(row.id);
        hits.push({
          key: `recent:${row.id}`,
          source: "recent",
          project: row,
          clusterId:
            row.kind === "atlas"
              ? ctx.clusterId ?? storedClusterFor(row)
              : null,
        });
      }
      setRecent(hits);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }

  function applyProject(row: StargateProject) {
    if (row.kind === "atlas") {
      const stored = storedClusterFor(row);
      if (row.id === atlasProjectId) {
        setOpen(false);
        return;
      }
      if (stored) {
        writeAtlasClusterForProject(row.id, stored);
      } else {
        pushRecentContext({ projectId: row.id, clusterId: null });
      }
    } else {
      pushRecentContext({ projectId: row.id, clusterId: null });
    }
    writeLastProjectId(row.id);
    setOpen(false);
    router.push(projectHref(row.id));
  }

  const projectItems = useMemo(() => {
    const recentKeys = new Set(recent.map((hit) => hit.project.id));
    const hits: ContextHit[] = [...recent];
    for (const row of projects) {
      if (recentKeys.has(row.id)) {
        continue;
      }
      hits.push({
        key: `all:${row.id}`,
        source: "all",
        project: row,
        clusterId: storedClusterFor(row),
      });
    }
    return hits;
  }, [projects, recent]);

  const projectGroups = useMemo<ContextSwitcherGroup<ContextHit>[]>(() => {
    const sections: ContextSwitcherGroup<ContextHit>[] = [];
    const recentProjectIds = new Set(recent.map((hit) => hit.project.id));
    const recentRows = projectItems.filter((hit) =>
      recentProjectIds.has(hit.project.id),
    );
    if (recentRows.length > 0) {
      sections.push({ id: "recent", label: "Recent", items: recentRows });
    }
    const allRows = projectItems.filter(
      (hit) => !recentProjectIds.has(hit.project.id),
    );
    if (allRows.length > 0 || recentRows.length === 0) {
      sections.push({
        id: "all",
        label: "All projects",
        items: allRows.length > 0 ? allRows : projectItems,
      });
    }
    return sections;
  }, [projectItems, recent]);

  const selectedHit = useMemo<ContextHit | null>(() => {
    if (!selectedProject) {
      return null;
    }
    return (
      recent.find((hit) => hit.project.id === selectedProject.id) ?? {
        key: `current:${selectedProject.id}`,
        source: "all",
        project: selectedProject,
        clusterId: kind === "atlas" ? clusterId : null,
      }
    );
  }, [clusterId, kind, recent, selectedProject]);

  function handleHit(hit: ContextHit) {
    if (skipDupRef.current) {
      return;
    }
    skipDupRef.current = true;
    queueMicrotask(() => {
      skipDupRef.current = false;
    });
    applyProject(hit.project);
  }

  const trigger = (
    <ContextCombobox.Trigger
      aria-label="Working context"
      title={[name, subtitle].filter(Boolean).join(" · ") || "Working context"}
      className={triggerClass}
    >
      <Folder className="size-4 shrink-0 text-primary" />
      <span className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
        <span className="truncate text-sm font-medium leading-tight">{name}</span>
        {subtitle ? (
          <span className="truncate text-[11px] leading-tight text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </span>
      <ContextCombobox.Icon
        render={
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
        }
      />
    </ContextCombobox.Trigger>
  );

  return (
    <ContextSwitcher
      items={projectItems}
      groups={projectGroups}
      value={selectedHit}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          void loadProjects();
        }
      }}
      onValueChange={handleHit}
      filter={(item, query) => projectMatches(item.project, query)}
      itemToStringLabel={(hit) => `${hit.project.name} ${hit.clusterId ?? ""}`}
      itemKey={(hit) => hit.key}
      isItemEqualToValue={(a, b) => a.project.id === b.project.id}
      emptyLabel={loading ? "Loading…" : error || "No projects"}
      placeholder="Search projects..."
      status={loading ? "Loading…" : error}
      trigger={trigger}
      side={collapsed ? "right" : "bottom"}
      align="start"
      renderItem={(hit) => {
        const current = hit.project.id === projectId;
        return (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {hit.project.name}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {projectKindLabel(hit.project.kind)}
              </span>
            </span>
            {current ? <Check className="size-3.5 shrink-0" /> : null}
          </>
        );
      }}
      footer={
        <>
          <Button
            size="sm"
            className="w-full rounded-md"
            onClick={() => {
              setOpen(false);
              router.push("/projects/new");
            }}
          >
            <Plus className="size-3.5" />
            Create project
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
            View all projects
          </Button>
        </>
      }
    />
  );
}
