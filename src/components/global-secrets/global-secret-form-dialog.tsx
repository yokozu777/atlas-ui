"use client";

import { useEffect, useRef, useState } from "react";
import {
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Package,
  Save,
  Sparkles,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import {
  isSshSecretType,
  isValidSecretName,
  secretPublicKey,
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
import { cn } from "@/lib/utils";

type CreateKind = "ssh_paste" | "ssh_generate" | "basic_auth";

type RevealedKeys = {
  publicKey: string;
  privateKey?: string;
};

const COMING_SOON = [
  { id: "git_token", label: "Token", icon: KeyRound },
  { id: "registry_token", label: "Registry Token", icon: Package },
] as const;

function kindFromSecret(secret?: GlobalSecretRow | null): CreateKind {
  if (secret?.type === "basic_auth") return "basic_auth";
  return "ssh_paste";
}

export function GlobalSecretFormDialog({
  open,
  onOpenChange,
  mode,
  secret,
  onSaved,
  clusterctlSecretId,
  sshOnly = false,
  forceClusterctl = false,
  title,
  description: descriptionProp,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  secret?: GlobalSecretRow | null;
  onSaved: () => Promise<void> | void;
  clusterctlSecretId?: string | null;
  sshOnly?: boolean;
  forceClusterctl?: boolean;
  title?: string;
  description?: string;
}) {
  const isEdit = mode === "edit";
  const [kind, setKind] = useState<CreateKind>("ssh_paste");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("git");
  const [registry, setRegistry] = useState("");
  const [comment, setComment] = useState("");
  const [description, setDescription] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [password, setPassword] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [rotate, setRotate] = useState(false);
  const [rotateGenerate, setRotateGenerate] = useState(false);
  const [useAsClusterctl, setUseAsClusterctl] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<RevealedKeys | null>(null);
  const [showRevealedPrivate, setShowRevealedPrivate] = useState(true);
  const notifiedSaved = useRef(false);

  const isBasic = (isEdit ? secret?.type === "basic_auth" : kind === "basic_auth");
  const isGenerate = !isEdit && kind === "ssh_generate";
  const isSsh = isEdit ? isSshSecretType(secret?.type) : !isBasic;

  useEffect(() => {
    if (!open) return;
    notifiedSaved.current = false;
    const nextKind = kindFromSecret(secret);
    setKind(isEdit ? nextKind : "ssh_paste");
    setName(secret?.name || "");
    setUsername(
      secret?.metadata?.username ||
        secret?.username ||
        (secret?.type === "basic_auth" && !sshOnly ? "" : "git"),
    );
    setRegistry(secret?.metadata?.registry || "");
    setComment(secret?.metadata?.comment || "");
    setDescription(secret?.description || "");
    setPrivateKey("");
    setPassword("");
    setPassphrase("");
    setShowSecret(false);
    setRotate(false);
    setRotateGenerate(false);
    setUseAsClusterctl(
      forceClusterctl || Boolean(secret?.id && clusterctlSecretId === secret.id),
    );
    setRevealedKeys(null);
    setShowRevealedPrivate(true);
  }, [open, secret, isEdit, clusterctlSecretId, forceClusterctl, sshOnly]);

  function selectKind(next: CreateKind) {
    if (sshOnly && next === "basic_auth") return;
    setKind(next);
    if (next === "basic_auth" && username === "git") {
      setUsername("");
    }
    if (next !== "basic_auth" && !username) {
      setUsername("git");
    }
  }

  async function finishSaved() {
    if (notifiedSaved.current) return;
    notifiedSaved.current = true;
    await onSaved();
  }

  async function dismissRevealedKeys() {
    if (!revealedKeys) return;
    onOpenChange(false);
    setRevealedKeys(null);
    await finishSaved();
  }

  function copyText(value: string, ok: string) {
    void navigator.clipboard.writeText(value);
    toast.success(ok);
  }

  async function submit() {
    const trimmed = name.trim();
    if (!isValidSecretName(trimmed)) {
      toast.error("Name must be 3–64 characters: letters, numbers, dashes, underscores");
      return;
    }
    if (!isEdit && isSsh && !isGenerate && !privateKey.trim()) {
      toast.error("Private key is required");
      return;
    }
    if (!isEdit && isBasic && (!username.trim() || !password.trim())) {
      toast.error("Username and password are required");
      return;
    }
    if (isEdit && isSsh && rotate && !rotateGenerate && !privateKey.trim()) {
      toast.error("Paste a new private key to rotate");
      return;
    }
    if (isEdit && isBasic && rotate && !password.trim()) {
      toast.error("Enter a new password to rotate");
      return;
    }
    setBusy(true);
    try {
      if (isBasic) {
        const body: Record<string, unknown> = {
          name: trimmed,
          description: description.trim(),
          username: username.trim(),
          metadata: {
            username: username.trim(),
            registry: registry.trim(),
          },
        };
        if (!isEdit) {
          body.type = "basic_auth";
          body.password = password;
          await stargateJson("/global/secrets", {
            method: "POST",
            body: JSON.stringify(body),
          });
          toast.success("Secret created");
        } else if (secret?.id) {
          if (rotate && password) body.password = password;
          await stargateJson(`/global/secrets/${encodeURIComponent(secret.id)}`, {
            method: "PUT",
            body: JSON.stringify(body),
          });
          toast.success("Secret updated");
        }
      } else {
        const body: Record<string, unknown> = {
          name: trimmed,
          description: description.trim(),
          useAsClusterctlSsh: forceClusterctl || useAsClusterctl,
          metadata: {
            username: username.trim() || "git",
            comment: comment.trim(),
          },
        };
        let publicKey = "";
        let generatedPrivateKey = "";
        if (!isEdit) {
          body.type = "git_ssh_key";
          if (isGenerate) {
            body.generate = true;
            if (passphrase) body.passphrase = passphrase;
          } else {
            body.privateKey = privateKey.trim();
            if (passphrase) body.passphrase = passphrase;
          }
          const created = await stargateJson<{ secret?: GlobalSecretRow }>(
            "/global/secrets",
            { method: "POST", body: JSON.stringify(body) },
          );
          publicKey = secretPublicKey(created.secret);
          generatedPrivateKey = (created.secret?.privateKey || "").trim();
          toast.success("Secret created");
        } else if (secret?.id) {
          if (rotate && rotateGenerate) {
            body.generate = true;
            if (passphrase) body.passphrase = passphrase;
          } else if (rotate && privateKey.trim()) {
            body.privateKey = privateKey.trim();
            if (passphrase) body.passphrase = passphrase;
          }
          const updated = await stargateJson<{ secret?: GlobalSecretRow }>(
            `/global/secrets/${encodeURIComponent(secret.id)}`,
            { method: "PUT", body: JSON.stringify(body) },
          );
          toast.success("Secret updated");
          publicKey = secretPublicKey(updated.secret);
          generatedPrivateKey = (updated.secret?.privateKey || "").trim();
          if (!(rotate && rotateGenerate)) {
            publicKey = "";
            generatedPrivateKey = "";
          }
        }
        if (publicKey) {
          setRevealedKeys({
            publicKey,
            privateKey: generatedPrivateKey || undefined,
          });
          setShowRevealedPrivate(true);
          return;
        }
      }
      await finishSaved();
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {title || (isEdit ? "Edit Global Secret" : "Create Global Secret")}
            </DialogTitle>
            <DialogDescription>
              {descriptionProp ||
                (isEdit
                  ? "Update organization credential metadata. Material is never displayed."
                  : "Add a new organization-wide secret for platform integrations")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!isEdit ? (
              <div className="space-y-1.5">
                <Label>
                  Type <span className="text-destructive">*</span>
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm",
                      kind === "ssh_paste"
                        ? "border-primary bg-primary/10"
                        : "border-border",
                    )}
                    onClick={() => selectKind("ssh_paste")}
                  >
                    <KeyRound className="size-4" />
                    SSH Key
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm",
                      kind === "ssh_generate"
                        ? "border-primary bg-primary/10"
                        : "border-border",
                    )}
                    onClick={() => selectKind("ssh_generate")}
                  >
                    <Sparkles className="size-4" />
                    Generate SSH Key
                  </button>
                  {sshOnly ? null : (
                    <button
                      type="button"
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm",
                        kind === "basic_auth"
                          ? "border-primary bg-primary/10"
                          : "border-border",
                      )}
                      onClick={() => selectKind("basic_auth")}
                    >
                      <UserRound className="size-4" />
                      Basic Auth
                    </button>
                  )}
                  {sshOnly
                    ? null
                    : COMING_SOON.map((item) => {
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
              <p className="text-sm text-muted-foreground">
                Type: {isBasic ? "Basic Auth" : "SSH Key"}
              </p>
            )}
            <div className="space-y-1.5">
              <Label>
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder={isBasic ? "e.g., registry-bot" : "e.g., github-prod-ssh"}
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
                placeholder={
                  isBasic
                    ? "e.g., HTTP basic auth for a private registry"
                    : "e.g., SSH key for GitHub production repositories"
                }
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Username{" "}
                {isBasic ? <span className="text-destructive">*</span> : "(optional)"}
              </Label>
              <Input
                placeholder={isBasic ? "username" : "git"}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              {isBasic ? null : (
                <p className="text-xs text-muted-foreground">
                  Default: &quot;git&quot; (for Git repositories)
                </p>
              )}
            </div>
            {isBasic ? (
              <div className="space-y-1.5">
                <Label>Registry (optional)</Label>
                <Input
                  placeholder="e.g., registry.example.com"
                  value={registry}
                  onChange={(e) => setRegistry(e.target.value)}
                />
              </div>
            ) : null}
            {isSsh ? (
              <>
                {isGenerate || (isEdit && rotate && rotateGenerate) ? (
                  <div className="space-y-1.5">
                    <Label>Comment (optional)</Label>
                    <Input
                      placeholder="atlas@secrets-manager"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Stored on the public key. Ed25519, generated on the hub.
                    </p>
                  </div>
                ) : null}
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={useAsClusterctl}
                    disabled={forceClusterctl}
                    onCheckedChange={(value) => setUseAsClusterctl(value === true)}
                    className="mt-0.5"
                  />
                  <span>
                    Use as clusterctl SSH key (Ansible / docker executor)
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Injected as SSH_KEY for atlas-ui git clone, validate, and
                      docker/Ansible runs.
                    </span>
                  </span>
                </label>
              </>
            ) : null}
            {isEdit ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={rotate}
                  onCheckedChange={(value) => {
                    const on = value === true;
                    setRotate(on);
                    if (!on) setRotateGenerate(false);
                  }}
                />
                {isBasic ? "Rotate Password" : "Rotate Private Key"}
              </label>
            ) : null}
            {isEdit && isSsh && rotate ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={rotateGenerate}
                  onCheckedChange={(value) => setRotateGenerate(value === true)}
                />
                Generate a new Ed25519 key
              </label>
            ) : null}
            {isBasic && (!isEdit || rotate) ? (
              <div className="space-y-1.5">
                <Label>
                  Password <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    type={showSecret ? "text" : "password"}
                    className="pr-9"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    className="absolute top-1/2 right-1.5 -translate-y-1/2"
                    onClick={() => setShowSecret((value) => !value)}
                    aria-label={showSecret ? "Hide password" : "Show password"}
                  >
                    {showSecret ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
              </div>
            ) : null}
            {isSsh && (!isEdit || rotate) && !isGenerate && !(isEdit && rotateGenerate) ? (
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
            ) : null}
            {isSsh && (!isEdit || rotate) ? (
              <div className="space-y-1.5">
                <Label>Passphrase (optional)</Label>
                <div className="relative">
                  <Input
                    type={showSecret ? "text" : "password"}
                    className="pr-9"
                    placeholder={
                      isGenerate || (isEdit && rotateGenerate)
                        ? "Leave empty for clusterctl / Ansible"
                        : "Enter passphrase if key is encrypted"
                    }
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    autoComplete="new-password"
                  />
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    className="absolute top-1/2 right-1.5 -translate-y-1/2"
                    onClick={() => setShowSecret((value) => !value)}
                    aria-label={
                      showSecret ? "Hide passphrase" : "Show passphrase"
                    }
                  >
                    {showSecret ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
              </div>
            ) : null}
            {isEdit && !rotate ? (
              <p className="text-xs text-muted-foreground">
                {isBasic
                  ? "Current password is stored and cannot be viewed. Enable Rotate Password to replace it."
                  : "Current private key is stored and cannot be viewed. Enable Rotate Private Key to replace it."}
              </p>
            ) : null}
            {!isEdit && isSsh && !isGenerate ? (
              <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
                <p className="font-medium text-warning">Important</p>
                <p className="text-muted-foreground">
                  This is a one-time entry. The private key cannot be viewed after
                  creation. To rotate the key, use the &quot;Rotate Private Key&quot;
                  option when editing.
                </p>
              </div>
            ) : null}
            {!isEdit && isGenerate ? (
              <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
                <p className="font-medium text-warning">Important</p>
                <p className="text-muted-foreground">
                  After create, the public and private keys are shown once so you
                  can copy a backup. You can also download both keys later from
                  Secrets Manager. Add the public key to Git or the target hosts.
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {revealedKeys?.privateKey ? "SSH key" : "Public key"}
            </DialogTitle>
            <DialogDescription>
              Copy the public key to Git (Gitea deploy keys / user keys) or the
              hosts this key should reach.
              {revealedKeys?.privateKey
                ? " The private key is shown only this once — copy or download a backup if you need it. You can also download keys later from Secrets Manager."
                : " You can download keys later from Secrets Manager."}{" "}
              Continue only after the public key is installed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Public key</Label>
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
