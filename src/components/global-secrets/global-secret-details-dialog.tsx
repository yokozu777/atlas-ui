"use client";

import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import {
  formatSecretDate,
  globalSecretTypeLabel,
  isSshSecretType,
  secretFingerprint,
  secretPublicKey,
  secretUsername,
  type GlobalSecretRow,
} from "@/components/global-secrets/types";
import { SecretKeyDownloadMenu } from "@/components/secret-key-download";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { stargateJson } from "@/lib/stargate";

export function GlobalSecretDetailsDialog({
  open,
  onOpenChange,
  secretId,
  clusterctlSecretId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  secretId: string | null;
  clusterctlSecretId?: string | null;
}) {
  const [details, setDetails] = useState<GlobalSecretRow | null>(null);

  useEffect(() => {
    if (!open || !secretId) {
      setDetails(null);
      return;
    }
    let cancelled = false;
    void stargateJson<{ secret?: GlobalSecretRow }>(
      `/global/secrets/${encodeURIComponent(secretId)}`,
    )
      .then((data) => {
        if (!cancelled) setDetails(data.secret ?? { id: secretId });
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [open, secretId]);

  const publicKey = secretPublicKey(details);
  const fingerprint = secretFingerprint(details);
  const rows = details
    ? [
        ["Name", details.name || "—"],
        ["Type", globalSecretTypeLabel(details.type)],
        ["Username", secretUsername(details) || "—"],
        [
          "Registry",
          details.type === "basic_auth"
            ? details.metadata?.registry || "—"
            : "",
        ],
        ["Description", details.description || "—"],
        ["Fingerprint", fingerprint || "—"],
        [
          "clusterctl SSH",
          details.id && clusterctlSecretId === details.id ? "Yes" : "No",
        ],
        ["Created", formatSecretDate(details.createdAt)],
        ["Updated", formatSecretDate(details.updatedAt)],
        ["Last used", "Never"],
      ].filter(([, value]) => value !== "")
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Secret details</DialogTitle>
          <DialogDescription>
            Private key material is hidden here. Download public or private keys
            from this dialog or the Secrets page.
          </DialogDescription>
        </DialogHeader>
        <dl className="space-y-3 text-sm">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-medium break-all">{value}</dd>
            </div>
          ))}
          {isSshSecretType(details?.type) && publicKey ? (
            <div>
              <dt className="text-xs text-muted-foreground">Public key</dt>
              <dd className="mt-1 flex items-start gap-2">
                <pre className="max-h-32 flex-1 overflow-auto rounded-md border bg-black/50 p-2 font-mono text-xs whitespace-pre-wrap break-all">
                  {publicKey}
                </pre>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Copy public key"
                  onClick={() => {
                    void navigator.clipboard.writeText(publicKey);
                    toast.success("Public key copied");
                  }}
                >
                  <Copy />
                </Button>
              </dd>
            </div>
          ) : null}
        </dl>
        <DialogFooter>
          {isSshSecretType(details?.type) && secretId ? (
            <SecretKeyDownloadMenu
              kind="global"
              name={details?.name || secretId}
              secretId={secretId}
            />
          ) : null}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
