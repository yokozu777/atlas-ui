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
import { useAuthz } from "@/lib/authz";
import { stargateJson } from "@/lib/stargate";

type UsersTabId = "users" | "roles" | "permissions";

function parseTab(value: string | null): UsersTabId {
  if (value === "roles" || value === "permissions") return value;
  return "users";
}

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
  const { me, ready, can } = useAuthz();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const meId = me?.user?.id;
  const meUsername = me?.user?.username || me?.username;

  async function load() {
    const [u, r, p] = await Promise.all([
      can("users.read")
        ? stargateJson<{ users?: UserRow[] }>("/users")
        : Promise.resolve({ users: [] as UserRow[] }),
      can("roles.read")
        ? stargateJson<{ roles?: RoleRow[] }>("/roles")
        : Promise.resolve({ roles: [] as RoleRow[] }),
      can("permissions.read")
        ? stargateJson<{ permissions?: PermissionRow[] }>("/permissions")
        : Promise.resolve({ permissions: [] as PermissionRow[] }),
    ]);
    setUsers(u.users ?? []);
    setRoles(r.roles ?? []);
    setPermissions(p.permissions ?? []);
    setLoaded(true);
  }

  useEffect(() => {
    if (!ready) return;
    if (!can("users.read")) {
      setError("users.read required");
      return;
    }
    void load().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [ready, can]);

  function setTab(next: string) {
    const parsed = parseTab(next);
    const href =
      parsed === "users" ? "/users" : `/users?tab=${encodeURIComponent(parsed)}`;
    router.replace(href, { scroll: false });
  }

  if (!ready) {
    return <EmptyState title="Loading users" />;
  }
  if (error) {
    return (
      <EmptyState
        title={error.includes("required") ? "Forbidden" : "Users unavailable"}
        description={error}
      />
    );
  }

  return (
    <div>
      <PageHeader
        kicker="System"
        title="Users"
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
          {loaded ? (
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
          {loaded ? (
            <RolesTab roles={roles} permissions={permissions} onReload={load} />
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </TabsContent>
        <TabsContent value="permissions" className="mt-6">
          {loaded ? (
            <PermissionsTab permissions={permissions} onReload={load} />
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
