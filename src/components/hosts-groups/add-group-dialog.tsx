"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useAtlasClusterSelection } from "@/components/atlas-cluster-selection";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { InvFile } from "@/components/hosts-groups/types";
import { inventoryKey, withClusterId } from "@/components/hosts-groups/helpers";
import { stargateJson } from "@/lib/stargate";

export function AddGroupDialog({
  projectId,
  open,
  onOpenChange,
  files,
  inventoryFile,
  onAdded,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: InvFile[];
  inventoryFile: string;
  onAdded: () => Promise<void> | void;
}) {
  const { clusterId } = useAtlasClusterSelection();
  const [name, setName] = useState("");
  const [file, setFile] = useState(inventoryFile);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setFile(inventoryFile || inventoryKey(files[0] ?? {}) || "inventory.yml");
  }, [open, inventoryFile, files]);

  async function submit() {
    const groupName = name.trim();
    if (!groupName) {
      toast.error("Group name is required");
      return;
    }
    setBusy(true);
    try {
      await stargateJson("/inventory/groups", {
        method: "POST",
        body: JSON.stringify(
          withClusterId(
            {
              project_id: projectId,
              group_name: groupName,
              inventory_file: file || "inventory.yml",
            },
            clusterId,
          ),
        ),
      });
      toast.success(`Group ${groupName} added`);
      onOpenChange(false);
      await onAdded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Group</DialogTitle>
          <DialogDescription>Create a new inventory group.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>
              Group Name <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder="web"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Inventory File</Label>
            <Select value={file} onValueChange={(value) => setFile(value ?? file)}>
              <SelectTrigger className="w-full">
                <span className="min-w-0 flex-1 truncate text-left">
                  {file || "inventory.yml"}
                </span>
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger>
                {(files.length ? files : [{ path: "inventory.yml", name: "inventory.yml" }]).map(
                  (row) => {
                    const value = inventoryKey(row);
                    return (
                      <SelectItem key={value} value={value}>
                        {row.name || row.path}
                      </SelectItem>
                    );
                  },
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
