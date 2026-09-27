"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Folder, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useAtlasClusterSelection } from "@/components/atlas-cluster-selection";
import { EmptyState } from "@/components/empty-state";
import { ConfirmAction } from "@/components/confirm-action";
import { EditFileDialog } from "@/components/hosts-groups/edit-file-dialog";
import {
  downloadText,
  projectApiQuery,
  withClusterId,
} from "@/components/hosts-groups/helpers";
import type { VarsFile } from "@/components/hosts-groups/types";
import { Panel } from "@/components/panel";
import { StackList, StackListRow } from "@/components/stack-list";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { envDefaultClusterId } from "@/lib/cluster-groups";
import { useCan } from "@/lib/authz";
import { stargateJson } from "@/lib/stargate";

type VarsKind = "group" | "host" | "default";

const ORG_DEFAULT_ID = "default/default";

export function VarsTab({ projectId }: { projectId: string }) {
  return (
    <Suspense fallback={<EmptyState title="Loading vars" />}>
      <VarsTabInner projectId={projectId} />
    </Suspense>
  );
}

function VarsTabInner({ projectId }: { projectId: string }) {
  const { clusterId } = useAtlasClusterSelection();
  const searchParams = useSearchParams();
  const fileParam = searchParams.get("file");
  const defaultClusterId = clusterId ? envDefaultClusterId(clusterId) : null;
  const [kind, setKind] = useState<VarsKind>(() =>
    fileParam?.includes("host_vars") ? "host" : "group",
  );

  useEffect(() => {
    if (!fileParam) return;
    const nextKind: VarsKind = fileParam.includes("host_vars") ? "host" : "group";
    if (nextKind !== kind) setKind(nextKind);
  }, [fileParam, kind]);

  return (
    <div>
      <Tabs
        value={kind}
        onValueChange={(value) => {
          if (value === "host" || value === "default" || value === "group") {
            setKind(value);
          }
        }}
      >
        <TabsList variant="line">
          <TabsTrigger value="group">Group Vars</TabsTrigger>
          <TabsTrigger value="host">Host Vars</TabsTrigger>
          {defaultClusterId ? (
            <TabsTrigger value="default">Default</TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="group" className="mt-4">
          <VarsFileList
            projectId={projectId}
            clusterId={clusterId}
            kind="group"
            title="Group Vars files"
            openPath={kind === "group" ? fileParam : null}
          />
        </TabsContent>
        <TabsContent value="host" className="mt-4">
          <VarsFileList
            projectId={projectId}
            clusterId={clusterId}
            kind="host"
            title="Host Vars files"
            openPath={kind === "host" ? fileParam : null}
          />
        </TabsContent>
        {defaultClusterId ? (
          <TabsContent value="default" className="mt-4 space-y-6">
            <VarsFileList
              projectId={projectId}
              clusterId={defaultClusterId}
              kind="group"
              title="Environment default"
              hint={defaultClusterId}
              quiet
            />
            {defaultClusterId !== ORG_DEFAULT_ID ? (
              <VarsFileList
                projectId={projectId}
                clusterId={ORG_DEFAULT_ID}
                kind="group"
                title="Organization default"
                hint={ORG_DEFAULT_ID}
                quiet
                allowEmpty={false}
              />
            ) : null}
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

function VarsFileList({
  projectId,
  clusterId,
  kind,
  title,
  hint,
  openPath,
  allowEmpty = true,
  quiet = false,
}: {
  projectId: string;
  clusterId: string | null;
  kind: "group" | "host";
  title: string;
  hint?: string;
  openPath?: string | null;
  allowEmpty?: boolean;
  quiet?: boolean;
}) {
  const can = useCan();
  const q = projectApiQuery(projectId, clusterId);
  const [files, setFiles] = useState<VarsFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [editPath, setEditPath] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [deletePath, setDeletePath] = useState<string | null>(null);
  const openedFileQuery = useRef<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const data = await stargateJson<{ files?: VarsFile[] }>(
        `/inventory/vars?${q}&kind=${kind}`,
      );
      setFiles(data.files ?? []);
    } catch (err) {
      setFiles([]);
      if (!quiet) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(false);
    }
  }, [kind, q, quiet]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!openPath || files.length === 0) return;
    if (openedFileQuery.current === openPath) return;
    const match = files.find((file) => file.path === openPath);
    if (!match) return;
    openedFileQuery.current = openPath;
    void openEdit(match.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open ?file= once per query value
  }, [openPath, files]);

  async function openEdit(path: string) {
    try {
      const data = await stargateJson<{ content?: string }>(
        `/inventory/vars/file?${q}&path=${encodeURIComponent(path)}`,
      );
      setEditContent(data.content || "");
      setEditPath(path);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveEdit(content: string) {
    if (!editPath) return;
    await stargateJson("/inventory/vars/file", {
      method: "PUT",
      body: JSON.stringify(
        withClusterId(
          {
            project_id: projectId,
            path: editPath,
            content,
          },
          clusterId,
        ),
      ),
    });
    await load();
  }

  async function remove(path: string) {
    await stargateJson(
      `/inventory/vars/file?${q}&path=${encodeURIComponent(path)}`,
      { method: "DELETE" },
    );
    toast.success("Deleted");
    await load();
  }

  const heading = useMemo(() => {
    if (!hint) return title;
    return (
      <span className="flex min-w-0 flex-col">
        <span>{title}</span>
        <span className="font-mono text-xs font-normal text-muted-foreground">
          {hint}
        </span>
      </span>
    );
  }, [hint, title]);

  if (!allowEmpty && files.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <Folder className="size-4 shrink-0" />
          {heading}
        </p>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void load()}>
          <RefreshCw />
          Refresh
        </Button>
      </div>
      {files.length === 0 ? (
        <EmptyState
          title="No vars files"
          description={
            hint
              ? "This cascade layer has no group_vars yet."
              : "Pull inventory or add hosts."
          }
        />
      ) : (
        <Panel>
          <StackList>
            {files.map((file) => (
              <StackListRow
                key={`${clusterId ?? ""}:${file.path}`}
                title={file.name}
                description={
                  <>
                    {file.path}
                    {file.stem === "all" ? " · Used for all hosts" : ""}
                  </>
                }
                trailing={
                  <span className="flex gap-1">
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() =>
                        void (async () => {
                          try {
                            const data = await stargateJson<{ content?: string }>(
                              `/inventory/vars/file?${q}&path=${encodeURIComponent(file.path)}`,
                            );
                            downloadText(file.name, data.content || "");
                          } catch (err) {
                            toast.error(
                              err instanceof Error ? err.message : String(err),
                            );
                          }
                        })()
                      }
                    >
                      <Download />
                      Download
                    </Button>
                    {can("inventory.update") ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => void openEdit(file.path)}
                    >
                      <Pencil />
                      Edit
                    </Button>
                    ) : null}
                    {can("inventory.delete") ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => setDeletePath(file.path)}
                    >
                      <Trash2 />
                      Delete
                    </Button>
                    ) : null}
                  </span>
                }
              />
            ))}
          </StackList>
        </Panel>
      )}
      <EditFileDialog
        open={Boolean(editPath)}
        onOpenChange={(open) => {
          if (!open) setEditPath(null);
        }}
        title={editPath ? editPath.split("/").pop() || editPath : "Edit"}
        description={editPath || undefined}
        value={editContent}
        onSave={saveEdit}
      />
      <ConfirmAction
        open={Boolean(deletePath)}
        onOpenChange={(open) => {
          if (!open) setDeletePath(null);
        }}
        title="Delete this vars file?"
        description={deletePath || ""}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deletePath) void remove(deletePath);
        }}
      />
    </div>
  );
}
