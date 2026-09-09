"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSetup } from "@/lib/api";

export function SetupForm({
  defaultPath = "",
  submitLabel = "Save and probe",
  redirectTo = "/projects",
}: {
  defaultPath?: string;
  submitLabel?: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [path, setPath] = useState(defaultPath);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await saveSetup(path);
      toast.success(result.version || "clusterctl OK");
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="p-6">
      <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-4">
        <div className="space-y-2">
          <Label htmlFor="clusterctl-root">atlas-clusterctl checkout</Label>
          <Input
            id="clusterctl-root"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/home/you/git/atlas-clusterctl"
            required
          />
          <p className="text-xs text-muted-foreground">
            Absolute path, or relative to the atlas-ui process cwd (e.g.
            ../atlas-clusterctl). Must contain ./cluster and
            clusterctl/__main__.py.
          </p>
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Checking…" : submitLabel}
        </Button>
      </form>
    </Panel>
  );
}
