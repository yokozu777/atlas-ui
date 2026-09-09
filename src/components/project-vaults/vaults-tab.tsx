"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import {
  keyNameOf,
  type VaultKeyRow,
  type VaultRow,
} from "@/components/project-vaults/types";
import { VaultFormDialog } from "@/components/project-vaults/vault-form-dialog";
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

export function VaultsTab({
  projectId,
  vaults,
  keys,
  onReload,
  onGoToKeys,
}: {
  projectId: string;
  vaults: VaultRow[];
  keys: VaultKeyRow[];
  onReload: () => Promise<void> | void;
  onGoToKeys: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editVault, setEditVault] = useState<VaultRow | null>(null);
  const [deleteVault, setDeleteVault] = useState<VaultRow | null>(null);

  const filtered = useMemo(() => {
    const qtext = search.trim().toLowerCase();
    if (!qtext) return vaults;
    return vaults.filter((row) => {
      const hay = [
        row.name,
        row.vaultId,
        row.keyName,
        keyNameOf(keys, row.keyId),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(qtext);
    });
  }, [vaults, keys, search]);

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
      await stargateJson(`/projects/${projectId}/vaults/${id}`, {
        method: "DELETE",
      });
      toast.success("Deleted");
      setSelected((current) => current.filter((item) => item !== id));
      await onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  if (keys.length === 0) {
    return (
      <EmptyState
        title="No vault keys"
        description={
          <>
            Create a key before adding a vault.{" "}
            <Button
              type="button"
              variant="link"
              className="h-auto p-0"
              onClick={onGoToKeys}
            >
              Go to Keys
            </Button>
          </>
        }
      />
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="relative min-w-56 flex-1 max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            placeholder="Search vaults..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus />
          Add Vault
        </Button>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title="No vaults found"
          description={
            search.trim()
              ? "No vaults match this search"
              : "Get started by creating your first vault"
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
              <TableHead>Vault id</TableHead>
              <TableHead>Key</TableHead>
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
                  <TableCell className="font-medium">
                    {row.name || id || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.vaultId || "—"}
                  </TableCell>
                  <TableCell>{row.keyName || keyNameOf(keys, row.keyId)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setEditVault(row)}
                      >
                        <Pencil />
                        Edit
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setDeleteVault(row)}
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
      <VaultFormDialog
        projectId={projectId}
        open={addOpen}
        onOpenChange={setAddOpen}
        mode="create"
        keys={keys}
        onSaved={onReload}
      />
      <VaultFormDialog
        projectId={projectId}
        open={Boolean(editVault)}
        onOpenChange={(open) => {
          if (!open) setEditVault(null);
        }}
        mode="edit"
        vault={editVault}
        keys={keys}
        onSaved={onReload}
      />
      <ConfirmAction
        open={Boolean(deleteVault)}
        onOpenChange={(open) => {
          if (!open) setDeleteVault(null);
        }}
        title="Delete this vault?"
        description={deleteVault?.name || deleteVault?.id || ""}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteVault?.id) void remove(deleteVault.id);
        }}
      />
    </div>
  );
}
