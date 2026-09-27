"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileCode, FolderTree, HardDrive, HeartPulse, ListChecks, Save } from "lucide-react";
import { toast } from "sonner";

import { useAtlasClusterSelection } from "@/components/atlas-cluster-selection";
import { AtlasClusterRuntime } from "@/components/atlas-cluster-runtime";
import { AtlasRuntimeFilesTab } from "@/components/atlas-runtime-files-tab";
import { ClusterYamlHealthTab } from "@/components/cluster-yaml-health-tab";
import { ClusterYamlSetupTab } from "@/components/cluster-yaml-setup-tab";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { YamlEditor } from "@/components/yaml-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { projectApiQuery } from "@/components/hosts-groups/helpers";
import { projectHref } from "@/lib/project-href";
import { stargateJson } from "@/lib/stargate";
import { useCan } from "@/lib/authz";
import type { ClusterPhase, ClusterPlaybookRepo } from "@/lib/api";
import {
  applyClusterYamlDraft,
  cloneClusterYamlDraft,
  parseClusterYaml,
  type ClusterYamlDraft,
} from "@/lib/cluster-yaml-model";

type ClusterYamlTab = "setup" | "health" | "yaml" | "runtime" | "files";

function parseTab(value: string | null): ClusterYamlTab {
  if (value === "yaml") return "yaml";
  if (value === "health" || value === "repos" || value === "config") {
    return "health";
  }
  if (value === "runtime" || value === "advanced" || value === "workspace") {
    return "runtime";
  }
  if (value === "files") return "files";
  return "setup";
}

function tabHref(projectId: string, tab: ClusterYamlTab): string {
  if (tab === "health") return projectHref(projectId, "/cluster-yaml?tab=health");
  if (tab === "yaml") return projectHref(projectId, "/cluster-yaml?tab=yaml");
  if (tab === "runtime") {
    return projectHref(projectId, "/cluster-yaml?tab=runtime");
  }
  if (tab === "files") {
    return projectHref(projectId, "/cluster-yaml?tab=files");
  }
  return projectHref(projectId, "/cluster-yaml");
}

export function ClusterYamlPage({ projectId }: { projectId: string }) {
  return (
    <Suspense fallback={<EmptyState title="Loading cluster setup" />}>
      <ClusterYamlPageInner projectId={projectId} />
    </Suspense>
  );
}

