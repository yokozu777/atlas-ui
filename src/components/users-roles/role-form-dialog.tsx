"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";

import {
  groupPermissions,
  isValidRoleName,
  type PermissionRow,
  type RoleRow,
} from "@/components/users-roles/types";
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
import { Textarea } from "@/components/ui/textarea";
import { stargateJson } from "@/lib/stargate";

export function RoleFormDialog({
  open,
  onOpenChange,
  mode,
  role,
  permissions,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  role?: RoleRow | null;
  permissions: PermissionRow[];
  onSaved: () => Promise<void> | void;
}) {
  const isEdit = mode === "edit";
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissionIds, setPermissionIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const grouped = groupPermissions(permissions);

  useEffect(() => {
    if (!open) return;
    setName(role?.name || "");
    setDescription(role?.description || "");
    setPermissionIds(role?.permissions ?? []);
  }, [open, role]);

  function toggle(id: string, checked: boolean) {
    setPermissionIds((current) =>
      checked ? [...current, id] : current.filter((item) => item !== id),
    );
  }

  async function submit() {
    const trimmed = name.trim();
    if (!isValidRoleName(trimmed)) {
      toast.error(
        "Role name must be 2–100 characters: letters, numbers, spaces, dashes, underscores",
      );
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: trimmed,
        description: description.trim(),
        permissions: permissionIds,
      };
      if (!isEdit) {
        await stargateJson("/roles", {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast.success("Role created");
      } else if (role?.id) {
        await stargateJson(`/roles/${encodeURIComponent(role.id)}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        toast.success("Role updated");
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit role" : "Create role"}</DialogTitle>
          <DialogDescription>
            Assign permissions by resource. Changes apply immediately after save.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              Name <span className="text-destructive">*</span>
            </Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Permissions</Label>
            <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border p-3">
              {grouped.map(([resource, rows]) => (
                <div key={resource} className="space-y-1.5">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {resource}
                  </p>
                  {rows.map((row) => (
                    <label key={row.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={permissionIds.includes(row.id)}
                        onCheckedChange={(value) => toggle(row.id, value === true)}
                      />
                      <span className="font-mono text-xs">{row.name}</span>
                      {row.description ? (
                        <span className="text-muted-foreground">— {row.description}</span>
                      ) : null}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            <Save />
            {isEdit ? "Save" : "Create role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
