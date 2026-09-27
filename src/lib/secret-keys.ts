import { downloadText } from "@/components/hosts-groups/helpers";
import { stargateJson } from "@/lib/stargate";

export type SecretKeyExport = {
  name?: string;
  publicKey?: string;
  privateKey?: string;
};

export async function fetchProjectSecretExport(projectId: string, name: string) {
  return stargateJson<SecretKeyExport>(
    `/secrets/${encodeURIComponent(name)}/export?project_id=${encodeURIComponent(projectId)}`,
  );
}

export async function fetchGlobalSecretExport(secretId: string) {
  return stargateJson<SecretKeyExport>(
    `/global/secrets/${encodeURIComponent(secretId)}/export`,
  );
}

function fileBase(name: string) {
  const safe = name.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "");
  return safe || "secret";
}

export function downloadPublicKey(name: string, publicKey: string) {
  const body = publicKey.endsWith("\n") ? publicKey : `${publicKey}\n`;
  downloadText(`${fileBase(name)}.pub`, body);
}

export function downloadPrivateKey(name: string, privateKey: string) {
  const body = privateKey.endsWith("\n") ? privateKey : `${privateKey}\n`;
  downloadText(fileBase(name), body);
}
