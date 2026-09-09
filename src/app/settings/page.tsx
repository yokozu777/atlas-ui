import { Suspense } from "react";

import { EmptyState } from "@/components/empty-state";
import { SettingsScreen } from "@/components/settings/settings-page";
import { loadConfig } from "@/server/config";
import { probeClusterctlVersion, resolveClusterctlRoot } from "@/server/clusterctl";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const config = await loadConfig();
  let version = "";
  let error = "";
  if (config) {
    try {
      const root = await resolveClusterctlRoot(config.clusterctlRoot);
      const probe = probeClusterctlVersion(root);
      version = probe.version;
      error = probe.error ?? "";
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  return (
    <Suspense fallback={<EmptyState title="Loading settings" />}>
      <SettingsScreen
        defaultPath={config?.clusterctlRoot ?? "../atlas-clusterctl"}
        version={version}
        error={error}
      />
    </Suspense>
  );
}
