"use client";

import { useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  Container,
  FileCode,
  FileWarning,
  Folder,
  FolderGit2,
  FolderTree,
  GitBranch,
  Hash,
  Link2,
  ListOrdered,
  Monitor,
  Plus,
  RefreshCw,
  Server,
  Tag,
  Tags,
  Trash2,
  Type,
  X,
} from "lucide-react";

import { Panel } from "@/components/panel";
import { SectionHeader } from "@/components/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  joinInvocationTags,
  listPlaybookEntryRefs,
  playbookEntryRef,
  newEntryDraft,
  newInvocationDraft,
  newPhaseDraft,
  newPlaybookDraft,
  splitInvocationTags,
  type ClusterYamlDraft,
  type ClusterYamlEntry,
  type ClusterYamlInvocation,
  type ClusterYamlPlaybook,
} from "@/lib/cluster-yaml-model";
import { cn } from "@/lib/utils";

export function ClusterYamlSetupTab({
  draft,
  onChange,
  readOnly,
  schemaOk,
  parseError,
  onOpenYaml,
}: {
  draft: ClusterYamlDraft;
  onChange: (draft: ClusterYamlDraft) => void;
  readOnly: boolean;
  schemaOk: boolean;
  parseError: string | null;
  onOpenYaml: () => void;
}) {
  const locked = readOnly || !schemaOk || Boolean(parseError);
  const entryRefs = listPlaybookEntryRefs(draft);
  const [sourceUid, setSourceUid] = useState<string | null>(null);
  const activeSource =
    draft.playbooks.find((row) => row.uid === sourceUid)?.uid ??
    draft.playbooks[0]?.uid ??
    "";

  function patch(next: ClusterYamlDraft) {
    onChange(next);
  }

  if (parseError) {
    return (
      <Panel className="space-y-3 p-5">
        <p className="flex items-center gap-2 text-sm font-medium">
          <FileWarning className="size-4" />
          cluster.yaml could not be parsed
        </p>
        <p className="text-sm text-muted-foreground">{parseError}</p>
        <Button size="sm" variant="outline" onClick={onOpenYaml}>
          <FileCode />
          Open YAML
        </Button>
      </Panel>
    );
  }

  if (!schemaOk) {
    return (
      <Panel className="space-y-3 p-5">
        <p className="flex items-center gap-2 text-sm font-medium">
          <FileWarning className="size-4" />
          This file is not schema v2
        </p>
        <p className="text-sm text-muted-foreground">
          The guided editor supports cluster.yaml schema version 2 (playbooks and
          phases). Edit the file in YAML, or convert it to v2.
        </p>
        <Button size="sm" variant="outline" onClick={onOpenYaml}>
          <FileCode />
          Open YAML
        </Button>
      </Panel>
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <SectionHeader title="This cluster" icon={<Server />} />
        <Panel className="grid gap-4 p-5 sm:grid-cols-2">
          <Field
            label="Display name"
            htmlFor="cluster-display-name"
            icon={<Type />}
          >
            <Input
              id="cluster-display-name"
              value={draft.displayName}
              disabled={locked}
              onChange={(event) =>
                patch({ ...draft, displayName: event.target.value })
              }
            />
          </Field>
          <Field label="Cluster id" icon={<Hash />}>
            <Input value={draft.id} readOnly disabled />
          </Field>
        </Panel>
      </section>

      <section>
        <SectionHeader title="How Ansible runs" icon={<Container />} />
        <Panel className="space-y-4 p-5">
          <RadioGroup
            className="flex flex-wrap gap-4"
            value={draft.execution.mode === "local" ? "local" : "docker"}
            disabled={locked}
            onValueChange={(value) => {
              if (value !== "local" && value !== "docker") return;
              patch({
                ...draft,
                execution: { ...draft.execution, mode: value },
              });
            }}
          >
            <Label className="font-normal">
              <RadioGroupItem value="docker" disabled={locked} />
              <Container className="size-4" />
              Docker image
            </Label>
            <Label className="font-normal">
              <RadioGroupItem value="local" disabled={locked} />
              <Monitor className="size-4" />
              Local Ansible
            </Label>
          </RadioGroup>
          {draft.execution.mode !== "local" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Image"
                htmlFor="execution-image"
                icon={<Container />}
              >
                <Input
                  id="execution-image"
                  value={draft.execution.image}
                  disabled={locked}
                  placeholder="harbor.example.com/library/krang"
                  onChange={(event) =>
                    patch({
                      ...draft,
                      execution: {
                        ...draft.execution,
                        image: event.target.value,
                        mode: draft.execution.mode || "docker",
                      },
                    })
                  }
                />
              </Field>
              <Field label="Tag" htmlFor="execution-tag" icon={<Tag />}>
                <Input
                  id="execution-tag"
                  value={draft.execution.tag}
                  disabled={locked}
                  placeholder="latest"
                  onChange={(event) =>
                    patch({
                      ...draft,
                      execution: {
                        ...draft.execution,
                        tag: event.target.value,
                        mode: draft.execution.mode || "docker",
                      },
                    })
                  }
                />
              </Field>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ansible runs on the worker host, not in a container.
            </p>
          )}
        </Panel>
      </section>

      <section>
        <SectionHeader
          title="Playbook sources"
          icon={<FolderGit2 />}
          actions={
            locked ? null : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const created = newPlaybookDraft(
                    draft.playbooks.map((row) => row.name),
                  );
                  patch({
                    ...draft,
                    playbooks: [...draft.playbooks, created],
                  });
                  setSourceUid(created.uid);
                }}
              >
                <Plus />
                Add source
              </Button>
            )
          }
        />
        {draft.playbooks.length === 0 ? (
          <Panel className="p-5 text-sm text-muted-foreground">
            No playbook repositories yet. Add a Git or local source, then put it
            in run order below.
          </Panel>
        ) : (
          <Tabs
            value={activeSource}
            onValueChange={(value) => {
              if (value) setSourceUid(value);
            }}
          >
            <TabsList
              variant="line"
              className="h-auto min-h-8 w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto"
            >
              {draft.playbooks.map((playbook) => (
                <TabsTrigger
                  key={playbook.uid}
                  value={playbook.uid}
                  className="max-w-[16rem] flex-none"
                  title={playbook.name}
                >
                  {playbook.source === "local" ? <Folder /> : <GitBranch />}
                  <span className="truncate">
                    {playbookTabLabel(playbook.name)}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
            {draft.playbooks.map((playbook, playbookIndex) => (
              <TabsContent
                key={playbook.uid}
                value={playbook.uid}
                className="mt-4"
              >
                <PlaybookCard
                  playbook={playbook}
                  locked={locked}
                  onChange={(next) =>
                    patch(replacePlaybook(draft, playbookIndex, next))
                  }
                  onRemove={() => {
                    const remaining = draft.playbooks.filter(
                      (row) => row.uid !== playbook.uid,
                    );
                    setSourceUid(remaining[0]?.uid ?? null);
                    patch({
                      ...draft,
                      playbooks: remaining,
                      phases: draft.phases.filter(
                        (phase) =>
                          !phase.ref.startsWith(`${playbook.name}/`) &&
                          phase.ref !== playbook.name,
                      ),
                    });
                  }}
                />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </section>

      <section>
        <SectionHeader
          title="Run order"
          icon={<ListOrdered />}
          actions={
            locked ? null : (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  patch({
                    ...draft,
                    phases: [
                      ...draft.phases,
                      newPhaseDraft(entryRefs[0] || ""),
                    ],
                  })
                }
              >
                <Plus />
                Add step
              </Button>
            )
          }
        />
        <Panel className="p-2 sm:p-3">
          {draft.phases.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              No steps yet. This is the order Init and pipeline will run.
            </p>
          ) : (
            <ol className="space-y-2">
              {draft.phases.map((phase, index) => (
                <li
                  key={phase.uid}
                  className="flex flex-col gap-2 rounded-lg bg-background/40 p-3 sm:flex-row sm:items-center"
                >
                  <span className="w-6 shrink-0 text-sm text-muted-foreground">
                    {index + 1}
                  </span>
                  <Input
                    aria-label={`Step ${index + 1} short name`}
                    placeholder="Short name"
                    value={phase.alias}
                    disabled={locked}
                    className="sm:max-w-40"
                    onChange={(event) =>
                      patch({
                        ...draft,
                        phases: draft.phases.map((row, rowIndex) =>
                          rowIndex === index
                            ? { ...row, alias: event.target.value }
                            : row,
                        ),
                      })
                    }
                  />
                  <Select
                    value={phase.ref || undefined}
                    disabled={locked || entryRefs.length === 0}
                    onValueChange={(value) => {
                      if (!value) return;
                      patch({
                        ...draft,
                        phases: draft.phases.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, ref: value } : row,
                        ),
                      });
                    }}
                  >
                    <SelectTrigger
                      size="sm"
                      className="w-full min-w-0 sm:flex-1"
                    >
                      <SelectValue placeholder="Playbook entry" />
                    </SelectTrigger>
                    <SelectContent>
                      {entryRefs.map((ref) => (
                        <SelectItem key={ref} value={ref}>
                          {ref}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {locked ? null : (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        disabled={index === 0}
                        aria-label="Move up"
                        onClick={() =>
                          patch({
                            ...draft,
                            phases: moveItem(draft.phases, index, -1),
                          })
                        }
                      >
                        <ChevronUp />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        disabled={index === draft.phases.length - 1}
                        aria-label="Move down"
                        onClick={() =>
                          patch({
                            ...draft,
                            phases: moveItem(draft.phases, index, 1),
                          })
                        }
                      >
                        <ChevronDown />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label="Remove step"
                        onClick={() =>
                          patch({
                            ...draft,
                            phases: draft.phases.filter(
                              (_, rowIndex) => rowIndex !== index,
                            ),
                          })
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </section>
    </div>
  );
}

function PlaybookCard({
  playbook,
  locked,
  onChange,
  onRemove,
}: {
  playbook: ClusterYamlPlaybook;
  locked: boolean;
  onChange: (playbook: ClusterYamlPlaybook) => void;
  onRemove: () => void;
}) {
  const local = playbook.source === "local";
  const [entryUid, setEntryUid] = useState<string | null>(null);
  const activeEntry =
    playbook.entries.find((row) => row.uid === entryUid)?.uid ??
    playbook.entries[0]?.uid ??
    "";

  function addEntry() {
    const created = newEntryDraft(playbook.entries.map((row) => row.name));
    onChange({
      ...playbook,
      entries: [...playbook.entries, created],
    });
    setEntryUid(created.uid);
  }

  return (
    <Panel className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2">
          <Field
            label="Name"
            htmlFor={`repo-name-${playbook.uid}`}
            icon={<FolderGit2 />}
          >
            <Input
              id={`repo-name-${playbook.uid}`}
              value={playbook.name}
              disabled={locked}
              onChange={(event) =>
                onChange({ ...playbook, name: event.target.value.trim() })
              }
            />
          </Field>
          <Field label="Source" icon={local ? <Folder /> : <GitBranch />}>
            <Select
              value={local ? "local" : "git"}
              disabled={locked}
              onValueChange={(value) => {
                if (value !== "git" && value !== "local") return;
                onChange({ ...playbook, source: value });
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="git">
                  <GitBranch />
                  Git
                </SelectItem>
                <SelectItem value="local">
                  <Folder />
                  Local path
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {local ? (
            <Field
              label="Path"
              htmlFor={`repo-path-${playbook.uid}`}
              icon={<Folder />}
            >
              <Input
                id={`repo-path-${playbook.uid}`}
                value={playbook.path}
                disabled={locked}
                onChange={(event) =>
                  onChange({ ...playbook, path: event.target.value })
                }
              />
            </Field>
          ) : (
            <>
              <Field
                label="Git URL"
                htmlFor={`repo-url-${playbook.uid}`}
                icon={<Link2 />}
              >
                <Input
                  id={`repo-url-${playbook.uid}`}
                  value={playbook.url}
                  disabled={locked}
                  onChange={(event) =>
                    onChange({ ...playbook, url: event.target.value })
                  }
                />
              </Field>
              <Field
                label="Branch"
                htmlFor={`repo-ref-${playbook.uid}`}
                icon={<GitBranch />}
              >
                <Input
                  id={`repo-ref-${playbook.uid}`}
                  value={playbook.ref}
                  disabled={locked}
                  onChange={(event) =>
                    onChange({ ...playbook, ref: event.target.value })
                  }
                />
              </Field>
            </>
          )}
          <Field label="Sync when" icon={<RefreshCw />}>
            <Select
              value={playbook.sync || "always"}
              disabled={locked}
              onValueChange={(value) => {
                if (!value) return;
                onChange({ ...playbook, sync: value });
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="always">Every sync</SelectItem>
                <SelectItem value="if_missing">Only if missing</SelectItem>
                <SelectItem value="never">Never</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Layout"
            htmlFor={`repo-layout-${playbook.uid}`}
            icon={<FolderTree />}
          >
            <Input
              id={`repo-layout-${playbook.uid}`}
              value={playbook.layout}
              disabled={locked}
              onChange={(event) =>
                onChange({ ...playbook, layout: event.target.value })
              }
            />
          </Field>
        </div>
        {locked ? null : (
          <Button size="sm" variant="ghost" onClick={onRemove}>
            <Trash2 />
            Remove
          </Button>
        )}
      </div>
      <Label className="font-normal">
        <Checkbox
          checked={playbook.shallow}
          disabled={locked}
          onCheckedChange={(value) =>
            onChange({ ...playbook, shallow: value === true })
          }
        />
        Shallow clone
      </Label>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <FileCode className="size-4 text-muted-foreground" />
            Entries
          </p>
          {locked ? null : (
            <Button size="xs" variant="outline" onClick={addEntry}>
              <Plus />
              Add entry
            </Button>
          )}
        </div>
        {playbook.entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No playbook files in this source yet.
          </p>
        ) : (
          <Tabs
            value={activeEntry}
            onValueChange={(value) => {
              if (value) setEntryUid(value);
            }}
          >
            <TabsList
              variant="line"
              className="h-auto min-h-8 w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto"
            >
              {playbook.entries.map((entry) => (
                <TabsTrigger
                  key={entry.uid}
                  value={entry.uid}
                  className="max-w-[14rem] flex-none"
                  title={entry.name}
                >
                  <FileCode />
                  <span className="truncate">
                    {untitledLabel(entry.name, "Untitled")}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
            {playbook.entries.map((entry, entryIndex) => (
              <TabsContent key={entry.uid} value={entry.uid} className="mt-4">
                <EntryEditor
                  entry={entry}
                  locked={locked}
                  onChange={(next) =>
                    onChange({
                      ...playbook,
                      entries: playbook.entries.map((row, index) =>
                        index === entryIndex ? next : row,
                      ),
                    })
                  }
                  onRemove={() => {
                    const remaining = playbook.entries.filter(
                      (row) => row.uid !== entry.uid,
                    );
                    setEntryUid(remaining[0]?.uid ?? null);
                    onChange({
                      ...playbook,
                      entries: remaining,
                    });
                  }}
                />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </Panel>
  );
}

function EntryEditor({
  entry,
  locked,
  onChange,
  onRemove,
}: {
  entry: ClusterYamlEntry;
  locked: boolean;
  onChange: (entry: ClusterYamlEntry) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-foreground/10 p-3">
      <div className="flex flex-wrap items-start gap-3">
        <Field
          className="min-w-40 flex-1"
          label="Entry id"
          htmlFor={`entry-name-${entry.uid}`}
          icon={<Hash />}
        >
          <Input
            id={`entry-name-${entry.uid}`}
            value={entry.name}
            disabled={locked}
            onChange={(event) =>
              onChange({ ...entry, name: event.target.value.trim() })
            }
          />
        </Field>
        <Field
          className="min-w-48 flex-1"
          label="Playbook file"
          htmlFor={`entry-file-${entry.uid}`}
          icon={<FileCode />}
        >
          <Input
            id={`entry-file-${entry.uid}`}
            value={entry.file}
            disabled={locked}
            onChange={(event) =>
              onChange({ ...entry, file: event.target.value })
            }
          />
        </Field>
        {locked ? null : (
          <Button
            size="icon-xs"
            variant="ghost"
            className="mt-6"
            aria-label="Remove entry"
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        )}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Tags className="size-3.5" />
            Invocations (tags)
          </p>
          {locked ? null : (
            <Button
              size="xs"
              variant="ghost"
              onClick={() =>
                onChange({
                  ...entry,
                  invocations: [...entry.invocations, newInvocationDraft()],
                })
              }
            >
              <Plus />
              Add run
            </Button>
          )}
        </div>
        {entry.invocations.map((invocation, index) => (
          <InvocationEditor
            key={invocation.uid}
            invocation={invocation}
            locked={locked}
            onChange={(next) =>
              onChange({
                ...entry,
                invocations: entry.invocations.map((row, rowIndex) =>
                  rowIndex === index ? next : row,
                ),
              })
            }
            onRemove={() =>
              onChange({
                ...entry,
                invocations: entry.invocations.filter(
                  (row) => row.uid !== invocation.uid,
                ),
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

function InvocationEditor({
  invocation,
  locked,
  onChange,
  onRemove,
}: {
  invocation: ClusterYamlInvocation;
  locked: boolean;
  onChange: (invocation: ClusterYamlInvocation) => void;
  onRemove: () => void;
}) {
  const tags = splitInvocationTags(invocation.tags);
  const [draftTag, setDraftTag] = useState("");

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag) return;
    onChange({
      ...invocation,
      tags: joinInvocationTags([...tags, tag]),
    });
    setDraftTag("");
  }

  return (
    <div className="space-y-2 rounded-md bg-background/50 p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <Badge key={tag} variant="outline">
            {tag}
            {locked ? null : (
              <button
                type="button"
                className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10"
                aria-label={`Remove tag ${tag}`}
                onClick={() =>
                  onChange({
                    ...invocation,
                    tags: joinInvocationTags(tags.filter((item) => item !== tag)),
                  })
                }
              >
                <X className="size-3" />
              </button>
            )}
          </Badge>
        ))}
        {locked ? null : (
          <Input
            value={draftTag}
            placeholder="Add tag"
            className="h-7 w-36"
            onChange={(event) => setDraftTag(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                addTag(draftTag.replace(/,/g, ""));
              }
            }}
            onBlur={() => addTag(draftTag)}
          />
        )}
        {locked ? null : (
          <Button
            size="icon-xs"
            variant="ghost"
            className="ml-auto"
            aria-label="Remove invocation"
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Field
          className="w-40"
          label="Limit hosts"
          htmlFor={`limit-${invocation.uid}`}
          icon={<Server />}
        >
          <Input
            id={`limit-${invocation.uid}`}
            value={invocation.limit}
            disabled={locked}
            placeholder="optional"
            className="h-8"
            onChange={(event) =>
              onChange({ ...invocation, limit: event.target.value })
            }
          />
        </Field>
        <Label className="mt-5 font-normal">
          <Checkbox
            checked={invocation.rootSsh}
            disabled={locked}
            onCheckedChange={(value) =>
              onChange({ ...invocation, rootSsh: value === true })
            }
          />
          Root SSH
        </Label>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
  className,
  icon,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="font-normal text-muted-foreground">
        {icon ? <span className="[&_svg]:size-3.5">{icon}</span> : null}
        {label}
      </Label>
      {children}
    </div>
  );
}

function playbookTabLabel(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "Untitled";
  return trimmed.replace(/^atlas-/i, "") || trimmed;
}

function untitledLabel(name: string, fallback: string): string {
  const trimmed = name.trim();
  return trimmed || fallback;
}

function replacePlaybook(
  draft: ClusterYamlDraft,
  index: number,
  next: ClusterYamlPlaybook,
): ClusterYamlDraft {
  const prev = draft.playbooks[index];
  const playbooks = draft.playbooks.map((row, rowIndex) =>
    rowIndex === index ? next : row,
  );
  if (!prev) return { ...draft, playbooks };
  const rewritten = new Map<string, string>();
  rewritten.set(prev.name, next.name);
  for (const entry of prev.entries) {
    const updated = next.entries.find((row) => row.uid === entry.uid);
    rewritten.set(
      playbookEntryRef(prev.name, entry.name),
      playbookEntryRef(next.name, updated?.name ?? entry.name),
    );
  }
  return {
    ...draft,
    playbooks,
    phases: draft.phases.map((phase) => ({
      ...phase,
      ref: rewritten.get(phase.ref) ?? phase.ref,
    })),
  };
}

function moveItem<T>(items: T[], index: number, delta: number): T[] {
  const next = index + delta;
  if (next < 0 || next >= items.length) return items;
  const copy = [...items];
  const [row] = copy.splice(index, 1);
  copy.splice(next, 0, row);
  return copy;
}
