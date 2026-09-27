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
    <SettingsSection icon={<Folder className="size-4" />} title="atlas-clusterctl">
      <SetupForm
        defaultPath={defaultPath}
        defaultGitUrl={defaultGitUrl}
        submitLabel="Update path"
        redirectTo="/settings?tab=atlas-clusterctl"
      />
      <p className="text-xs text-muted-foreground">
        Check version lists tags and <code className="font-mono">main</code> from
        the Git URL, then Install or Update that ref into the checkout path. An
        empty dest is filled automatically with the latest tag on first start.
        Last fetched time comes from the last clone, pull, or install. In
        Docker the dest is <code className="font-mono">/atlas/clusterctl</code>{" "}
        (host folder from <code className="font-mono">ATLAS_CLUSTER_ROOT</code>{" "}
        / compose project dir). Without Docker, default is{" "}
        <code className="font-mono">atlas-clusterctl</code> next to atlas-ui.
        Saved in ~/.config/atlas-ui/config.json (or ATLAS_UI_CONFIG). The hub
        uses this path for Logs and Workspace when the project has no
        clusterctlRoot and ATLAS_CLUSTER_ROOT is unset.
      </p>
    </SettingsSection>
  );
}
