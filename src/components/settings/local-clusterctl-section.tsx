"use client";

import { Folder } from "lucide-react";

import { SetupForm } from "@/components/setup-form";
import { SettingsSection } from "@/components/settings/settings-section";

export function LocalClusterctlSection({
  defaultPath,
  defaultGitUrl,
}: {
  defaultPath: string;
  defaultGitUrl?: string;
}) {
  return (
    <SettingsSection icon={<Folder className="size-4" />} title="Local / clusterctl">
      <SetupForm
        defaultPath={defaultPath}
        defaultGitUrl={defaultGitUrl}
        submitLabel="Update path"
        redirectTo="/settings"
      />
      <p className="text-xs text-muted-foreground">
        Clone public atlas-clusterctl from GitHub into the checkout path (default:{" "}
        <code className="font-mono">atlas-clusterctl</code> next to atlas-ui).
        Saved in ~/.config/atlas-ui/config.json (or ATLAS_UI_CONFIG). The hub
        uses this path for Logs and Workspace when the project has no
        clusterctlRoot and ATLAS_CLUSTER_ROOT is unset.
      </p>
    </SettingsSection>
  );
}
