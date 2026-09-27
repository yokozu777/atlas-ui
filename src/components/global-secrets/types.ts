export type GlobalSecretType = "git_ssh_key" | "basic_auth";

export type GlobalSecretRow = {
  id: string;
  name?: string;
  type?: string;
  description?: string;
  username?: string;
  publicKey?: string;
  privateKey?: string;
  fingerprint?: string;
  createdAt?: string;
  updatedAt?: string;
  metadata?: {
    username?: string;
    registry?: string;
    comment?: string;
    publicKey?: string;
    fingerprint?: string;
    keyType?: string;
  };
};

export function globalSecretTypeLabel(type?: string): string {
  if (type === "git_ssh_key") return "SSH Key";
  if (type === "git_token") return "Token";
  if (type === "basic_auth") return "Basic Auth";
  if (type === "registry_token") return "Registry Token";
  if (type === "vault_token") return "Vault token";
  return type || "Unknown";
}

export function formatSecretDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU");
}

export function isValidSecretName(name: string): boolean {
  return /^[a-zA-Z0-9_-]{3,64}$/.test(name.trim());
}

export function secretPublicKey(row?: GlobalSecretRow | null): string {
  return (row?.publicKey || row?.metadata?.publicKey || "").trim();
}

export function secretFingerprint(row?: GlobalSecretRow | null): string {
  return (row?.fingerprint || row?.metadata?.fingerprint || "").trim();
}

export function secretUsername(row?: GlobalSecretRow | null): string {
  return (row?.metadata?.username || row?.username || "").trim();
}

export function isSshSecretType(type?: string): boolean {
  return type === "git_ssh_key" || type === "ssh_key";
}
