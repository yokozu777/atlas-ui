import type { BootstrapStatus } from "@/lib/api";

export type ReadinessIssue = {
  id: string;
  label: string;
  detail?: string;
};

export type OverviewReadiness = {
  ready: boolean;
  summary: string;
  repos: ReadinessIssue[];
  image: ReadinessIssue | null;
  /** One Sync covers every workspace, lock, and git row. */
  sync: boolean;
  pull: boolean;
};

export function overviewReadiness(status: BootstrapStatus): OverviewReadiness {
  const repos = (status.missing ?? []).map((item, index) => ({
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
  return {
    ready,
    summary: imageRef
      ? "Executor image present, repos ready."
      : "Repos ready.",
    repos,
    image,
    sync: repos.length > 0,
    pull: image !== null,
  };
}
