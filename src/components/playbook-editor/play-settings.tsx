"use client";

import {
  ChevronDown,
  ChevronUp,
  Folder,
  Server,
  Settings,
  Trash2,
  Zap,
} from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Panel } from "@/components/panel";
import {
  fieldIssue,
  hostsList,
  playValidationOf,
  type GroupInfo,
  type InlineTask,
  type Play,
  type PlayRole,
  type PlaybookValidation,
  type TaskPlacement,
} from "@/components/playbook-editor/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

function Chip({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm",
        checked ? "border-primary bg-primary/10" : "border-border",
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
      />
      {label}
    </label>
  );
}

export function PlaySettings({
  play,
  groups,
  hosts,
  validation,
  onChange,
  onAddRole,
  onEditRole,
  onDeleteRole,
  onMoveRole,
  onAddTask,
  onEditTask,
  onDeleteTask,
}: {
  play: Play | null;
  groups: Record<string, GroupInfo>;
  hosts: string[];
  validation: PlaybookValidation | null;
  onChange: (patch: Partial<Play>) => void;
  onAddRole: () => void;
  onEditRole: (index: number) => void;
  onDeleteRole: (index: number) => void;
  onMoveRole: (index: number, delta: number) => void;
  onAddTask: (placement: TaskPlacement) => void;
  onEditTask: (placement: TaskPlacement, index: number) => void;
  onDeleteTask: (placement: TaskPlacement, index: number) => void;
}) {
  if (!play) {
    return (
      <Panel className="flex-1 p-6">
        <EmptyState
          title="No play selected"
          description="Add a play or select one from the list."
        />
      </Panel>
    );
  }

  const selected = hostsList(play.hosts);
  const groupNames = Object.keys(groups);
  const playVal = playValidationOf(validation, play.id);
  const hostsIssue = fieldIssue(playVal?.errors, "hosts") || fieldIssue(playVal?.warnings, "hosts");
  const rolesIssue = fieldIssue(playVal?.errors, "roles");

  function toggleHost(value: string, checked: boolean) {
    const next = checked
      ? [...selected, value]
      : selected.filter((item) => item !== value);
    onChange({ hosts: [...new Set(next)] });
  }

  return (
    <Panel className="min-w-0 flex-1 overflow-y-auto p-6">
      <h2 className="mb-6 font-display text-2xl font-medium tracking-tight">
        Play Settings
      </h2>
      <div className="mb-5 space-y-1.5">
        <Label>Play name</Label>
        <Input
          value={play.name || ""}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </div>
      <div className="mb-5 space-y-2">
        <Label>
          <Folder className="size-3.5" />
          GROUPS
        </Label>
        <div className="max-h-48 overflow-y-auto rounded-lg border border-border p-2">
          {groupNames.length === 0 ? (
            <p className="p-3 text-center text-sm text-muted-foreground">
              No groups available in inventory
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {groupNames.map((group) => (
                <Chip
                  key={group}
                  label={group}
                  checked={selected.includes(group)}
                  onChange={(checked) => toggleHost(group, checked)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="mb-5 space-y-2">
        <Label>
          <Server className="size-3.5" />
          HOSTS
        </Label>
        <div className="max-h-48 overflow-y-auto rounded-lg border border-border p-2">
          {hosts.length === 0 ? (
            <p className="p-3 text-center text-sm text-muted-foreground">
              No hosts available in inventory
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {hosts.map((host) => (
                <Chip
                  key={host}
                  label={host}
                  checked={selected.includes(host)}
                  onChange={(checked) => toggleHost(host, checked)}
                />
              ))}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {selected.length
            ? `Selected: ${selected.join(", ")}`
            : "No groups or hosts selected"}
        </p>
        {hostsIssue?.message ? (
          <p className="text-xs text-destructive">{hostsIssue.message}</p>
        ) : null}
      </div>
      <div className="mb-5 space-y-1.5">
        <Label>Remote user</Label>
        <Input
          value={play.remote_user || ""}
          onChange={(e) => onChange({ remote_user: e.target.value || null })}
          placeholder="Leave empty for default"
        />
      </div>
      <label className="mb-5 flex items-center gap-2 text-sm font-medium">
        <Checkbox
          checked={Boolean(play.become)}
          onCheckedChange={(value) => onChange({ become: value === true })}
        />
        Become (sudo/su)
      </label>
      <div className="mb-8 space-y-1.5">
        <Label>Strategy</Label>
        <Select
          value={play.strategy || "linear"}
          onValueChange={(value) => {
            if (value) onChange({ strategy: value });
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="linear">Linear</SelectItem>
            <SelectItem value="free">Free</SelectItem>
            <SelectItem value="debug">Debug</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <TaskSection
        title="PRE-TASKS"
        tasks={play.pre_tasks ?? []}
        onAdd={() => onAddTask("pre_tasks")}
        onEdit={(index) => onEditTask("pre_tasks", index)}
        onDelete={(index) => onDeleteTask("pre_tasks", index)}
      />
      <div className="border-t border-foreground/10 pt-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="font-display text-lg font-medium">Roles</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => onAddTask("pre_tasks")}>
              <Zap />
              Add Task
            </Button>
            <Button size="sm" onClick={onAddRole}>
              + Add Role
            </Button>
          </div>
        </div>
        {(play.roles ?? []).length === 0 ? (
          <p className="rounded-lg bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            No roles added yet. Click Add Role to get started.
          </p>
        ) : (
          <div className="space-y-2">
            {(play.roles ?? []).map((role, index) => (
              <RoleCard
                key={`${role.role_name}-${index}`}
                role={role}
                index={index}
                last={(play.roles ?? []).length - 1}
                onEdit={() => onEditRole(index)}
                onDelete={() => onDeleteRole(index)}
                onMove={(delta) => onMoveRole(index, delta)}
              />
            ))}
          </div>
        )}
        {rolesIssue?.message ? (
          <p className="mt-2 text-xs text-destructive">{rolesIssue.message}</p>
        ) : null}
      </div>
      <TaskSection
        title="POST-TASKS"
        tasks={play.post_tasks ?? []}
        onAdd={() => onAddTask("post_tasks")}
        onEdit={(index) => onEditTask("post_tasks", index)}
        onDelete={(index) => onDeleteTask("post_tasks", index)}
      />
    </Panel>
  );
}

function RoleCard({
  role,
  index,
  last,
  onEdit,
  onDelete,
  onMove,
}: {
  role: PlayRole;
  index: number;
  last: number;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (delta: number) => void;
}) {
  const hasVars = Boolean(
    role.vars_override && Object.keys(role.vars_override).length,
  );
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{role.role_name || "Unknown"}</p>
        <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {role.auto === false ? <Badge variant="outline">MANUAL</Badge> : null}
          {role.tag && role.tag !== role.role_name ? <span>{role.tag}</span> : null}
          {hasVars ? <span>Has vars</span> : null}
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button
          size="icon-xs"
          variant="ghost"
          disabled={index === 0}
          onClick={() => onMove(-1)}
          aria-label="Move role up"
        >
          <ChevronUp />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          disabled={index === last}
          onClick={() => onMove(1)}
          aria-label="Move role down"
        >
          <ChevronDown />
        </Button>
        <Button size="icon-xs" variant="ghost" onClick={onEdit} aria-label="Edit role">
          <Settings />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          className="text-destructive"
          onClick={onDelete}
          aria-label="Delete role"
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}

function TaskSection({
  title,
  tasks,
  onAdd,
  onEdit,
  onDelete,
}: {
  title: string;
  tasks: InlineTask[];
  onAdd: () => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <div className="mt-8 border-t border-foreground/10 pt-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium tracking-wide text-muted-foreground">
          {title}
        </h3>
        <Button size="xs" variant="outline" onClick={onAdd}>
          <Zap />
          Add Task
        </Button>
      </div>
      <div className="space-y-2">
        {tasks.map((task, index) => (
          <div
            key={task.id || index}
            className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{task.name || "Unnamed Task"}</p>
              <p className="text-xs text-muted-foreground">{task.module || "unknown"}</p>
            </div>
            <div className="flex gap-1">
              <Button size="xs" variant="ghost" onClick={() => onEdit(index)}>
                Edit
              </Button>
              <Button
                size="xs"
                variant="ghost"
                className="text-destructive"
                onClick={() => onDelete(index)}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
