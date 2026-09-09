"use client";

import { FolderTree, Pencil, Plus, Search, Trash2 } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
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
import { groupBadgeVariant } from "@/components/hosts-groups/helpers";
import type { GroupInfo } from "@/components/hosts-groups/types";

export function GroupsTab({
  groups,
  inventoryFile,
  search,
  onSearchChange,
  selected,
  onSelectedChange,
  onAddGroup,
  onEditHosts,
  onDelete,
}: {
  groups: Record<string, GroupInfo>;
  inventoryFile: string;
  search: string;
  onSearchChange: (value: string) => void;
  selected: string[];
  onSelectedChange: (next: string[]) => void;
  onAddGroup: () => void;
  onEditHosts: (group: string) => void;
  onDelete: (group: string) => void;
}) {
  const rows = Object.entries(groups)
    .map(([name, info]) => ({
      name,
      hosts: info.hosts ?? [],
      children: info.children ?? [],
    }))
    .filter((row) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        row.hosts.some((host) => host.toLowerCase().includes(q))
      );
    });
  const allChecked =
    rows.length > 0 && rows.every((row) => selected.includes(row.name));

  function toggleAll(checked: boolean) {
    if (checked) {
      onSelectedChange([...new Set([...selected, ...rows.map((row) => row.name)])]);
      return;
    }
    const drop = new Set(rows.map((row) => row.name));
    onSelectedChange(selected.filter((name) => !drop.has(name)));
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <FolderTree className="size-4" />
          Groups
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onAddGroup}>
            <Plus />
            Add Group
          </Button>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 w-52 pl-8"
              placeholder="Search groups..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No groups" description="Add a group to the inventory." />
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
              <TableHead>Group Name</TableHead>
              <TableHead>Hosts</TableHead>
              <TableHead>Connection</TableHead>
              <TableHead>Children</TableHead>
              <TableHead>Inventory File</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.name}>
                <TableCell>
                  <Checkbox
                    checked={selected.includes(row.name)}
                    onCheckedChange={(value) =>
                      onSelectedChange(
                        value === true
                          ? [...selected, row.name]
                          : selected.filter((item) => item !== row.name),
                      )
                    }
                  />
                </TableCell>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="max-w-xs whitespace-normal font-mono text-xs text-muted-foreground">
                  {row.hosts.length === 0
                    ? "—"
                    : `${row.hosts.join(" ")} (${row.hosts.length})`}
                </TableCell>
                <TableCell className="text-muted-foreground">—</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {row.children.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      row.children.map((child) => (
                        <Badge key={child} variant={groupBadgeVariant(child)}>
                          {child}
                        </Badge>
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {inventoryFile || "—"}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => onEditHosts(row.name)}
                    >
                      <Pencil />
                      Edit Hosts
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => onDelete(row.name)}
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
    </div>
  );
}
