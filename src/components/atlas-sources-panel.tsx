"use client";

import { GitPullSecretSelect } from "@/components/git-pull-secret-select";
import { AtlasSettingsField } from "@/components/atlas-settings-section";
import { Input } from "@/components/ui/input";
import type { SecretOption } from "@/lib/project-sources";

export function AtlasInventoryFields({
  clustersRoot,
  workspaceRoot,
  defaultSecretId,
  secrets,
  disabled,
  onClustersRoot,
  onWorkspaceRoot,
  onDefaultSecretId,
}: {
  clustersRoot: string;
  workspaceRoot: string;
  defaultSecretId: string;
  secrets: SecretOption[];
  disabled?: boolean;
  onClustersRoot: (value: string) => void;
  onWorkspaceRoot: (value: string) => void;
  onDefaultSecretId: (value: string) => void;
}) {
  return (
    <div className="space-y-5">
      <AtlasSettingsField
        label="Inventory folder"
        htmlFor="clusters-path"
        hint={
          <>
            Directory of cluster leaves. Atlas reads this as{" "}
            <span className="font-mono">clusters.path</span>.
          </>
        }
      >
        <Input
          id="clusters-path"
          className="font-mono text-sm"
          value={clustersRoot}
          onChange={(e) => onClustersRoot(e.target.value)}
          placeholder="/path/to/atlas-inventory/clusters"
          spellCheck={false}
          disabled={disabled}
        />
      </AtlasSettingsField>
      <AtlasSettingsField
        label="Workspace folder"
        htmlFor="workspace-path"
        hint={
          <>
            Runtime files for this project. Atlas reads this as{" "}
            <span className="font-mono">workspace.path</span>.
          </>
        }
      >
        <Input
          id="workspace-path"
          className="font-mono text-sm"
          value={workspaceRoot}
          onChange={(e) => onWorkspaceRoot(e.target.value)}
          placeholder="/path/to/atlas-inventory/workspace"
          spellCheck={false}
          disabled={disabled}
        />
      </AtlasSettingsField>
      <AtlasSettingsField
        label="Playbook SSH key"
        htmlFor="git-pull-default"
        hint="SSH key for repos sync and cluster run (git clone of playbooks). Not the Atlas key used to log into VMs."
      >
        <GitPullSecretSelect
          id="git-pull-default"
          label="Playbook SSH key"
          hideLabel
          value={defaultSecretId}
          secrets={secrets}
          onValueChange={onDefaultSecretId}
          disabled={disabled}
        />
      </AtlasSettingsField>
    </div>
  );
}
