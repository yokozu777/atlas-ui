import type { SecretOption } from "@/lib/project-sources";
import { stargateJson } from "@/lib/stargate";

export type ClusterctlSshInfo = {
  sshSecretId: string | null;
  name: string | null;
  fingerprint: string | null;
};

export type AtlasOperatorSshStatus = ClusterctlSshInfo & {
  cluster_id?: string | null;
  pubPath?: string | null;
  pubExists?: boolean;
  pubFingerprint?: string | null;
  match?: boolean;
};

export async function fetchClusterctlSsh(): Promise<ClusterctlSshInfo> {
  const data = await stargateJson<ClusterctlSshInfo>("/global/clusterctl-ssh");
  return {
    sshSecretId: (data.sshSecretId || "").trim() || null,
    name: (data.name || "").trim() || null,
    fingerprint: (data.fingerprint || "").trim() || null,
  };
}

export async function fetchClusterctlSshSecretId(): Promise<string | null> {
  const data = await fetchClusterctlSsh();
  return data.sshSecretId;
}

export async function saveClusterctlSshSecretId(
  sshSecretId: string | null,
): Promise<void> {
  await stargateJson("/global/clusterctl-ssh", {
    method: "PUT",
    body: JSON.stringify({ sshSecretId }),
  });
}

export async function loadClusterctlSshKeys(): Promise<SecretOption[]> {
  const options = await stargateJson<{
    options?: { id?: string; name?: string; type?: string }[];
  }>("/global/secrets/options?purpose=git");
  return (options.options ?? [])
    .filter(
      (row) =>
        row.id && row.name && String(row.type || "") === "git_ssh_key",
    )
    .map((row) => ({
      id: row.id as string,
      name: row.name as string,
      type: row.type,
      group: "global" as const,
    }));
}

export async function fetchAtlasOperatorSsh(
  projectId: string,
  clusterId: string,
): Promise<AtlasOperatorSshStatus> {
  const params = new URLSearchParams();
  if (clusterId.trim()) params.set("cluster_id", clusterId.trim());
  const q = params.toString();
  return stargateJson<AtlasOperatorSshStatus>(
    `/projects/${encodeURIComponent(projectId)}/atlas/operator-ssh${q ? `?${q}` : ""}`,
  );
}

export async function writeAtlasOperatorPubkey(
  projectId: string,
  clusterId: string,
  opts?: { sshSecretId?: string | null; projectSecretName?: string | null },
): Promise<AtlasOperatorSshStatus> {
  return stargateJson<AtlasOperatorSshStatus>(
    `/projects/${encodeURIComponent(projectId)}/atlas/operator-ssh`,
    {
      method: "POST",
      body: JSON.stringify({
        cluster_id: clusterId,
        sshSecretId: opts?.sshSecretId ?? null,
        projectSecretName: opts?.projectSecretName ?? null,
      }),
    },
  );
}
