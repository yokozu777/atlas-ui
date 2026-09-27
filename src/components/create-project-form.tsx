"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { projectKindButtonClass } from "@/components/project-kind-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { projectHref } from "@/lib/project-href";
import { useAuthz } from "@/lib/authz";
import { createProject } from "@/lib/stargate";
import type { ProjectKind } from "@/lib/project-types";

export function CreateProjectForm() {
  const router = useRouter();
  const { ready, can } = useAuthz();
  const canCreate = can("projects.create");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<ProjectKind | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!kind || !canCreate) {
      toast.error(canCreate ? "Choose Ansible or Atlas" : "projects.create required");
      return;
    }
    setBusy(true);
    try {
      const project = await createProject({
        name,
        description,
        kind,
      });
      toast.success("Project created");
      router.push(projectHref(project.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return <EmptyState title="Loading project form" />;
  }
  if (!canCreate) {
    return (
      <EmptyState title="Forbidden" description="projects.create required" />
    );
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
            <div className="flex gap-2" role="group" aria-label="Project kind">
              <Button
                type="button"
                variant="outline"
                aria-pressed={kind === "ansible"}
                className={projectKindButtonClass("ansible", kind === "ansible")}
                onClick={() => setKind("ansible")}
              >
                Ansible
              </Button>
              <Button
                type="button"
                variant="outline"
                aria-pressed={kind === "atlas"}
                className={projectKindButtonClass("atlas", kind === "atlas")}
                onClick={() => setKind("atlas")}
              >
                Atlas
              </Button>
            </div>
            {kind === "ansible" ? (
              <p className="text-xs text-muted-foreground">
                Ansible projects hold playbooks, inventory, Git sources, and the
                scheduler. Pull sources under Project Settings, then run
                playbooks from this project.
              </p>
            ) : kind === "atlas" ? (
              <p className="text-xs text-muted-foreground">
                Atlas projects are not bound to a single cluster id. Scaffold
                leaves with Init, then pick a cluster in the header switcher.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Choose Ansible or Atlas. Kind cannot be changed after create.
              </p>
            )}
          </div>
          <Button type="submit" disabled={busy || !kind || !canCreate}>
            {busy ? "Creating…" : canCreate ? "Create" : "projects.create required"}
          </Button>
        </form>
      </Panel>
    </div>
  );
}
