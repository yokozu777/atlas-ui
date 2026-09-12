"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Layers, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";

import { BackupSection } from "@/components/settings/backup-section";
import { DebugLoggingSection } from "@/components/settings/debug-logging-section";
import { EncryptionKeySection } from "@/components/settings/encryption-key-section";
import { ExecutionHistorySection } from "@/components/settings/execution-history-section";
import { LocalClusterctlSection } from "@/components/settings/local-clusterctl-section";
import { UserUiSection } from "@/components/settings/user-ui-section";
import { WorkersTab } from "@/components/settings/workers-tab";
import type { HubSettings, HubStats, SettingsResponse } from "@/components/settings/types";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { stargateJson } from "@/lib/stargate";

type SettingsTab = "general" | "workers";

function parseTab(value: string | null): SettingsTab {
  return value === "workers" ? "workers" : "general";
}

export function SettingsScreen({
  defaultPath,
  defaultGitUrl,
}: {
  defaultPath: string;
  defaultGitUrl?: string;
}) {
  return (
    <Suspense fallback={<EmptyState title="Loading settings" />}>
      <SettingsScreenInner
        defaultPath={defaultPath}
        defaultGitUrl={defaultGitUrl}
      />
    </Suspense>
  );
}

function SettingsScreenInner({
  defaultPath,
  defaultGitUrl,
}: {
  defaultPath: string;
  defaultGitUrl?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const [settings, setSettings] = useState<HubSettings | null>(null);
  const [stats, setStats] = useState<HubStats>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadHub() {
    const data = await stargateJson<SettingsResponse>("/execution_settings");
    setSettings(data.settings ?? {});
    setStats(data.stats ?? {});
  }

  useEffect(() => {
    void loadHub().catch((err: unknown) =>
      setLoadError(err instanceof Error ? err.message : String(err)),
    );
  }, []);

  async function patchHub(partial: Partial<HubSettings>) {
    const data = await stargateJson<SettingsResponse>("/execution_settings", {
      method: "POST",
      body: JSON.stringify(partial),
    });
    setSettings(data.settings ?? { ...(settings ?? {}), ...partial });
    setStats(data.stats ?? stats);
    toast.success("Saved");
  }

  async function clearHistory() {
    const data = await stargateJson<{ deletedCount?: number }>(
      "/executions/clear",
      { method: "POST", body: JSON.stringify({}) },
    );
    toast.success(`Cleared ${data.deletedCount ?? 0} executions`);
    await loadHub();
  }

  function setTab(next: string) {
    const parsed = parseTab(next);
    router.replace(parsed === "workers" ? "/settings?tab=workers" : "/settings", {
      scroll: false,
    });
  }

  return (
    <div>
      <PageHeader
        kicker="System"
        title="Settings"
        description={
          <div className="space-y-3">
            <p>Application preferences and system options.</p>
            <Badge variant="info">Global scope</Badge>
          </div>
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line">
          <TabsTrigger value="general">
            <SettingsIcon />
            General
          </TabsTrigger>
          <TabsTrigger value="workers">
            <Layers />
            Workers
          </TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="mt-6 space-y-6">
          {loadError ? (
            <EmptyState title="Hub settings unavailable" description={loadError} />
          ) : settings ? (
            <>
              <UserUiSection />
              <BackupSection />
              <DebugLoggingSection
                settings={settings}
                onPatch={(partial) => patchHub(partial)}
              />
              <EncryptionKeySection />
              <ExecutionHistorySection
                settings={settings}
                stats={stats}
                onPatch={(partial) => patchHub(partial)}
                onClear={clearHistory}
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          <LocalClusterctlSection
            defaultPath={defaultPath}
            defaultGitUrl={defaultGitUrl}
          />
        </TabsContent>
        <TabsContent value="workers" className="mt-6">
          <WorkersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
