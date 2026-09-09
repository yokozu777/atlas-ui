"use client";

import { useRef, useState } from "react";
import { Download, List, Pencil, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { useAtlasClusterSelection } from "@/components/atlas-cluster-selection";
import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { EditFileDialog } from "@/components/hosts-groups/edit-file-dialog";
import { inventoryKey, projectApiQuery, withClusterId } from "@/components/hosts-groups/helpers";
import type { InvFile } from "@/components/hosts-groups/types";
import { Panel } from "@/components/panel";
import { StackList, StackListRow } from "@/components/stack-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { stargateDownload, stargateJson } from "@/lib/stargate";

export function InventoryTab({
  projectId,
  files,
  selected,
  onSelectedChange,
  busy,
  onRefresh,
}: {
  projectId: string;
  files: InvFile[];
  selected: string[];
  onSelectedChange: (next: string[]) => void;
  busy: boolean;
  onRefresh: () => Promise<void> | void;
}) {
  const { clusterId } = useAtlasClusterSelection();
  const q = projectApiQuery(projectId, clusterId);
  const importRef = useRef<HTMLInputElement>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("invent.yaml");
  const [editFile, setEditFile] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [deleteFile, setDeleteFile] = useState<string | null>(null);
  const active = selected[0] || inventoryKey(files[0] ?? {});

  function toggle(path: string, checked: boolean) {
    if (checked) {
      onSelectedChange([...new Set([...selected, path])]);
      return;
    }
    const next = selected.filter((item) => item !== path);
    onSelectedChange(next.length ? next : [path]);
  }

  async function exportZip() {
    try {
      await stargateDownload(`/inventory/export?${q}`, "inventory_export.zip");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function importFile(file: File) {
    const form = new FormData();
    form.append("file", file);
    try {
      await stargateJson(`/inventory/import?${q}`, { method: "POST", body: form });
      toast.success("Imported");
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function addFile() {
    const name = newName.trim();
    if (!name) {
      toast.error("File name is required");
      return;
    }
    try {
      await stargateJson("/inventory/save", {
        method: "POST",
        body: JSON.stringify(
          withClusterId(
            {
              project_id: projectId,
              file: name,
              content: "all: {}\n",
            },
            clusterId,
          ),
        ),
      });
      toast.success("Inventory file added");
      setAddOpen(false);
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function openEdit(path: string) {
    try {
      const data = await stargateJson<{ content?: string }>(
        `/inventory/get?${q}&file=${encodeURIComponent(path)}`,
      );
      setEditContent(data.content || "");
      setEditFile(path);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveEdit(content: string) {
    if (!editFile) return;
    await stargateJson("/inventory/save", {
      method: "POST",
      body: JSON.stringify(
        withClusterId(
          {
            project_id: projectId,
            file: editFile,
            content,
          },
          clusterId,
        ),
      ),
    });
    await onRefresh();
  }

  async function downloadFile(path: string, name: string) {
    try {
      const data = await stargateJson<{ content?: string }>(
        `/inventory/get?${q}&file=${encodeURIComponent(path)}`,
      );
      const blob = new Blob([data.content || ""], { type: "text/yaml" });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function remove(path: string) {
    await stargateJson("/inventory/delete", {
      method: "POST",
      body: JSON.stringify(
        withClusterId({ project_id: projectId, file: path }, clusterId),
      ),
    });
    toast.success("Deleted");
    onSelectedChange(selected.filter((item) => item !== path));
    await onRefresh();
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <List className="size-4" />
          Inventory files
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            ref={importRef}
            type="file"
            accept=".yml,.yaml,.zip"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void importFile(file);
            }}
          />
          <Button size="sm" variant="outline" onClick={() => void exportZip()}>
            <Download />
            Export
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => importRef.current?.click()}
          >
            <Upload />
            Import
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus />
            Add
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void onRefresh()}>
            <RefreshCw />
            Refresh
          </Button>
        </div>
      </div>
      <div className="mb-3 rounded-lg border border-info/30 bg-info/10 px-4 py-2 text-sm">
        <p className="text-xs text-muted-foreground">Active Inventory:</p>
        <p className="font-mono text-sm">{active || "—"}</p>
      </div>
      {files.length === 0 ? (
        <EmptyState title="No inventory files" description="Add or import an inventory YAML." />
      ) : (
        <Panel>
          <StackList>
            {files.map((file) => {
              const path = inventoryKey(file);
              return (
                <StackListRow
                  key={path}
                  title={
                    <span className="flex items-center gap-3">
                      <Checkbox
                        checked={selected.includes(path)}
                        onCheckedChange={(value) => toggle(path, value === true)}
                      />
                      <span className="flex items-center gap-2">
                        {file.name || path}
                        {file.env ? <Badge variant="info">{file.env}</Badge> : null}
                      </span>
                    </span>
                  }
                  description={path}
                  trailing={
                    <span className="flex gap-1">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() =>
                          void downloadFile(path, file.name || "inventory.yml")
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
      )}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add inventory file</DialogTitle>
            <DialogDescription>
              Creates an empty inventory YAML in project storage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>File name</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void addFile()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <EditFileDialog
        open={Boolean(editFile)}
        onOpenChange={(open) => {
          if (!open) setEditFile(null);
        }}
        title={editFile || "Inventory"}
        description={editFile || undefined}
        value={editContent}
        onSave={saveEdit}
      />
      <ConfirmAction
        open={Boolean(deleteFile)}
        onOpenChange={(open) => {
          if (!open) setDeleteFile(null);
        }}
        title="Delete this inventory file?"
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
