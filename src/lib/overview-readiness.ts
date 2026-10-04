import type { BootstrapStatus } from "@/lib/api";

export type ReadinessIssue = {
  id: string;
  label: string;
  detail?: string;
};

const REPO_KINDS = new Set(["workspace", "lock", "git_repo"]);

export type OverviewReadiness = {
  ready: boolean;
  summary: string;
  repos: ReadinessIssue[];
  image: ReadinessIssue | null;
  /** One Sync covers every workspace, lock, and git row. */
  sync: boolean;
  /** Write localuser.pub from the already selected Atlas secret. */
  restorePub: boolean;
  /** Atlas SSH secret is missing; do not invent a key. */
  selectKey: boolean;
  pull: boolean;
};

export function overviewReadiness(status: BootstrapStatus): OverviewReadiness {
  const missing = status.missing ?? [];
  const repos = missing.map((item, index) => ({
    id: `${item.kind}-${item.name ?? index}`,
    label: (item.label || item.name || item.kind || "Missing").trim(),
    detail: item.path?.trim() || undefined,
  }));
  const imageRef = status.docker_image?.trim() || "";
  const image =
    imageRef && status.docker_image_present !== true
      ? {
          id: "docker",
          label: "Docker executor image is not pulled",
          detail: imageRef,
        }
      : null;
  const ready = repos.length === 0 && image === null;
  const keyGap = missing.some((item) => item.kind === "ssh_key");
  return {
    ready,
    summary: imageRef
      ? "Executor image present, repos ready."
      : "Repos ready.",
    repos,
    image,
    sync: missing.some((item) => REPO_KINDS.has(item.kind)),
    restorePub: missing.some((item) => item.kind === "operator_pub") && !keyGap,
    selectKey: keyGap,
    pull: image !== null,
  };
}
