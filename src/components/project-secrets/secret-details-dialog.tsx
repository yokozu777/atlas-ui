"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  formatSecretDate,
  secretTypeLabel,
  type SecretDetails,
} from "@/components/project-secrets/types";
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

function materialLine(
  label: string,
  material?: { present?: boolean; length?: number },
): string {
  if (!material?.present) return `${label}: not stored`;
  const length = material.length ?? 0;
  return length ? `${label}: stored (${length} chars)` : `${label}: stored`;
}

export function SecretDetailsDialog({
  projectId,
  open,
  onOpenChange,
  name,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string | null;
}) {
  const q = `project_id=${encodeURIComponent(projectId)}`;
  const [details, setDetails] = useState<SecretDetails | null>(null);

  useEffect(() => {
    if (!open || !name) {
      setDetails(null);
      return;
    }
    let cancelled = false;
    void stargateJson<{ secret?: SecretDetails }>(
      `/secrets/${encodeURIComponent(name)}?${q}`,
    )
      .then((data) => {
        if (!cancelled) setDetails(data.secret ?? { name });
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [open, name, q]);

  const rows = details
    ? [
        ["Name", details.name || "—"],
        ["Type", secretTypeLabel(details.type)],
        ["Username", details.username || "—"],
        ["Description", details.description || "—"],
        ["Created", formatSecretDate(details.createdAt)],
        ["Updated", formatSecretDate(details.updatedAt)],
        [
          "Material",
          details.type === "login_password"
            ? materialLine("Password", details.material?.password)
            : [
                materialLine("Private key", details.material?.privateKey),
                materialLine("Passphrase", details.material?.passphrase),
              ].join("\n"),
        ],
      ]
    : [];
  const publicKey = (details?.publicKey || "").trim();

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
              <dd className="whitespace-pre-wrap font-medium">{value}</dd>
            </div>
          ))}
          {details?.type === "ssh_key" && publicKey ? (
            <div>
              <dt className="text-xs text-muted-foreground">Public key</dt>
              <dd className="mt-1 max-h-32 overflow-auto rounded-md border bg-black/50 p-2 font-mono text-xs whitespace-pre-wrap break-all">
                {publicKey}
              </dd>
            </div>
          ) : null}
        </dl>
        <DialogFooter>
          {details?.type === "ssh_key" && name ? (
            <SecretKeyDownloadMenu
              kind="project"
              projectId={projectId}
              name={name}
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
