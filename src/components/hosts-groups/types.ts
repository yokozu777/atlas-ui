export type InvFile = { name?: string; path?: string; env?: string | null };
export type CfgFile = { path?: string; name?: string; is_primary?: boolean };
export type SecretRow = { name?: string; type?: string };
export type GroupInfo = { hosts?: string[]; children?: string[] };
export type HostStatus = { status?: string; last_checked_at?: string };
export type VarsFile = { name: string; path: string; stem: string };

export type HostsGroupsTab = "hosts" | "groups";
