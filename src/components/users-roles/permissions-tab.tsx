"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { PermissionFormDialog } from "@/components/users-roles/permission-form-dialog";
import type { PermissionRow } from "@/components/users-roles/types";
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

export function PermissionsTab({
  permissions,
  onReload,
}: {
  permissions: PermissionRow[];
  onReload: () => Promise<void> | void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editPermission, setEditPermission] = useState<PermissionRow | null>(null);
  const [deletePermission, setDeletePermission] = useState<PermissionRow | null>(
    null,
  );

  const filtered = useMemo(() => {
    const qtext = search.trim().toLowerCase();
    if (!qtext) return permissions;
    return permissions.filter((row) => {
      const hay = [row.name, row.resource, row.action, row.description]
        .join(" ")
        .toLowerCase();
      return hay.includes(qtext);
    });
  }, [permissions, search]);

  const allChecked =
    filtered.length > 0 && filtered.every((row) => selected.includes(row.id));

  async function remove(id: string) {
    try {
      await stargateJson(`/permissions/${encodeURIComponent(id)}`, {
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
            placeholder="Search permissions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus />
          Add Permission
        </Button>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title="No permissions found"
          description={
            search.trim()
              ? "No permissions match this search"
              : "Create the first permission"
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={(value) => {
                    const ids = filtered.map((row) => row.id);
                    if (value === true) {
                      setSelected([...new Set([...selected, ...ids])]);
                      return;
                    }
                    const drop = new Set(ids);
                    setSelected(selected.filter((id) => !drop.has(id)));
                  }}
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Description</TableHead>
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
                <TableCell>{row.resource}</TableCell>
                <TableCell>{row.action}</TableCell>
                <TableCell className="text-muted-foreground">
                  {row.description || "—"}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => setEditPermission(row)}
                    >
                      <Pencil />
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setDeletePermission(row)}
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
      <PermissionFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        mode="create"
        onSaved={onReload}
      />
      <PermissionFormDialog
        open={Boolean(editPermission)}
        onOpenChange={(open) => {
          if (!open) setEditPermission(null);
        }}
        mode="edit"
        permission={editPermission}
        onSaved={onReload}
      />
      <ConfirmAction
        open={Boolean(deletePermission)}
        onOpenChange={(open) => {
          if (!open) setDeletePermission(null);
        }}
        title="Delete this permission?"
        description={deletePermission?.name || deletePermission?.id || ""}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deletePermission) void remove(deletePermission.id);
        }}
      />
    </div>
  );
}
