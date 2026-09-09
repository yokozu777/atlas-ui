export type UserRow = {
  id: string;
  username?: string;
  email?: string | null;
  roles?: string[];
  role_names?: string[];
  role_details?: { id?: string; name?: string }[];
  is_active?: boolean;
  created_at?: string;
  last_login?: string | null;
};

export type RoleRow = {
  id: string;
  name?: string;
  description?: string;
  permissions?: string[];
  permission_names?: string[];
  permission_details?: PermissionRow[];
  created_at?: string;
};

export type PermissionRow = {
  id: string;
  name?: string;
  description?: string;
  resource?: string;
  action?: string;
};

export function formatUserDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU");
}

export function isValidUsername(name: string): boolean {
  return /^[a-zA-Z0-9_-]{3,50}$/.test(name.trim());
}

export function isValidPassword(password: string): boolean {
  return password.length >= 6 && password.length <= 128;
}

export function isValidEmail(email: string): boolean {
  if (!email.trim()) return true;
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email.trim());
}

export function isValidRoleName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed.length <= 100 && /^[a-zA-Z0-9_\s-]+$/.test(trimmed);
}

export function isValidPermissionName(name: string): boolean {
  return /^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+$/.test(name.trim());
}

export function groupPermissions(rows: PermissionRow[]): [string, PermissionRow[]][] {
  const groups = new Map<string, PermissionRow[]>();
  for (const row of rows) {
    const key = row.resource || "other";
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}