function ClusterYamlPageInner({ projectId }: { projectId: string }) {
  const { clusterId, clustersLoading } = useAtlasClusterSelection();
  const canWrite = useCan()("inventory.update");
  const q = projectApiQuery(projectId, clusterId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const [content, setContent] = useState("");
  const [draft, setDraft] = useState<ClusterYamlDraft | null>(null);
  const [parsed, setParsed] = useState<ClusterYamlDraft | null>(null);
  const [schemaOk, setSchemaOk] = useState(true);
  const [parseError, setParseError] = useState<string | null>(null);
  const [formDirty, setFormDirty] = useState(false);
  const [yamlDirty, setYamlDirty] = useState(false);
  const [playbooks, setPlaybooks] = useState<ClusterPlaybookRepo[]>([]);
  const [phases, setPhases] = useState<ClusterPhase[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  function ingest(text: string) {
    const result = parseClusterYaml(text);
    setContent(text);
    setDraft(result.draft);
    setParsed(cloneClusterYamlDraft(result.draft));
    setSchemaOk(result.schemaOk);
    setParseError(result.ok ? null : result.error || "Invalid YAML");
    setFormDirty(false);
    setYamlDirty(false);
  }

  useEffect(() => {
    let cancelled = false;
    void stargateJson<{
      content?: string;
      cluster_id?: string;
      playbooks?: ClusterPlaybookRepo[];
      phases?: ClusterPhase[];
    }>(`/projects/${encodeURIComponent(projectId)}/atlas/cluster-yaml?${q}`)
      .then((data) => {
        if (cancelled) return;
        setError(null);
        ingest(data.content || "");
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

  function serializeForm(): string | null {
    if (!draft || !parsed) return content;
    try {
      return applyClusterYamlDraft(content, draft, parsed);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  function setTab(next: string) {
    const target = parseTab(next);
    if (target === tab) return;
    if (tab === "setup" && formDirty) {
      const serialized = serializeForm();
      if (serialized == null) return;
      setContent(serialized);
      if (draft) setParsed(cloneClusterYamlDraft(draft));
      setFormDirty(false);
    }
    if (tab === "yaml" && yamlDirty) {
      const result = parseClusterYaml(content);
      if (!result.ok) {
        toast.error("Fix YAML before leaving this tab");
        return;
      }
      setDraft(result.draft);
      setParsed(cloneClusterYamlDraft(result.draft));
      setSchemaOk(result.schemaOk);
      setParseError(null);
      setYamlDirty(false);
      setFormDirty(false);
    }
    router.replace(tabHref(projectId, target), { scroll: false });
  }

  async function save() {
    let body = content;
    if (tab === "setup") {
      if (!schemaOk || parseError) {
        toast.error("Open YAML to fix this file before saving from Setup");
        return;
      }
      const serialized = serializeForm();
      if (serialized == null) return;
      body = serialized;
    }
    setBusy(true);
    try {
      const data = await stargateJson<{
        playbooks?: ClusterPlaybookRepo[];
        phases?: ClusterPhase[];
      }>(
        `/projects/${encodeURIComponent(projectId)}/atlas/cluster-yaml?${q}`,
        {
          method: "PUT",
          body: JSON.stringify({ content: body, cluster_id: clusterId }),
        },
      );
      ingest(body);
      setPlaybooks(data.playbooks ?? []);
      setPhases(data.phases ?? []);
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const showSave = tab === "setup" || tab === "yaml";

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        kicker="Atlas"
        title="Cluster setup"
        description="Name, playbook sources, run order, and runtime for this cluster"
        actions={
          <div className="flex items-center gap-2">
            {clusterId ? <Badge variant="success">{clusterId}</Badge> : loadedFor ? (
              <Badge variant="success">{loadedFor}</Badge>
            ) : null}
            {showSave && canWrite ? (
              <Button
                onClick={() => void save()}
                disabled={
                  busy ||
                  !clusterId ||
                  (tab === "setup" && (!schemaOk || Boolean(parseError)))
                }
              >
                <Save />
                Save
              </Button>
            ) : null}
          </div>
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line">
          <TabsTrigger value="setup">
            <ListChecks />
            Setup
          </TabsTrigger>
          <TabsTrigger value="health">
            <HeartPulse />
            Health
          </TabsTrigger>
          <TabsTrigger value="yaml">
            <FileCode />
            YAML
          </TabsTrigger>
          <TabsTrigger value="runtime">
            <HardDrive />
            Runtime
          </TabsTrigger>
          <TabsTrigger value="files">
            <FolderTree />
            Files
          </TabsTrigger>
        </TabsList>
        <TabsContent value="setup" className="mt-6">
          {error ? (
            <EmptyState title="cluster.yaml unavailable" description={error} />
          ) : draft ? (
            <ClusterYamlSetupTab
              draft={draft}
              readOnly={!canWrite}
              schemaOk={schemaOk}
              parseError={parseError}
              onOpenYaml={() => setTab("yaml")}
              onChange={(next) => {
                setDraft(next);
                setFormDirty(true);
              }}
            />
          ) : (
            <EmptyState title="Loading cluster setup" />
          )}
        </TabsContent>
        <TabsContent value="health" className="mt-6">
          {tab === "health" ? (
            <ClusterYamlHealthTab
              projectId={projectId}
              clusterId={clusterId}
              playbooks={playbooks}
              phases={phases}
              ready={Boolean(clusterId) && loadedFor === clusterId}
            />
          ) : null}
        </TabsContent>
        <TabsContent value="yaml" className="mt-6 space-y-3">
          {error ? (
            <EmptyState title="cluster.yaml unavailable" description={error} />
          ) : (
            <>
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <FileCode className="mt-0.5 size-4 shrink-0" />
                Edit the file directly. Prefer Setup unless you need fields the form
                does not show.
              </p>
              <YamlEditor
                value={content}
                onChange={(value) => {
                  setContent(value);
                  setYamlDirty(true);
                }}
                readOnly={!canWrite}
              />
            </>
          )}
        </TabsContent>
        <TabsContent value="runtime" className="mt-6">
          <AtlasClusterRuntime
            projectId={projectId}
            clusterId={clusterId}
            loading={clustersLoading}
          />
        </TabsContent>
        <TabsContent value="files" className="mt-6">
          {tab === "files" ? (
            <AtlasRuntimeFilesTab
              projectId={projectId}
              clusterId={clusterId}
              loading={clustersLoading}
            />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
