"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { KeyFormDialog } from "@/components/project-vaults/key-form-dialog";
import {
  formatVaultDate,
  vaultKeyTypeLabel,
  type VaultKeyRow,
} from "@/components/project-vaults/types";
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

export function VaultKeysTab({
  projectId,
  keys,
  onReload,
}: {
  projectId: string;
  keys: VaultKeyRow[];
  onReload: () => Promise<void> | void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editKey, setEditKey] = useState<VaultKeyRow | null>(null);
  const [deleteKey, setDeleteKey] = useState<VaultKeyRow | null>(null);

  const filtered = useMemo(() => {
    const qtext = search.trim().toLowerCase();
    if (!qtext) return keys;
    return keys.filter((row) => {
      const hay = [row.name, vaultKeyTypeLabel(row.type)].join(" ").toLowerCase();
      return hay.includes(qtext);
    });
  }, [keys, search]);

  const allChecked =
    filtered.length > 0 &&
    filtered.every((row) => row.id && selected.includes(row.id));

  function toggleAll(checked: boolean) {
    const ids = filtered
      .map((row) => row.id)
      .filter((id): id is string => Boolean(id));
    if (checked) {
      setSelected([...new Set([...selected, ...ids])]);
      return;
    }
    const drop = new Set(ids);
    setSelected(selected.filter((id) => !drop.has(id)));
  }

  async function remove(id: string) {
    try {
      await stargateJson(`/projects/${projectId}/vault-keys/${id}`, {
        method: "DELETE",
      });
      toast.success("Deleted");
      setSelected((current) => current.filter((item) => item !== id));
      await onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="relative min-w-56 flex-1 max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            placeholder="Search keys..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus />
          Add Key
        </Button>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title="No keys found"
          description={
            search.trim()
              ? "No keys match this search"
              : "Get started by creating your first vault key"
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
              <TableHead>Type</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => {
              const id = row.id || "";
              return (
                <TableRow key={id || row.name}>
                  <TableCell>
                    {id ? (
                      <Checkbox
                        checked={selected.includes(id)}
                        onCheckedChange={(value) =>
                          setSelected(
                            value === true
                              ? [...selected, id]
                              : selected.filter((item) => item !== id),
                          )
                        }
                      />
                    ) : null}
                  </TableCell>
                  <TableCell className="font-medium">{row.name || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="info">{vaultKeyTypeLabel(row.type)}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatVaultDate(row.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setEditKey(row)}
                      >
                        <Pencil />
                        Edit
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setDeleteKey(row)}
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
      <KeyFormDialog
        projectId={projectId}
        open={addOpen}
        onOpenChange={setAddOpen}
        mode="create"
        onSaved={onReload}
      />
      <KeyFormDialog
        projectId={projectId}
        open={Boolean(editKey)}
        onOpenChange={(open) => {
          if (!open) setEditKey(null);
        }}
        mode="edit"
        vaultKey={editKey}
        onSaved={onReload}
      />
      <ConfirmAction
        open={Boolean(deleteKey)}
        onOpenChange={(open) => {
          if (!open) setDeleteKey(null);
        }}
        title="Delete this vault key?"
        description={deleteKey?.name || deleteKey?.id || ""}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteKey?.id) void remove(deleteKey.id);
        }}
      />
    </div>
  );
}
