"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { projectHref } from "@/lib/project-href";
import { createProject } from "@/lib/stargate";
import type { ProjectKind } from "@/lib/project-types";

export function CreateProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<ProjectKind>("ansible");
  const [clusterId, setClusterId] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const project = await createProject({
        name,
        description,
        kind,
        cluster_id: kind === "atlas" ? clusterId : undefined,
      });
      toast.success("Project created");
      router.push(projectHref(project.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        kicker="Workspace"
        title="New project"
        description="Kind is required and cannot be changed after create."
      />
      <Panel className="max-w-lg">
        <form className="space-y-4 p-6" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
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
          <div className="space-y-2">
            <Label>Kind</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={kind === "ansible" ? "default" : "outline"}
                onClick={() => setKind("ansible")}
              >
                Ansible
              </Button>
              <Button
                type="button"
                variant={kind === "atlas" ? "default" : "outline"}
                onClick={() => setKind("atlas")}
              >
                Atlas
              </Button>
            </div>
          </div>
          {kind === "atlas" ? (
            <div className="space-y-2">
              <Label htmlFor="cluster_id">Cluster id</Label>
              <Input
                id="cluster_id"
                placeholder="dev/k8s"
                value={clusterId}
                onChange={(e) => setClusterId(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Inventory leaf, for example dev/k8s. No Ansible repo skeleton is
                created.
              </p>
            </div>
          ) : null}
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </form>
      </Panel>
    </div>
  );
}
