"use client";

import { useEffect, useState } from "react";
import {
  Ban,
  Info,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Server,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { CodeBlock } from "@/components/code-block";
import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { SettingsHint, SettingsSection } from "@/components/settings/settings-section";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { stargateJson } from "@/lib/stargate";

const ONLINE_TTL_SECONDS = 60;

type WorkerRuntime = "docker" | "local";

type WorkerRow = {
  id: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  lastSeenAt?: number;
  currentExecutionId?: string;
  tags?: string[];
  capabilities?: Record<string, unknown>;
  runtime?: string | null;
};

function formatLastSeen(ts?: number): string {
  if (!ts) return "Never";
  const sec = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hours = Math.floor(min / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function workerStatus(row: WorkerRow): "Online" | "Offline" | "Disabled" {
  if (row.enabled === false) return "Disabled";
  if (row.lastSeenAt && Date.now() / 1000 - row.lastSeenAt <= ONLINE_TTL_SECONDS) {
    return "Online";
  }
  return "Offline";
}

function workerRuntime(row: WorkerRow): WorkerRuntime | null {
  const value = (row.runtime ?? "").trim().toLowerCase();
  if (value === "docker" || value === "local") return value;
  return null;
}

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function WorkersTab() {
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [tags, setTags] = useState("default");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [details, setDetails] = useState<WorkerRow | null>(null);
  const [edit, setEdit] = useState<WorkerRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTags, setEditTags] = useState("");
  const [rotateId, setRotateId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function load() {
    const data = await stargateJson<{ workers?: WorkerRow[] }>("/admin/workers");
    setWorkers(data.workers ?? []);
  }

  useEffect(() => {
    void load().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, []);

  async function createWorker() {
    if (!name.trim()) {
      toast.error("Worker name is required");
      return;
    }
    setBusy(true);
    try {
      const data = await stargateJson<{ workerToken?: string }>("/admin/workers", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          tags: parseTags(tags),
        }),
      });
      setToken(data.workerToken ?? null);
      setAddOpen(false);
      setName("");
      setTags("default");
      toast.success("Worker created — copy the token now");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!edit) return;
    setBusy(true);
    try {
      await stargateJson(`/admin/workers/${edit.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription,
          tags: parseTags(editTags),
        }),
      });
      toast.success("Worker updated");
      setEdit(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(row: WorkerRow) {
    const enabled = row.enabled !== false;
    try {
      await stargateJson(
        `/admin/workers/${row.id}/${enabled ? "disable" : "enable"}`,
        { method: "POST", body: JSON.stringify({}) },
      );
      toast.success(enabled ? "Disabled" : "Enabled");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function rotate(id: string) {
    try {
      const data = await stargateJson<{ workerToken?: string }>(
        `/admin/workers/${id}/rotate-token`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setToken(data.workerToken ?? null);
      toast.success("Token rotated — copy the new token now");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function remove(id: string) {
    try {
      await stargateJson(`/admin/workers/${id}`, { method: "DELETE" });
      toast.success("Worker deleted");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function openDetails(id: string) {
    try {
      const data = await stargateJson<{ worker?: WorkerRow }>(
        `/admin/workers/${id}`,
      );
      setDetails(data.worker ?? { id });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  if (error) {
    return <EmptyState title="Workers unavailable" description={error} />;
  }

  return (
    <SettingsSection
      icon={<Server className="size-4" />}
      title="Worker agents"
      actions={
        <>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCw />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus />
            Add Worker
          </Button>
        </>
      }
    >
      {workers.length === 0 ? (
        <EmptyState title="No workers" description="Add a worker agent to claim jobs." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Last Seen</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workers.map((row) => {
              const status = workerStatus(row);
              const runtime = workerRuntime(row);
              return (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row.name ?? row.id}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {row.id}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        status === "Online"
                          ? "success"
                          : status === "Disabled"
                            ? "outline"
                            : "destructive"
                      }
                    >
                      {status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {runtime ? (
                      <Badge variant={runtime === "docker" ? "info" : "secondary"}>
                        {runtime}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatLastSeen(row.lastSeenAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(row.tags ?? []).length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        (row.tags ?? []).map((tag) => (
                          <Badge key={tag} variant="info">
                            {tag}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => void openDetails(row.id)}
                      >
                        <Info />
                        Details
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => {
                          setEdit(row);
                          setEditName(row.name || "");
                          setEditDescription(row.description || "");
                          setEditTags((row.tags ?? []).join(", "));
                        }}
                      >
                        <Pencil />
                        Edit
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setRotateId(row.id)}
                      >
                        <KeyRound />
                        Token
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => void toggle(row)}
                      >
                        <Ban />
                        {row.enabled === false ? "Enable" : "Disable"}
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setDeleteId(row.id)}
                      >
                        <Trash2 />
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <SettingsHint>
        <p className="mb-2 font-medium text-foreground">How to connect a worker agent</p>
        <ol className="list-decimal space-y-2 pl-4">
          <li>Create a worker and copy the token. It is shown only once.</li>
          <li>
            Set environment variables:
            <CodeBlock
              className="mt-2"
              label="env"
              value={`export WORKER_SERVER_URL=http://127.0.0.1:8000
export WORKER_TOKEN=your-token-here`}
            />
          </li>
          <li>
            Start the worker from atlas-ui:
            <CodeBlock
              className="mt-2"
              label="hub-worker"
              value="./scripts/hub-worker.sh"
            />
          </li>
        </ol>
      </SettingsHint>
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Worker</DialogTitle>
            <DialogDescription>
              The token is shown once after create.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Tags</Label>
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="default, local"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void createWorker()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(edit)}
        onOpenChange={(open) => {
          if (!open) setEdit(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit worker</DialogTitle>
            <DialogDescription>Name, description and tags.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tags</Label>
              <Input
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder="default, local"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void saveEdit()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(details)}
        onOpenChange={(open) => {
          if (!open) setDetails(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Worker details</DialogTitle>
            <DialogDescription>Token is never shown here.</DialogDescription>
          </DialogHeader>
          {details ? (
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Name</dt>
                <dd className="font-medium">{details.name || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">ID</dt>
                <dd className="font-mono text-xs">{details.id}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Status</dt>
                <dd>{workerStatus(details)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Type</dt>
                <dd>{workerRuntime(details) ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Last seen</dt>
                <dd>{formatLastSeen(details.lastSeenAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Tags</dt>
                <dd>{(details.tags ?? []).join(", ") || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Description</dt>
                <dd>{details.description || "—"}</dd>
              </div>
            </dl>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDetails(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(token)}
        onOpenChange={(open) => {
          if (!open) setToken(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Worker token</DialogTitle>
            <DialogDescription>
              Save this token. It is not shown again.
            </DialogDescription>
          </DialogHeader>
          <code className="block break-all rounded-md bg-muted p-2 font-mono text-xs">
            {token}
          </code>
          <DialogFooter>
            <Button
              onClick={() => {
                if (token) void navigator.clipboard.writeText(token);
                toast.success("Copied");
              }}
            >
              Copy
            </Button>
            <Button variant="ghost" onClick={() => setToken(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmAction
        open={Boolean(rotateId)}
        onOpenChange={(open) => {
          if (!open) setRotateId(null);
        }}
        title="Rotate this worker token?"
        description="The old token stops working immediately."
        confirmLabel="Rotate"
        destructive
        onConfirm={() => {
          if (rotateId) void rotate(rotateId);
        }}
      />
      <ConfirmAction
        open={Boolean(deleteId)}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
        title="Delete this worker?"
        description={deleteId || ""}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteId) void remove(deleteId);
        }}
      />
    </SettingsSection>
  );
}
