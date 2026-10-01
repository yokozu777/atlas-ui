"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/empty-state";
import { useAuthz } from "@/lib/authz";
import {
  createHypervisor,
  deleteHypervisor,
  listHypervisors,
  testHypervisor,
  updateHypervisor,
  type Hypervisor,
} from "@/lib/proxmox";

type Draft = {
  id?: string;
  name: string;
  host: string;
  port: string;
  apiUser: string;
  sshUser: string;
  password: string;
  createToken: boolean;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  host: "",
  port: "8006",
  apiUser: "root@pam",
  sshUser: "root",
  password: "",
  createToken: true,
};

export function HypervisorsPage() {
  const { ready, can } = useAuthz();
  const canWrite = can("settings.update");
  const [rows, setRows] = useState<Hypervisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);

  async function reload() {
    const next = await listHypervisors();
    setRows(next);
  }

  useEffect(() => {
    if (!ready || !can("settings.read")) return;
    let cancelled = false;
    void listHypervisors()
      .then((next) => {
        if (!cancelled) setRows(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [can, ready]);

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const port = Number(draft.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      toast.error("Port is invalid");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: draft.name.trim(),
        host: draft.host.trim(),
        port,
        apiUser: draft.apiUser.trim(),
        sshUser: draft.sshUser.trim(),
        password: draft.password,
        createToken: draft.createToken,
      };
      const saved = draft.id
        ? await updateHypervisor(draft.id, payload)
        : await createHypervisor(payload);
      await reload();
      if (saved.error) {
        if (saved.hypervisor?.id) {
          setDraft({ ...draft, id: saved.hypervisor.id, password: "" });
        }
        toast.error(saved.error);
        return;
      }
      setDraft(null);
      const nodes = (saved.nodes ?? []).filter(Boolean).join(", ");
      toast.success(
        saved.tokenId
          ? `Token ${saved.tokenId} created${nodes ? `. Nodes: ${nodes}` : ""}`
          : "Saved",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onTest(id: string) {
    setTesting(id);
    try {
      const result = await testHypervisor(id);
      const names = result.nodes.length ? result.nodes.join(", ") : "no nodes";
      toast.success(`Connected: ${names}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(null);
    }
  }

  async function onDelete() {
    if (!removeId) return;
    setBusy(true);
    try {
      await deleteHypervisor(removeId);
      setRemoveId(null);
      await reload();
      toast.success("Removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <EmptyState title="Loading hypervisors" />;
  if (!can("settings.read")) {
    return <EmptyState title="Forbidden" description="settings.read required" />;
  }

  return (
    <div>
      <PageHeader
        kicker="System"
        title="Hypervisors"
        description="Proxmox servers used to fill host, storage, bridge, and node lists."
        actions={
          canWrite ? (
            <Button type="button" onClick={() => setDraft({ ...EMPTY_DRAFT })}>
              Add server
            </Button>
          ) : null
        }
      />
      {error ? (
        <EmptyState title="Hypervisors unavailable" description={error} />
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No Proxmox servers"
          description="Add a server to use its nodes, storages, and bridges in cluster setup."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Host</th>
                <th className="px-3 py-2 font-medium">API user</th>
                <th className="px-3 py-2 font-medium">SSH user</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {row.host}:{row.port}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{row.apiUser}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.sshUser}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!canWrite || testing === row.id}
                        onClick={() => void onTest(row.id)}
                      >
                        {testing === row.id ? "Testing…" : "Test"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!canWrite}
                        onClick={() =>
                          setDraft({
                            id: row.id,
                            name: row.name,
                            host: row.host,
                            port: String(row.port),
                            apiUser: row.apiUser,
                            sshUser: row.sshUser,
                            password: "",
                            createToken: true,
                          })
                        }
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!canWrite}
                        onClick={() => setRemoveId(row.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-w-md">
          <DialogTitle>{draft?.id ? "Edit Proxmox server" : "Add Proxmox server"}</DialogTitle>
          <DialogDescription>
            The password is stored encrypted. With the token option on, it is used once
            to create an API token and load nodes, storages, and bridges.
          </DialogDescription>
          {draft ? (
            <form className="mt-4 space-y-3" onSubmit={onSave}>
              <Field label="Name" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
              <Field label="API host" value={draft.host} onChange={(host) => setDraft({ ...draft, host })} />
              <Field label="API port" value={draft.port} onChange={(port) => setDraft({ ...draft, port })} />
              <Field
                label="API user"
                value={draft.apiUser}
                onChange={(apiUser) => setDraft({ ...draft, apiUser })}
              />
              <Field
                label="SSH user"
                value={draft.sshUser}
                onChange={(sshUser) => setDraft({ ...draft, sshUser })}
              />
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Password</Label>
                <Input
                  type="password"
                  autoComplete="off"
                  value={draft.password}
                  placeholder={draft.id ? "Leave blank to keep the saved password" : ""}
                  required={!draft.id}
                  onChange={(event) => setDraft({ ...draft, password: event.target.value })}
                />
              </div>
              <label className="flex items-start gap-2 pt-1 text-sm">
                <Checkbox
                  checked={draft.createToken}
                  disabled={busy}
                  aria-label="Create API token"
                  className="mt-0.5"
                  onCheckedChange={(value) =>
                    setDraft({ ...draft, createToken: value === true })
                  }
                />
                <span>
                  <span className="block">Create API token</span>
                  <span className="block text-xs text-muted-foreground">
                    Creates the token without privilege separation, then loads nodes,
                    storages, and bridges for the setup lists.
                  </span>
                </span>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? (draft.createToken ? "Creating token…" : "Saving…") : "Save"}
                </Button>
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmAction
        open={removeId !== null}
        onOpenChange={(open) => !open && setRemoveId(null)}
        title="Remove this Proxmox server?"
        description="Cluster setup will stop offering its nodes, storages, and bridges."
        confirmLabel="Remove"
        destructive
        onConfirm={() => void onDelete()}
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} required onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
