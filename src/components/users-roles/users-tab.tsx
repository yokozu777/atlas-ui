"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { UserFormDialog } from "@/components/users-roles/user-form-dialog";
import {
  formatUserDate,
  type RoleRow,
  type UserRow,
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

export function UsersTab({
  users,
  roles,
  meId,
  meUsername,
  onReload,
}: {
  users: UserRow[];
  roles: RoleRow[];
  meId?: string;
  meUsername?: string;
  onReload: () => Promise<void> | void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserRow | null>(null);

  const filtered = useMemo(() => {
    const qtext = search.trim().toLowerCase();
    if (!qtext) return users;
    return users.filter((row) => {
      const hay = [
        row.username,
        row.email,
        row.is_active === false ? "inactive" : "active",
        ...(row.role_names ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(qtext);
    });
  }, [users, search]);

  const allChecked =
    filtered.length > 0 && filtered.every((row) => selected.includes(row.id));

  function isSelf(row: UserRow): boolean {
    return Boolean(
      (meId && row.id === meId) ||
        (meUsername && row.username === meUsername),
    );
  }

  async function remove(id: string) {
    try {
      await stargateJson(`/users/${encodeURIComponent(id)}`, { method: "DELETE" });
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
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus />
          Add User
        </Button>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title="No users found"
          description={
            search.trim() ? "No users match this search" : "Create the first user"
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
              <TableHead>Username</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last login</TableHead>
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
                <TableCell className="font-medium">{row.username}</TableCell>
                <TableCell className="text-muted-foreground">
                  {row.email || "—"}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(row.role_names ?? []).length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      (row.role_names ?? []).map((name) => (
                        <Badge key={name} variant="info">
                          {name}
                        </Badge>
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={row.is_active === false ? "secondary" : "success"}>
                    {row.is_active === false ? "Inactive" : "Active"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatUserDate(row.created_at)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.last_login ? formatUserDate(row.last_login) : "Never"}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => setEditUser(row)}
                    >
                      <Pencil />
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-destructive"
                      disabled={isSelf(row)}
                      onClick={() => setDeleteUser(row)}
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
      <UserFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        mode="create"
        roles={roles}
        isSelf={false}
        onSaved={onReload}
      />
      <UserFormDialog
        open={Boolean(editUser)}
        onOpenChange={(open) => {
          if (!open) setEditUser(null);
        }}
        mode="edit"
        user={editUser}
        roles={roles}
        isSelf={editUser ? isSelf(editUser) : false}
        onSaved={onReload}
      />
      <ConfirmAction
        open={Boolean(deleteUser)}
        onOpenChange={(open) => {
          if (!open) setDeleteUser(null);
        }}
        title="Delete this user?"
        description={deleteUser?.username || deleteUser?.id || ""}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteUser) void remove(deleteUser.id);
        }}
      />
    </div>
  );
}
