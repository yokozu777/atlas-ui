"use client";

import { useEffect, useState } from "react";
import { KeyRound, Shield } from "lucide-react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { SettingsHint, SettingsSection } from "@/components/settings/settings-section";
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
import { Textarea } from "@/components/ui/textarea";
import { stargateJson } from "@/lib/stargate";

type KeyInfo = {
  exists?: boolean;
  source?: string;
  masked?: string | null;
  filePath?: string | null;
};

export function EncryptionKeySection() {
  const [key, setKey] = useState<KeyInfo>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceValue, setReplaceValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await stargateJson<{ key?: KeyInfo }>(
      "/global/secrets/encryption-key",
    );
    setKey(data.key ?? {});
  }

  useEffect(() => {
    void load().catch((err: unknown) =>
      toast.error(err instanceof Error ? err.message : String(err)),
    );
  }, []);

  async function createKey() {
    setBusy(true);
    try {
      await stargateJson("/global/secrets/encryption-key/create", {
        method: "POST",
        body: JSON.stringify({}),
      });
      toast.success("Encryption key created");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function replaceKey() {
    const next = replaceValue.trim();
    if (next.length < 32) {
      toast.error("Encryption key must be at least 32 characters");
      return;
    }
    setBusy(true);
    try {
      await stargateJson("/global/secrets/encryption-key", {
        method: "POST",
        body: JSON.stringify({ key: next }),
      });
      toast.success("Encryption key replaced");
      setReplaceOpen(false);
      setReplaceValue("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const source = key.source === "environment" ? "Environment" : key.source === "file" ? "File" : "None";

  return (
    <SettingsSection
      icon={<KeyRound className="size-4" />}
      title="Global secrets encryption key"
    >
      <SettingsHint>
        Encryption key for Global Secrets Manager. The key is generated on first
        use and stored in a file. Changing it makes existing secrets
        undecryptable.
      </SettingsHint>
      <div className="space-y-1 rounded-lg border border-border px-3 py-3 text-sm">
        <p>
          Status:{" "}
          <span className={key.exists ? "text-success" : "text-destructive"}>
            {key.exists ? "Found" : "Not found"}
          </span>
        </p>
        <p className="text-muted-foreground">Source: {source}</p>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Shield className="mt-0.5 size-3.5 shrink-0" />
          Key value is never displayed or downloaded. For production, use
          GLOBAL_SECRETS_ENCRYPTION_KEY.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy || Boolean(key.exists)}
          onClick={() => setCreateOpen(true)}
        >
          Create New
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={busy}
          onClick={() => setReplaceOpen(true)}
        >
          Replace
        </Button>
      </div>
      <ConfirmAction
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create encryption key?"
        description="A new key will be generated and stored. The value is never shown."
        confirmLabel="Create"
        onConfirm={() => void createKey()}
      />
      <Dialog
        open={replaceOpen}
        onOpenChange={(open) => {
          setReplaceOpen(open);
          if (!open) setReplaceValue("");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Replace encryption key</DialogTitle>
            <DialogDescription>
              Paste a new key (at least 32 characters). Existing secrets may
              become unreadable. The current key is never displayed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>New key</Label>
            <Textarea
              className="min-h-24 font-mono text-xs"
              value={replaceValue}
              onChange={(e) => setReplaceValue(e.target.value)}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReplaceOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void replaceKey()}
            >
              Replace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}
