"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import {
  flattenRoles,
  type RoleNode,
  type RoleOption,
} from "@/components/playbook-editor/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function AddRoleSheet({
  open,
  onOpenChange,
  tree,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tree: RoleNode[];
  onAdd: (role: RoleOption) => void;
}) {
  const [search, setSearch] = useState("");
  const roles = useMemo(() => flattenRoles(tree), [tree]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.fullPath.toLowerCase().includes(q) ||
        row.folder.toLowerCase().includes(q),
    );
  }, [roles, search]);
  const folders = useMemo(() => {
    const map = new Map<string, RoleOption[]>();
    for (const row of filtered) {
      const list = map.get(row.folder) ?? [];
      list.push(row);
      map.set(row.folder, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Add Role</SheetTitle>
          <SheetDescription>Pick a role from project storage.</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-8"
              placeholder="Search roles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            {folders.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No roles found
              </p>
            ) : (
              folders.map(([folder, items]) => (
                <div key={folder}>
                  <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {folder}
                  </p>
                  <div className="space-y-1">
                    {items.map((row) => (
                      <Button
                        key={row.fullPath}
                        variant="ghost"
                        className="h-auto w-full justify-start py-2 text-left whitespace-normal"
                        onClick={() => {
                          onAdd(row);
                          onOpenChange(false);
                        }}
                      >
                        <span className="block">
                          <span className="block font-medium">{row.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {row.fullPath}
                          </span>
                        </span>
                      </Button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
