"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";

import {
  isValidPermissionName,
  type PermissionRow,
} from "@/components/users-roles/types";
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
import { stargateJson } from "@/lib/stargate";

export function PermissionFormDialog({
  open,
  onOpenChange,
  mode,
  permission,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  permission?: PermissionRow | null;
  onSaved: () => Promise<void> | void;
}) {
  const isEdit = mode === "edit";
  const [resource, setResource] = useState("");
  const [action, setAction] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setResource(permission?.resource || "");
    setAction(permission?.action || "");
    setName(permission?.name || "");
    setNameTouched(Boolean(permission?.name));
    setDescription(permission?.description || "");
  }, [open, permission]);

  const autoName =
    resource.trim() && action.trim()
      ? `${resource.trim()}.${action.trim()}`
      : "";

  async function submit() {
    const nextName = (nameTouched ? name : autoName).trim();
    const nextResource = resource.trim();
    const nextAction = action.trim();
    if (!nextResource || !nextAction) {
      toast.error("Resource and action are required");
      return;
    }
    if (!isValidPermissionName(nextName)) {
      toast.error("Permission name must be resource.action");
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: nextName,
        resource: nextResource,
        action: nextAction,
        description: description.trim(),
      };
      if (!isEdit) {
        await stargateJson("/permissions", {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast.success("Permission created");
      } else if (permission?.id) {
        await stargateJson(`/permissions/${encodeURIComponent(permission.id)}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        toast.success("Permission updated");
      }
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
          <DialogTitle>{isEdit ? "Edit permission" : "Create permission"}</DialogTitle>
          <DialogDescription>
            Names use the resource.action format, for example users.read.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              Resource <span className="text-destructive">*</span>
            </Label>
            <Input
              value={resource}
              onChange={(e) => setResource(e.target.value)}
              placeholder="users"
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              Action <span className="text-destructive">*</span>
            </Label>
            <Input
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="read"
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              value={nameTouched ? name : autoName}
              onChange={(e) => {
                setNameTouched(true);
                setName(e.target.value);
              }}
              placeholder="users.read"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            <Save />
            {isEdit ? "Save" : "Create permission"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
