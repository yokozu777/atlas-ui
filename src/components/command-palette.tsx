"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Command as CommandPrimitive } from "cmdk";
import { useRouter, usePathname } from "next/navigation";
import {
  Boxes,
  ChevronDown,
  Folder,
  KeyRound,
  LayoutTemplate,
  Play,
  Search,
  Users,
} from "lucide-react";

import { useAtlasClusterSelection } from "@/components/atlas-cluster-selection";
import { useClusterOverlays } from "@/components/cluster-overlays";
import type { GlobalSecretRow } from "@/components/global-secrets/types";
import {
  buildSearchHits,
  defaultSearchFilters,
  filterSearchHits,
  groupSearchHits,
  SEARCH_GROUP_LABEL,
  SEARCH_KIND_LABEL,
  SEARCH_KIND_ORDER,
  SEARCH_TYPE_LABEL,
  type SearchFilters,
  type SearchHit,
  type SearchKind,
} from "@/components/search-catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import type { UserRow } from "@/components/users-roles/types";
import {
  clusterHref,
  fetchClusters,
  type ClusterRow,
} from "@/lib/api";
import { useCan } from "@/lib/authz";
import { projectHref, projectIdFromPath } from "@/lib/project-href";
import { fetchProjects, stargateJson } from "@/lib/stargate";
import type { StargateProject } from "@/lib/project-types";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<SearchKind, ReactNode> = {
  page: <LayoutTemplate />,
  project: <Folder />,
  cluster: <Boxes />,
  secret: <KeyRound />,
  user: <Users />,
  action: <Play />,
};

