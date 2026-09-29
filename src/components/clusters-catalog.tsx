"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Archive,
  Cpu,
  HardDrive,
  Layers,
  MemoryStick,
  Pencil,
  Plus,
  Search,
  Server,
  Star,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import {
  notifyAtlasClustersChanged,
  useAtlasClusterSelection,
  writeAtlasClusterForProject,
} from "@/components/atlas-cluster-selection";
import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { FavoriteStar } from "@/components/favorite-star";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  archiveAtlasCluster,
  deleteAtlasCluster,
  fetchAtlasProjectClusters,
  patchAtlasClusterDisplayName,
  restoreAtlasCluster,
  type ClusterRow,
} from "@/lib/api";
import { groupClusters, isCascadeDefaultCluster } from "@/lib/cluster-groups";
import { favoriteClustersKey, sortFavoritesFirst } from "@/lib/favorites";
import { useFavoriteIds } from "@/hooks/use-favorite-ids";
import { projectHref } from "@/lib/project-href";
import { useCan } from "@/lib/authz";
import { fetchProject } from "@/lib/stargate";
import type { StargateProject } from "@/lib/project-types";
import { cn } from "@/lib/utils";

type ConfirmKind = "archive" | "restore";

function leafName(row: ClusterRow): string {
  return row.name || row.id.split("/").pop() || row.id;
}

function formatRam(mb: number): string {
  if (mb <= 0) return "0 GB";
  const gb = mb / 1024;
  if (Number.isInteger(gb)) return `${gb} GB`;
  return `${gb.toFixed(1)} GB`;
}

function ClusterCapacity({ row }: { row: ClusterRow }) {
  const hosts = row.hostCount ?? 0;
  const cpu = row.cpu ?? 0;
  const ram = row.memoryMb ?? 0;
  const disk = row.diskGb ?? 0;
  return (
    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1 tabular-nums">
        <Server className="size-3 shrink-0 text-muted-foreground/80" />
        {hosts} {hosts === 1 ? "host" : "hosts"}
      </span>
      <span className="inline-flex items-center gap-1 tabular-nums">
        <Cpu className="size-3 shrink-0 text-muted-foreground/80" />
        {cpu} CPU
      </span>
      <span className="inline-flex items-center gap-1 tabular-nums">
        <MemoryStick className="size-3 shrink-0 text-muted-foreground/80" />
        {formatRam(ram)}
      </span>
      <span className="inline-flex items-center gap-1 tabular-nums">
        <HardDrive className="size-3 shrink-0 text-muted-foreground/80" />
        {disk} GB
      </span>
    </div>
  );
}

