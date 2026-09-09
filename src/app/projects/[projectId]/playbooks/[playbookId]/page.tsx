"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { useAtlasClusterSelection } from "@/components/atlas-cluster-selection";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PlaybookEditorPage } from "@/components/playbook-editor/playbook-editor-page";
import { YamlEditor } from "@/components/yaml-editor";
import { Button } from "@/components/ui/button";
import { projectHref } from "@/lib/project-href";
import { fetchProject, stargateJson } from "@/lib/stargate";

export default function PlaybookPage({
  params,
}: {
  params: Promise<{ projectId: string; playbookId: string }>;
}) {
  const { projectId, playbookId } = use(params);
  const id = decodeURIComponent(projectId);
  const pbId = decodeURIComponent(playbookId);
  const { clusterId } = useAtlasClusterSelection();
  const [kind, setKind] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchProject(id)
      .then((project) => {
        if (!cancelled) {
          setKind(project.kind);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return <EmptyState title="Playbook unavailable" description={error} />;
  }
  if (!kind) {
    return <EmptyState title="Loading playbook" />;
  }
  if (kind === "atlas") {
    return (
      <AtlasPlaybookYamlPage
        projectId={id}
        playbookId={pbId}
        clusterId={clusterId}
      />
    );
  }
  return <PlaybookEditorPage projectId={id} playbookId={pbId} />;
}

function AtlasPlaybookYamlPage({
  projectId,
  playbookId,
  clusterId,
}: {
  projectId: string;
  playbookId: string;
  clusterId: string | null;
}) {
  const [name, setName] = useState(playbookId);
  const [file, setFile] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clusterQuery = clusterId
    ? `?cluster_id=${encodeURIComponent(clusterId)}`
    : "";

  useEffect(() => {
    let cancelled = false;
    void stargateJson<{
      playbook?: { name?: string; file?: string; yaml?: string };
    }>(
      `/projects/${encodeURIComponent(projectId)}/playbooks/${encodeURIComponent(playbookId)}${clusterQuery}`,
    )
      .then((data) => {
        if (cancelled) {
          return;
        }
        setName(data.playbook?.name || playbookId);
        setFile(data.playbook?.file || "");
        setContent(data.playbook?.yaml || "");
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, playbookId, clusterQuery]);

  async function save() {
    setBusy(true);
    try {
      await stargateJson(
        `/projects/${encodeURIComponent(projectId)}/playbooks/${encodeURIComponent(playbookId)}${clusterQuery}`,
        {
          method: "PUT",
          body: JSON.stringify({ yaml: content, cluster_id: clusterId }),
        },
      );
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return <EmptyState title="Playbook unavailable" description={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        kicker="Infrastructure"
        title={name}
        description={file || "YAML from the cluster playbook repo"}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              render={<Link href={projectHref(projectId, "/playbooks")} />}
            >
              Back
            </Button>
            <Button onClick={() => void save()} disabled={busy}>
              Save
            </Button>
          </div>
        }
      />
      <YamlEditor value={content} onChange={setContent} />
    </div>
  );
}
