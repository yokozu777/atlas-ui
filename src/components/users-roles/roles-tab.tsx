"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { RoleFormDialog } from "@/components/users-roles/role-form-dialog";
import {
  formatUserDate,
  type PermissionRow,
  type RoleRow,
} from "@/components/users-roles/types";
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

export function RolesTab({
  roles,
  permissions,
  onReload,
}: {
  roles: RoleRow[];
  permissions: PermissionRow[];
  onReload: () => Promise<void> | void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editRole, setEditRole] = useState<RoleRow | null>(null);
  const [deleteRole, setDeleteRole] = useState<RoleRow | null>(null);

  const filtered = useMemo(() => {
    const qtext = search.trim().toLowerCase();
    if (!qtext) return roles;
    return roles.filter((row) => {
      const hay = [row.name, row.description, ...(row.permission_names ?? [])]
        .join(" ")
        .toLowerCase();
      return hay.includes(qtext);
    });
  }, [roles, search]);

  const allChecked =
    filtered.length > 0 && filtered.every((row) => selected.includes(row.id));

  async function remove(id: string) {
    try {
      await stargateJson(`/roles/${encodeURIComponent(id)}`, { method: "DELETE" });
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
            placeholder="Search roles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus />
          Add Role
        </Button>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title="No roles found"
          description={
            search.trim() ? "No roles match this search" : "Create the first role"
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
              <TableHead>Description</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => {
              const names = row.permission_names ?? [];
              return (
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
                    <Badge variant="info">{names.length}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatUserDate(row.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setEditRole(row)}
                      >
                        <Pencil />
                        Edit
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setDeleteRole(row)}
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
      <RoleFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        mode="create"
        permissions={permissions}
        onSaved={onReload}
      />
      <RoleFormDialog
        open={Boolean(editRole)}
        onOpenChange={(open) => {
          if (!open) setEditRole(null);
        }}
        mode="edit"
        role={editRole}
        permissions={permissions}
        onSaved={onReload}
      />
      <ConfirmAction
        open={Boolean(deleteRole)}
        onOpenChange={(open) => {
          if (!open) setDeleteRole(null);
        }}
        title="Delete this role?"
        description={deleteRole?.name || deleteRole?.id || ""}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteRole) void remove(deleteRole.id);
        }}
      />
    </div>
  );
}
