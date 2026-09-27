"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, File, Folder } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { JsonBlock } from "@/components/json-block";
import { LogViewer } from "@/components/log-viewer";
import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { YamlEditor } from "@/components/yaml-editor";
import {
  fetchWorkspaceFile,
  fetchWorkspaceLs,
  type WorkspaceFilePayload,
  type WorkspaceFsEntry,
} from "@/lib/api";
import { cn } from "@/lib/utils";

export function WorkspaceFsBrowser({
  clusterId,
  rootRel = "",
  refreshKey = 0,
  runLogHref,
  variant = "compact",
}: {
  clusterId: string;
  rootRel?: string;
  refreshKey?: number;
  runLogHref?: (rel: string) => string | null;
  variant?: "compact" | "page";
}) {
  const [byRel, setByRel] = useState<Record<string, WorkspaceFsEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([rootRel]));
  const [listError, setListError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [file, setFile] = useState<WorkspaceFilePayload | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileBusy, setFileBusy] = useState(false);

  const loadDir = useCallback(
    async (rel: string) => {
      const data = await fetchWorkspaceLs(clusterId, rel);
      setByRel((current) => ({ ...current, [rel]: data.entries }));
      return data.entries;
    },
    [clusterId],
  );

  useEffect(() => {
    let cancelled = false;
    setByRel({});
    setExpanded(new Set([rootRel]));
    setSelected(null);
    setFile(null);
    setFileError(null);
    setListError(null);
    setLoaded(false);
    void loadDir(rootRel)
      .then(() => {
        if (!cancelled) {
          setLoaded(true);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setListError(err instanceof Error ? err.message : String(err));
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadDir, rootRel, refreshKey]);

  async function toggleDir(rel: string) {
    const next = new Set(expanded);
    if (next.has(rel)) {
      next.delete(rel);
      setExpanded(next);
      return;
    }
    next.add(rel);
    setExpanded(next);
    if (!byRel[rel]) {
      try {
        await loadDir(rel);
      } catch (err) {
        setListError(err instanceof Error ? err.message : String(err));
      }
    }
  }

  async function openFile(rel: string) {
    setSelected(rel);
    setFileBusy(true);
    setFileError(null);
    try {
      const payload = await fetchWorkspaceFile(clusterId, rel);
      setFile(payload);
    } catch (err) {
      setFile(null);
      setFileError(err instanceof Error ? err.message : String(err));
    } finally {
      setFileBusy(false);
    }
  }

  const rows = useMemo(
    () => flattenEntries(rootRel, byRel, expanded),
    [rootRel, byRel, expanded],
  );

  const logHref = selected && runLogHref ? runLogHref(selected) : null;
  const jsonValue = useMemo(() => parseJsonPreview(selected, file), [selected, file]);
  const page = variant === "page";

  if (!loaded) {
    return <EmptyState title="Loading files" />;
  }
  if (listError && rows.length === 0) {
    return <EmptyState title="Files unavailable" description={listError} />;
  }

  const rootEntries = byRel[rootRel] ?? [];
  if (rootEntries.length === 0) {
    return <EmptyState title="Empty folder" />;
  }

  const tree = (
    <div className={page ? "min-h-0 flex-1 overflow-y-auto" : undefined}>
      {rows.map((row) => {
        const open = expanded.has(row.rel);
        const active = selected === row.rel;
        return (
          <button
            key={row.rel}
            type="button"
            className={cn(
              page
                ? "flex h-auto w-full items-center gap-2 rounded-r-lg border-l-2 border-transparent py-1.5 pr-3 text-left transition-colors hover:bg-white/5"
                : "flex h-auto w-full items-center gap-2 rounded-none px-3 py-1.5 text-left font-normal hover:bg-white/5",
              active &&
                (page ? "border-foreground bg-white/10" : "bg-white/10"),
            )}
            style={{ paddingLeft: 12 + row.depth * 14 }}
            onClick={() =>
              row.kind === "dir" ? void toggleDir(row.rel) : void openFile(row.rel)
            }
          >
            {row.kind === "dir" ? (
              <ChevronRight
                className={cn(
                  "size-3.5 shrink-0 text-muted-foreground transition-transform",
                  open && "rotate-90",
                )}
              />
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            {row.kind === "dir" ? (
              <Folder className="size-3.5 shrink-0 text-chart-1" />
            ) : (
              <File className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 truncate font-mono text-xs">{row.name}</span>
          </button>
        );
      })}
    </div>
  );

  const preview = !selected ? (
    <EmptyState
      title="Pick a folder, then a file"
      description="Folders expand in the tree."
    />
  ) : fileBusy ? (
    <EmptyState title="Loading file" />
  ) : fileError ? (
    <EmptyState title="Cannot read file" description={fileError} />
  ) : file?.binary ? (
    <EmptyState title="Binary file" description={selected} />
  ) : page ? (
    <FilePreviewPane
      path={selected}
      truncated={Boolean(file?.truncated)}
      content={file?.content ?? ""}
      jsonValue={jsonValue}
      logHref={logHref}
    />
  ) : (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 truncate font-mono text-xs text-muted-foreground">
          {selected}
          {file?.truncated ? " (truncated)" : ""}
        </p>
        {logHref ? (
          <Button size="sm" variant="outline" render={<Link href={logHref} />}>
            Open log
          </Button>
        ) : null}
      </div>
      {jsonValue !== null ? (
        <JsonBlock value={jsonValue} label={selected} />
      ) : (
        <LogViewer
          jobId={null}
          text={file?.content ?? ""}
          running={false}
          label={selected}
        />
      )}
    </div>
  );

  if (page) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(16rem,20rem)_1fr] lg:items-stretch">
        <Panel className="flex h-[min(70vh,36rem)] flex-col overflow-hidden p-3">
          {tree}
        </Panel>
        <Panel className="flex h-[min(70vh,36rem)] min-h-[28rem] flex-col overflow-hidden">
          {preview}
        </Panel>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
      <Panel className="max-h-[28rem] overflow-auto py-2">{tree}</Panel>
      <div className="min-w-0">{preview}</div>
    </div>
  );
}

function FilePreviewPane({
  path,
  truncated,
  content,
  jsonValue,
  logHref,
}: {
  path: string;
  truncated: boolean;
  content: string;
  jsonValue: unknown | null;
  logHref: string | null;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-foreground/10 px-3 py-2">
        <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
          <span className="text-foreground">{path}</span>
          {truncated ? " (truncated)" : ""}
        </p>
        {logHref ? (
          <Button size="sm" variant="outline" render={<Link href={logHref} />}>
            Open log
          </Button>
        ) : null}
      </div>
      {jsonValue !== null ? (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <JsonBlock value={jsonValue} label={path} />
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          <YamlEditor
            value={content}
            onChange={() => undefined}
            readOnly
            className="absolute inset-0 min-h-0"
          />
        </div>
      )}
    </div>
  );
}

function flattenEntries(
  rootRel: string,
  byRel: Record<string, WorkspaceFsEntry[]>,
  expanded: Set<string>,
): Array<WorkspaceFsEntry & { depth: number }> {
  const out: Array<WorkspaceFsEntry & { depth: number }> = [];

  function walk(rel: string, depth: number) {
    for (const entry of byRel[rel] ?? []) {
      out.push({ ...entry, depth });
      if (entry.kind === "dir" && expanded.has(entry.rel)) {
        walk(entry.rel, depth + 1);
      }
    }
  }

  walk(rootRel, 0);
  return out;
}

function parseJsonPreview(
  rel: string | null,
  file: WorkspaceFilePayload | null,
): unknown | null {
  if (!rel || !file?.content || file.binary) {
    return null;
  }
  if (!rel.endsWith(".json")) {
    return null;
  }
  try {
    return JSON.parse(file.content);
  } catch {
    return null;
  }
}
