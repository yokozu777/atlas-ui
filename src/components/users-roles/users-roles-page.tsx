"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, Shield, Users } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PermissionsTab } from "@/components/users-roles/permissions-tab";
import { RolesTab } from "@/components/users-roles/roles-tab";
import type {
  PermissionRow,
  RoleRow,
  UserRow,
} from "@/components/users-roles/types";
import { UsersTab } from "@/components/users-roles/users-tab";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchMe, stargateJson } from "@/lib/stargate";

type UsersTabId = "users" | "roles" | "permissions";

function parseTab(value: string | null): UsersTabId {
  if (value === "roles" || value === "permissions") return value;
  return "users";
}

type MePayload = {
  username?: string;
  user?: { id?: string; username?: string };
};

export function UsersRolesPage() {
  return (
    <Suspense fallback={<EmptyState title="Loading users" />}>
      <UsersRolesPageInner />
    </Suspense>
  );
}

function UsersRolesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [meId, setMeId] = useState<string>();
  const [meUsername, setMeUsername] = useState<string>();

  async function load() {
    const [u, r, p] = await Promise.all([
      stargateJson<{ users?: UserRow[] }>("/users"),
      stargateJson<{ roles?: RoleRow[] }>("/roles"),
      stargateJson<{ permissions?: PermissionRow[] }>("/permissions"),
    ]);
    setUsers(u.users ?? []);
    setRoles(r.roles ?? []);
    setPermissions(p.permissions ?? []);
    setReady(true);
  }

  useEffect(() => {
    void load().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
    void fetchMe().then((me) => {
      const payload = me as MePayload | null;
      setMeId(payload?.user?.id);
      setMeUsername(payload?.user?.username || payload?.username);
    });
  }, []);

  function setTab(next: string) {
    const parsed = parseTab(next);
    const href =
      parsed === "users" ? "/users" : `/users?tab=${encodeURIComponent(parsed)}`;
    router.replace(href, { scroll: false });
  }

  if (error) {
    return <EmptyState title="Users unavailable" description={error} />;
  }

  return (
    <div>
      <PageHeader
        kicker="System"
        title="Users & roles"
        description={
          <div className="space-y-3">
            <p>Accounts, RBAC roles, and permissions</p>
            <Badge variant="info">Global scope</Badge>
          </div>
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line">
          <TabsTrigger value="users">
            <Users />
            Users
          </TabsTrigger>
          <TabsTrigger value="roles">
            <Shield />
            Roles
          </TabsTrigger>
          <TabsTrigger value="permissions">
            <KeyRound />
            Permissions
          </TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-6">
          {ready ? (
            <UsersTab
              users={users}
              roles={roles}
              meId={meId}
              meUsername={meUsername}
              onReload={load}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </TabsContent>
        <TabsContent value="roles" className="mt-6">
          {ready ? (
            <RolesTab roles={roles} permissions={permissions} onReload={load} />
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </TabsContent>
        <TabsContent value="permissions" className="mt-6">
          {ready ? (
            <PermissionsTab permissions={permissions} onReload={load} />
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
