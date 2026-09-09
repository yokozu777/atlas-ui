"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  formatSecretDate,
  secretTypeLabel,
  type SecretDetails,
} from "@/components/project-secrets/types";
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Secret details</DialogTitle>
          <DialogDescription>
            Stored values are never displayed after save.
          </DialogDescription>
        </DialogHeader>
        <dl className="space-y-3 text-sm">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="whitespace-pre-wrap font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
