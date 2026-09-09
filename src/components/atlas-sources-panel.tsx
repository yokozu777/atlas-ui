"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  GIT_PULL_NONE,
  GitPullSecretSelect,
} from "@/components/git-pull-secret-select";
import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loadGitPullSecrets } from "@/lib/git-pull";
import type { SecretOption } from "@/lib/project-sources";
import type { StargateProject } from "@/lib/project-types";
import { stargateJson } from "@/lib/stargate";

type PathDefaults = {
  clustersRoot?: string;
  workspaceRoot?: string;
  configPath?: string;
  configExists?: boolean;
};

export function AtlasSourcesPanel({
  projectId,
  project,
  onProject,
}: {
  projectId: string;
  project: StargateProject;
  onProject?: (project: StargateProject) => void;
}) {
  const [clustersRoot, setClustersRoot] = useState(project.clustersRoot ?? "");
  const [workspaceRoot, setWorkspaceRoot] = useState(project.workspaceRoot ?? "");
  const [defaultSecretId, setDefaultSecretId] = useState(
    project.gitPull?.defaultSecretId || GIT_PULL_NONE,
  );
  const [secrets, setSecrets] = useState<SecretOption[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDefaultSecretId(project.gitPull?.defaultSecretId || GIT_PULL_NONE);
  }, [project.gitPull?.defaultSecretId]);

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
    let cancelled = false;
    void stargateJson<PathDefaults>(
      `/projects/${encodeURIComponent(projectId)}/atlas/path-defaults`,
    )
      .then((defaults) => {
        if (cancelled) {
          return;
        }
        const savedClusters = (project.clustersRoot ?? "").trim();
        const savedWorkspace = (project.workspaceRoot ?? "").trim();
        setClustersRoot(savedClusters || defaults.clustersRoot || "");
        setWorkspaceRoot(savedWorkspace || defaults.workspaceRoot || "");
        if (!savedClusters && !savedWorkspace && defaults.configExists) {
          setHint(
            defaults.configPath
              ? `Defaults from ${defaults.configPath}`
              : "Defaults from .config/config.yaml",
          );
        } else {
          setHint(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, project.clustersRoot, project.workspaceRoot]);

  async function save() {
    setBusy(true);
    try {
      const data = await stargateJson<{ project?: StargateProject }>(
        `/projects/${encodeURIComponent(projectId)}`,
        {
          method: "PUT",
          body: JSON.stringify({
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
        onProject?.(data.project);
      }
      setHint(null);
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="max-w-lg space-y-4 p-6">
      <p className="text-sm text-muted-foreground">
        Inventory and workspace roots for this atlas project. Empty values fall
        back to the hub environment after save.
      </p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <div className="space-y-2">
        <Label htmlFor="clusters-path">clusters.path</Label>
        <Input
          id="clusters-path"
          value={clustersRoot}
          onChange={(e) => setClustersRoot(e.target.value)}
          placeholder="/path/to/atlas-inventory/clusters"
          spellCheck={false}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="workspace-path">workspace.path</Label>
        <Input
          id="workspace-path"
          value={workspaceRoot}
          onChange={(e) => setWorkspaceRoot(e.target.value)}
          placeholder="/path/to/atlas-inventory/workspace"
          spellCheck={false}
        />
      </div>
      <GitPullSecretSelect
        id="git-pull-default"
        label="Playbook git pull key"
        hint="Lowest-priority SSH key for repos sync and cluster run (git clone of playbooks). Not the Ansible key used to log into cluster hosts."
        value={defaultSecretId}
        secrets={secrets}
        onValueChange={setDefaultSecretId}
        disabled={busy}
      />
      <Button type="button" onClick={() => void save()} disabled={busy}>
        {busy ? "Saving…" : "Save"}
      </Button>
    </Panel>
  );
}
