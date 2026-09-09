"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";

import type { VaultKeyRow, VaultRow } from "@/components/project-vaults/types";
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
  SelectValue,
} from "@/components/ui/select";
import { stargateJson } from "@/lib/stargate";

export function VaultFormDialog({
  projectId,
  open,
  onOpenChange,
  mode,
  vault,
  keys,
  onSaved,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  vault?: VaultRow | null;
  keys: VaultKeyRow[];
  onSaved: () => Promise<void> | void;
}) {
  const isEdit = mode === "edit";
  const [name, setName] = useState("");
  const [vaultLabel, setVaultLabel] = useState("");
  const [keyId, setKeyId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(vault?.name || "");
    setVaultLabel(vault?.vaultId || "");
    setKeyId(vault?.keyId || keys[0]?.id || "");
  }, [open, vault, keys]);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name is required");
      return;
    }
    if (!keyId) {
      toast.error("Key is required");
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: trimmed,
        keyId,
        vaultId: vaultLabel.trim() || undefined,
      };
      if (!isEdit) {
        await stargateJson(`/projects/${projectId}/vaults`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast.success("Vault created");
      } else if (vault?.id) {
        await stargateJson(`/projects/${projectId}/vaults/${vault.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        toast.success("Vault updated");
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
          <DialogTitle>{isEdit ? "Edit vault" : "Add vault"}</DialogTitle>
          <DialogDescription>
            Bind an ansible-vault identity to an existing password key.
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
          <div className="space-y-1.5">
            <Label>ansible-vault id (optional)</Label>
            <Input
              value={vaultLabel}
              onChange={(e) => setVaultLabel(e.target.value)}
              placeholder="vault id label"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              Key <span className="text-destructive">*</span>
            </Label>
            <Select
              value={keyId || null}
              onValueChange={(value) => setKeyId(value ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a key…" />
              </SelectTrigger>
              <SelectContent
                side="bottom"
                align="start"
                alignItemWithTrigger={false}
                positionMethod="fixed"
              >
                {keys
                  .filter(
                    (row): row is VaultKeyRow & { id: string } => Boolean(row.id),
                  )
                  .map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || keys.length === 0} onClick={() => void submit()}>
            <Save />
            {isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
