"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { AtlasSourcesPanel } from "@/components/atlas-sources-panel";
import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { GitSourcesPanel } from "@/components/git-sources-panel";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchProject, stargateJson } from "@/lib/stargate";
import type { StargateProject } from "@/lib/project-types";

export type ProjectSettingsInnerTab = "sources" | "project";

export function parseProjectSettingsInnerTab(
  value: string | null,
): ProjectSettingsInnerTab {
  return value === "project" ? "project" : "sources";
}

export function ProjectSettingsView({
  projectId,
  innerTab,
  onInnerTabChange,
}: {
  projectId: string;
  innerTab: ProjectSettingsInnerTab;
  onInnerTabChange: (tab: ProjectSettingsInnerTab) => void;
}) {
  const router = useRouter();
  const [project, setProject] = useState<StargateProject | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"archive" | "restore" | "delete" | null>(
    null,
  );

  useEffect(() => {
    void fetchProject(projectId)
      .then((p) => {
        setProject(p);
        setName(p.name);
        setDescription(p.description ?? "");
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, [projectId]);

  async function save() {
    try {
      await stargateJson(`/projects/${projectId}`, {
        method: "PUT",
        body: JSON.stringify({ name, description }),
      });
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function archive() {
    try {
      const data = await stargateJson<{ project?: StargateProject }>(
        `/projects/${projectId}`,
        {
          method: "PUT",
          body: JSON.stringify({ isArchived: true }),
        },
      );
      if (data.project) {
        setProject(data.project);
      }
      toast.success("Archived");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function restore() {
    try {
      const data = await stargateJson<{ project?: StargateProject }>(
        `/projects/${projectId}/restore`,
        { method: "POST" },
      );
      if (data.project) {
        setProject(data.project);
      } else {
        setProject((prev) => (prev ? { ...prev, isArchived: false } : prev));
      }
      toast.success("Restored");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function remove() {
    try {
      await stargateJson(`/projects/${projectId}`, { method: "DELETE" });
      toast.success("Deleted");
      router.push("/projects");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  if (error) {
    return <EmptyState title="Settings unavailable" description={error} />;
  }

  if (!project) {
    return <EmptyState title="Loading settings" />;
  }

  const archived = Boolean(project.isArchived);
  const ansible = project.kind === "ansible";
  const atlas = project.kind === "atlas";

  return (
    <div>
      <PageHeader
        kicker="Project"
        title="Project Settings"
        description={
          <div className="space-y-3">
            <p>Project configuration, sources, and policies</p>
            <Badge variant="success">Project: {project.name}</Badge>
          </div>
        }
        actions={
          innerTab === "project" ? (
            <Button onClick={() => void save()}>Save</Button>
          ) : null
        }
      />
      <Tabs
        value={innerTab}
        onValueChange={(next) =>
          onInnerTabChange(parseProjectSettingsInnerTab(next))
        }
      >
        <TabsList>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="project">Project</TabsTrigger>
        </TabsList>
        <TabsContent value="sources" className="mt-6">
          {ansible ? (
            <GitSourcesPanel projectId={projectId} />
          ) : atlas ? (
            <AtlasSourcesPanel
              projectId={projectId}
              project={project}
              onProject={setProject}
            />
          ) : null}
        </TabsContent>
        <TabsContent value="project" className="mt-6">
          <Panel className="max-w-lg space-y-4 p-6">
            <div className="space-y-2">
              <Label>Kind</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{project.kind ?? "—"}</Badge>
                {archived ? <Badge variant="warning">archived</Badge> : null}
              </div>
            </div>
            {project.kind === "atlas" ? (
              <div className="space-y-2">
                <Label>Cluster id</Label>
                <Input value={project.cluster_id ?? ""} readOnly />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </Panel>
          <Panel className="mt-6 max-w-lg space-y-3 p-6">
            <p className="text-sm text-muted-foreground">
              Archive hides the project from the default list. Delete removes the
              project record and its on-disk directory.
            </p>
            <div className="flex flex-wrap gap-2">
              {archived ? (
                <Button variant="outline" onClick={() => setConfirm("restore")}>
                  Restore
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setConfirm("archive")}>
                  Archive
                </Button>
              )}
              <Button variant="destructive" onClick={() => setConfirm("delete")}>
                Delete
              </Button>
            </div>
          </Panel>
          <ConfirmAction
            open={confirm === "archive"}
            onOpenChange={(open) => setConfirm(open ? "archive" : null)}
            title="Archive this project?"
            description="It will be hidden from the default projects list until restored."
            confirmLabel="Archive"
            onConfirm={archive}
          />
          <ConfirmAction
            open={confirm === "restore"}
            onOpenChange={(open) => setConfirm(open ? "restore" : null)}
            title="Restore this project?"
            description="The project will appear in the default list again."
            confirmLabel="Restore"
            onConfirm={restore}
          />
          <ConfirmAction
            open={confirm === "delete"}
            onOpenChange={(open) => setConfirm(open ? "delete" : null)}
            title="Delete this project permanently?"
            description="This removes the project record and its directory. This cannot be undone."
            confirmLabel="Delete"
            destructive
            onConfirm={remove}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
