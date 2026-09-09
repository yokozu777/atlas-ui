"use client";

import { Folder } from "lucide-react";

import { SetupForm } from "@/components/setup-form";
import { SettingsSection } from "@/components/settings/settings-section";

export function LocalClusterctlSection({
  defaultPath,
  version,
  error,
}: {
  defaultPath: string;
  version: string;
  error: string;
}) {
  return (
    <SettingsSection icon={<Folder className="size-4" />} title="Local / clusterctl">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {version ? (
        <p className="font-mono text-sm text-muted-foreground">{version}</p>
      ) : null}
      <SetupForm
        defaultPath={defaultPath}
        submitLabel="Update path"
        redirectTo="/settings"
      />
      <p className="text-xs text-muted-foreground">
        Saved in ~/.config/atlas-ui/config.json (or ATLAS_UI_CONFIG). The hub
        uses this path for Logs and Workspace when the project has no
        clusterctlRoot and ATLAS_CLUSTER_ROOT is unset.
      </p>
    </SettingsSection>
  );
}
