"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, Lock, Wrench } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { VaultKeysTab } from "@/components/project-vaults/vault-keys-tab";
import { VaultsTab } from "@/components/project-vaults/vaults-tab";
import { VaultToolsTab } from "@/components/project-vaults/vault-tools-tab";
import type {
  VaultFileRow,
  VaultKeyRow,
  VaultRow,
} from "@/components/project-vaults/types";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchProject, stargateJson } from "@/lib/stargate";
import type { StargateProject } from "@/lib/project-types";

type VaultTabId = "keys" | "vaults" | "tools";

function parseTab(value: string | null): VaultTabId {
  if (value === "vaults" || value === "tools") return value;
  return "keys";
}

export function ProjectVaultsPage({ projectId }: { projectId: string }) {
  return (
    <Suspense fallback={<EmptyState title="Loading vaults" />}>
      <ProjectVaultsPageInner projectId={projectId} />
    </Suspense>
  );
}

function ProjectVaultsPageInner({ projectId }: { projectId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const [project, setProject] = useState<StargateProject | null>(null);
  const [keys, setKeys] = useState<VaultKeyRow[]>([]);
  const [vaults, setVaults] = useState<VaultRow[]>([]);
  const [vaultFiles, setVaultFiles] = useState<VaultFileRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  async function load() {
    const [k, v] = await Promise.all([
      stargateJson<{ keys?: VaultKeyRow[] }>(
        `/projects/${projectId}/vault-keys`,
      ),
      stargateJson<{ vaults?: VaultRow[]; vaultFiles?: VaultFileRow[] }>(
        `/projects/${projectId}/vaults`,
      ),
    ]);
    setKeys(k.keys ?? []);
    setVaults(v.vaults ?? []);
    setVaultFiles(v.vaultFiles ?? []);
    setReady(true);
  }

  useEffect(() => {
    void fetchProject(projectId)
      .then(setProject)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, [projectId]);

  useEffect(() => {
    setReady(false);
    void load().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function setTab(next: string) {
    const parsed = parseTab(next);
    const href =
      parsed === "keys"
        ? `/projects/${encodeURIComponent(projectId)}/vault`
        : `/projects/${encodeURIComponent(projectId)}/vault?tab=${parsed}`;
    router.replace(href, { scroll: false });
  }

  if (error) {
    return <EmptyState title="Vaults unavailable" description={error} />;
  }

  return (
    <div>
      <PageHeader
        kicker="Infrastructure"
        title="Vaults"
        description={
          <div className="space-y-3">
            <p>Ansible vault keys and identities for this project</p>
            {project ? (
              <Badge variant="success">Project: {project.name}</Badge>
            ) : null}
          </div>
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line">
          <TabsTrigger value="keys">
            <KeyRound />
            Keys
          </TabsTrigger>
          <TabsTrigger value="vaults">
            <Lock />
            Vaults
          </TabsTrigger>
          <TabsTrigger value="tools">
            <Wrench />
            Tools
          </TabsTrigger>
        </TabsList>
        <TabsContent value="keys" className="mt-6">
          {ready ? (
            <VaultKeysTab
              projectId={projectId}
              keys={keys}
              onReload={load}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </TabsContent>
        <TabsContent value="vaults" className="mt-6">
          {ready ? (
            <VaultsTab
              projectId={projectId}
              vaults={vaults}
              keys={keys}
              onReload={load}
              onGoToKeys={() => setTab("keys")}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </TabsContent>
        <TabsContent value="tools" className="mt-6">
          {ready ? (
            <VaultToolsTab
              projectId={projectId}
              vaults={vaults}
              keys={keys}
              vaultFiles={vaultFiles}
              onReload={load}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
