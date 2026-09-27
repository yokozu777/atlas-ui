"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Archive, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { AtlasInventoryFields } from "@/components/atlas-sources-panel";
import {
  AtlasSettingsField,
  AtlasSettingsSection,
} from "@/components/atlas-settings-section";
import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { GIT_PULL_NONE } from "@/components/git-pull-secret-select";
import { ProjectKindBadge } from "@/components/project-kind-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadGitPullSecrets } from "@/lib/git-pull";
import type { SecretOption } from "@/lib/project-sources";
import type { StargateProject } from "@/lib/project-types";
import { fetchProject, stargateJson } from "@/lib/stargate";

type PathDefaults = {
  clustersRoot?: string;
  workspaceRoot?: string;
  configPath?: string;
  configExists?: boolean;
};

type FormSnapshot = {
  name: string;
  description: string;
  clustersRoot: string;
  workspaceRoot: string;
  defaultSecretId: string;
};

function gitPullId(project: StargateProject): string {
  return project.gitPull?.defaultSecretId || GIT_PULL_NONE;
}

export function AtlasSettingsPage({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<StargateProject | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [clustersRoot, setClustersRoot] = useState("");
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [defaultSecretId, setDefaultSecretId] = useState(GIT_PULL_NONE);
  const [baseline, setBaseline] = useState<FormSnapshot | null>(null);
  const [secrets, setSecrets] = useState<SecretOption[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"archive" | "restore" | "delete" | null>(
    null,
  );
  const pathsBoundFor = useRef<string | null>(null);

  useEffect(() => {
    setProject(null);
    setBaseline(null);
    setError(null);
    pathsBoundFor.current = null;
    void fetchProject(projectId)
      .then((p) => {
        setProject(p);
        setName(p.name);
        setDescription(p.description ?? "");
        setDefaultSecretId(gitPullId(p));
        setClustersRoot(p.clustersRoot ?? "");
        setWorkspaceRoot(p.workspaceRoot ?? "");
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    void loadGitPullSecrets(projectId)
      .then((rows) => {
        if (!cancelled) setSecrets(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!project || project.id !== projectId) return;
    if (pathsBoundFor.current === projectId) return;
    let cancelled = false;
    void stargateJson<PathDefaults>(
      `/projects/${encodeURIComponent(projectId)}/atlas/path-defaults`,
    )
      .then((defaults) => {
        if (cancelled) return;
        pathsBoundFor.current = projectId;
        const savedClusters = (project.clustersRoot ?? "").trim();
        const savedWorkspace = (project.workspaceRoot ?? "").trim();
        const nextClusters = savedClusters || defaults.clustersRoot || "";
        const nextWorkspace = savedWorkspace || defaults.workspaceRoot || "";
        setClustersRoot(nextClusters);
        setWorkspaceRoot(nextWorkspace);
        if (!savedClusters && !savedWorkspace && defaults.configExists) {
          setHint(
            defaults.configPath
              ? `Defaults from ${defaults.configPath}`
              : "Defaults from .config/config.yaml",
          );
        } else {
          setHint(null);
        }
        setBaseline({
          name: project.name,
          description: project.description ?? "",
          clustersRoot: nextClusters,
          workspaceRoot: nextWorkspace,
          defaultSecretId: gitPullId(project),
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        pathsBoundFor.current = projectId;
        toast.error(err instanceof Error ? err.message : String(err));
        setBaseline({
          name: project.name,
          description: project.description ?? "",
          clustersRoot: project.clustersRoot ?? "",
          workspaceRoot: project.workspaceRoot ?? "",
          defaultSecretId: gitPullId(project),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, project]);

  const current: FormSnapshot = {
    name,
    description,
    clustersRoot,
    workspaceRoot,
    defaultSecretId,
  };
  const dirty = Boolean(baseline) && !sameSnapshot(baseline, current);
  const nameInvalid = !name.trim();

  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const archived = Boolean(project?.isArchived);

  function discard() {
    if (!baseline) return;
    setName(baseline.name);
    setDescription(baseline.description);
    setClustersRoot(baseline.clustersRoot);
    setWorkspaceRoot(baseline.workspaceRoot);
    setDefaultSecretId(baseline.defaultSecretId);
  }

  async function save() {
    if (nameInvalid) {
      toast.error("Name is required");
      return;
    }
    setBusy(true);
    try {
      const data = await stargateJson<{ project?: StargateProject }>(
        `/projects/${projectId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            name: name.trim(),
            description,
            clustersRoot,
            workspaceRoot,
            gitPull: {
              defaultSecretId:
                defaultSecretId === GIT_PULL_NONE ? null : defaultSecretId,
            },
          }),
        },
      );
      if (data.project) {
        setProject(data.project);
        setName(data.project.name);
        setDescription(data.project.description ?? "");
        setDefaultSecretId(gitPullId(data.project));
      } else {
        setName(name.trim());
      }
      setHint(null);
      setBaseline({
        name: name.trim(),
        description,
        clustersRoot,
        workspaceRoot,
        defaultSecretId,
      });
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    try {
      const data = await stargateJson<{ project?: StargateProject }>(
        `/projects/${projectId}`,
        {
          method: "PUT",
          body: JSON.stringify({ isArchived: true }),
        },
      );
      if (data.project) {
        setProject(data.project);
      }
      toast.success("Archived");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function restore() {
    try {
      const data = await stargateJson<{ project?: StargateProject }>(
        `/projects/${projectId}/restore`,
        { method: "POST" },
      );
      if (data.project) {
        setProject(data.project);
      } else {
        setProject((prev) => (prev ? { ...prev, isArchived: false } : prev));
      }
      toast.success("Restored");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function remove() {
    try {
      await stargateJson(`/projects/${projectId}`, { method: "DELETE" });
      toast.success("Deleted");
      router.push("/projects");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  if (error) {
    return <EmptyState title="Settings unavailable" description={error} />;
  }

  if (!project) {
    return <EmptyState title="Loading settings" />;
  }

  return (
    <div className="mx-auto w-full max-w-3xl xl:max-w-4xl">
      <header className="space-y-1 pb-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Project Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Name the project and point Atlas at inventory and workspace folders.
        </p>
      </header>

      <AtlasSettingsSection
        title="Project details"
        description="This project can contain many inventory leaves. Choose the active cluster in the header switcher."
        className="border-t-0 pt-6"
      >
        <div className="space-y-5">
          <AtlasSettingsField label="Kind">
            <div className="flex flex-wrap items-center gap-2 pt-1.5">
              <ProjectKindBadge kind={project.kind} />
              {archived ? <Badge variant="warning">archived</Badge> : null}
            </div>
          </AtlasSettingsField>
          <AtlasSettingsField
            label="Name"
            htmlFor="atlas-project-name"
            hint={nameInvalid ? "Required" : undefined}
          >
            <Input
              id="atlas-project-name"
              value={name}
              aria-invalid={nameInvalid}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </AtlasSettingsField>
          <AtlasSettingsField
            label="Description"
            htmlFor="atlas-project-description"
          >
            <Input
              id="atlas-project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
            />
          </AtlasSettingsField>
        </div>
      </AtlasSettingsSection>

      <AtlasSettingsSection
        title="Inventory and workspace"
        description={
          <>
            Empty values fall back to the hub environment after save.
            {hint ? <> {hint}</> : null}
          </>
        }
      >
        <AtlasInventoryFields
          clustersRoot={clustersRoot}
          workspaceRoot={workspaceRoot}
          defaultSecretId={defaultSecretId}
          secrets={secrets}
          disabled={busy}
          onClustersRoot={setClustersRoot}
          onWorkspaceRoot={setWorkspaceRoot}
          onDefaultSecretId={setDefaultSecretId}
        />
      </AtlasSettingsSection>

      <AtlasSettingsSection
        title="Danger zone"
        description="Archive hides the project from the default list. Delete removes the project record and its on-disk directory."
        className="border-destructive/30"
      >
        <div className="divide-y divide-destructive/20 overflow-hidden rounded-lg border border-destructive/25">
          <DangerRow
            title={archived ? "Restore this project" : "Archive this project"}
            description={
              archived
                ? "The project will appear in the default list again."
                : "It will be hidden from the default projects list until restored."
            }
            action={
              archived ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirm("restore")}
                >
                  <Undo2 />
                  Restore
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirm("archive")}
                >
                  <Archive />
                  Archive
                </Button>
              )
            }
          />
          <DangerRow
            title="Delete this project"
            description="Removes the project record and its directory. This cannot be undone."
            action={
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirm("delete")}
              >
                <Trash2 />
                Delete
              </Button>
            }
          />
        </div>
      </AtlasSettingsSection>

      {dirty ? (
        <div className="sticky bottom-4 z-10 mt-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/95 px-4 py-3 shadow-sm">
          <p className="text-sm">Unsaved changes</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={discard}
            >
              Discard
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy || nameInvalid}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmAction
        open={confirm === "archive"}
        onOpenChange={(open) => setConfirm(open ? "archive" : null)}
        title="Archive this project?"
        description="It will be hidden from the default projects list until restored."
        confirmLabel="Archive"
        onConfirm={archive}
      />
      <ConfirmAction
        open={confirm === "restore"}
        onOpenChange={(open) => setConfirm(open ? "restore" : null)}
        title="Restore this project?"
        description="The project will appear in the default list again."
        confirmLabel="Restore"
        onConfirm={restore}
      />
      <ConfirmAction
        open={confirm === "delete"}
        onOpenChange={(open) => setConfirm(open ? "delete" : null)}
        title="Delete this project permanently?"
        description="This removes the project record and its directory. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={remove}
      />
    </div>
  );
}

function sameSnapshot(a: FormSnapshot | null, b: FormSnapshot): boolean {
  if (!a) return false;
  return (
    a.name === b.name &&
    a.description === b.description &&
    a.clustersRoot === b.clustersRoot &&
    a.workspaceRoot === b.workspaceRoot &&
    a.defaultSecretId === b.defaultSecretId
  );
}

function DangerRow({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}
