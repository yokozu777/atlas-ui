export const DEFAULT_CLUSTERCTL_GIT_URL =
  "https://github.com/yokozu777/atlas-clusterctl.git";

export function defaultGitUrl(): string {
  return process.env.ATLAS_CLUSTERCTL_GIT_URL?.trim() || DEFAULT_CLUSTERCTL_GIT_URL;
}

export function defaultDest(): string {
  const envRoot = process.env.ATLAS_CLUSTER_ROOT?.trim();
  if (envRoot) {
    return envRoot;
  }
  const uiRoot = (process.env.ATLAS_UI_ROOT?.trim() || process.cwd()).replace(
    /\/+$/,
    "",
  );
  return `${uiRoot}/atlas-clusterctl`;
}
