"use client";

import { useEffect, useState } from "react";
import { KeyRound, Save, UserRound } from "lucide-react";
import { toast } from "sonner";

import type { SecretRow, SecretType } from "@/components/project-secrets/types";
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
import { Textarea } from "@/components/ui/textarea";
import { stargateJson } from "@/lib/stargate";
import { cn } from "@/lib/utils";

export function SecretFormDialog({
  projectId,
  open,
  onOpenChange,
  mode,
  secret,
  onSaved,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  secret?: SecretRow | null;
  onSaved: () => Promise<void> | void;
}) {
  const q = `project_id=${encodeURIComponent(projectId)}`;
  const isEdit = mode === "edit";
  const [type, setType] = useState<SecretType>("ssh_key");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [description, setDescription] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const nextType: SecretType =
      secret?.type === "login_password" ? "login_password" : "ssh_key";
    setType(nextType);
    setName(secret?.name || "");
    setUsername(secret?.username || "");
    setDescription(secret?.description || "");
    setPrivateKey("");
    setPassphrase("");
    setPassword("");
  }, [open, secret]);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name is required");
      return;
    }
    if (!isEdit && type === "ssh_key" && !privateKey.trim()) {
      toast.error("Private key is required");
      return;
    }
    if (!isEdit && type === "login_password" && !password.trim()) {
      toast.error("Password is required");
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, string> = {
        project_id: projectId,
        username: username.trim(),
        description: description.trim(),
      };
      if (!isEdit) {
        body.name = trimmed;
        body.type = type;
      }
      if (type === "ssh_key") {
        if (privateKey.trim()) body.privateKey = privateKey.trim();
        if (passphrase) body.passphrase = passphrase;
      } else if (password.trim()) {
        body.password = password.trim();
      }
      if (isEdit) {
        await stargateJson(`/secrets/${encodeURIComponent(trimmed)}?${q}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        toast.success("Secret updated");
      } else {
        await stargateJson(`/secrets?${q}`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast.success("Secret created");
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
          <DialogTitle>{isEdit ? "Edit Secret" : "Add Secret"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update secret credentials"
              : "Create a new secret credential"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!isEdit ? (
            <div className="space-y-1.5">
              <Label>
                Type <span className="text-destructive">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "h-auto justify-start rounded-lg px-3 py-2.5",
                    type === "ssh_key" && "border-primary bg-primary/10",
                  )}
                  onClick={() => setType("ssh_key")}
                >
                  <KeyRound />
                  SSH Key
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "h-auto justify-start rounded-lg px-3 py-2.5",
                    type === "login_password" && "border-primary bg-primary/10",
                  )}
                  onClick={() => setType("login_password")}
                >
                  <UserRound />
                  Login/Password
                </Button>
              </div>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label>
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder="e.g., prod-redis-ssh"
              value={name}
              readOnly={isEdit}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {isEdit
                ? "Secret name cannot be changed"
                : "Unique name for this secret (alphanumeric, dashes, underscores only)"}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Username</Label>
            <Input
              placeholder="e.g., ubuntu"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              placeholder="Optional description for this secret"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {type === "ssh_key" ? (
            <>
              <div className="space-y-1.5">
                <Label>
                  Private Key{" "}
                  {isEdit ? null : <span className="text-destructive">*</span>}
                </Label>
                <Textarea
                  className="min-h-32 font-mono text-xs"
                  placeholder={
                    isEdit
                      ? "Value is hidden. Paste a new private key for rotation (leave empty to keep unchanged)."
                      : "-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"
                  }
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  {isEdit
                    ? "Saved value is never displayed. To replace — paste a new one."
                    : 'Paste your private key here. Must start with "BEGIN" and end with "PRIVATE KEY"'}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Passphrase (optional)</Label>
                <Input
                  type="password"
                  placeholder="Enter passphrase if key is encrypted"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label>
                Password{" "}
                {isEdit ? null : <span className="text-destructive">*</span>}
              </Label>
              <Input
                type="password"
                placeholder={
                  isEdit
                    ? "Leave empty to keep unchanged"
                    : "Enter password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            <Save />
            {isEdit ? "Save" : "Create Secret"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
