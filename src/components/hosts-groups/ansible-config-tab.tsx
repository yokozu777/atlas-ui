"use client";

import { useState } from "react";
import { Download, Pencil, RefreshCw, Settings, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useAtlasClusterSelection } from "@/components/atlas-cluster-selection";
import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { EditFileDialog } from "@/components/hosts-groups/edit-file-dialog";
import { downloadText, projectApiQuery } from "@/components/hosts-groups/helpers";
import type { CfgFile } from "@/components/hosts-groups/types";
import { Panel } from "@/components/panel";
import { StackList, StackListRow } from "@/components/stack-list";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { stargateJson } from "@/lib/stargate";

export function AnsibleConfigTab({
  projectId,
  files,
  selected,
  busy,
  onRefresh,
}: {
  projectId: string;
  files: CfgFile[];
  selected: string;
  busy: boolean;
  onRefresh: () => Promise<void> | void;
}) {
  const { clusterId } = useAtlasClusterSelection();
  const q = projectApiQuery(projectId, clusterId);
  const [editFile, setEditFile] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [deleteFile, setDeleteFile] = useState<string | null>(null);

  async function select(path: string) {
    try {
      await stargateJson("/ansible_config/select", {
        method: "POST",
        body: JSON.stringify({ project_id: projectId, file: path }),
      });
      toast.success("Active ansible.cfg updated");
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function openEdit(path: string) {
    try {
      const data = await stargateJson<{ content?: string }>(
        `/ansible_config/get?${q}&file=${encodeURIComponent(path)}`,
      );
      setEditContent(data.content || "");
      setEditFile(path);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveEdit(content: string) {
    if (!editFile) return;
    await stargateJson("/ansible_config/save", {
      method: "POST",
      body: JSON.stringify({
        project_id: projectId,
        file: editFile,
        content,
      }),
    });
    await onRefresh();
  }

  async function downloadFile(path: string, name: string) {
    try {
      const data = await stargateJson<{ content?: string }>(
        `/ansible_config/get?${q}&file=${encodeURIComponent(path)}`,
      );
      downloadText(name, data.content || "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function remove(path: string) {
    await stargateJson("/ansible_config/delete", {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, file: path }),
    });
    toast.success("Deleted");
    await onRefresh();
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Settings className="size-4" />
          Ansible Config files
        </p>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void onRefresh()}>
          <RefreshCw />
          Refresh
        </Button>
      </div>
      {files.length === 0 ? (
        <EmptyState title="No ansible.cfg files" />
      ) : (
        <RadioGroup
          value={selected}
          onValueChange={(value) => {
            if (value) void select(value);
          }}
          className="gap-0"
        >
          <Panel>
            <StackList>
              {files.map((file) => {
                const path = file.path || file.name || "";
                return (
                  <StackListRow
                    key={path}
                    title={
                      <Label className="flex min-w-0 items-center gap-3 font-medium">
                        <RadioGroupItem value={path} />
                        {file.name || path}
                      </Label>
                    }
                    description={path}
                    trailing={
                      <span className="flex gap-1">
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() =>
                            void downloadFile(path, file.name || "ansible.cfg")
                          }
                        >
                          <Download />
                          Download
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => void openEdit(path)}
                        >
                          <Pencil />
                          Edit
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => setDeleteFile(path)}
                        >
                          <Trash2 />
                          Delete
                        </Button>
                      </span>
                    }
                  />
                );
              })}
            </StackList>
          </Panel>
        </RadioGroup>
      )}
      <EditFileDialog
        open={Boolean(editFile)}
        onOpenChange={(open) => {
          if (!open) setEditFile(null);
        }}
        title={editFile || "ansible.cfg"}
        description={editFile || undefined}
        value={editContent}
        onSave={saveEdit}
      />
      <ConfirmAction
        open={Boolean(deleteFile)}
        onOpenChange={(open) => {
          if (!open) setDeleteFile(null);
        }}
        title="Delete this ansible.cfg?"
        description={deleteFile || ""}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteFile) void remove(deleteFile);
        }}
      />
    </div>
  );
}
