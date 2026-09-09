"use client";

import { useCallback, useEffect, useState } from "react";
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
import { stargateJson } from "@/lib/stargate";

export function VarsTab({ projectId }: { projectId: string }) {
  const { clusterId } = useAtlasClusterSelection();
  const q = projectApiQuery(projectId, clusterId);
  const [kind, setKind] = useState<"group" | "host">("group");
  const [files, setFiles] = useState<VarsFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [editPath, setEditPath] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [deletePath, setDeletePath] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const data = await stargateJson<{ files?: VarsFile[] }>(
        `/inventory/vars?${q}&kind=${kind}`,
      );
      setFiles(data.files ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [q, kind]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const title = kind === "group" ? "Group Vars files" : "Host Vars files";

  return (
    <div>
      <Tabs value={kind} onValueChange={(value) => setKind(value === "host" ? "host" : "group")}>
        <TabsList variant="line">
          <TabsTrigger value="group">Group Vars</TabsTrigger>
          <TabsTrigger value="host">Host Vars</TabsTrigger>
        </TabsList>
        <TabsContent value={kind} className="mt-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Folder className="size-4" />
              {title}
            </p>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void load()}>
              <RefreshCw />
              Refresh
            </Button>
          </div>
          {files.length === 0 ? (
            <EmptyState title="No vars files" description="Pull inventory or add hosts." />
          ) : (
            <Panel>
              <StackList>
                {files.map((file) => (
                  <StackListRow
                    key={file.path}
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
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => void openEdit(file.path)}
                        >
                          <Pencil />
                          Edit
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => setDeletePath(file.path)}
                        >
                          <Trash2 />
                          Delete
                        </Button>
                      </span>
                    }
                  />
                ))}
              </StackList>
            </Panel>
          )}
        </TabsContent>
      </Tabs>
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
