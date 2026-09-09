import type { SecretOption } from "@/lib/project-sources";
import { stargateJson } from "@/lib/stargate";

const SSH_TYPES = new Set(["git_ssh_key", "ssh_key"]);

export async function loadGitPullSecrets(
  projectId: string,
): Promise<SecretOption[]> {
  const [secretData, globalData] = await Promise.all([
    stargateJson<{ secrets?: { name?: string; type?: string }[] }>(
      `/secrets?project_id=${encodeURIComponent(projectId)}`,
    ).catch(() => ({ secrets: [] as { name?: string; type?: string }[] })),
    stargateJson<{
      options?: { id?: string; name?: string; type?: string }[];
    }>("/global/secrets/options?purpose=git").catch(() => ({
      options: [] as { id?: string; name?: string; type?: string }[],
    })),
  ]);
  const global: SecretOption[] = (globalData.options ?? [])
    .filter(
      (row) =>
        row.id && row.name && SSH_TYPES.has(String(row.type || "")),
    )
    .map((row) => ({
      id: row.id as string,
      name: row.name as string,
      type: row.type,
      group: "global" as const,
    }));
  const project: SecretOption[] = (secretData.secrets ?? [])
    .filter(
      (row) => row.name && SSH_TYPES.has(String(row.type || "ssh_key")),
    )
    .map((row) => ({
      id: row.name as string,
      name: row.name as string,
      type: row.type,
      group: "project" as const,
    }));
  return [...global, ...project];
}
