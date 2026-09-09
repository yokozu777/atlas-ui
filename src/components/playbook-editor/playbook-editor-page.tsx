"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlignLeft,
  ArrowLeft,
  Ban,
  CheckCircle,
  Eye,
  Pencil,
  Save,
  Tag,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { AddRoleSheet } from "@/components/playbook-editor/add-role-sheet";
import { PlaySettings } from "@/components/playbook-editor/play-settings";
import {
  RoleFormDialog,
  TaskFormDialog,
  TextFieldDialog,
  YamlPreviewDialog,
} from "@/components/playbook-editor/playbook-dialogs";
import { PlaysSidebar } from "@/components/playbook-editor/plays-sidebar";
import {
  createPlay,
  isPlaybookDisabled,
  moveItem,
  normalizePlaybook,
  parseTagInput,
  playTags,
  rolePaths,
  type GroupInfo,
  type Play,
  type PlayRole,
  type PlaybookDoc,
  type PlaybookValidation,
  type RoleNode,
  type TaskPlacement,
} from "@/components/playbook-editor/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { inventoryFilesQuery as hostInventoryQuery } from "@/components/hosts-groups/helpers";
import { fetchProject, stargateJson } from "@/lib/stargate";
import { projectHref } from "@/lib/project-href";
import type { StargateProject } from "@/lib/project-types";

const SELECTED_FILES_KEY = "atlas-ui:inventory-files";

