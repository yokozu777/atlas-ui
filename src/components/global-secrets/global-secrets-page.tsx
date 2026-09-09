"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, KeyRound, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { GlobalSecretDetailsDialog } from "@/components/global-secrets/global-secret-details-dialog";
import { GlobalSecretFormDialog } from "@/components/global-secrets/global-secret-form-dialog";
import {
  formatSecretDate,
  globalSecretTypeLabel,
  type GlobalSecretRow,
} from "@/components/global-secrets/types";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { stargateJson } from "@/lib/stargate";

export function GlobalSecretsPage() {
  const [secrets, setSecrets] = useState<GlobalSecretRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editSecret, setEditSecret] = useState<GlobalSecretRow | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [deleteSecret, setDeleteSecret] = useState<GlobalSecretRow | null>(null);

  async function load() {
    const data = await stargateJson<{ secrets?: GlobalSecretRow[] }>(
      "/global/secrets",
    );
    setSecrets(data.secrets ?? []);
  }

  useEffect(() => {
    void load().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, []);

  const filtered = useMemo(() => {
    const qtext = search.trim().toLowerCase();
    if (!qtext) return secrets;
    return secrets.filter((row) => {
      const hay = [
        row.name,
        row.type,
        globalSecretTypeLabel(row.type),
        row.description,
        row.metadata?.username,
        row.username,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(qtext);
    });
  }, [secrets, search]);

  const allChecked =
    filtered.length > 0 && filtered.every((row) => selected.includes(row.id));

  function toggleAll(checked: boolean) {
    const ids = filtered.map((row) => row.id);
    if (checked) {
      setSelected([...new Set([...selected, ...ids])]);
      return;
    }
    const drop = new Set(ids);
    setSelected(selected.filter((id) => !drop.has(id)));
  }

  async function remove(id: string) {
    try {
      await stargateJson(`/global/secrets/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      toast.success("Deleted");
      setSelected((current) => current.filter((item) => item !== id));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  if (error) {
    return <EmptyState title="Secrets unavailable" description={error} />;
  }

  return (
    <div>
      <PageHeader
        kicker="System"
        title="Secrets Manager"
        description={
          <div className="space-y-3">
            <p>Organization credentials for integrations (Git, registries, etc.)</p>
            <Badge variant="info">Global scope</Badge>
          </div>
        }
      />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="relative min-w-56 flex-1 max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            placeholder="Search by name, type, or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus />
          Add Secret
        </Button>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title="No secrets found"
          description={
            search.trim()
              ? "No secrets match this search"
              : "Get started by creating your first secret"
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={(value) => toggleAll(value === true)}
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Last Used</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Checkbox
                    checked={selected.includes(row.id)}
                    onCheckedChange={(value) =>
                      setSelected(
                        value === true
                          ? [...selected, row.id]
                          : selected.filter((item) => item !== row.id),
                      )
                    }
                  />
                </TableCell>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {row.description || "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="info">
                    <KeyRound />
                    {globalSecretTypeLabel(row.type)}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatSecretDate(row.createdAt)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatSecretDate(row.updatedAt)}
                </TableCell>
                <TableCell className="text-muted-foreground">Never</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => setViewId(row.id)}
                    >
                      <Eye />
                      View
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => setEditSecret(row)}
                    >
                      <Pencil />
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setDeleteSecret(row)}
                    >
                      <Trash2 />
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <GlobalSecretFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        mode="create"
        onSaved={load}
      />
      <GlobalSecretFormDialog
        open={Boolean(editSecret)}
        onOpenChange={(open) => {
          if (!open) setEditSecret(null);
        }}
        mode="edit"
        secret={editSecret}
        onSaved={load}
      />
      <GlobalSecretDetailsDialog
        open={Boolean(viewId)}
        onOpenChange={(open) => {
          if (!open) setViewId(null);
        }}
        secretId={viewId}
      />
      <ConfirmAction
        open={Boolean(deleteSecret)}
        onOpenChange={(open) => {
          if (!open) setDeleteSecret(null);
        }}
        title="Delete this secret?"
        description={deleteSecret?.name || deleteSecret?.id || ""}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteSecret) void remove(deleteSecret.id);
        }}
      />
    </div>
  );
}
