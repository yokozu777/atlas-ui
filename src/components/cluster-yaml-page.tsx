"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileCode, FolderGit2, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { useAtlasClusterSelection } from "@/components/atlas-cluster-selection";
import { ClusterYamlConfigTab } from "@/components/cluster-yaml-config-tab";
import { ClusterYamlReposTab } from "@/components/cluster-yaml-repos-tab";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { YamlEditor } from "@/components/yaml-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { projectApiQuery } from "@/components/hosts-groups/helpers";
import { projectHref } from "@/lib/project-href";
import { stargateJson } from "@/lib/stargate";
import type { ClusterPhase, ClusterPlaybookRepo } from "@/lib/api";

type ClusterYamlTab = "yaml" | "repos" | "config";

function parseTab(value: string | null): ClusterYamlTab {
  if (value === "repos" || value === "config") return value;
  return "yaml";
}

function tabHref(projectId: string, tab: ClusterYamlTab): string {
  if (tab === "repos") return projectHref(projectId, "/cluster-yaml?tab=repos");
  if (tab === "config") return projectHref(projectId, "/cluster-yaml?tab=config");
  return projectHref(projectId, "/cluster-yaml");
}

export function ClusterYamlPage({ projectId }: { projectId: string }) {
  return (
    <Suspense fallback={<EmptyState title="Loading cluster definition" />}>
      <ClusterYamlPageInner projectId={projectId} />
    </Suspense>
  );
}

function ClusterYamlPageInner({ projectId }: { projectId: string }) {
  const { clusterId } = useAtlasClusterSelection();
  const q = projectApiQuery(projectId, clusterId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const [content, setContent] = useState("");
  const [playbooks, setPlaybooks] = useState<ClusterPlaybookRepo[]>([]);
  const [phases, setPhases] = useState<ClusterPhase[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void stargateJson<{
      content?: string;
      cluster_id?: string;
      playbooks?: ClusterPlaybookRepo[];
      phases?: ClusterPhase[];
    }>(`/projects/${encodeURIComponent(projectId)}/atlas/cluster-yaml?${q}`)
      .then((data) => {
        if (cancelled) return;
        setContent(data.content || "");
        setPlaybooks(data.playbooks ?? []);
        setPhases(data.phases ?? []);
        setLoadedFor(data.cluster_id || clusterId);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, q, clusterId]);

  function setTab(next: string) {
    router.replace(tabHref(projectId, parseTab(next)), { scroll: false });
  }

  async function save() {
    setBusy(true);
    try {
      const data = await stargateJson<{
        playbooks?: ClusterPlaybookRepo[];
        phases?: ClusterPhase[];
      }>(
        `/projects/${encodeURIComponent(projectId)}/atlas/cluster-yaml?${q}`,
        {
          method: "PUT",
          body: JSON.stringify({ content, cluster_id: clusterId }),
        },
      );
      setPlaybooks(data.playbooks ?? []);
      setPhases(data.phases ?? []);
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return <EmptyState title="cluster.yaml unavailable" description={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        kicker="Atlas"
        title="Cluster definition"
        description="How this cluster is defined: cluster.yaml, playbook repos, and the resolved config"
        actions={
          <div className="flex items-center gap-2">
            {loadedFor ? <Badge variant="success">{loadedFor}</Badge> : null}
            {tab === "yaml" ? (
              <Button onClick={() => void save()} disabled={busy || !clusterId}>
                Save
              </Button>
            ) : null}
          </div>
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line">
          <TabsTrigger value="yaml">
            <FileCode />
            YAML
          </TabsTrigger>
          <TabsTrigger value="repos">
            <FolderGit2 />
            Repos
          </TabsTrigger>
          <TabsTrigger value="config">
            <SlidersHorizontal />
            Config
          </TabsTrigger>
        </TabsList>
        <TabsContent value="yaml" className="mt-6">
          <YamlEditor value={content} onChange={setContent} />
        </TabsContent>
        <TabsContent value="repos" className="mt-6">
          <ClusterYamlReposTab
            projectId={projectId}
            clusterId={clusterId}
            playbooks={playbooks}
          />
        </TabsContent>
        <TabsContent value="config" className="mt-6">
          {tab === "config" ? (
            <ClusterYamlConfigTab
              clusterId={clusterId}
              phases={phases}
              ready={Boolean(clusterId) && loadedFor === clusterId}
            />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