function FilterChip({
  label,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant={selected ? "secondary" : "outline"}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

export function CommandPalette({
  clusterId,
  projectId = null,
  atlasProjectId = null,
}: {
  clusterId: string | null;
  projectId?: string | null;
  atlasProjectId?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { openRun, openInspect } = useClusterOverlays();
  const { setClusterId } = useAtlasClusterSelection();
  const can = useCan();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>(defaultSearchFilters);
  const [selectedValue, setSelectedValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<StargateProject[]>([]);
  const [clusters, setClusters] = useState<ClusterRow[]>([]);
  const [secrets, setSecrets] = useState<GlobalSecretRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);

  const ctx = useMemo(() => {
    const current = projects.find((row) => row.id === projectId);
    return {
      projectId,
      atlasProjectId,
      clusterId,
      projectClusterId: current?.cluster_id ?? null,
    };
  }, [atlasProjectId, clusterId, projectId, projects]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    function onPalette() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("atlas-ui:palette", onPalette);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("atlas-ui:palette", onPalette);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      fetchProjects(true).catch(() => [] as StargateProject[]),
      fetchClusters(atlasProjectId).catch(() => [] as ClusterRow[]),
      can("global_secrets.read")
        ? stargateJson<{ secrets?: GlobalSecretRow[] }>("/global/secrets")
            .then((data) => data.secrets ?? [])
            .catch(() => [] as GlobalSecretRow[])
        : Promise.resolve([] as GlobalSecretRow[]),
      can("users.read")
        ? stargateJson<{ users?: UserRow[] }>("/users")
            .then((data) => data.users ?? [])
            .catch(() => [] as UserRow[])
        : Promise.resolve([] as UserRow[]),
    ])
      .then(([nextProjects, nextClusters, nextSecrets, nextUsers]) => {
        if (cancelled) return;
        setProjects(nextProjects);
        setClusters(nextClusters);
        setSecrets(nextSecrets);
        setUsers(nextUsers);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    }, [open, atlasProjectId, can]);

  const hits = useMemo(() => {
    const built = buildSearchHits(
      { projects, clusters, secrets, users },
      ctx,
    ).filter((hit) => !hit.permission || can(hit.permission));
    return filterSearchHits(built, query, filters, ctx);
  }, [can, clusters, ctx, filters, projects, query, secrets, users]);

  const groups = useMemo(() => groupSearchHits(hits), [hits]);

  function resetDialog() {
    setQuery("");
    setAdvanced(false);
    setFilters(defaultSearchFilters());
    setSelectedValue("");
  }

  function close() {
    setOpen(false);
    resetDialog();
  }

  function activate(hit: SearchHit) {
    if (hit.kind === "cluster" && hit.clusterId) {
      setClusterId(hit.clusterId);
      if (!projectIdFromPath(pathname)) {
        const atlasId =
          atlasProjectId ??
          projects.find((row) => row.kind === "atlas")?.id ??
          null;
        if (atlasId) {
          router.push(projectHref(atlasId));
        } else {
          router.push(clusterHref(hit.clusterId));
        }
      }
      close();
      return;
    }
    if (hit.kind === "action") {
      if (hit.action === "plan" || hit.action === "validate" || hit.action === "smoke") {
        openInspect(hit.action);
        close();
        return;
      }
      if (hit.action === "run") {
        openRun();
        close();
        return;
      }
    }
    if (hit.href) {
      router.push(hit.href);
      close();
    }
  }

  function runSelected() {
    const selected = hits.find((hit) => hit.id === selectedValue);
    const hit = selected ?? hits[0];
    if (hit) {
      activate(hit);
    }
  }

  function toggleType(kind: SearchKind, checked: boolean) {
    setFilters((current) => ({
      ...current,
      types: { ...current.types, [kind]: checked },
    }));
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetDialog();
      }}
      title="Search"
      description="Search projects, pages, people, and more"
      className="top-[18vh] w-[min(100%-2rem,36rem)] sm:max-w-xl"
    >
      <Command
        shouldFilter={false}
        value={selectedValue}
        onValueChange={setSelectedValue}
        className="rounded-xl bg-popover"
      >
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <Search className="size-5 shrink-0 text-muted-foreground" />
          <CommandPrimitive.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Search projects, pages, people…"
            className="h-8 w-full bg-transparent text-base outline-hidden placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex items-center gap-2 px-4 py-2">
          <Button type="button" size="sm" onClick={runSelected} disabled={hits.length === 0}>
            Search
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-expanded={advanced}
            onClick={() => setAdvanced((value) => !value)}
          >
            Advanced search
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                advanced ? "rotate-180" : null,
              )}
            />
          </Button>
          {loading ? (
            <span className="ml-auto text-xs text-muted-foreground">
              Loading…
            </span>
          ) : null}
        </div>
        {advanced ? (
          <div className="space-y-3 border-b px-4 py-3">
            <div>
              <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Type
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-2">
                {SEARCH_KIND_ORDER.map((kind) => (
                  <Label
                    key={kind}
                    className="gap-1.5 text-xs font-normal text-foreground"
                  >
                    <Checkbox
                      checked={filters.types[kind]}
                      onCheckedChange={(checked) =>
                        toggleType(kind, checked === true)
                      }
                    />
                    {SEARCH_TYPE_LABEL[kind]}
                  </Label>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Kind
              </p>
              <div className="flex flex-wrap gap-1.5">
                <FilterChip
                  label="Any"
                  selected={filters.projectKind === "any"}
                  onClick={() =>
                    setFilters((current) => ({ ...current, projectKind: "any" }))
                  }
                />
                <FilterChip
                  label="Atlas"
                  selected={filters.projectKind === "atlas"}
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      projectKind: "atlas",
                    }))
                  }
                />
                <FilterChip
                  label="Ansible"
                  selected={filters.projectKind === "ansible"}
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      projectKind: "ansible",
                    }))
                  }
                />
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Scope
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <FilterChip
                  label="Everywhere"
                  selected={filters.scope === "everywhere"}
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      scope: "everywhere",
                    }))
                  }
                />
                <FilterChip
                  label="Current project"
                  selected={filters.scope === "current"}
                  disabled={!projectId}
                  onClick={() =>
                    setFilters((current) => ({ ...current, scope: "current" }))
                  }
                />
                <Label className="ml-2 gap-1.5 text-xs font-normal">
                  <Checkbox
                    checked={filters.includeArchived}
                    onCheckedChange={(checked) =>
                      setFilters((current) => ({
                        ...current,
                        includeArchived: checked === true,
                      }))
                    }
                  />
                  Include archived
                </Label>
              </div>
            </div>
          </div>
        ) : null}
        <CommandList className={advanced ? "max-h-56" : "max-h-80"}>
          <CommandEmpty>No matches</CommandEmpty>
          {groups.map((group) => (
            <CommandGroup
              key={group.kind}
              heading={SEARCH_GROUP_LABEL[group.kind]}
            >
              {group.hits.map((hit) => (
                <CommandItem
                  key={hit.id}
                  value={hit.id}
                  onSelect={() => activate(hit)}
                  className="items-start py-2"
                >
                  <span className="mt-0.5 text-muted-foreground">
                    {TYPE_ICONS[hit.kind]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate">{hit.title}</span>
                      {hit.archived ? (
                        <Badge variant="outline">Archived</Badge>
                      ) : null}
                    </span>
                    {hit.subtitle ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {hit.subtitle}
                      </span>
                    ) : null}
                  </span>
                  <CommandShortcut className="tracking-normal">
                    {SEARCH_KIND_LABEL[hit.kind]}
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
