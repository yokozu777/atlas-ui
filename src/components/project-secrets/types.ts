export type SecretType = "ssh_key" | "login_password";

export type SecretRow = {
  name?: string;
  type?: string;
  username?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type SecretMaterial = {
  present?: boolean;
  length?: number;
};

export type SecretDetails = SecretRow & {
  material?: {
    privateKey?: SecretMaterial;
    passphrase?: SecretMaterial;
    password?: SecretMaterial;
  };
};

export function secretTypeLabel(type?: string): string {
  if (type === "ssh_key") return "SSH Key";
  if (type === "login_password") return "Login/Password";
  if (type === "vault_password") return "Vault password";
  if (type === "git_auth") return "Git auth";
  return type || "Unknown";
}

export function formatSecretDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU");
}
