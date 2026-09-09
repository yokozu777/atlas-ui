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

export function AddHostDialog({
  projectId,
  open,
  onOpenChange,
  groups,
  files,
  inventoryFile,
  onAdded,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: string[];
  files: InvFile[];
  inventoryFile: string;
  onAdded: () => Promise<void> | void;
}) {
  const { clusterId } = useAtlasClusterSelection();
  const groupOptions = groups.includes("all") ? groups : ["all", ...groups];
  const [hostName, setHostName] = useState("");
  const [group, setGroup] = useState("all");
  const [file, setFile] = useState(inventoryFile);
  const [hostIp, setHostIp] = useState("");
  const [varsFile, setVarsFile] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setHostName("");
    setGroup("all");
    setFile(inventoryFile || inventoryKey(files[0] ?? {}) || "inventory.yml");
    setHostIp("");
    setVarsFile("");
  }, [open, inventoryFile, files]);

  async function submit() {
    const name = hostName.trim();
    if (!name) {
      toast.error("Host name is required");
      return;
    }
    setBusy(true);
    try {
      await stargateJson("/inventory/add_host", {
        method: "POST",
        body: JSON.stringify(
          withClusterId(
            {
              project_id: projectId,
              host_name: name,
              group_name: group || "all",
              inventory_file: file || "inventory.yml",
              host_ip: hostIp.trim(),
              vars_file: varsFile.trim(),
            },
            clusterId,
          ),
        ),
      });
      toast.success(`Host ${name} added`);
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
          <DialogTitle>Add Host</DialogTitle>
          <DialogDescription>
            Fill in information about the new host:
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>
              Host Name <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder="example-host"
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              Group <span className="text-destructive">*</span>
            </Label>
            <Select value={group} onValueChange={(value) => setGroup(value ?? "all")}>
              <SelectTrigger className="w-full">
                <span className="min-w-0 flex-1 truncate text-left">{group}</span>
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger>
                {groupOptions.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>
              Inventory File <span className="text-destructive">*</span>
            </Label>
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
          <div className="space-y-1.5">
            <Label>IP Address (optional)</Label>
            <Input
              placeholder="192.168.1.100"
              value={hostIp}
              onChange={(e) => setHostIp(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Vars File (optional)</Label>
            <Input
              placeholder="host_vars/example-host.yml"
              value={varsFile}
              onChange={(e) => setVarsFile(e.target.value)}
            />
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
