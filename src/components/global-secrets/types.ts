export type GlobalSecretType = "git_ssh_key";

export type GlobalSecretRow = {
  id: string;
  name?: string;
  type?: string;
  description?: string;
  username?: string;
  createdAt?: string;
  updatedAt?: string;
  metadata?: { username?: string };
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
