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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { withClusterId } from "@/components/hosts-groups/helpers";
import { stargateJson } from "@/lib/stargate";

export function AssignGroupDialog({
  projectId,
  open,
  onOpenChange,
  host,
  groups,
  inventoryFile,
  onAssigned,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  host: string;
  groups: string[];
  inventoryFile: string;
  onAssigned: () => Promise<void> | void;
}) {
  const { clusterId } = useAtlasClusterSelection();
  const options = groups.includes("all") ? groups : ["all", ...groups];
  const [group, setGroup] = useState("all");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setGroup(options[0] || "all");
  }, [open, host]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    if (!host) {
      toast.error("Host is required");
      return;
    }
    setBusy(true);
    try {
      await stargateJson("/inventory/assign_host", {
        method: "POST",
        body: JSON.stringify(
          withClusterId(
            {
              project_id: projectId,
              host_name: host,
              group_name: group || "all",
              inventory_file: inventoryFile,
            },
            clusterId,
          ),
        ),
      });
      toast.success(`${host} assigned to ${group}`);
      onOpenChange(false);
      await onAssigned();
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
          <DialogTitle>Assign Group</DialogTitle>
          <DialogDescription>
            Add {host || "the host"} to an inventory group.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Group</Label>
          <Select value={group} onValueChange={(value) => setGroup(value ?? "all")}>
            <SelectTrigger className="w-full">
              <span className="min-w-0 flex-1 truncate text-left">{group}</span>
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger>
              {options.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