function readStoredFiles(projectId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(`${SELECTED_FILES_KEY}:${projectId}`);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function PlaybookEditorPage({
  projectId,
  playbookId,
}: {
  projectId: string;
  playbookId: string;
}) {
  const q = `project_id=${encodeURIComponent(projectId)}`;
  const [project, setProject] = useState<StargateProject | null>(null);
  const [playbook, setPlaybook] = useState<PlaybookDoc | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [groups, setGroups] = useState<Record<string, GroupInfo>>({});
  const [hosts, setHosts] = useState<string[]>([]);
  const [roleTree, setRoleTree] = useState<RoleNode[]>([]);
  const [validation, setValidation] = useState<PlaybookValidation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [yaml, setYaml] = useState("");
  const [yamlOpen, setYamlOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [roleSheetOpen, setRoleSheetOpen] = useState(false);
  const [deletePlay, setDeletePlay] = useState<Play | null>(null);
  const [editRoleIndex, setEditRoleIndex] = useState<number | null>(null);
  const [taskDialog, setTaskDialog] = useState<{
    placement: TaskPlacement;
    index: number | null;
  } | null>(null);

  const plays = playbook?.plays ?? [];
  const selectedPlay = plays.find((play) => play.id === selectedId) ?? null;
  const availableRolePaths = useMemo(() => rolePaths(roleTree), [roleTree]);
  const extra = hostInventoryQuery(readStoredFiles(projectId));

  function applyPlaybook(next: PlaybookDoc, markDirty = true) {
    const normalized = normalizePlaybook(next);
    setPlaybook(normalized);
    setSelectedId((current) => {
      if (current && normalized.plays?.some((play) => play.id === current)) {
        return current;
      }
      return normalized.plays?.[0]?.id ?? null;
    });
    if (markDirty) setDirty(true);
  }

  function updatePlay(playId: string, patch: Partial<Play>) {
    if (!playbook) return;
    applyPlaybook({
      ...playbook,
      plays: plays.map((play) =>
        play.id === playId ? { ...play, ...patch } : play,
      ),
    });
  }

  async function persist(patch?: Partial<PlaybookDoc>) {
    if (!playbook) return;
    const next = normalizePlaybook({ ...playbook, ...patch });
    setBusy(true);
    try {
      const data = await stargateJson<{ playbook?: PlaybookDoc }>(
        `/projects/${projectId}/playbooks/${playbookId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            name: next.name,
            description: next.description ?? "",
            plays: next.plays,
            tags: playTags(next),
            disabled: isPlaybookDisabled(next),
          }),
        },
      );
      applyPlaybook(data.playbook ?? next, false);
      setDirty(false);
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function runValidate(target = playbook, silent = false) {
    if (!target) return;
    try {
      const data = await stargateJson<{ validation?: PlaybookValidation }>(
        `/projects/${projectId}/playbooks/${playbookId}/validate`,
        {
          method: "POST",
          body: JSON.stringify({
            playbook: target,
            inventory_groups: groups,
            available_roles: availableRolePaths,
          }),
        },
      );
      setValidation(data.validation ?? null);
      if (silent) return;
      const errors = data.validation?.summary?.total_errors ?? 0;
      const warnings = data.validation?.summary?.total_warnings ?? 0;
      if (errors) {
        toast.error(`Validation found ${errors} error(s) and ${warnings} warning(s)`);
      } else if (warnings) {
        toast.warning(`Validation found ${warnings} warning(s)`);
      } else {
        toast.success("Playbook is valid");
      }
    } catch (err) {
      if (!silent) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    }
  }

  useEffect(() => {
    void fetchProject(projectId)
      .then(setProject)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, [projectId]);

  useEffect(() => {
    void (async () => {
      const [pb, hostData, groupData, rolesData] = await Promise.all([
        stargateJson<{ playbook?: PlaybookDoc }>(
          `/projects/${projectId}/playbooks/${playbookId}`,
        ),
        stargateJson<{ hosts?: unknown[] }>(`/inventory/hosts?${q}${extra}`).catch(
          () => ({ hosts: [] }),
        ),
        stargateJson<{ groups?: Record<string, GroupInfo> }>(
          `/inventory/groups?${q}${extra}`,
        ).catch(() => ({ groups: {} })),
        stargateJson<{ tree?: RoleNode[] }>(`/roles/storage?${q}`).catch(() => ({
          tree: [],
        })),
      ]);
      const loaded = normalizePlaybook(pb.playbook ?? {});
      setPlaybook(loaded);
      setSelectedId(loaded.plays?.[0]?.id ?? null);
      setDirty(false);
      setHosts(
        (hostData.hosts ?? []).map((host) =>
          typeof host === "string" ? host : String(host),
        ),
      );
      setGroups(groupData.groups ?? {});
      setRoleTree(rolesData.tree ?? []);
      try {
        const validated = await stargateJson<{ validation?: PlaybookValidation }>(
          `/projects/${projectId}/playbooks/${playbookId}/validate`,
          {
            method: "POST",
            body: JSON.stringify({
              playbook: loaded,
              inventory_groups: groupData.groups ?? {},
              available_roles: rolePaths(rolesData.tree ?? []),
            }),
          },
        );
        setValidation(validated.validation ?? null);
      } catch {
        setValidation(null);
      }
    })().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, playbookId]);

  if (error) {
    return <EmptyState title="Playbook unavailable" description={error} />;
  }
  if (!playbook) {
    return <EmptyState title="Loading playbook" />;
  }

  const disabled = isPlaybookDisabled(playbook);
  const editingRole =
    editRoleIndex != null ? selectedPlay?.roles?.[editRoleIndex] ?? null : null;
  const editingTask =
    taskDialog && taskDialog.index != null && selectedPlay
      ? (selectedPlay[taskDialog.placement] ?? [])[taskDialog.index]
      : null;

  return (
    <div>
      <PageHeader
        kicker="Infrastructure"
        title={`Playbook editor · ${playbook.name}`}
        description={
          <div className="space-y-3">
            <p>Edit Ansible playbook</p>
            {project ? (
              <Badge variant="success">Project: {project.name}</Badge>
            ) : null}
          </div>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              render={<Link href={projectHref(projectId, "/playbooks")} />}
            >
              <ArrowLeft />
              Back
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void runValidate(playbook, false)}
            >
              <CheckCircle />
              Validate
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void (async () => {
                  try {
                    const data = await stargateJson<{ yaml?: string }>(
                      `/projects/${projectId}/playbooks/${playbookId}/preview`,
                      {
                        method: "POST",
                        body: JSON.stringify({ playbook }),
                      },
                    );
                    setYaml(data.yaml || "");
                    setYamlOpen(true);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : String(err));
                  }
                })();
              }}
            >
              <Eye />
              Preview YAML
            </Button>
            <Button size="sm" variant="outline" onClick={() => setTagOpen(true)}>
              <Tag />
              Tag
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDescOpen(true)}>
              <AlignLeft />
              Set Description
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRenameOpen(true)}>
              <Pencil />
              Rename
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void persist({ disabled: !disabled })}
            >
              <Ban />
              {disabled ? "Enable" : "Disable"}
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void persist()}>
              <Save />
              Save
            </Button>
          </div>
        }
      />
      {dirty ? (
        <p className="mb-4 text-sm text-muted-foreground">Unsaved changes</p>
      ) : null}
      <div className="flex min-h-[70vh] items-stretch gap-4">
        <PlaysSidebar
          plays={plays}
          selectedId={selectedId}
          validation={validation}
          onSelect={setSelectedId}
          onAdd={() => {
            const play = createPlay();
            applyPlaybook({ ...playbook, plays: [...plays, play] });
            setSelectedId(play.id ?? null);
          }}
          onDelete={setDeletePlay}
          onMove={(index, delta) =>
            applyPlaybook({ ...playbook, plays: moveItem(plays, index, delta) })
          }
        />
        <PlaySettings
          play={selectedPlay}
          groups={groups}
          hosts={hosts}
          validation={validation}
          onChange={(patch) => {
            if (selectedPlay?.id) updatePlay(selectedPlay.id, patch);
          }}
          onAddRole={() => setRoleSheetOpen(true)}
          onEditRole={setEditRoleIndex}
          onDeleteRole={(index) => {
            if (!selectedPlay?.id) return;
            updatePlay(selectedPlay.id, {
              roles: (selectedPlay.roles ?? []).filter((_, i) => i !== index),
            });
          }}
          onMoveRole={(index, delta) => {
            if (!selectedPlay?.id) return;
            updatePlay(selectedPlay.id, {
              roles: moveItem(selectedPlay.roles ?? [], index, delta),
            });
          }}
          onAddTask={(placement) => setTaskDialog({ placement, index: null })}
          onEditTask={(placement, index) => setTaskDialog({ placement, index })}
          onDeleteTask={(placement, index) => {
            if (!selectedPlay?.id) return;
            updatePlay(selectedPlay.id, {
              [placement]: (selectedPlay[placement] ?? []).filter((_, i) => i !== index),
            });
          }}
        />
      </div>
      <AddRoleSheet
        open={roleSheetOpen}
        onOpenChange={setRoleSheetOpen}
        tree={roleTree}
        onAdd={(role) => {
          if (!selectedPlay?.id) return;
          const nextRole: PlayRole = {
            role_name: role.fullPath,
            tag: "",
            auto: true,
            vars_override: null,
          };
          updatePlay(selectedPlay.id, {
            roles: [...(selectedPlay.roles ?? []), nextRole],
          });
        }}
      />
      <TextFieldDialog
        open={tagOpen}
        onOpenChange={setTagOpen}
        title="Playbook tags"
        description="Comma-separated tags for this playbook."
        label="Tags"
        value={playTags(playbook).join(", ")}
        placeholder="production, redis"
        onSave={(value) => persist({ tags: parseTagInput(value) })}
      />
      <TextFieldDialog
        open={descOpen}
        onOpenChange={setDescOpen}
        title="Set description"
        description="Short description shown in the playbook catalog."
        label="Description"
        value={playbook.description || ""}
        multiline
        onSave={(value) => persist({ description: value })}
      />
      <TextFieldDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title="Rename playbook"
        description="Playbook name must be unique in this project."
        label="Name"
        value={playbook.name || ""}
        onSave={(value) => persist({ name: value.trim() })}
      />
      <YamlPreviewDialog open={yamlOpen} onOpenChange={setYamlOpen} yaml={yaml} />
      <RoleFormDialog
        open={editRoleIndex != null}
        onOpenChange={(open) => {
          if (!open) setEditRoleIndex(null);
        }}
        role={editingRole}
        onSave={(role) => {
          if (!selectedPlay?.id || editRoleIndex == null) return;
          const roles = [...(selectedPlay.roles ?? [])];
          roles[editRoleIndex] = role;
          updatePlay(selectedPlay.id, { roles });
        }}
      />
      <TaskFormDialog
        open={Boolean(taskDialog)}
        onOpenChange={(open) => {
          if (!open) setTaskDialog(null);
        }}
        task={editingTask}
        defaultPlacement={taskDialog?.placement ?? "pre_tasks"}
        onSave={(task, placement) => {
          if (!selectedPlay?.id || !taskDialog) return;
          const list = [...(selectedPlay[placement] ?? [])];
          if (taskDialog.index == null) {
            list.push(task);
          } else if (placement === taskDialog.placement) {
            list[taskDialog.index] = task;
          } else {
            updatePlay(selectedPlay.id, {
              [taskDialog.placement]: (selectedPlay[taskDialog.placement] ?? []).filter(
                (_, i) => i !== taskDialog.index,
              ),
              [placement]: [...(selectedPlay[placement] ?? []), task],
            });
            return;
          }
          updatePlay(selectedPlay.id, { [placement]: list });
        }}
      />
      <ConfirmAction
        open={Boolean(deletePlay)}
        onOpenChange={(open) => {
          if (!open) setDeletePlay(null);
        }}
        title="Delete this play?"
        description={deletePlay?.name || deletePlay?.id || ""}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (!deletePlay?.id) return;
          const nextPlays = plays.filter((play) => play.id !== deletePlay.id);
          applyPlaybook({ ...playbook, plays: nextPlays });
        }}
      />
    </div>
  );
}