function formatClusterWhen(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  const ms = value < 1e12 ? value * 1000 : value;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ClusterActivity({ row }: { row: ClusterRow }) {
  const runs = row.runCount ?? 0;
  const successful = row.successCount ?? 0;
  return (
    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
      <dt className="text-muted-foreground">Created</dt>
      <dd className="text-right tabular-nums">{formatClusterWhen(row.createdAt)}</dd>
      <dt className="text-muted-foreground">Runs</dt>
      <dd
        className="text-right tabular-nums"
        title={`${runs} runs, ${successful} successful`}
      >
        {runs}/{successful} successful
      </dd>
      <dt className="text-muted-foreground">Last run</dt>
      <dd className="text-right tabular-nums">{formatClusterWhen(row.lastRunAt)}</dd>
    </dl>
  );
}

export function ClustersCatalog({ projectId }: { projectId: string }) {
  const router = useRouter();
  const can = useCan();
  const { clusterId, setClusterId } = useAtlasClusterSelection();
  const { starred, isFavorite, toggle } = useFavoriteIds(
    favoriteClustersKey(projectId),
  );
  const [project, setProject] = useState<StargateProject | null>(null);
  const [clusters, setClusters] = useState<ClusterRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState("active");
  const [query, setQuery] = useState("");
  const [envFilter, setEnvFilter] = useState("all");
  const [confirm, setConfirm] = useState<{
    kind: ConfirmKind;
    cluster: ClusterRow;
  } | null>(null);
  const [editing, setEditing] = useState<ClusterRow | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [removing, setRemoving] = useState<ClusterRow | null>(null);
  const [purge, setPurge] = useState(false);
  const [purgeTyped, setPurgeTyped] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchProject(projectId)
      .then(setProject)
      .catch((err: unknown) =>
        setLoadError(err instanceof Error ? err.message : String(err)),
      );
  }, [projectId]);

  async function reload() {
    const listed = await fetchAtlasProjectClusters(projectId, {
      includeArchived: true,
    });
    setClusters(
      listed.clusters.filter((row) => !isCascadeDefaultCluster(row.id)),
    );
  }

  useEffect(() => {
    void reload().catch((err: unknown) =>
      setLoadError(err instanceof Error ? err.message : String(err)),
    );
  }, [projectId]);

  const envs = useMemo(() => {
    const names = new Set<string>();
    for (const row of clusters) {
      if (row.env) names.add(row.env);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [clusters]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clusters.filter((row) => {
      if (envFilter !== "all" && row.env !== envFilter) return false;
      if (!q) return true;
      return [row.id, row.name, row.env, row.display_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [clusters, envFilter, query]);

  const active = useMemo(
    () =>
      sortFavoritesFirst(
        visible.filter((row) => !row.archived),
        starred,
        (row) => row.id,
      ),
    [visible, starred],
  );
  const archived = useMemo(
    () => visible.filter((row) => row.archived),
    [visible],
  );
  const favorites = useMemo(
    () => active.filter((row) => starred.has(row.id)),
    [active, starred],
  );

  function openCluster(id: string) {
    writeAtlasClusterForProject(projectId, id);
    setClusterId(id);
    router.push(projectHref(projectId));
  }

  async function applyList(next: ClusterRow[]) {
    const filtered = next.filter((row) => !isCascadeDefaultCluster(row.id));
    setClusters(filtered);
    const remaining = filtered.filter((row) => !row.archived);
    const stillActive =
      Boolean(clusterId) && remaining.some((row) => row.id === clusterId);
    if (!stillActive) {
      const nextId = remaining[0]?.id ?? null;
      if (nextId) {
        writeAtlasClusterForProject(projectId, nextId);
        setClusterId(nextId);
        notifyAtlasClustersChanged(nextId);
        return;
      }
    }
    notifyAtlasClustersChanged(stillActive ? clusterId : null);
  }

  async function runConfirm() {
    if (!confirm) return;
    const { kind, cluster } = confirm;
    try {
      if (kind === "archive") {
        await applyList(await archiveAtlasCluster(projectId, cluster.id));
        toast.success("Archived");
      } else {
        await applyList(await restoreAtlasCluster(projectId, cluster.id));
        toast.success("Restored");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveDisplayName() {
    if (!editing) return;
    setBusy(true);
    try {
      const updated = await patchAtlasClusterDisplayName(
        projectId,
        editing.id,
        displayName.trim(),
      );
      setClusters((rows) =>
        rows.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)),
      );
      toast.success("Saved");
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function runDelete() {
    if (!removing) return;
    if (purge && purgeTyped.trim() !== removing.id) return;
    const id = removing.id;
    setBusy(true);
    try {
      await applyList(
        await deleteAtlasCluster(projectId, id, { purge }),
      );
      toast.success(purge ? "Deleted from disk" : "Removed from project");
      setRemoving(null);
      setPurge(false);
      setPurgeTyped("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (project && project.kind !== "atlas") {
    return (
      <EmptyState
        title="Clusters are for Atlas projects"
        description="Ansible projects do not own inventory leaves."
      />
    );
  }

  const confirmCopy =
    confirm?.kind === "restore"
      ? {
          title: "Restore this cluster?",
          description: "The cluster will appear in the switcher again.",
          confirmLabel: "Restore",
        }
      : {
          title: "Archive this cluster?",
          description:
            "It will be hidden from the switcher until restored. Inventory on disk is not changed.",
          confirmLabel: "Archive",
        };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <Layers className="size-6 text-primary" />
            <h1 className="text-2xl font-medium tracking-tight">Clusters</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Inventory leaves in this project — switch, archive, or remove
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {project ? (
              <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                Project:{" "}
                <span className="font-medium text-foreground">{project.name}</span>
              </span>
            ) : null}
            {clusterId ? (
              <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/35">
                Active: {clusterId}
              </span>
            ) : null}
          </div>
        </div>
        {can("atlas.execute") ? (
        <Button
          nativeButton={false}
          render={<Link href={projectHref(projectId, "/init")} />}
        >
          <Plus />
          New cluster
        </Button>
        ) : null}
      </div>

      {loadError ? (
        <EmptyState title="Could not load clusters" description={loadError} />
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border">
            <TabsList
              variant="line"
              className="h-auto w-auto justify-start gap-0 rounded-none border-0 p-0"
            >
              <TabsTrigger
                value="active"
                className="rounded-none px-5 py-3 text-foreground/80 data-active:bg-transparent data-active:text-foreground dark:data-active:bg-transparent dark:data-active:text-foreground"
              >
                Active
                <span
                  className={cn(
                    "rounded-full px-1.5 py-px text-[11px] font-semibold",
                    tab === "active"
                      ? "bg-foreground/15 text-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {active.length}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="favorites"
                className="rounded-none px-5 py-3 text-foreground/80 data-active:bg-transparent data-active:text-foreground dark:data-active:bg-transparent dark:data-active:text-foreground"
              >
                Favorites
                <span
                  className={cn(
                    "rounded-full px-1.5 py-px text-[11px] font-semibold",
                    tab === "favorites"
                      ? "bg-foreground/15 text-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {favorites.length}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="archived"
                className="rounded-none px-5 py-3 text-foreground/80 data-active:bg-transparent data-active:text-foreground dark:data-active:bg-transparent dark:data-active:text-foreground"
              >
                Archived
                {archived.length > 0 ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-px text-[11px] font-semibold",
                      tab === "archived"
                        ? "bg-foreground/15 text-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {archived.length}
                  </span>
                ) : null}
              </TabsTrigger>
            </TabsList>
            <div className="flex min-w-0 flex-wrap items-center gap-2 pb-2 sm:pb-0">
              <div className="relative min-w-44 flex-1 sm:max-w-64">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-8 pl-8"
                  placeholder="Search clusters..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="Search clusters"
                />
              </div>
              <div
                className="flex items-center rounded-lg border border-input p-0.5"
                role="group"
                aria-label="Environment"
              >
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  aria-pressed={envFilter === "all"}
                  className={cn(
                    "rounded-md",
                    envFilter === "all" && "bg-white/10 text-foreground",
                  )}
                  onClick={() => setEnvFilter("all")}
                >
                  All
                </Button>
                {envs.map((env) => (
                  <Button
                    key={env}
                    type="button"
                    size="xs"
                    variant="ghost"
                    aria-pressed={envFilter === env}
                    className={cn(
                      "rounded-md font-mono",
                      envFilter === env && "bg-white/10 text-foreground",
                    )}
                    onClick={() => setEnvFilter(env)}
                  >
                    {env}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <TabsContent value="active">
            {active.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <Server className="size-14 text-muted-foreground/40" />
                <p className="text-lg font-medium">No clusters yet</p>
                <p className="text-sm text-muted-foreground">
                  {query.trim() || envFilter !== "all"
                    ? "No clusters match this search"
                    : "Init a cluster to add an inventory leaf to this project"}
                </p>
                {can("atlas.execute") ? (
                <Button
                  nativeButton={false}
                  render={<Link href={projectHref(projectId, "/init")} />}
                >
                  <Plus />
                  New cluster
                </Button>
                ) : null}
              </div>
            ) : (
              <ClusterSections
                rows={active}
                currentId={clusterId}
                isFavorite={isFavorite}
                onToggleFavorite={toggle}
                onOpen={openCluster}
                onEdit={(row) => {
                  setEditing(row);
                  setDisplayName(row.display_name || row.id);
                }}
                onArchive={(row) => setConfirm({ kind: "archive", cluster: row })}
                onDelete={(row) => {
                  setRemoving(row);
                  setPurge(false);
                  setPurgeTyped("");
                }}
              />
            )}
          </TabsContent>

          <TabsContent value="favorites">
            {favorites.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <Star className="size-14 text-muted-foreground/40" />
                <p className="text-lg font-medium">No favorite clusters</p>
                <p className="text-sm text-muted-foreground">
                  {query.trim() || envFilter !== "all"
                    ? "No favorites match this search"
                    : "Star a cluster to pin it here"}
                </p>
              </div>
            ) : (
              <ClusterSections
                rows={favorites}
                currentId={clusterId}
                isFavorite={isFavorite}
                onToggleFavorite={toggle}
                onOpen={openCluster}
                onEdit={(row) => {
                  setEditing(row);
                  setDisplayName(row.display_name || row.id);
                }}
                onArchive={(row) => setConfirm({ kind: "archive", cluster: row })}
                onDelete={(row) => {
                  setRemoving(row);
                  setPurge(false);
                  setPurgeTyped("");
                }}
              />
            )}
          </TabsContent>

          <TabsContent value="archived">
            {archived.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <Archive className="size-14 text-muted-foreground/40" />
                <p className="text-lg font-medium">No archived clusters</p>
                <p className="text-sm text-muted-foreground">
                  Archived clusters stay on disk and can be restored here
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
                {archived.map((row) => (
                  <article
                    key={row.id}
                    data-slot="panel"
                    className="rounded-xl bg-card p-5 opacity-80"
                  >
                    <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Archive className="size-3.5 shrink-0 text-muted-foreground" />
                      <h2 className="truncate text-base font-semibold text-muted-foreground">
                        {leafName(row)}
                      </h2>
                      <Badge variant="warning">Archived</Badge>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {row.id}
                    </p>
                    <ClusterCapacity row={row} />
                    </div>
                    <FavoriteStar
                      pressed={isFavorite(row.id)}
                      label={leafName(row)}
                      onToggle={() => toggle(row.id)}
                    />
                    </div>
                    <div className="mt-4 flex items-center justify-end gap-1.5 border-t border-border pt-3">
                      {can("projects.update") ? (
                      <Button
                        type="button"
                        size="xs"
                        className="rounded-md"
                        onClick={() =>
                          setConfirm({ kind: "restore", cluster: row })
                        }
                      >
                        <Undo2 />
                        Restore
                      </Button>
                      ) : null}
                      {can("projects.delete") ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="destructive"
                        className="rounded-md"
                        onClick={() => {
                          setRemoving(row);
                          setPurge(false);
                          setPurgeTyped("");
                        }}
                      >
                        <Trash2 />
                        Delete
                      </Button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      <ConfirmAction
        open={confirm != null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={confirmCopy.title}
        description={confirmCopy.description}
        confirmLabel={confirmCopy.confirmLabel}
        onConfirm={runConfirm}
      />

      <Dialog
        open={editing != null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit cluster</DialogTitle>
            <DialogDescription>
              Display name is written to cluster.yaml. The inventory id does not
              change.
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cluster-id">Cluster id</Label>
                <Input
                  id="cluster-id"
                  value={editing.id}
                  readOnly
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cluster-display">Display name</Label>
                <Input
                  id="cluster-display"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </div>
              <Link
                href={projectHref(projectId, "/cluster-yaml")}
                className="inline-block text-xs text-muted-foreground underline underline-offset-4"
                onClick={() => {
                  writeAtlasClusterForProject(projectId, editing.id);
                  setClusterId(editing.id);
                }}
              >
                Open setup
              </Link>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => void saveDisplayName()}
              disabled={busy || !displayName.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={removing != null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoving(null);
            setPurge(false);
            setPurgeTyped("");
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this cluster?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing
                ? `Remove ${removing.id} from this project. Inventory stays on disk unless you also delete it.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={purge}
              onCheckedChange={(value) => setPurge(value === true)}
            />
            <span>
              Also delete from disk (inventory leaf and workspace). This cannot
              be undone.
            </span>
          </label>
          {purge && removing ? (
            <div className="space-y-1.5">
              <Label htmlFor="purge-id">Type {removing.id} to confirm</Label>
              <Input
                id="purge-id"
                value={purgeTyped}
                onChange={(event) => setPurgeTyped(event.target.value)}
                className="font-mono"
                autoComplete="off"
              />
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={Boolean(purge && removing && purgeTyped.trim() !== removing.id) || busy}
              onClick={() => {
                void runDelete();
              }}
            >
              {purge ? "Delete from disk" : "Remove from project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ClusterSections({
  rows,
  currentId,
  isFavorite,
  onToggleFavorite,
  onOpen,
  onEdit,
  onArchive,
  onDelete,
}: {
  rows: ClusterRow[];
  currentId: string | null;
  isFavorite: (id: string) => boolean;
  onToggleFavorite: (id: string) => void;
  onOpen: (id: string) => void;
  onEdit: (row: ClusterRow) => void;
  onArchive: (row: ClusterRow) => void;
  onDelete: (row: ClusterRow) => void;
}) {
  const can = useCan();
  const sections = groupClusters(rows);
  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <section key={section.key} className="space-y-3">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {section.label}
            <span className="ml-2 font-normal tabular-nums">
              {section.items.length}
            </span>
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
            {section.items.map((row) => {
              const isCurrent = row.id === currentId;
              const title = leafName(row);
              const extraName =
                row.display_name &&
                row.display_name !== row.id &&
                row.display_name !== title
                  ? row.display_name
                  : null;
              return (
                <article
                  key={row.id}
                  data-slot="panel"
                  className={cn(
                    "cursor-pointer rounded-xl bg-card p-5 transition-shadow hover:shadow-[0_0_0_1px_var(--gray-a8)]",
                    isCurrent && "shadow-[0_0_0_1px_var(--accent-8)]",
                  )}
                  onClick={() => onOpen(row.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpen(row.id);
                    }
                  }}
                  role="link"
                  tabIndex={0}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Server className="size-3.5 shrink-0 text-primary" />
                        <h3 className="truncate text-base font-semibold">
                          {title}
                        </h3>
                        {isCurrent ? (
                          <span className="rounded px-1.5 py-px text-[10px] font-semibold tracking-wide text-emerald-400 uppercase ring-1 ring-emerald-500/35 bg-emerald-500/15">
                            Active
                          </span>
                        ) : null}
                        {row.leafExists === false ? (
                          <Badge variant="warning">missing</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                        {row.id}
                      </p>
                      {extraName ? (
                        <p className="mt-1 truncate text-[13px] text-muted-foreground">
                          {extraName}
                        </p>
                      ) : null}
                      <ClusterCapacity row={row} />
                      <ClusterActivity row={row} />
                    </div>
                    <FavoriteStar
                      pressed={isFavorite(row.id)}
                      label={title}
                      onToggle={() => onToggleFavorite(row.id)}
                    />
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
                    <p className="text-[11px] text-muted-foreground">
                      {row.workspaceExists ? "Workspace ready" : "No workspace"}
                    </p>
                    <div className="flex items-center gap-1.5">
                      {can("projects.update") ? (
                      <IconAction
                        label="Edit cluster"
                        onClick={() => onEdit(row)}
                      >
                        <Pencil />
                      </IconAction>
                      ) : null}
                      {can("projects.update") ? (
                      <IconAction
                        label="Archive cluster"
                        onClick={() => onArchive(row)}
                      >
                        <Archive />
                      </IconAction>
                      ) : null}
                      {can("projects.delete") ? (
                      <IconAction
                        label="Delete cluster"
                        danger
                        onClick={() => onDelete(row)}
                      >
                        <Trash2 />
                      </IconAction>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function IconAction({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      size="icon-xs"
      variant="outline"
      className={cn(
        "rounded-md",
        danger && "border-destructive/50 text-destructive hover:bg-destructive/15",
      )}
      aria-label={label}
      title={label}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </Button>
  );
}
