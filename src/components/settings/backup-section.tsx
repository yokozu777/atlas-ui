"use client";

import { useEffect, useState } from "react";
import { Database, Download, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { SettingsHint, SettingsSection } from "@/components/settings/settings-section";
import { StackList, StackListRow } from "@/components/stack-list";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchProjects, stargateDownload, stargateJson } from "@/lib/stargate";
import type { StargateProject } from "@/lib/project-types";

type BackupSettings = {
  max_depth?: number;
  projects?: Record<string, { enabled?: boolean }>;
};

type ArchiveRow = {
  name: string;
  path: string;
  size?: number;
  modified?: number;
};

export function BackupSection() {
  const [settings, setSettings] = useState<BackupSettings>({ max_depth: 100, projects: {} });
  const [depth, setDepth] = useState("100");
  const [projects, setProjects] = useState<StargateProject[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [picker, setPicker] = useState<{
    projectId: string;
    mode: "download" | "restore";
    archives: ArchiveRow[];
  } | null>(null);
  const [restore, setRestore] = useState<{ projectId: string; path: string } | null>(
    null,
  );

  async function load() {
    const [backup, rows] = await Promise.all([
      stargateJson<{ settings?: BackupSettings }>("/backup-settings"),
      fetchProjects(),
    ]);
    const next = backup.settings ?? { max_depth: 100, projects: {} };
    setSettings(next);
    setDepth(String(next.max_depth ?? 100));
    setProjects(rows.filter((row) => !row.isArchived));
  }

  useEffect(() => {
    void load().catch((err: unknown) =>
      toast.error(err instanceof Error ? err.message : String(err)),
    );
  }, []);

  async function saveSettings(partial: BackupSettings) {
    const data = await stargateJson<{ settings?: BackupSettings }>("/backup-settings", {
      method: "PUT",
      body: JSON.stringify(partial),
    });
    const next = data.settings ?? settings;
    setSettings(next);
    setDepth(String(next.max_depth ?? 100));
  }

  async function commitDepth() {
    const value = Number(depth);
    if (!Number.isFinite(value) || value < 1) {
      toast.error("Backup depth must be greater than 0");
      return;
    }
    try {
      await saveSettings({ max_depth: value });
      toast.success("Backup depth saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function toggleProject(projectId: string, enabled: boolean) {
    try {
      await saveSettings({
        projects: { [projectId]: { enabled } },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function backupNow(projectId: string) {
    setBusyId(projectId);
    try {
      await stargateJson("/backups/create", {
        method: "POST",
        body: JSON.stringify({ project_id: projectId, reason: "manual" }),
      });
      toast.success("Backup created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function openArchives(projectId: string, mode: "download" | "restore") {
    setBusyId(projectId);
    try {
      const data = await stargateJson<{ archives?: ArchiveRow[] }>(
        `/backups/archives/list?project_id=${encodeURIComponent(projectId)}`,
      );
      const archives = data.archives ?? [];
      if (archives.length === 0) {
        toast.error("No archives for this project");
        return;
      }
      setPicker({ projectId, mode, archives });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function downloadArchive(projectId: string, path: string, name: string) {
    try {
      await stargateDownload(
        `/backups/archives/download?project_id=${encodeURIComponent(projectId)}&path=${encodeURIComponent(path)}`,
        name,
      );
      setPicker(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <SettingsSection icon={<Database className="size-4" />} title="System / Automation">
      <SettingsHint>
        Recommended to enable for production environments. Creates a backup copy
        of the project directory. If enabled, an automatic backup can be created
        after each change inside the project.
      </SettingsHint>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>Backup depth (for all projects)</Label>
          <Input
            className="w-24"
            type="number"
            min={1}
            value={depth}
            onChange={(e) => setDepth(e.target.value)}
            onBlur={() => void commitDepth()}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Maximum number of backups to keep per project.
        </p>
      </div>
      <div className="space-y-2">
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects yet.</p>
        ) : (
          projects.map((project) => {
            const enabled = Boolean(settings.projects?.[project.id]?.enabled);
            return (
              <div
                key={project.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{project.name}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {project.id}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={enabled}
                    onCheckedChange={(value) =>
                      void toggleProject(project.id, value === true)
                    }
                  />
                  Automatic backup
                </label>
                <div className="flex flex-wrap gap-1">
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={busyId === project.id}
                    onClick={() => void backupNow(project.id)}
                  >
                    Backup Now
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={busyId === project.id}
                    onClick={() => void openArchives(project.id, "download")}
                  >
                    <Download />
                    Download
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={busyId === project.id}
                    onClick={() => void openArchives(project.id, "restore")}
                  >
                    <RotateCcw />
                    Restore
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
      <Dialog
        open={Boolean(picker)}
        onOpenChange={(open) => {
          if (!open) setPicker(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {picker?.mode === "restore" ? "Restore archive" : "Download archive"}
            </DialogTitle>
            <DialogDescription>
              Choose a tar.gz archive for this project.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto">
            <StackList>
              {picker?.archives.map((row) => (
                <StackListRow
                  key={row.path}
                  className="px-2 py-2"
                  onClick={() => {
                    if (!picker) return;
                    if (picker.mode === "download") {
                      void downloadArchive(picker.projectId, row.path, row.name);
                      return;
                    }
                    setRestore({ projectId: picker.projectId, path: row.path });
                    setPicker(null);
                  }}
                  title={
                    <span className="font-mono text-xs font-normal">{row.name}</span>
                  }
                  trailing={
                    <span className="text-xs text-muted-foreground">
                      {row.size
                        ? `${Math.max(1, Math.round((row.size || 0) / 1024))} KB`
                        : ""}
                    </span>
                  }
                />
              ))}
            </StackList>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPicker(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmAction
        open={Boolean(restore)}
        onOpenChange={(open) => {
          if (!open) setRestore(null);
        }}
        title="Restore this archive?"
        description="Project files will be overwritten from the selected backup."
        confirmLabel="Restore"
        destructive
        onConfirm={() => {
          if (!restore) return;
          void stargateJson("/backups/archives/restore", {
            method: "POST",
            body: JSON.stringify({
              project_id: restore.projectId,
              path: restore.path,
            }),
          })
            .then(() => toast.success("Project restored"))
            .catch((err: unknown) =>
              toast.error(err instanceof Error ? err.message : String(err)),
            );
        }}
      />
    </SettingsSection>
  );
}
