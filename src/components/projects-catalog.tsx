"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Archive, Folder, FolderOpen, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LAST_PROJECT_EVENT,
  projectHref,
  readLastProjectId,
  writeLastProjectId,
} from "@/lib/project-href";
import { stargateJson } from "@/lib/stargate";
import type { StargateProject } from "@/lib/project-types";
import { cn } from "@/lib/utils";

type ConfirmKind = "archive" | "restore" | "delete";

function formatCreatedAt(value?: number): string {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return "—";
  }
  const ms = value < 1e12 ? value * 1000 : value;
  return new Date(ms).toLocaleDateString("ru-RU");
}

function useCurrentProjectId() {
  const [currentId, setCurrentId] = useState<string | null>(null);
  useEffect(() => {
    function sync() {
      setCurrentId(readLastProjectId());
    }
    sync();
    window.addEventListener(LAST_PROJECT_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(LAST_PROJECT_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return currentId;
}

export function ProjectsCatalog({
  initial,
  loadError,
}: {
  initial: StargateProject[];
  loadError: string | null;
}) {
  const router = useRouter();
  const currentId = useCurrentProjectId();
  const [projects, setProjects] = useState(initial);
  const [tab, setTab] = useState("active");
  const [confirm, setConfirm] = useState<{
    kind: ConfirmKind;
    project: StargateProject;
  } | null>(null);

  useEffect(() => {
    setProjects(initial);
  }, [initial]);

  const currentProject = useMemo(
    () => projects.find((row) => row.id === currentId) ?? null,
    [projects, currentId],
  );
  const active = useMemo(
    () => projects.filter((row) => !row.isArchived),
    [projects],
  );
  const archived = useMemo(
    () => projects.filter((row) => row.isArchived),
    [projects],
  );

  function openProject(id: string) {
    writeLastProjectId(id);
    router.push(projectHref(id));
  }

  async function runConfirm() {
    if (!confirm) {
      return;
    }
    const { kind, project } = confirm;
    try {
      if (kind === "archive") {
        await stargateJson(`/projects/${project.id}`, {
          method: "PUT",
          body: JSON.stringify({ isArchived: true }),
        });
        setProjects((rows) =>
          rows.map((row) =>
            row.id === project.id ? { ...row, isArchived: true } : row,
          ),
        );
        toast.success("Archived");
      } else if (kind === "restore") {
        await stargateJson(`/projects/${project.id}/restore`, {
          method: "POST",
        });
        setProjects((rows) =>
          rows.map((row) =>
            row.id === project.id ? { ...row, isArchived: false } : row,
          ),
        );
        toast.success("Restored");
      } else {
        await stargateJson(`/projects/${project.id}`, { method: "DELETE" });
        setProjects((rows) => rows.filter((row) => row.id !== project.id));
        if (readLastProjectId() === project.id) {
          writeLastProjectId(null);
        }
        toast.success("Deleted");
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  const confirmCopy =
    confirm?.kind === "archive"
      ? {
          title: "Archive this project?",
          description:
            "It will be hidden from the default projects list until restored.",
          confirmLabel: "Archive",
          destructive: false,
        }
      : confirm?.kind === "restore"
        ? {
            title: "Restore this project?",
            description: "The project will appear in the default list again.",
            confirmLabel: "Restore",
            destructive: false,
          }
        : {
            title: "Delete this project permanently?",
            description:
              "This removes the project record and its directory. This cannot be undone.",
            confirmLabel: "Delete",
            destructive: true,
          };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <Folder className="size-6 text-primary" />
            <h1 className="text-2xl font-medium tracking-tight">Projects</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Manage your projects and switch between them
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
              Global scope
            </span>
            {currentProject ? (
              <Link
                href={projectHref(currentProject.id)}
                onClick={() => writeLastProjectId(currentProject.id)}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              >
                Project: <span className="font-medium text-foreground">{currentProject.name}</span>
              </Link>
            ) : null}
          </div>
        </div>
        <Button nativeButton={false} render={<Link href="/projects/new" />}>
          <Plus />
          Create Project
        </Button>
      </div>

      {loadError ? (
        <EmptyState title="Could not load projects" description={loadError} />
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="gap-6">
          <TabsList
            variant="line"
            className="h-auto w-full justify-start gap-0 rounded-none border-b border-border p-0"
          >
            <TabsTrigger
              value="active"
              className="rounded-none px-5 py-3 text-foreground/80 data-active:bg-transparent data-active:text-foreground dark:data-active:bg-transparent dark:data-active:text-foreground"
            >
              Active Projects
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
              value="archived"
              className="rounded-none px-5 py-3 text-foreground/80 data-active:bg-transparent data-active:text-foreground dark:data-active:bg-transparent dark:data-active:text-foreground"
            >
              Archived Projects
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

          <TabsContent value="active">
            {active.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <FolderOpen className="size-14 text-muted-foreground/40" />
                <p className="text-lg font-medium">No projects yet</p>
                <p className="text-sm text-muted-foreground">
                  Create your first project to get started
                </p>
                <Button nativeButton={false} render={<Link href="/projects/new" />}>
                  <Plus />
                  Create Project
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
                {active.map((row) => {
                  const isCurrent = row.id === currentId;
                  return (
                    <article
                      key={row.id}
                      data-slot="panel"
                      className={cn(
                        "cursor-pointer rounded-xl bg-card p-5 transition-shadow hover:shadow-[0_0_0_1px_var(--gray-a8)]",
                        isCurrent && "shadow-[0_0_0_1px_var(--accent-8)]",
                      )}
                      onClick={() => openProject(row.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openProject(row.id);
                        }
                      }}
                      role="link"
                      tabIndex={0}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Folder className="size-3.5 shrink-0 text-primary" />
                            <h2 className="truncate text-base font-semibold">
                              {row.name}
                            </h2>
                            {isCurrent ? (
                              <span className="rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-emerald-400 ring-1 ring-emerald-500/35 bg-emerald-500/15">
                                Active
                              </span>
                            ) : null}
                            <Badge variant="outline">{row.kind}</Badge>
                          </div>
                          {row.description?.trim() ? (
                            <p className="mt-2 line-clamp-2 text-[13px] text-muted-foreground">
                              {row.description}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
                        <p className="text-[11px] text-muted-foreground">
                          Created: {formatCreatedAt(row.createdAt)}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <IconAction
                            label="Edit project"
                            onClick={() => {
                              writeLastProjectId(row.id);
                              router.push(
                                `${projectHref(row.id, "/settings")}?tab=project`,
                              );
                            }}
                          >
                            <Pencil />
                          </IconAction>
                          <IconAction
                            label="Archive project"
                            onClick={() =>
                              setConfirm({ kind: "archive", project: row })
                            }
                          >
                            <Archive />
                          </IconAction>
                          <IconAction
                            label="Delete project"
                            danger
                            onClick={() =>
                              setConfirm({ kind: "delete", project: row })
                            }
                          >
                            <Trash2 />
                          </IconAction>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="archived">
            {archived.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <Archive className="size-14 text-muted-foreground/40" />
                <p className="text-lg font-medium">No archived projects</p>
                <p className="text-sm text-muted-foreground">
                  Archived projects will appear here
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
                    <div className="flex flex-wrap items-center gap-2">
                      <Archive className="size-3.5 shrink-0 text-muted-foreground" />
                      <h2 className="truncate text-base font-semibold text-muted-foreground">
                        {row.name}
                      </h2>
                      <Badge variant="warning">Archived</Badge>
                      <Badge variant="outline">{row.kind}</Badge>
                    </div>
                    {row.description?.trim() ? (
                      <p className="mt-2 line-clamp-2 text-[13px] text-muted-foreground">
                        {row.description}
                      </p>
                    ) : null}
                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
                      <p className="text-[11px] text-muted-foreground">
                        Created: {formatCreatedAt(row.createdAt)}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          size="xs"
                          className="rounded-md"
                          onClick={() =>
                            setConfirm({ kind: "restore", project: row })
                          }
                        >
                          <Undo2 />
                          Restore
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="destructive"
                          className="rounded-md"
                          onClick={() =>
                            setConfirm({ kind: "delete", project: row })
                          }
                        >
                          <Trash2 />
                          Delete
                        </Button>
                      </div>
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
          if (!open) {
            setConfirm(null);
          }
        }}
        title={confirmCopy.title}
        description={confirmCopy.description}
        confirmLabel={confirmCopy.confirmLabel}
        destructive={confirmCopy.destructive}
        onConfirm={runConfirm}
      />
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
