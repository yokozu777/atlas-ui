export type ProjectKind = "atlas" | "ansible";

export type GitPullConfig = {
  defaultSecretId?: string | null;
  repoSecretIds?: Record<string, string>;
};

export type StargateProject = {
  id: string;
  name: string;
  description?: string;
  kind: ProjectKind;
  cluster_id?: string;
  clusterctlRoot?: string;
  clustersRoot?: string;
  workspaceRoot?: string;
  gitPull?: GitPullConfig;
  createdAt?: number;
  updatedAt?: number;
  isArchived?: boolean;
};

export function isProjectKind(value: unknown): value is ProjectKind {
  return value === "atlas" || value === "ansible";
}
