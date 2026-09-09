"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Save } from "lucide-react";
import { toast } from "sonner";

import type { VaultKeyRow } from "@/components/project-vaults/types";
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
import { stargateJson } from "@/lib/stargate";

export function KeyFormDialog({
  projectId,
  open,
  onOpenChange,
  mode,
  vaultKey,
  onSaved,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  vaultKey?: VaultKeyRow | null;
  onSaved: () => Promise<void> | void;
}) {
  const isEdit = mode === "edit";
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rotatePassword, setRotatePassword] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(vaultKey?.name || "");
    setPassword("");
    setShowPassword(false);
    setRotatePassword(false);
  }, [open, vaultKey]);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name is required");
      return;
    }
    if (!isEdit && !password) {
      toast.error("Password is required");
      return;
    }
    if (isEdit && rotatePassword && !password) {
      toast.error("Password is required to rotate");
      return;
    }
    setBusy(true);
    try {
      if (!isEdit) {
        await stargateJson(`/projects/${projectId}/vault-keys`, {
          method: "POST",
          body: JSON.stringify({ name: trimmed, password }),
        });
        toast.success("Vault key created");
      } else if (vaultKey?.id) {
        const body: Record<string, string> = { name: trimmed };
        if (rotatePassword && password) {
          body.password = password;
        }
        await stargateJson(`/projects/${projectId}/vault-keys/${vaultKey.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        toast.success("Vault key updated");
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit key" : "Add key"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Rename this vault key. Rotate the password only when needed."
              : "Create an ansible-vault password key for this project."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </div>
          {isEdit ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={rotatePassword}
                onCheckedChange={(value) => setRotatePassword(value === true)}
              />
              Rotate password
            </label>
          ) : null}
          {!isEdit || rotatePassword ? (
            <div className="space-y-1.5">
              <Label>
                Password <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  className="pr-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  className="absolute top-1/2 right-1.5 -translate-y-1/2"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void submit()}>
            <Save />
            {isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
