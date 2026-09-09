"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useAtlasClusterSelection } from "@/components/atlas-cluster-selection";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { SecretRow } from "@/components/hosts-groups/types";
import { projectApiQuery, withClusterId } from "@/components/hosts-groups/helpers";
import { stargateJson } from "@/lib/stargate";

export function ConnectionDialog({
  projectId,
  open,
  onOpenChange,
  host,
  secrets,
  inventoryFile,
  initialSecret,
  initialUser,
  initialPort,
  onSaved,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  host: string;
  secrets: SecretRow[];
  inventoryFile: string;
  initialSecret?: string;
  initialUser?: string;
  initialPort?: string;
  onSaved: () => Promise<void> | void;
}) {
  const { clusterId } = useAtlasClusterSelection();
  const q = projectApiQuery(projectId, clusterId);
  const [secret, setSecret] = useState("");
  const [user, setUser] = useState("root");
  const [port, setPort] = useState("22");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSecret(initialSecret || secrets[0]?.name || "");
    setUser(initialUser || "root");
    setPort(initialPort || "22");
  }, [open, initialSecret, initialUser, initialPort, secrets]);

  async function submit() {
    if (!host) {
      toast.error("Host is required");
      return;
    }
    if (!secret) {
      toast.error("Select a connection secret");
      return;
    }
    setBusy(true);
    try {
      await stargateJson(`/hosts/${encodeURIComponent(host)}/connection-secret?${q}`, {
        method: "PUT",
        body: JSON.stringify(
          withClusterId(
            {
              secretName: secret,
              ansibleUser: user,
              port,
              project_id: projectId,
              inventory_file: inventoryFile,
            },
            clusterId,
          ),
        ),
      });
      toast.success(`Connection saved for ${host}`);
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connection</DialogTitle>
          <DialogDescription>
            Bind an SSH secret to {host || "the host"}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Secret</Label>
            <Select value={secret} onValueChange={(value) => setSecret(value ?? "")}>
              <SelectTrigger className="w-full">
                <span className="min-w-0 flex-1 truncate text-left">
                  {secret || "Select secret"}
                </span>
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger>
                {secrets.map((row) => (
                  <SelectItem key={row.name} value={row.name || ""}>
                    {row.name}
                    {row.type ? ` (${row.type})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>User</Label>
              <Input value={user} onChange={(e) => setUser(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Port</Label>
              <Input value={port} onChange={(e) => setPort(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
