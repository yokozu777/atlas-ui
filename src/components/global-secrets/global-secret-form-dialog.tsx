"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Package, Save, UserRound } from "lucide-react";
import { toast } from "sonner";

import {
  isValidSecretName,
  type GlobalSecretRow,
} from "@/components/global-secrets/types";
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

const COMING_SOON = [
  { id: "git_token", label: "Token", icon: KeyRound },
  { id: "basic_auth", label: "Basic Auth", icon: UserRound },
  { id: "registry_token", label: "Registry Token", icon: Package },
] as const;

export function GlobalSecretFormDialog({
  open,
  onOpenChange,
  mode,
  secret,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  secret?: GlobalSecretRow | null;
  onSaved: () => Promise<void> | void;
}) {
  const isEdit = mode === "edit";
  const [name, setName] = useState("");
  const [username, setUsername] = useState("git");
  const [description, setDescription] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [rotate, setRotate] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(secret?.name || "");
    setUsername(secret?.metadata?.username || secret?.username || "git");
    setDescription(secret?.description || "");
    setPrivateKey("");
    setPassphrase("");
    setShowPassphrase(false);
    setRotate(false);
  }, [open, secret]);

  async function submit() {
    const trimmed = name.trim();
    if (!isValidSecretName(trimmed)) {
      toast.error("Name must be 3–64 characters: letters, numbers, dashes, underscores");
      return;
    }
    if (!isEdit && !privateKey.trim()) {
      toast.error("Private key is required");
      return;
    }
    if (isEdit && rotate && !privateKey.trim()) {
      toast.error("Paste a new private key to rotate");
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        name: trimmed,
        description: description.trim(),
        metadata: { username: username.trim() || "git" },
      };
      if (!isEdit) {
        body.type = "git_ssh_key";
        body.privateKey = privateKey.trim();
        if (passphrase) body.passphrase = passphrase;
        await stargateJson("/global/secrets", {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast.success("Secret created");
      } else if (secret?.id) {
        if (rotate && privateKey.trim()) {
          body.privateKey = privateKey.trim();
          if (passphrase) body.passphrase = passphrase;
        }
        await stargateJson(`/global/secrets/${encodeURIComponent(secret.id)}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        toast.success("Secret updated");
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
          <DialogTitle>
            {isEdit ? "Edit Global Secret" : "Create Global Secret"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update organization credential metadata. Material is never displayed."
              : "Add a new organization-wide secret for platform integrations"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!isEdit ? (
            <div className="space-y-1.5">
              <Label>
                Type <span className="text-destructive">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 rounded-lg border border-primary bg-primary/10 px-3 py-2.5 text-sm">
                  <KeyRound className="size-4" />
                  SSH Key
                </div>
                {COMING_SOON.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5 text-sm text-muted-foreground opacity-60"
                    >
                      <span className="flex items-center gap-2">
                        <Icon className="size-4" />
                        {item.label}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide">
                        Coming soon
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Type: SSH Key</p>
          )}
          <div className="space-y-1.5">
            <Label>
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder="e.g., github-prod-ssh"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Unique name (alphanumeric, dashes, underscores, 3-64 characters)
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Textarea
              placeholder="e.g., SSH key for GitHub production repositories"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Username (optional)</Label>
            <Input
              placeholder="git"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Default: &quot;git&quot; (for Git repositories)
            </p>
          </div>
          {isEdit ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={rotate}
                onCheckedChange={(value) => setRotate(value === true)}
              />
              Rotate Private Key
            </label>
          ) : null}
          {!isEdit || rotate ? (
            <>
              <div className="space-y-1.5">
                <Label>
                  Private Key <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  className="min-h-32 font-mono text-xs"
                  placeholder={
                    "-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"
                  }
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Paste your private key here. Must start with &quot;BEGIN&quot; and
                  end with &quot;PRIVATE KEY&quot;
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Passphrase (optional)</Label>
                <div className="relative">
                  <Input
                    type={showPassphrase ? "text" : "password"}
                    className="pr-9"
                    placeholder="Enter passphrase if key is encrypted"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    autoComplete="new-password"
                  />
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    className="absolute top-1/2 right-1.5 -translate-y-1/2"
                    onClick={() => setShowPassphrase((value) => !value)}
                    aria-label={
                      showPassphrase ? "Hide passphrase" : "Show passphrase"
                    }
                  >
                    {showPassphrase ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Current private key is stored and cannot be viewed. Enable Rotate
              Private Key to replace it.
            </p>
          )}
          {!isEdit ? (
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
              <p className="font-medium text-warning">Important</p>
              <p className="text-muted-foreground">
                This is a one-time entry. The private key cannot be viewed after
                creation. To rotate the key, use the &quot;Rotate Private Key&quot;
                option when editing.
              </p>
            </div>
          ) : null}
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
