"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";

import { JsonBlock } from "@/components/json-block";
import {
  createTask,
  parseTagInput,
  type InlineTask,
  type PlayRole,
  type TaskPlacement,
} from "@/components/playbook-editor/types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function TextFieldDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  value,
  placeholder,
  multiline,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  label: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  onSave: (value: string) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  async function submit() {
    setBusy(true);
    try {
      await onSave(draft);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>{label}</Label>
          {multiline ? (
            <Textarea
              className="min-h-28"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
            />
          ) : (
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void submit()}>
            <Save />
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function YamlPreviewDialog({
  open,
  onOpenChange,
  yaml,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  yaml: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>YAML Preview</DialogTitle>
          <DialogDescription>Generated from the current play model.</DialogDescription>
        </DialogHeader>
        <JsonBlock value={yaml || "—"} mask={false} label="yaml" />
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  defaultPlacement,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: InlineTask | null;
  defaultPlacement: TaskPlacement;
  onSave: (task: InlineTask, placement: TaskPlacement) => void;
}) {
  const isEdit = Boolean(task);
  const [name, setName] = useState("");
  const [module, setModule] = useState("command");
  const [args, setArgs] = useState("{}");
  const [when, setWhen] = useState("");
  const [tags, setTags] = useState("");
  const [become, setBecome] = useState(false);
  const [placement, setPlacement] = useState<TaskPlacement>(defaultPlacement);

  useEffect(() => {
    if (!open) return;
    setName(task?.name || "");
    setModule(task?.module || "command");
    setArgs(
      typeof task?.args === "string"
        ? task.args
        : JSON.stringify(task?.args ?? {}, null, 2),
    );
    setWhen(task?.when || "");
    setTags((task?.tags ?? []).join(", "));
    setBecome(Boolean(task?.become));
    const nextPlacement =
      task?.placement === "post_tasks" || task?.placement === "pre_tasks"
        ? task.placement
        : defaultPlacement;
    setPlacement(nextPlacement);
  }, [open, task, defaultPlacement]);

  function submit() {
    const trimmed = name.trim();
    const moduleName = module.trim();
    if (!trimmed) {
      toast.error("Name is required");
      return;
    }
    if (!moduleName) {
      toast.error("Module is required");
      return;
    }
    let parsed: Record<string, unknown> = {};
    const raw = args.trim();
    if (raw) {
      try {
        const value = JSON.parse(raw) as unknown;
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw new Error("args must be a JSON object");
        }
        parsed = value as Record<string, unknown>;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Invalid JSON args");
        return;
      }
    }
    onSave(
      {
        ...(task ?? createTask(placement)),
        name: trimmed,
        module: moduleName,
        args: parsed,
        when: when.trim() || null,
        tags: parseTagInput(tags),
        become,
        placement,
      },
      placement,
    );
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit inline task" : "Add inline task"}</DialogTitle>
          <DialogDescription>
            Tasks run before or after roles in the selected play.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>
              Name <span className="text-destructive">*</span>
            </Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>
              Module <span className="text-destructive">*</span>
            </Label>
            <Input value={module} onChange={(e) => setModule(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Args (JSON)</Label>
            <Textarea
              className="min-h-28 font-mono text-xs"
              value={args}
              onChange={(e) => setArgs(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>When (optional)</Label>
            <Input value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Tags (comma-separated)</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
          {!isEdit ? (
            <div className="space-y-1.5">
              <Label>Placement</Label>
              <Select
                value={placement}
                onValueChange={(value) => {
                  if (value === "pre_tasks" || value === "post_tasks") {
                    setPlacement(value);
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  side="bottom"
                  align="start"
                  alignItemWithTrigger={false}
                  positionMethod="fixed"
                >
                  <SelectItem value="pre_tasks">Pre-tasks</SelectItem>
                  <SelectItem value="post_tasks">Post-tasks</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={become}
              onCheckedChange={(value) => setBecome(value === true)}
            />
            Become
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>
            <Save />
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RoleFormDialog({
  open,
  onOpenChange,
  role,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: PlayRole | null;
  onSave: (role: PlayRole) => void;
}) {
  const [tag, setTag] = useState("");
  const [auto, setAuto] = useState(true);
  const [vars, setVars] = useState("");

  useEffect(() => {
    if (!open) return;
    setTag(role?.tag || "");
    setAuto(role?.auto !== false);
    setVars(
      role?.vars_override && Object.keys(role.vars_override).length
        ? JSON.stringify(role.vars_override, null, 2)
        : "",
    );
  }, [open, role]);

  function submit() {
    let varsOverride: Record<string, unknown> | null = null;
    const raw = vars.trim();
    if (raw) {
      try {
        const value = JSON.parse(raw) as unknown;
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw new Error("vars must be a JSON object");
        }
        varsOverride = value as Record<string, unknown>;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Invalid JSON vars");
        return;
      }
    }
    onSave({
      ...(role ?? {}),
      tag: tag.trim(),
      auto,
      vars_override: varsOverride,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit role: {role?.role_name || "Unknown"}</DialogTitle>
          <DialogDescription>Tag, auto include, and variable overrides.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tag</Label>
            <Input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="Leave empty for default"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={auto}
              onCheckedChange={(value) => setAuto(value === true)}
            />
            Auto (automatically included)
          </label>
          <div className="space-y-1.5">
            <Label>Variables override (JSON)</Label>
            <Textarea
              className="min-h-32 font-mono text-xs"
              value={vars}
              onChange={(e) => setVars(e.target.value)}
              placeholder='{ "nginx_port": 6379 }'
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>
            <Save />
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
