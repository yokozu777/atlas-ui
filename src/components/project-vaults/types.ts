export type VaultKeyRow = {
  id?: string;
  name?: string;
  type?: string;
  createdAt?: string | number;
  updatedAt?: string | number;
};

export type VaultRow = {
  id?: string;
  name?: string;
  vaultId?: string;
  keyId?: string;
  keyName?: string;
  createdAt?: string | number;
  updatedAt?: string | number;
};

export type VaultFileRow = {
  path?: string;
  key?: string;
  keyName?: string;
  vaultId?: string;
};

export function vaultKeyTypeLabel(type?: string): string {
  return type || "vault_password";
}

export function keyNameOf(keys: VaultKeyRow[], id?: string): string {
  return keys.find((row) => row.id === id)?.name ?? "—";
}

export function formatVaultDate(value?: string | number | null): string {
  if (value == null || value === "") return "—";
  let date: Date;
  if (typeof value === "number") {
    date = new Date(value < 1e12 ? value * 1000 : value);
  } else if (/^\d+(\.\d+)?$/.test(value.trim())) {
    const num = Number(value);
    date = new Date(num < 1e12 ? num * 1000 : num);
  } else {
    date = new Date(value);
  }
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU");
}
