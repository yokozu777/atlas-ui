import { Suspense } from "react";

import { EmptyState } from "@/components/empty-state";
import { SettingsScreen } from "@/components/settings/settings-page";
import { loadConfig } from "@/server/config";
import { defaultDest, defaultGitUrl } from "@/server/clusterctl-defaults";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const config = await loadConfig();

  return (
    <Suspense fallback={<EmptyState title="Loading settings" />}>
      <SettingsScreen
        defaultPath={config?.clusterctlRoot ?? defaultDest()}
        defaultGitUrl={defaultGitUrl()}
      />
    </Suspense>
  );
}
