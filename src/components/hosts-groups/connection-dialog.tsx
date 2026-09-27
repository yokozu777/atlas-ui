"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { useAtlasClusterSelection } from "@/components/atlas-cluster-selection";
import { SecretFormDialog } from "@/components/project-secrets/secret-form-dialog";
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
  SelectSeparator,
  SelectTrigger,
} from "@/components/ui/select";
import type { SecretRow } from "@/components/hosts-groups/types";
import { projectApiQuery, withClusterId } from "@/components/hosts-groups/helpers";
import { useCan } from "@/lib/authz";
import { stargateJson } from "@/lib/stargate";

const ATLAS_DEFAULT = "__atlas__";
const CREATE_SECRET = "__create__";

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
  atlasSshName,
  onSaved,
  onSecretsChange,
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
  atlasSshName?: string | null;
  onSaved: () => Promise<void> | void;
  onSecretsChange?: () => Promise<void> | void;
}) {
  const { clusterId } = useAtlasClusterSelection();
  const can = useCan();
  const q = projectApiQuery(projectId, clusterId);
  const [secret, setSecret] = useState("");
  const [user, setUser] = useState("root");
  const [port, setPort] = useState("22");
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setAddOpen(false);
      return;
    }
    setSecret(initialSecret || (atlasSshName ? ATLAS_DEFAULT : secrets[0]?.name || ""));
    setUser(initialUser || "root");
    setPort(initialPort || "22");
    // Snapshot connection fields when the dialog opens, not when secrets reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, host]);

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
              secretName: secret === ATLAS_DEFAULT ? null : secret,
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

  const triggerLabel =
    secret === ATLAS_DEFAULT
      ? `Atlas key (${atlasSshName})`
      : secret || "Select secret";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connection</DialogTitle>
            <DialogDescription>
              {atlasSshName
                ? "Override is used for Check/Facts in this UI. Provision always uses the Atlas SSH key."
                : `Bind an SSH secret to ${host || "the host"}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Secret</Label>
              <Select
                value={secret}
                onValueChange={(value) => {
                  if (value === CREATE_SECRET) {
                    setAddOpen(true);
                    return;
                  }
                  setSecret(value ?? "");
                }}
              >
                <SelectTrigger className="w-full">
                  <span className="min-w-0 flex-1 truncate text-left">
                    {triggerLabel}
                  </span>
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger>
                  {atlasSshName ? (
                    <SelectItem value={ATLAS_DEFAULT}>
                      Atlas key ({atlasSshName})
                    </SelectItem>
                  ) : null}
                  {secrets.map((row) => (
                    <SelectItem key={row.name} value={row.name || ""}>
                      {row.name}
                      {row.type ? ` (${row.type})` : ""}
                    </SelectItem>
                  ))}
                  {can("secrets.create") ? (
                    <>
                      <SelectSeparator />
                      <SelectItem value={CREATE_SECRET}>
                        <span className="flex items-center gap-2">
                          <Plus className="size-3.5" />
                          Create new secret
                        </span>
                      </SelectItem>
                    </>
                  ) : null}
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
      <SecretFormDialog
        projectId={projectId}
        open={addOpen}
        onOpenChange={setAddOpen}
        mode="create"
        sshOnly
        title="Add Secret"
        description="Create a project SSH secret for Check/Facts on this host. Provision still uses the Atlas SSH key."
        onSaved={async (created) => {
          await onSecretsChange?.();
          if (created?.name) setSecret(created.name);
        }}
      />
    </>
  );
}
