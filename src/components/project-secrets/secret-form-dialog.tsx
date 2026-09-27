"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Eye, EyeOff, KeyRound, Save, Sparkles, UserRound } from "lucide-react";
import { toast } from "sonner";

import type { SecretRow } from "@/components/project-secrets/types";
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
import { downloadPrivateKey, downloadPublicKey } from "@/lib/secret-keys";
import { stargateJson } from "@/lib/stargate";
import { cn } from "@/lib/utils";

type CreateKind = "ssh_paste" | "ssh_generate" | "login_password";

type RevealedKeys = {
  name: string;
  publicKey: string;
  privateKey?: string;
};

function kindFromSecret(secret?: SecretRow | null): CreateKind {
  if (secret?.type === "login_password") return "login_password";
  return "ssh_paste";
}

export function SecretFormDialog({
  projectId,
  open,
  onOpenChange,
  mode,
  secret,
  onSaved,
  sshOnly = false,
  title,
  description: descriptionProp,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  secret?: SecretRow | null;
  onSaved: (created?: { name: string }) => Promise<void> | void;
  sshOnly?: boolean;
  title?: string;
  description?: string;
}) {
  const q = `project_id=${encodeURIComponent(projectId)}`;
  const isEdit = mode === "edit";
  const [kind, setKind] = useState<CreateKind>("ssh_paste");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [description, setDescription] = useState("");
  const [comment, setComment] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<RevealedKeys | null>(null);
  const [showRevealedPrivate, setShowRevealedPrivate] = useState(true);
  const notifiedSaved = useRef(false);

  const isLogin = isEdit
    ? secret?.type === "login_password"
    : kind === "login_password";
  const isGenerate = !isEdit && kind === "ssh_generate";
  const isSsh = !isLogin;

  useEffect(() => {
    if (!open) return;
    notifiedSaved.current = false;
    setKind(isEdit ? kindFromSecret(secret) : "ssh_paste");
    setName(secret?.name || "");
    setUsername(secret?.username || "");
    setDescription(secret?.description || "");
    setComment("");
    setPrivateKey("");
    setPassphrase("");
    setPassword("");
    setRevealedKeys(null);
    setShowRevealedPrivate(true);
  }, [open, secret, isEdit]);

  function selectKind(next: CreateKind) {
    if (sshOnly && next === "login_password") return;
    setKind(next);
  }

  async function finishSaved(created?: { name: string }) {
    if (notifiedSaved.current) return;
    notifiedSaved.current = true;
    await onSaved(created);
  }

  async function dismissRevealedKeys() {
    if (!revealedKeys) return;
    const created = { name: revealedKeys.name };
    onOpenChange(false);
    setRevealedKeys(null);
    await finishSaved(created);
  }

  function copyText(value: string, ok: string) {
    void navigator.clipboard.writeText(value);
    toast.success(ok);
  }

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name is required");
      return;
    }
    if (!isEdit && isSsh && !isGenerate && !privateKey.trim()) {
      toast.error("Private key is required");
      return;
    }
    if (!isEdit && isLogin && !password.trim()) {
      toast.error("Password is required");
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        project_id: projectId,
        username: username.trim(),
        description: description.trim(),
      };
      if (!isEdit) {
        body.name = trimmed;
        body.type = isLogin ? "login_password" : "ssh_key";
      }
      if (isSsh) {
        if (isGenerate) {
          body.generate = true;
          if (comment.trim()) body.comment = comment.trim();
        } else if (privateKey.trim()) {
          body.privateKey = privateKey.trim();
        }
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
        await finishSaved({ name: trimmed });
        onOpenChange(false);
        return;
      }
      const created = await stargateJson<{
        secret?: SecretRow & { publicKey?: string; privateKey?: string };
      }>(`/secrets?${q}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast.success("Secret created");
      const createdName = created.secret?.name || trimmed;
      const publicKey = (created.secret?.publicKey || "").trim();
      const generatedPrivateKey = (created.secret?.privateKey || "").trim();
      if (isSsh && publicKey) {
        setRevealedKeys({
          name: createdName,
          publicKey,
          privateKey: generatedPrivateKey || undefined,
        });
        setShowRevealedPrivate(true);
        return;
      }
      await finishSaved({ name: createdName });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog
        open={open && !revealedKeys}
        onOpenChange={(next) => {
          if (revealedKeys) return;
          onOpenChange(next);
        }}
      >
        <DialogContent
          className="z-[60] max-h-[90vh] overflow-y-auto sm:max-w-lg"
          overlayClassName="z-[60]"
        >
          <DialogHeader>
            <DialogTitle>
              {title || (isEdit ? "Edit Secret" : "Add Secret")}
            </DialogTitle>
            <DialogDescription>
              {descriptionProp ||
                (isEdit
                  ? "Update secret credentials"
                  : "Create a new secret credential")}
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
                      kind === "ssh_paste" && "border-primary bg-primary/10",
                    )}
                    onClick={() => selectKind("ssh_paste")}
                  >
                    <KeyRound />
                    SSH Key
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "h-auto justify-start rounded-lg px-3 py-2.5",
                      kind === "ssh_generate" && "border-primary bg-primary/10",
                    )}
                    onClick={() => selectKind("ssh_generate")}
                  >
                    <Sparkles />
                    Generate SSH Key
                  </Button>
                  {sshOnly ? null : (
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "h-auto justify-start rounded-lg px-3 py-2.5",
                        kind === "login_password" &&
                          "border-primary bg-primary/10",
                      )}
                      onClick={() => selectKind("login_password")}
                    >
                      <UserRound />
                      Login/Password
                    </Button>
                  )}
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
            {isSsh && isGenerate ? (
              <div className="space-y-1.5">
                <Label>Comment (optional)</Label>
                <Input
                  placeholder="atlas@project"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Stored on the public key. Ed25519, generated on the hub.
                </p>
              </div>
            ) : null}
            {isSsh && !isGenerate ? (
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
                      ? "Saved value is never displayed here. Download keys from the Secrets page, or paste a new private key to replace it."
                      : 'Paste your private key here. Must start with "BEGIN" and end with "PRIVATE KEY"'}
                  </p>
                </div>
              </>
            ) : null}
            {isSsh ? (
              <div className="space-y-1.5">
                <Label>Passphrase (optional)</Label>
                <Input
                  type="password"
                  placeholder={
                    isGenerate
                      ? "Leave empty unless the target requires an encrypted key"
                      : "Enter passphrase if key is encrypted"
                  }
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>
                  Password{" "}
                  {isEdit ? null : <span className="text-destructive">*</span>}
                </Label>
                <Input
                  type="password"
                  placeholder={
                    isEdit ? "Leave empty to keep unchanged" : "Enter password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            )}
            {!isEdit && isSsh && isGenerate ? (
              <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
                <p className="font-medium text-warning">Important</p>
                <p className="text-muted-foreground">
                  After create, copy the public key to the target hosts. You can
                  also download the public and private keys later from Secrets.
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
              {isEdit ? "Save" : isGenerate ? "Generate Secret" : "Create Secret"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(revealedKeys)}
        onOpenChange={(next) => {
          if (!next) void dismissRevealedKeys();
        }}
      >
        <DialogContent
          className="z-[70] max-h-[90vh] overflow-y-auto sm:max-w-lg"
          overlayClassName="z-[70]"
        >
          <DialogHeader>
            <DialogTitle>
              {revealedKeys?.privateKey ? "SSH key" : "Public key"}
            </DialogTitle>
            <DialogDescription>
              Copy the public key to the hosts this key should reach.
              {revealedKeys?.privateKey
                ? " The private key is shown here after generate — copy or download a backup. You can also download both keys later from Secrets."
                : " You can download keys later from Secrets."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Public key</Label>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!revealedKeys) return;
                    downloadPublicKey(revealedKeys.name, revealedKeys.publicKey);
                    toast.success("Public key downloaded");
                  }}
                >
                  Download
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    revealedKeys &&
                    copyText(revealedKeys.publicKey, "Public key copied")
                  }
                >
                  <Copy />
                  Copy
                </Button>
              </div>
            </div>
            <pre className="max-h-36 overflow-auto rounded-md border bg-black/50 p-3 font-mono text-xs whitespace-pre-wrap break-all">
              {revealedKeys?.publicKey}
            </pre>
            {revealedKeys?.privateKey ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <Label>Private key</Label>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowRevealedPrivate((value) => !value)}
                      aria-label={
                        showRevealedPrivate
                          ? "Hide private key"
                          : "Show private key"
                      }
                    >
                      {showRevealedPrivate ? <EyeOff /> : <Eye />}
                      {showRevealedPrivate ? "Hide" : "Show"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!revealedKeys?.privateKey) return;
                        downloadPrivateKey(
                          revealedKeys.name,
                          revealedKeys.privateKey,
                        );
                        toast.success("Private key downloaded");
                      }}
                    >
                      Download
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        copyText(
                          revealedKeys.privateKey || "",
                          "Private key copied",
                        )
                      }
                    >
                      <Copy />
                      Copy
                    </Button>
                  </div>
                </div>
                <pre className="max-h-48 overflow-auto rounded-md border bg-black/50 p-3 font-mono text-xs whitespace-pre-wrap break-all">
                  {showRevealedPrivate
                    ? revealedKeys.privateKey
                    : "••••••••  Hidden — use Show or Copy"}
                </pre>
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button onClick={() => void dismissRevealedKeys()}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
