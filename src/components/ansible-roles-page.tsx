"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  File,
  FileText,
  Folder,
  FolderGit2,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { HandbookView } from "@/components/handbook-view";
import { useAtlasClusterSelection } from "@/components/atlas-cluster-selection";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { YamlEditor } from "@/components/yaml-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { projectApiQuery } from "@/components/hosts-groups/helpers";
import {
  flattenRoles,
  type RoleNode,
  type RoleOption,
} from "@/components/playbook-editor/types";
import {
  defaultRoleFile,
  humanizeRoleName,
  packLabel,
  roleFileTree,
  roleFileTreeDirPaths,
  rolePackId,
  roleShortName,
  type RoleFileRef,
  type RoleFileTreeNode,
} from "@/lib/ansible-role-display";
import { useCan } from "@/lib/authz";
import { projectHref } from "@/lib/project-href";
import { fetchProject, stargateJson } from "@/lib/stargate";
import type { StargateProject } from "@/lib/project-types";
import { cn } from "@/lib/utils";

type RoleSearchHit = {
  pack: string;
  role: string;
  path: string;
  line: number;
  snippet: string;
};

function roleMatches(role: RoleOption, needle: string): boolean {
  if (!needle) return true;
  const pack = packLabel(role.folder);
  const label = humanizeRoleName(role.name);
  return (
    role.name.toLowerCase().includes(needle) ||
    role.fullPath.toLowerCase().includes(needle) ||
    pack.toLowerCase().includes(needle) ||
    label.toLowerCase().includes(needle)
  );
}

function packKey(role: RoleOption): string {
  return role.folder || "root";
}

function hitFullPath(hit: RoleSearchHit): string {
  if (!hit.role || hit.role === hit.pack) {
    return hit.pack;
  }
  return `${hit.pack}/${hit.role}`;
}

