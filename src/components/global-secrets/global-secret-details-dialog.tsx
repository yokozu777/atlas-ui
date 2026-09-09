"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  formatSecretDate,
  globalSecretTypeLabel,
  type GlobalSecretRow,
} from "@/components/global-secrets/types";
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  secretId: string | null;
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

  const rows = details
    ? [
        ["Name", details.name || "—"],
        ["Type", globalSecretTypeLabel(details.type)],
        ["Username", details.metadata?.username || details.username || "—"],
        ["Description", details.description || "—"],
        ["Created", formatSecretDate(details.createdAt)],
        ["Updated", formatSecretDate(details.updatedAt)],
        ["Last used", "Never"],
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
              <dd className="font-medium">{value}</dd>
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
