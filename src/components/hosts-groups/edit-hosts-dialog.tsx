"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useAtlasClusterSelection } from "@/components/atlas-cluster-selection";
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
import { withClusterId } from "@/components/hosts-groups/helpers";
import { stargateJson } from "@/lib/stargate";

export function EditHostsDialog({
  projectId,
  open,
  onOpenChange,
  group,
  hosts,
  selected,
  inventoryFile,
  onSaved,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: string;
  hosts: string[];
  selected: string[];
  inventoryFile: string;
  onSaved: () => Promise<void> | void;
}) {
  const { clusterId } = useAtlasClusterSelection();
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPicked(selected);
  }, [open, selected]);

  function toggle(name: string, checked: boolean) {
    setPicked((current) =>
      checked ? [...current, name] : current.filter((item) => item !== name),
    );
  }

  async function submit() {
    setBusy(true);
    try {
      await stargateJson(
        `/inventory/groups/${encodeURIComponent(group)}/hosts`,
        {
          method: "PUT",
          body: JSON.stringify(
            withClusterId(
              {
                project_id: projectId,
                inventory_file: inventoryFile,
                hosts: picked,
              },
              clusterId,
            ),
          ),
        },
      );
      toast.success(`Hosts updated for ${group}`);
      onOpenChange(false);
      await onSaved();
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
          <DialogTitle>Edit Hosts</DialogTitle>
          <DialogDescription>
            Choose hosts that belong to {group}.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-72 space-y-2 overflow-auto">
          {hosts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hosts in inventory.</p>
          ) : (
            hosts.map((name) => (
              <label key={name} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={picked.includes(name)}
                  onCheckedChange={(value) => toggle(name, value === true)}
                />
                <span className="font-mono">{name}</span>
              </label>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