export function AnsibleRolesPage({ projectId }: { projectId: string }) {
  const { clusterId } = useAtlasClusterSelection();
  const q = projectApiQuery(projectId, clusterId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const roleParam = searchParams.get("role");
  const canWrite = useCan()("playbooks.update");
  const [project, setProject] = useState<StargateProject | null>(null);
  const atlas = project?.kind === "atlas";
  const view =
    atlas && searchParams.get("view") === "handbook" ? "handbook" : "defaults";
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [files, setFiles] = useState<RoleFileRef[]>([]);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [contentHits, setContentHits] = useState<RoleSearchHit[]>([]);
  const [searchingFiles, setSearchingFiles] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [packTab, setPackTab] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchProject(projectId)
      .then((row) => {
        if (!cancelled) {
          setProject(row);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    void stargateJson<{ tree?: RoleNode[] }>(`/roles/storage?${q}`)
      .then((data) => {
        if (!cancelled) {
          setRoles(flattenRoles(data.tree));
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [q]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => window.clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    const query = debouncedSearch;
    if (query.length < 2) {
      setContentHits([]);
      setSearchingFiles(false);
      return;
    }
    let cancelled = false;
    setSearchingFiles(true);
    void stargateJson<{ hits?: RoleSearchHit[] }>(
      `/roles/search?q=${encodeURIComponent(query)}&${q}`,
    )
      .then((data) => {
        if (!cancelled) {
          setContentHits(data.hits ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setContentHits([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSearchingFiles(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, q]);

  useEffect(() => {
    if (!roleParam || roles.length === 0) {
      return;
    }
    const match = roles.find(
      (role) =>
        role.fullPath === roleParam ||
        role.name === roleParam ||
        role.fullPath.endsWith(`/${roleParam}`),
    );
    const path = match?.fullPath ?? roleParam;
    if (path && path !== selectedRole) {
      void openRole(path).catch((err: unknown) =>
        toast.error(err instanceof Error ? err.message : String(err)),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleParam, roles]);

  async function openRole(path: string) {
    setSelectedRole(path);
    setSelectedFile(null);
    setContent("");
    setSavedContent("");
    setFiles([]);
    const data = await stargateJson<{ files?: RoleFileRef[] }>(
      `/roles/files/${encodeURIComponent(path)}?${q}`,
    );
    setFiles(data.files ?? []);
  }

  function selectRole(role: RoleOption) {
    setPackTab(packKey(role));
    if (role.fullPath === selectedRole) {
      setSelectedFile(null);
      setContent("");
      setSavedContent("");
      return;
    }
    router.replace(`?role=${encodeURIComponent(role.fullPath)}`, {
      scroll: false,
    });
  }

  function clearRoleSelection() {
    setSelectedRole(null);
    setSelectedFile(null);
    setFiles([]);
    setContent("");
    setSavedContent("");
  }

  function setView(next: string) {
    if (next === "handbook") {
      router.replace("?view=handbook", { scroll: false });
      return;
    }
    if (selectedRole) {
      router.replace(`?role=${encodeURIComponent(selectedRole)}`, {
        scroll: false,
      });
      return;
    }
    router.replace("?", { scroll: false });
  }

  async function openFile(filePath: string) {
    if (!selectedRole) return;
    const parts = selectedRole.split("/");
    const pack = parts[0];
    const role = parts.slice(1).join("/") || pack;
    setSelectedFile(filePath);
    setLoadingFile(true);
    try {
      const data = await stargateJson<{ content?: string }>(
        `/roles/file/${encodeURIComponent(pack)}/${encodeURIComponent(role)}/${filePath}?${q}`,
      );
      const next = data.content ?? "";
      setContent(next);
      setSavedContent(next);
    } catch (err) {
      setSelectedFile(null);
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingFile(false);
    }
  }

  async function saveFile() {
    if (!selectedRole || !selectedFile || !canWrite) return;
    setBusy(true);
    try {
      const parts = selectedRole.split("/");
      const pack = parts[0];
      const role = parts.slice(1).join("/") || pack;
      await stargateJson(
        `/roles/file/${encodeURIComponent(pack)}/${encodeURIComponent(role)}/${selectedFile}?${q}`,
        { method: "PUT", body: JSON.stringify({ content }) },
      );
      setSavedContent(content);
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const needle = search.trim().toLowerCase();
  const searchPending =
    search.trim().length >= 2 &&
    (searchingFiles || search.trim() !== debouncedSearch);
  const hitsByRole = useMemo(() => {
    const map = new Map<string, RoleSearchHit>();
    for (const hit of contentHits) {
      const key = hitFullPath(hit);
      if (!map.has(key)) {
        map.set(key, hit);
      }
    }
    return map;
  }, [contentHits]);

  const allPacks = useMemo(() => {
    const map = new Map<string, RoleOption[]>();
    for (const role of roles) {
      const key = packKey(role);
      const list = map.get(key) ?? [];
      list.push(role);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [roles]);

  function roleVisible(role: RoleOption): boolean {
    if (!needle) return true;
    return roleMatches(role, needle) || hitsByRole.has(role.fullPath);
  }

  const tabPacks = useMemo(() => {
    if (!needle) return allPacks;
    return allPacks.filter(([, items]) => items.some((role) => roleVisible(role)));
  }, [allPacks, needle, hitsByRole]);

  const selected = roles.find((role) => role.fullPath === selectedRole) ?? null;
  const selectedFolder = selected ? packKey(selected) : packTab;
  const activePack =
    tabPacks.find(([key]) => key === selectedFolder)?.[0] ??
    tabPacks[0]?.[0] ??
    "";

  const packRoles = useMemo(() => {
    const items = allPacks.find(([key]) => key === activePack)?.[1] ?? [];
    if (!needle) return items;
    return items.filter((role) => roleVisible(role));
  }, [allPacks, activePack, needle, hitsByRole]);

  function onPackChange(next: string) {
    setPackTab(next);
    if (selected && packKey(selected) !== next) {
      clearRoleSelection();
      router.replace(projectHref(projectId, "/roles"), { scroll: false });
    }
  }

  const dirty = selectedFile != null && content !== savedContent;
  const defaultsPath = defaultRoleFile(files);
  const packId = selectedRole ? rolePackId(selectedRole) : "";
  const shortName = selected
    ? selected.name
    : selectedRole
      ? roleShortName(selectedRole)
      : "";
  const activePackLabel = packLabel(activePack);

  if (error) {
    return <EmptyState title="Roles unavailable" description={error} />;
  }

  if (!project) {
    return <EmptyState title="Loading roles" />;
  }

  const searchField = (
    <div className="relative max-w-[20rem]">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="h-9 pl-8"
        placeholder="Search roles and files..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
    </div>
  );

  const library = (
    <div className="space-y-4">
      {roles.length === 0 ? (
        <EmptyState
          title="No roles"
          description="Clone playbook repos or pick a cluster that already has role sources."
        />
      ) : (
        <>
          {searchField}
          {tabPacks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {searchPending
                ? "Searching files..."
                : `No roles match “${search}”.`}
            </p>
          ) : (
            <Tabs value={activePack} onValueChange={onPackChange}>
              <TabsList
                variant="line"
                className="h-auto w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto"
              >
                {tabPacks.map(([folder, items]) => {
                  const visible = needle
                    ? items.filter((role) => roleVisible(role)).length
                    : items.length;
                  return (
                    <TabsTrigger
                      key={folder}
                      value={folder}
                      className="h-8 flex-none gap-1.5"
                    >
                      <FolderGit2 />
                      {packLabel(folder)}
                      <Badge variant="secondary">{visible}</Badge>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
              {tabPacks.map(([folder]) => (
                <TabsContent key={folder} value={folder} className="mt-4">
                  {folder !== activePack ? null : (
                    <div className="grid gap-4 lg:grid-cols-[minmax(16rem,20rem)_1fr] lg:items-stretch">
                      <Panel className="flex h-[min(70vh,36rem)] flex-col overflow-hidden p-3">
                        <div className="min-h-0 flex-1 overflow-y-auto">
                          {packRoles.length === 0 ? (
                            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                              {searchPending
                                ? "Searching files..."
                                : `No roles match “${search}”.`}
                            </p>
                          ) : (
                            <div className="space-y-0.5">
                              {packRoles.map((role) => {
                                const label = humanizeRoleName(role.name);
                                const showOriginal =
                                  label.replace(/\s/g, "").toLowerCase() !==
                                  role.name.replace(/[_-]/g, "").toLowerCase();
                                const active = role.fullPath === selectedRole;
                                const hit = hitsByRole.get(role.fullPath);
                                return (
                                  <button
                                    key={role.fullPath}
                                    type="button"
                                    onClick={() => selectRole(role)}
                                    className={cn(
                                      "w-full rounded-r-lg border-l-2 border-transparent px-2.5 py-2 text-left transition-colors hover:bg-white/5",
                                      active && "border-foreground bg-white/10",
                                    )}
                                  >
                                    <span className="block truncate text-[15px] font-medium">
                                      {label}
                                    </span>
                                    {hit ? (
                                      <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
                                        {hit.path} · {hit.snippet}
                                      </span>
                                    ) : showOriginal ? (
                                      <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
                                        {role.name}
                                      </span>
                                    ) : null}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </Panel>
                      <Panel className="flex min-h-[28rem] flex-col overflow-hidden lg:h-[min(70vh,36rem)]">
                        {!selectedRole ? (
                          <EmptyState
                            title="Pick a role"
                            description={`Open a role from ${activePackLabel} to see defaults, tasks, and files.`}
                          />
                        ) : selectedFile ? (
                          <RoleEditorPane
                            packLabel={packLabel(packId)}
                            roleName={humanizeRoleName(shortName)}
                            filePath={selectedFile}
                            files={files}
                            canWrite={canWrite}
                            busy={busy}
                            dirty={dirty}
                            loading={loadingFile}
                            content={content}
                            onContent={setContent}
                            onBack={() => {
                              setSelectedFile(null);
                              setContent("");
                              setSavedContent("");
                            }}
                            onOpenFile={(path) => void openFile(path)}
                            onSave={() => void saveFile()}
                          />
                        ) : (
                          <RoleOverview
                            packId={packId}
                            packName={packLabel(packId)}
                            roleName={humanizeRoleName(shortName)}
                            originalName={shortName}
                            files={files}
                            atlas={atlas}
                            projectId={projectId}
                            defaultsPath={defaultsPath}
                            onOpenFile={(path) => void openFile(path)}
                          />
                        )}
                      </Panel>
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        kicker="Automation"
        title="Roles"
        description="Ansible roles from the cloned playbook repos — defaults, tasks, and docs."
      />
      {atlas ? (
        <Tabs value={view} onValueChange={setView}>
          <TabsList variant="line">
            <TabsTrigger value="defaults">
              <BookOpen />
              Library
            </TabsTrigger>
            <TabsTrigger value="handbook">
              <FileText />
              Handbook
            </TabsTrigger>
          </TabsList>
          <TabsContent value="defaults" className="mt-6">
            {library}
          </TabsContent>
          <TabsContent value="handbook" className="mt-6">
            <Suspense fallback={<EmptyState title="Loading handbook" />}>
              <HandbookView projectId={projectId} hideHeader />
            </Suspense>
          </TabsContent>
        </Tabs>
      ) : (
        library
      )}
    </div>
  );
}

function RoleOverview({
  packId,
  packName,
  roleName,
  originalName,
  files,
  atlas,
  projectId,
  defaultsPath,
  onOpenFile,
}: {
  packId: string;
  packName: string;
  roleName: string;
  originalName: string;
  files: RoleFileRef[];
  atlas: boolean;
  projectId: string;
  defaultsPath: string | null;
  onOpenFile: (path: string) => void;
}) {
  const handbookHref = `${projectHref(projectId, "/roles")}?view=handbook&tab=${encodeURIComponent(packId)}`;
  const tree = useMemo(() => roleFileTree(files), [files]);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(roleFileTreeDirPaths(tree)),
  );

  useEffect(() => {
    setExpanded(new Set(roleFileTreeDirPaths(tree)));
  }, [tree]);

  function toggleDir(path: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-2xl font-medium tracking-tight">
              {roleName}
            </h2>
            <Badge variant="outline">{packName}</Badge>
          </div>
          {originalName !== roleName ? (
            <p className="font-mono text-xs text-muted-foreground">
              {originalName}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {defaultsPath ? (
            <Button onClick={() => onOpenFile(defaultsPath)}>
              Open defaults
            </Button>
          ) : null}
          {atlas ? (
            <Button variant="outline" render={<Link href={handbookHref} />}>
              Handbook
            </Button>
          ) : null}
        </div>
      </div>
      {tree.length === 0 ? (
        <EmptyState
          title="No files"
          description="This role folder is empty."
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          <RoleFileTreeRows
            nodes={tree}
            depth={0}
            expanded={expanded}
            onToggle={toggleDir}
            onOpenFile={onOpenFile}
          />
        </div>
      )}
    </div>
  );
}

function RoleFileTreeRows({
  nodes,
  depth,
  expanded,
  onToggle,
  onOpenFile,
}: {
  nodes: RoleFileTreeNode[];
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onOpenFile: (path: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        const open = node.type === "dir" && expanded.has(node.path);
        return (
          <div key={node.path}>
            <button
              type="button"
              className="flex h-auto w-full items-center gap-2 rounded-none py-1.5 pr-3 text-left hover:bg-white/5"
              style={{ paddingLeft: 12 + depth * 14 }}
              onClick={() =>
                node.type === "dir" ? onToggle(node.path) : onOpenFile(node.path)
              }
            >
              {node.type === "dir" ? (
                <ChevronRight
                  className={cn(
                    "size-3.5 shrink-0 text-muted-foreground transition-transform",
                    open && "rotate-90",
                  )}
                />
              ) : (
                <span className="w-3.5 shrink-0" />
              )}
              {node.type === "dir" ? (
                <Folder className="size-3.5 shrink-0 text-chart-1" />
              ) : (
                <File className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 truncate font-mono text-xs">
                {node.name}
              </span>
            </button>
            {node.type === "dir" && open ? (
              <RoleFileTreeRows
                nodes={node.children}
                depth={depth + 1}
                expanded={expanded}
                onToggle={onToggle}
                onOpenFile={onOpenFile}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

function RoleEditorPane({
  packLabel: pack,
  roleName,
  filePath,
  files,
  canWrite,
  busy,
  dirty,
  loading,
  content,
  onContent,
  onBack,
  onOpenFile,
  onSave,
}: {
  packLabel: string;
  roleName: string;
  filePath: string;
  files: RoleFileRef[];
  canWrite: boolean;
  busy: boolean;
  dirty: boolean;
  loading: boolean;
  content: string;
  onContent: (value: string) => void;
  onBack: () => void;
  onOpenFile: (path: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-foreground/10 px-3 py-2">
        <Button type="button" size="sm" variant="ghost" onClick={onBack}>
          <ChevronLeft />
          Back
        </Button>
        <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
          <span>{pack}</span>
          <span className="mx-1">/</span>
          <span>{roleName}</span>
          <span className="mx-1">/</span>
          <span className="text-foreground">{filePath}</span>
          {dirty ? (
            <span className="ml-2 inline-block size-1.5 rounded-full bg-foreground align-middle" />
          ) : null}
        </p>
        <Button
          size="sm"
          onClick={onSave}
          disabled={!canWrite || busy || loading || !dirty}
        >
          Save
        </Button>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-foreground/10 px-3 py-2">
        {files.map((file) => (
          <button
            key={file.path}
            type="button"
            onClick={() => onOpenFile(file.path)}
            className={cn(
              "shrink-0 rounded-md px-2 py-1 font-mono text-[11px] transition-colors hover:bg-white/5",
              file.path === filePath
                ? "bg-white/10 text-foreground"
                : "text-muted-foreground",
            )}
          >
            {file.path}
          </button>
        ))}
      </div>
      {loading ? (
        <EmptyState title="Loading file" />
      ) : (
        <YamlEditor
          value={content}
          onChange={onContent}
          readOnly={!canWrite}
          className="min-h-[28rem] flex-1"
        />
      )}
    </div>
  );
}
