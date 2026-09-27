"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Combobox } from "@base-ui/react/combobox";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { YamlEditor } from "@/components/yaml-editor";
import {
  projectApiQuery,
  withClusterId,
} from "@/components/hosts-groups/helpers";
import { projectHref } from "@/lib/project-href";
import type {
  PlaybookSetupField,
  PveTemplatesMap,
  SetupFieldValue,
  VarsSetupOrigin,
} from "@/lib/playbook-setup";
import {
  PVE_TEMPLATE_KEYS,
  commentFromVarsSetupFile,
  groupedSetupFields,
  isMissingSetupValue,
  isSecretsVarsFile,
  isSetupFieldRequired,
  playbookNameFromVarsFile,
  normalizePveTemplatesMap,
  originFromVarsSetupFile,
  generateSetupSecret,
  parseStringList,
  envScopeLabel,
  ianaTimeZones,
  setupFieldCopyText,
  setupFieldInvalidMessage,
  setupFieldValueType,
  setupProgressFromValues,
  setupSchemaForVarsFile,
  setupSearchHaystack,
  setupValuesEqual,
  valuesFromVarsSetupFile,
} from "@/lib/playbook-setup";
import { GIT_PULL_NONE } from "@/components/git-pull-secret-select";
import { useEnsureClusterctlSshKey } from "@/hooks/use-ensure-clusterctl-ssh";
import {
  fetchAtlasOperatorSsh,
  writeAtlasOperatorPubkey,
} from "@/lib/clusterctl-ssh";
import { loadGitPullSecrets } from "@/lib/git-pull";
import type { SecretOption } from "@/lib/project-sources";
import { stargateJson } from "@/lib/stargate";
import { useCan } from "@/lib/authz";
import { cn } from "@/lib/utils";

type VarsSetupFileResponse = {
  name?: string;
  path?: string;
  pveFactory?: boolean;
  hasEnvLayer?: boolean;
  keys?: Record<string, { origin?: string; value?: unknown; comment?: string }>;
  nested?: Record<
    string,
    { origin?: string; value?: unknown; comment?: string }
  >;
};

export type PlaybookSetupFileTab = {
  name: string;
  path: string;
  missing?: number;
};

type RowFilter = "all" | "required" | "missing" | "modified" | "inherited";
type EditorView = "variables" | "yaml";
type SaveFlash = "idle" | "saved";

const FILTERS: { id: RowFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "required", label: "Required" },
  { id: "missing", label: "Missing" },
  { id: "modified", label: "Modified" },
  { id: "inherited", label: "Inherited" },
];

type SetupDraft = {
  fileName: string;
  values: Record<string, SetupFieldValue>;
  baseline: Record<string, SetupFieldValue>;
};

type SetupChange = {
  path: string;
  fileName: string;
  key: string;
  label: string;
  from: string;
  to: string;
  secret: boolean;
};

function previewSetupValue(
  field: PlaybookSetupField,
  value: SetupFieldValue | undefined,
): string {
  if (field.input === "password") {
    return value == null || value === "" ? "empty" : "••••";
  }
  if (value == null || value === "") return "empty";
  if (typeof value === "string") {
    const flat = value.replace(/\s+/g, " ").trim();
    if (!flat) return "empty";
    return flat.length > 56 ? `${flat.slice(0, 53)}…` : flat;
  }
  const count = Object.values(value).filter(
    (entry) => entry?.id || entry?.image_url,
  ).length;
  return count === 0 ? "empty" : `${count} template${count === 1 ? "" : "s"}`;
}

function changesForFile(
  path: string,
  fileName: string,
  values: Record<string, SetupFieldValue>,
  baseline: Record<string, SetupFieldValue>,
  pveFactory: boolean,
): SetupChange[] {
  const schema = setupSchemaForVarsFile(fileName, "", { pveFactory });
  const changes: SetupChange[] = [];
  for (const field of schema.fields) {
    if (setupValuesEqual(values[field.key], baseline[field.key])) continue;
    changes.push({
      path,
      fileName,
      key: field.key,
      label: field.label,
      from: previewSetupValue(field, baseline[field.key]),
      to: previewSetupValue(field, values[field.key]),
      secret: field.input === "password",
    });
  }
  return changes;
}

function payloadForFile(
  fileName: string,
  values: Record<string, SetupFieldValue>,
  baseline: Record<string, SetupFieldValue>,
  pveFactory: boolean,
): {
  updates: Record<string, string | string[]>;
  nested: Record<string, PveTemplatesMap>;
} {
  const schema = setupSchemaForVarsFile(fileName, "", { pveFactory });
  const updates: Record<string, string | string[]> = {};
  const nested: Record<string, PveTemplatesMap> = {};
  for (const field of schema.fields) {
    if (setupValuesEqual(values[field.key], baseline[field.key])) continue;
    if (field.kind === "pve_templates") {
      nested[field.key] = normalizePveTemplatesMap(values[field.key]);
      continue;
    }
    if (setupFieldValueType(field) === "string_list") {
      updates[field.key] = parseStringList(values[field.key]);
      continue;
    }
    const value = values[field.key];
    updates[field.key] = typeof value === "string" ? value : "";
  }
  return { updates, nested };
}

function groupedChanges(changes: SetupChange[]): {
  path: string;
  fileName: string;
  lines: SetupChange[];
}[] {
  const groups: { path: string; fileName: string; lines: SetupChange[] }[] = [];
  for (const change of changes) {
    let group = groups.find((item) => item.path === change.path);
    if (!group) {
      group = { path: change.path, fileName: change.fileName, lines: [] };
      groups.push(group);
    }
    group.lines.push(change);
  }
  return groups;
}

export function PlaybookSetupDialog({
  open,
  onOpenChange,
  projectId,
  clusterId,
  fileName,
  path,
  files,
  onFileChange,
  pveFactory,
  hasEnvLayer,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  clusterId: string;
  fileName: string;
  path: string;
  files?: PlaybookSetupFileTab[];
  onFileChange?: (file: PlaybookSetupFileTab) => void;
  pveFactory?: boolean;
  hasEnvLayer?: boolean;
  onSaved: () => void;
}) {
  const canWrite = useCan()("inventory.update");
  const q = projectApiQuery(projectId, clusterId);
  const varsHref = `${projectHref(projectId, "/vars")}?file=${encodeURIComponent(path)}`;
  const searchRef = useRef<HTMLDivElement>(null);
  const savedTimer = useRef<number | null>(null);
  const [sshFormOpen, setSshFormOpen] = useState(false);

  const [file, setFile] = useState<VarsSetupFileResponse>({});
  const [values, setValues] = useState<Record<string, SetupFieldValue>>({});
  const [baseline, setBaseline] = useState<Record<string, SetupFieldValue>>({});
  const [origins, setOrigins] = useState<Record<string, VarsSetupOrigin>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [layerBusy, setLayerBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RowFilter>("all");
  const [view, setView] = useState<EditorView>("variables");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [expandedMaps, setExpandedMaps] = useState<Record<string, boolean>>({});
  const [yamlText, setYamlText] = useState("");
  const [yamlLoading, setYamlLoading] = useState(true);
  const [saveFlash, setSaveFlash] = useState<SaveFlash>("idle");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [draftVersion, setDraftVersion] = useState(0);
  const draftsRef = useRef<Record<string, SetupDraft>>({});

  const schema = useMemo(
    () =>
      setupSchemaForVarsFile(fileName, "", {
        pveFactory: pveFactory || file.pveFactory,
      }),
    [fileName, pveFactory, file.pveFactory],
  );

  const envLayer = hasEnvLayer || Boolean(file.hasEnvLayer);
  const progress = setupProgressFromValues(schema, values);

  const invalidCount = useMemo(
    () =>
      schema.fields.filter(
        (field) => setupFieldInvalidMessage(field, values[field.key]) != null,
      ).length,
    [schema.fields, values],
  );

  const factory = pveFactory || Boolean(file.pveFactory);

  const pendingChanges = useMemo(() => {
    const stored = draftVersion >= 0 ? draftsRef.current : {};
    const lines: SetupChange[] = [];
    const currentDraft = loading ? stored[path] : undefined;
    if (currentDraft) {
      lines.push(
        ...changesForFile(
          path,
          currentDraft.fileName,
          currentDraft.values,
          currentDraft.baseline,
          factory,
        ),
      );
    } else {
      lines.push(...changesForFile(path, fileName, values, baseline, factory));
    }
    for (const [draftPath, draft] of Object.entries(stored)) {
      if (draftPath === path) continue;
      lines.push(
        ...changesForFile(
          draftPath,
          draft.fileName,
          draft.values,
          draft.baseline,
          factory,
        ),
      );
    }
    return lines;
  }, [path, fileName, values, baseline, factory, loading, draftVersion]);
  const pendingCount = pendingChanges.length;
  const dirtyPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const change of pendingChanges) paths.add(change.path);
    return paths;
  }, [pendingChanges]);
  const reviewGroups = useMemo(
    () => groupedChanges(pendingChanges),
    [pendingChanges],
  );

  const fileGroups = useMemo(() => {
    const list = files ?? [];
    return {
      vars: list.filter((item) => !isSecretsVarsFile(item.name)),
      secrets: list.filter((item) => isSecretsVarsFile(item.name)),
    };
  }, [files]);

  function applyFile(
    data: VarsSetupFileResponse,
    keepValues?: Record<string, SetupFieldValue>,
  ) {
    const nextSchema = setupSchemaForVarsFile(fileName, "", {
      pveFactory: pveFactory || data.pveFactory,
    });
    const nextValues = valuesFromVarsSetupFile(nextSchema, data);
    const nextOrigins: Record<string, VarsSetupOrigin> = {};
    const nextComments: Record<string, string> = {};
    for (const field of nextSchema.fields) {
      nextOrigins[field.key] = originFromVarsSetupFile(field, data);
      nextComments[field.key] = commentFromVarsSetupFile(field, data);
    }
    setFile(data);
    setValues(keepValues ?? nextValues);
    setBaseline(nextValues);
    setOrigins(nextOrigins);
    setComments(nextComments);
    const draft = draftsRef.current[path];
    if (draft) {
      draftsRef.current[path] = {
        ...draft,
        fileName,
        baseline: nextValues,
        values: keepValues ?? nextValues,
      };
    }
    return nextValues;
  }

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setYamlLoading(true);
    setQuery("");
    setFilter("all");
    setView("variables");
    setValues({});
    setBaseline({});
    setOrigins({});
    setComments({});
    setVisible({});
    setCollapsed({});
    setExpandedMaps({});
    setSaveFlash("idle");
    let cancelled = false;
    void (async () => {
      try {
        const data = await stargateJson<VarsSetupFileResponse>(
          `/atlas/vars-setup/file?${q}&path=${encodeURIComponent(path)}`,
        );
        if (cancelled) return;
        const draft = draftsRef.current[path];
        applyFile(data, draft?.values);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // applyFile is local and uses current fileName/pveFactory
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q, path, fileName, pveFactory]);

  useEffect(() => {
    if (!open || loading || view !== "variables") return;
    const input = searchRef.current?.querySelector("input");
    input?.focus();
  }, [open, loading, view]);

  useEffect(() => {
    if (!open || view !== "yaml") return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await stargateJson<{ content?: string }>(
          `/inventory/vars/file?${q}&path=${encodeURIComponent(path)}`,
        );
        if (cancelled) return;
        setYamlText(data.content || "");
        setYamlLoading(false);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : String(err));
          setYamlLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, view, q, path, file]);

  useEffect(() => {
    return () => {
      if (savedTimer.current != null) window.clearTimeout(savedTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onWindowKey(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (reviewOpen) void commitSave();
        else if (pendingCount > 0) setReviewOpen(true);
        return;
      }
      if (event.key !== "/" || event.altKey || meta) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      setView("variables");
      searchRef.current?.querySelector("input")?.focus();
    }
    window.addEventListener("keydown", onWindowKey);
    return () => window.removeEventListener("keydown", onWindowKey);
    // save closes over current form state; rebind while the dialog is open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy, loading, reviewOpen, pendingCount, values, baseline, fileName, factory, files, canWrite, path, projectId, clusterId]);

  const visibleFields = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return schema.fields.filter((field) => {
      const value = values[field.key];
      const origin = origins[field.key] ?? "missing";
      const modified = !setupValuesEqual(value, baseline[field.key]);
      if (filter === "required" && !isSetupFieldRequired(field)) return false;
      if (filter === "missing" && !isMissingSetupValue(value, field)) return false;
      if (filter === "modified" && !modified) return false;
      if (filter === "inherited" && origin !== "env" && origin !== "org") {
        return false;
      }
      if (!needle) return true;
      return setupSearchHaystack(field, value, comments[field.key] || "").includes(
        needle,
      );
    });
  }, [schema.fields, values, origins, baseline, filter, query, comments]);

  const groups = useMemo(
    () => groupedSetupFields(visibleFields),
    [visibleFields],
  );

  function requestClose() {
    if (pendingCount > 0) {
      setDiscardOpen(true);
      return;
    }
    onOpenChange(false);
  }

  function requestFile(next: PlaybookSetupFileTab) {
    if (next.path === path || !onFileChange) return;
    if (!loading) {
      const current = changesForFile(path, fileName, values, baseline, factory);
      if (current.length > 0) {
        draftsRef.current[path] = { fileName, values, baseline };
      } else {
        delete draftsRef.current[path];
      }
      setDraftVersion((version) => version + 1);
    }
    onFileChange(next);
  }

  function confirmDiscard() {
    draftsRef.current = {};
    setDraftVersion((version) => version + 1);
    setReviewOpen(false);
    setDiscardOpen(false);
    onOpenChange(false);
  }

  function resetAll() {
    draftsRef.current = {};
    setValues(baseline);
    setReviewOpen(false);
    setDraftVersion((version) => version + 1);
  }

  async function putVarsFile(
    relPath: string,
    updates: Record<string, string | string[]>,
    nested?: Record<string, PveTemplatesMap>,
  ) {
    return stargateJson<VarsSetupFileResponse>("/atlas/vars-setup/file", {
      method: "PUT",
      body: JSON.stringify(
        withClusterId(
          {
            project_id: projectId,
            path: relPath,
            updates,
            nested,
          },
          clusterId,
        ),
      ),
    });
  }

  async function commitSave() {
    if (busy || loading || pendingCount === 0 || !canWrite) return;
    const jobs: { path: string; fileName: string; draft: SetupDraft }[] = [
      { path, fileName, draft: { fileName, values, baseline } },
    ];
    for (const [draftPath, draft] of Object.entries(draftsRef.current)) {
      if (draftPath === path) continue;
      jobs.push({ path: draftPath, fileName: draft.fileName, draft });
    }
    setBusy(true);
    try {
      const suffixByPath = new Map<string, string>();
      for (const job of jobs) {
        const payload = payloadForFile(
          job.fileName,
          job.draft.values,
          job.draft.baseline,
          factory,
        );
        if (
          Object.keys(payload.updates).length === 0 &&
          Object.keys(payload.nested).length === 0
        ) {
          continue;
        }
        const data = await putVarsFile(
          job.path,
          payload.updates,
          Object.keys(payload.nested).length > 0 ? payload.nested : undefined,
        );
        delete draftsRef.current[job.path];
        if (job.path === path) applyFile(data);
        const nextSuffix = payload.updates.dns_domain_suffix;
        if (typeof nextSuffix === "string") suffixByPath.set(job.path, nextSuffix);
      }
      const suffixFrom = suffixByPath.has(path)
        ? path
        : [...suffixByPath.keys()].at(-1);
      const suffix = suffixFrom ? suffixByPath.get(suffixFrom) : undefined;
      if (suffix != null && suffixFrom) {
        const tabs = (files ?? []).filter(
          (item) => !isSecretsVarsFile(item.name) && item.path !== suffixFrom,
        );
        for (const tab of tabs) {
          if (suffixByPath.has(tab.path)) continue;
          const data = await putVarsFile(tab.path, { dns_domain_suffix: suffix });
          delete draftsRef.current[tab.path];
          if (tab.path === path) applyFile(data);
        }
      }
      setReviewOpen(false);
      setDraftVersion((version) => version + 1);
      setSaveFlash("saved");
      if (savedTimer.current != null) window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setSaveFlash("idle"), 1600);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function postLayer(
    relPath: string,
    field: PlaybookSetupField,
    action: "local" | "global",
  ) {
    const nested = field.kind === "pve_templates";
    return stargateJson<VarsSetupFileResponse>("/atlas/vars-setup/layer", {
      method: "POST",
      body: JSON.stringify(
        withClusterId(
          {
            project_id: projectId,
            path: relPath,
            key: field.key,
            action,
            nested,
            value: nested
              ? normalizePveTemplatesMap(values[field.key])
              : setupFieldValueType(field) === "string_list"
                ? parseStringList(values[field.key])
                : (values[field.key] ?? ""),
          },
          clusterId,
        ),
      ),
    });
  }

  async function moveLayer(
    field: PlaybookSetupField,
    action: "local" | "global",
  ) {
    setLayerBusy(`${field.key}:${action}`);
    try {
      const data = await postLayer(path, field, action);
      if (field.key === "dns_domain_suffix") {
        const tabs = (files ?? []).filter(
          (item) => !isSecretsVarsFile(item.name) && item.path !== path,
        );
        for (const tab of tabs) {
          await postLayer(tab.path, field, action);
        }
      }
      applyFile(data);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLayerBusy(null);
    }
  }

  const status = headerStatus(
    progress.filled,
    progress.total,
    progress.missing,
    invalidCount,
  );
  const saveLabel = busy
    ? "Saving…"
    : reviewOpen
      ? "Save"
      : saveFlash === "saved" && pendingCount === 0
        ? "Saved"
        : "Save changes";

  return (
    <>
      <Dialog
        open={open}
        modal={!sshFormOpen}
        onOpenChange={(next) => {
          if (!next && !sshFormOpen) requestClose();
        }}
      >
        <DialogContent
          overlayClassName="bg-black/50 supports-backdrop-filter:backdrop-blur-none"
          className="flex h-[min(44rem,90vh)] max-h-[90vh] min-h-0 flex-col gap-0 overflow-hidden overflow-y-hidden !bg-[#1c1c1f] p-0 shadow-[0_24px_80px_rgba(0,0,0,0.65)] ring-1 ring-foreground/15 ![backdrop-filter:none] ![-webkit-backdrop-filter:none] sm:max-w-[min(72rem,calc(100vw-2rem))]"
          style={{
            maxWidth: "72rem",
            width: "min(72rem, calc(100vw - 2rem))",
            backgroundColor: "#1c1c1f",
            backdropFilter: "none",
            WebkitBackdropFilter: "none",
          }}
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col sm:flex-row">
            {files && files.length > 0 ? (
              <aside className="flex max-h-40 shrink-0 flex-col border-b border-border bg-[#151517] sm:max-h-none sm:w-60 sm:border-r sm:border-b-0">
                <p className="px-3 pt-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Files
                </p>
                <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                  <FileNavGroup
                    items={fileGroups.vars}
                    activePath={path}
                    dirtyPaths={dirtyPaths}
                    onSelect={requestFile}
                    labelFor={(item) => playbookNameFromVarsFile(item.name)}
                  />
                  <FileNavGroup
                    title="Secrets"
                    nested
                    items={fileGroups.secrets}
                    activePath={path}
                    dirtyPaths={dirtyPaths}
                    onSelect={requestFile}
                    labelFor={(item) => playbookNameFromVarsFile(item.name)}
                    className={
                      fileGroups.vars.length > 0 ? "mt-2" : undefined
                    }
                  />
                </nav>
              </aside>
            ) : null}

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 py-3 pr-14">
                <div className="min-w-0">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Configuration
                  </p>
                  <DialogTitle className="mt-1 truncate font-mono text-sm font-medium">
                    {fileName}
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
                    Configure required variables
                  </DialogDescription>
                </div>
                {schema.fields.length > 0 ? (
                  <StatusPill tone={status.tone} label={status.label} />
                ) : null}
              </div>

              <div className="flex shrink-0 flex-col gap-2 border-b border-border bg-muted/40 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div ref={searchRef} className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search variables"
                    aria-label="Search variables"
                    className="h-8 bg-background pl-8 font-normal"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="flex flex-wrap items-center gap-0.5 rounded-lg bg-background/80 p-[3px] ring-1 ring-foreground/10">
                    {FILTERS.map((item) => (
                      <Button
                        key={item.id}
                        type="button"
                        size="xs"
                        variant={filter === item.id ? "secondary" : "ghost"}
                        className={cn(
                          "rounded-md",
                          filter === item.id && "bg-background shadow-sm",
                        )}
                        onClick={() => setFilter(item.id)}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </div>
                  <div className="flex items-center gap-0.5 rounded-lg bg-background/80 p-[3px] ring-1 ring-foreground/10">
                    <Button
                      type="button"
                      size="xs"
                      variant={view === "variables" ? "secondary" : "ghost"}
                      className={cn(
                        "rounded-md",
                        view === "variables" && "bg-background shadow-sm",
                      )}
                      onClick={() => setView("variables")}
                    >
                      Variables
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant={view === "yaml" ? "secondary" : "ghost"}
                      className={cn(
                        "rounded-md",
                        view === "yaml" && "bg-background shadow-sm",
                      )}
                      onClick={() => setView("yaml")}
                    >
                      YAML
                    </Button>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {loading ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground">
                    Loading…
                  </p>
                ) : view === "yaml" ? (
                  <div className="flex min-h-full flex-col">
                    {yamlLoading ? (
                      <p className="px-4 py-6 text-sm text-muted-foreground">
                        Loading YAML…
                      </p>
                    ) : (
                      <YamlEditor
                        value={yamlText}
                        onChange={() => undefined}
                        readOnly
                        bounded={false}
                        className="min-h-[18rem] flex-1"
                      />
                    )}
                    <p className="px-4 py-2 text-xs text-muted-foreground">
                      Read-only preview of this overlay.{" "}
                      <Link
                        href={varsHref}
                        className="underline underline-offset-2"
                      >
                        Open in Vars
                      </Link>
                    </p>
                  </div>
                ) : schema.fields.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground">
                    No scalar fields to edit here. Use the YAML tab for maps and
                    lists.
                  </p>
                ) : groups.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground">
                    No matching variables.
                  </p>
                ) : (
                  <div className="space-y-3 p-4">
                    {groups.map((group) => {
                      const openGroup = query.trim()
                        ? true
                        : !collapsed[group.group];
                      return (
                        <section
                          key={group.group}
                          className="overflow-hidden rounded-lg border border-border bg-[#161618]"
                        >
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium hover:bg-muted/40"
                            onClick={() =>
                              setCollapsed((prev) => ({
                                ...prev,
                                [group.group]: !prev[group.group],
                              }))
                            }
                          >
                            {openGroup ? (
                              <ChevronDown className="size-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="size-4 text-muted-foreground" />
                            )}
                            <span>{group.group}</span>
                            <span className="font-mono text-xs font-normal tabular-nums text-muted-foreground">
                              {group.fields.length}
                            </span>
                          </button>
                          {openGroup ? (
                            <div className="divide-y divide-border/70 border-t border-border">
                              {group.fields.map((field) => (
                                <SettingRow
                                  key={field.key}
                                  field={field}
                                  value={values[field.key]}
                                  origin={origins[field.key] ?? "missing"}
                                  description={comments[field.key] || ""}
                                  modified={
                                    !setupValuesEqual(
                                      values[field.key],
                                      baseline[field.key],
                                    )
                                  }
                                  revealed={Boolean(visible[field.key])}
                                  envLayer={envLayer}
                                  layerBusy={layerBusy}
                                  mapOpen={Boolean(expandedMaps[field.key])}
                                  projectId={projectId}
                                  clusterId={clusterId}
                                  onSshFormOpenChange={setSshFormOpen}
                                  onReveal={() =>
                                    setVisible((prev) => ({
                                      ...prev,
                                      [field.key]: !prev[field.key],
                                    }))
                                  }
                                  onChange={(next) =>
                                    setValues((prev) => ({
                                      ...prev,
                                      [field.key]: next,
                                    }))
                                  }
                                  onToggleMap={() =>
                                    setExpandedMaps((prev) => ({
                                      ...prev,
                                      [field.key]: !prev[field.key],
                                    }))
                                  }
                                  onOverride={() => void moveLayer(field, "local")}
                                  onReset={() => void moveLayer(field, "global")}
                                />
                              ))}
                            </div>
                          ) : null}
                        </section>
                      );
                    })}
                  </div>
                )}
              </div>

              {reviewOpen && reviewGroups.length > 0 ? (
                <div className="max-h-40 shrink-0 overflow-y-auto border-t border-border bg-[#141416] px-4 py-2">
                  <p className="pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    Changes
                  </p>
                  <div className="space-y-2">
                    {reviewGroups.map((group) => (
                      <div key={group.path}>
                        <p className="truncate font-mono text-[11px] text-foreground/80">
                          {playbookNameFromVarsFile(group.fileName)}
                        </p>
                        <ul className="mt-0.5 space-y-0.5">
                          {group.lines.map((line) => (
                            <li
                              key={`${line.path}:${line.key}`}
                              className="flex min-w-0 items-baseline gap-2 text-[12px]"
                            >
                              <span className="w-36 shrink-0 truncate text-muted-foreground sm:w-44">
                                {line.label}
                              </span>
                              {line.secret ? (
                                <span className="truncate text-foreground">updated</span>
                              ) : (
                                <span className="min-w-0 truncate font-mono text-[11px]">
                                  <span className="text-muted-foreground">{line.from}</span>
                                  <span className="px-1 text-muted-foreground/70">→</span>
                                  <span>{line.to}</span>
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-[#161618] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {pendingCount
                    ? `${pendingCount} unsaved change${pendingCount === 1 ? "" : "s"}`
                    : "No unsaved changes"}
                </span>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pendingCount === 0 || busy || loading}
                    onClick={resetAll}
                  >
                    Reset
                  </Button>
                  <Button variant="ghost" onClick={requestClose}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      if (!reviewOpen) {
                        setReviewOpen(true);
                        return;
                      }
                      void commitSave();
                    }}
                    disabled={busy || loading || pendingCount === 0 || !canWrite}
                  >
                    {saveLabel}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmAction
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Discard unsaved changes?"
        description="Unsaved edits will be lost."
        confirmLabel="Discard"
        destructive
        onConfirm={confirmDiscard}
      />
    </>
  );
}

function headerStatus(
  filled: number,
  total: number,
  missing: number,
  invalid: number,
): { tone: "ready" | "missing" | "invalid"; label: string } {
  if (invalid > 0) {
    return {
      tone: "invalid",
      label: `${invalid} invalid`,
    };
  }
  if (missing > 0) {
    return {
      tone: "missing",
      label: `${missing} missing`,
    };
  }
  return {
    tone: "ready",
    label: `${filled}/${total} Ready`,
  };
}

function FileNavGroup({
  title,
  nested = false,
  items,
  activePath,
  dirtyPaths,
  onSelect,
  labelFor,
  className,
}: {
  title?: string;
  nested?: boolean;
  items: PlaybookSetupFileTab[];
  activePath: string;
  dirtyPaths?: ReadonlySet<string>;
  onSelect: (item: PlaybookSetupFileTab) => void;
  labelFor?: (item: PlaybookSetupFileTab) => string;
  className?: string;
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div className={className}>
      {title ? (
        <p
          className={cn(
            "px-1 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground",
            nested ? "pt-1.5" : "pt-2 uppercase",
          )}
        >
          {title}
        </p>
      ) : null}
      <div className={cn("space-y-0.5", nested && "ml-1 border-l border-border/80 pl-1")}>
        {items.map((item) => {
          const active = item.path === activePath;
          const label = labelFor?.(item) ?? item.name;
          return (
            <button
              key={item.path}
              type="button"
              title={item.name}
              aria-label={item.name}
              className={cn(
                "relative flex w-full items-center gap-2 rounded-md py-1.5 pr-2 pl-3 text-left text-[13px]",
                active
                  ? "bg-background text-foreground shadow-sm ring-1 ring-foreground/10"
                  : "text-muted-foreground hover:bg-background/50 hover:text-foreground",
              )}
              onClick={() => onSelect(item)}
            >
              {active ? (
                <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-foreground" />
              ) : null}
              <span className="min-w-0 flex-1 truncate font-mono">{label}</span>
              {dirtyPaths?.has(item.path) ? (
                <span
                  className="size-1.5 shrink-0 rounded-full bg-amber-400"
                  title="Unsaved changes"
                />
              ) : null}
              {item.missing && item.missing > 0 ? (
                <Badge variant="warning">{item.missing}</Badge>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const SSH_GUEST_ADD = "__add__";

function sshGuestValue(row: SecretOption): string {
  return `${row.group}:${row.id}`;
}

function parseSshGuestValue(
  value: string,
): { group: "global" | "project"; id: string } | null {
  const sep = value.indexOf(":");
  if (sep <= 0) return null;
  const group = value.slice(0, sep);
  const id = value.slice(sep + 1).trim();
  if (!id || (group !== "global" && group !== "project")) return null;
  return { group, id };
}

function SshPubStatusCard({
  projectId,
  clusterId,
  pathHint,
  onFormOpenChange,
}: {
  projectId: string;
  clusterId: string;
  pathHint: string;
  onFormOpenChange?: (open: boolean) => void;
}) {
  const { promptAdd, dialog, formOpen } = useEnsureClusterctlSshKey();
  const [secrets, setSecrets] = useState<SecretOption[]>([]);
  const [value, setValue] = useState(GIT_PULL_NONE);
  const [status, setStatus] = useState<{
    sshSecretId: string | null;
    name: string | null;
    fingerprint: string | null;
    pubFingerprint: string | null;
    match: boolean;
    pubExists: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    onFormOpenChange?.(formOpen);
  }, [formOpen, onFormOpenChange]);

  async function reload() {
    if (!projectId || !clusterId) return;
    const [rows, data] = await Promise.all([
      loadGitPullSecrets(projectId),
      fetchAtlasOperatorSsh(projectId, clusterId),
    ]);
    setSecrets(rows);
    const atlasId = (data.sshSecretId || "").trim();
    const atlasRow = rows.find(
      (row) => row.group === "global" && row.id === atlasId,
    );
    setValue(atlasRow ? sshGuestValue(atlasRow) : GIT_PULL_NONE);
    setStatus({
      sshSecretId: atlasId || null,
      name: data.name ?? null,
      fingerprint: data.fingerprint ?? null,
      pubFingerprint: data.pubFingerprint ?? null,
      match: Boolean(data.match),
      pubExists: Boolean(data.pubExists),
    });
  }

  useEffect(() => {
    void reload().catch((err: unknown) => {
      toast.error(err instanceof Error ? err.message : String(err));
    });
  }, [projectId, clusterId]);

  async function applyKey(next: string) {
    const parsed = parseSshGuestValue(next);
    if (!parsed) return;
    setBusy(true);
    try {
      const data = await writeAtlasOperatorPubkey(projectId, clusterId, {
        sshSecretId: parsed.group === "global" ? parsed.id : null,
        projectSecretName: parsed.group === "project" ? parsed.id : null,
      });
      setValue(next);
      setStatus({
        sshSecretId: data.sshSecretId ?? null,
        name: data.name ?? null,
        fingerprint: data.fingerprint ?? null,
        pubFingerprint: data.pubFingerprint ?? null,
        match: Boolean(data.match),
        pubExists: Boolean(data.pubExists),
      });
      toast.success("Wrote public key to the cluster");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      await reload().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function addKey() {
    const ok = await promptAdd();
    try {
      await reload();
      if (ok) {
        await writeAtlasOperatorPubkey(projectId, clusterId);
        await reload();
        toast.success("Wrote public key to the cluster");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  const globalSecrets = secrets.filter((row) => row.group === "global");
  const projectSecrets = secrets.filter((row) => row.group === "project");
  const selected =
    value === GIT_PULL_NONE
      ? "Select SSH key"
      : secrets.find((row) => sshGuestValue(row) === value)?.name || value;
  const selectedIsProject = value.startsWith("project:");
  const tone = !status?.sshSecretId && !selectedIsProject
    ? "missing"
    : selectedIsProject || status?.match
      ? "ready"
      : "invalid";
  const pillLabel = !status?.sshSecretId && !selectedIsProject
    ? "No key"
    : selectedIsProject
      ? "On guests"
      : status?.match
        ? "Matches VMs"
        : "Does not match";

  return (
    <div className="space-y-2">
      {dialog}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
        <Select
          value={value}
          onValueChange={(next) => {
            const chosen = next ?? GIT_PULL_NONE;
            if (chosen === SSH_GUEST_ADD) {
              void addKey();
              return;
            }
            if (chosen === GIT_PULL_NONE) {
              setValue(GIT_PULL_NONE);
              return;
            }
            void applyKey(chosen);
          }}
          disabled={busy}
        >
          <SelectTrigger
            id="setup-ssh-on-guests"
            size="sm"
            className="h-8 w-full min-w-0 border-foreground/20 bg-background"
          >
            <span className="min-w-0 flex-1 truncate text-left text-[13px]">
              {busy ? "Writing…" : selected}
            </span>
          </SelectTrigger>
          <SelectContent
            side="bottom"
            align="start"
            alignItemWithTrigger={false}
            positionMethod="fixed"
            className="z-[80] min-w-(--anchor-width)"
          >
            <SelectItem value={GIT_PULL_NONE}>Select SSH key</SelectItem>
            {globalSecrets.length ? (
              <SelectGroup>
                <SelectLabel>Global</SelectLabel>
                {globalSecrets.map((row) => (
                  <SelectItem key={sshGuestValue(row)} value={sshGuestValue(row)}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
            {projectSecrets.length ? (
              <SelectGroup>
                <SelectLabel>Project</SelectLabel>
                {projectSecrets.map((row) => (
                  <SelectItem key={sshGuestValue(row)} value={sshGuestValue(row)}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
            <SelectSeparator />
            <SelectItem value={SSH_GUEST_ADD}>
              <Plus />
              Add SSH key
            </SelectItem>
          </SelectContent>
        </Select>
        </div>
        <StatusPill tone={tone} label={pillLabel} />
      </div>
      {pathHint ? (
        <p className="font-mono text-[11px] text-muted-foreground">{pathHint}</p>
      ) : null}
    </div>
  );
}

function StatusPill({
  tone,
  label,
}: {
  tone: "ready" | "missing" | "invalid";
  label: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 pt-0.5 text-xs tabular-nums">
      <span
        className={cn(
          "size-1.5 rounded-full",
          tone === "ready" && "bg-emerald-400",
          tone === "missing" && "bg-amber-400",
          tone === "invalid" && "bg-red-500",
        )}
      />
      <span
        className={cn(
          tone === "ready" && "text-emerald-400",
          tone === "missing" && "text-amber-400",
          tone === "invalid" && "text-red-500",
        )}
      >
        {label}
      </span>
    </div>
  );
}

function scopeBadgeClass(origin: VarsSetupOrigin): string {
  if (origin === "env") {
    return "bg-sky-400/20 text-sky-100";
  }
  if (origin === "org") {
    return "bg-violet-400/20 text-violet-100";
  }
  if (origin === "leaf") {
    return "bg-amber-400/25 text-amber-100";
  }
  return "text-muted-foreground";
}

function ScopeToggle({
  fieldKey,
  origin,
  clusterId,
  busy,
  pending,
  onOverride,
  onReset,
}: {
  fieldKey: string;
  origin: VarsSetupOrigin;
  clusterId: string;
  busy: boolean;
  pending: "cluster" | "shared" | null;
  onOverride: () => void;
  onReset: () => void;
}) {
  const onCluster = origin === "leaf";
  const sharedLabel = envScopeLabel(clusterId, origin);
  const sharedOn = origin === "env" || origin === "org";
  return (
    <div
      role="group"
      aria-label={`Value source for ${fieldKey}`}
      className="grid w-full grid-cols-[1.4fr_0.9fr] rounded-md border border-foreground/15 bg-background p-0.5"
    >
      <button
        type="button"
        aria-pressed={sharedOn}
        disabled={busy || sharedOn}
        title={sharedLabel}
        className={cn(
          "h-7 min-w-0 rounded-[5px] px-1.5 text-[11px] font-medium whitespace-nowrap disabled:opacity-100",
          sharedOn
            ? scopeBadgeClass(origin)
            : "text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-50",
        )}
        onClick={onReset}
      >
        {pending === "shared" ? "…" : sharedLabel}
      </button>
      <button
        type="button"
        aria-pressed={onCluster}
        disabled={busy || onCluster}
        title={onCluster ? "Value is set on this cluster" : "Set a value on this cluster"}
        className={cn(
          "h-7 rounded-[5px] text-[11px] font-medium disabled:opacity-100",
          onCluster
            ? scopeBadgeClass("leaf")
            : "text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-50",
        )}
        onClick={onOverride}
      >
        {pending === "cluster" ? "…" : "Cluster"}
      </button>
    </div>
  );
}

function SettingRow({
  field,
  value,
  origin,
  description,
  modified,
  revealed,
  envLayer,
  layerBusy,
  mapOpen,
  projectId,
  clusterId,
  onSshFormOpenChange,
  onReveal,
  onChange,
  onToggleMap,
  onOverride,
  onReset,
}: {
  field: PlaybookSetupField;
  value: SetupFieldValue | undefined;
  origin: VarsSetupOrigin;
  description: string;
  modified: boolean;
  revealed: boolean;
  envLayer: boolean;
  layerBusy: string | null;
  mapOpen: boolean;
  projectId: string;
  clusterId: string;
  onSshFormOpenChange?: (open: boolean) => void;
  onReveal: () => void;
  onChange: (next: SetupFieldValue) => void;
  onToggleMap: () => void;
  onOverride: () => void;
  onReset: () => void;
}) {
  const required = isSetupFieldRequired(field);
  const invalid = setupFieldInvalidMessage(field, value);
  const type = setupFieldValueType(field);
  const busy = Boolean(layerBusy);

  return (
    <div
      className={cn(
        "flex flex-col gap-2 px-3 py-3 sm:min-h-16 sm:flex-row sm:gap-4",
        type === "string_list" || type === "pve_templates" || type === "ssh_pub_status"
          ? "sm:items-start"
          : "sm:items-center",
      )}
    >
      <div className="min-w-0 sm:w-[36%] sm:shrink-0">
        <div className="flex items-center gap-1.5">
          {modified ? (
            <span className="size-1.5 shrink-0 rounded-full bg-foreground/70" />
          ) : null}
          <span className="truncate text-[13px] font-medium">
            {field.label || field.key}
          </span>
          {required ? (
            <span className="text-muted-foreground" title="Required">
              *
            </span>
          ) : null}
        </div>
        {description || field.hint ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {description || field.hint}
          </p>
        ) : null}
        {invalid ? (
          <p className="mt-0.5 text-xs text-red-500">{invalid}</p>
        ) : null}
      </div>

      <div className="flex min-w-0 items-start gap-1 sm:flex-1">
        <div className="min-w-0 flex-1">
        {type === "ssh_pub_status" ? (
          <SshPubStatusCard
            projectId={projectId}
            clusterId={clusterId}
            pathHint={typeof value === "string" ? value : ""}
            onFormOpenChange={onSshFormOpenChange}
          />
        ) : type === "pve_templates" ? (
          <PveTemplatesEditor
            value={normalizePveTemplatesMap(value)}
            open={mapOpen}
            onToggle={onToggleMap}
            onChange={onChange}
          />
        ) : type === "boolean" ? (
          <BooleanToggle
            value={typeof value === "string" ? value : ""}
            onChange={(next) => onChange(next)}
          />
        ) : type === "string_list" ? (
          <Textarea
            id={`setup-${field.key}`}
            rows={3}
            className="min-h-16 border-foreground/20 bg-background font-mono text-[13px]"
            value={typeof value === "string" ? value : ""}
            aria-invalid={Boolean(invalid)}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : field.options && field.options.length > 0 ? (
          <ChoiceField
            id={`setup-${field.key}`}
            value={typeof value === "string" ? value : ""}
            options={field.options}
            invalid={Boolean(invalid)}
            onChange={onChange}
          />
        ) : type === "timezone" ? (
          <TimezoneField
            id={`setup-${field.key}`}
            value={typeof value === "string" ? value : ""}
            invalid={Boolean(invalid)}
            onChange={onChange}
          />
        ) : type === "password" ? (
          <div className="relative">
            <Input
              id={`setup-${field.key}`}
              type={revealed ? "text" : "password"}
              className="h-8 border-foreground/20 bg-background pr-9 font-mono text-[13px]"
              value={typeof value === "string" ? value : ""}
              autoComplete="off"
              aria-invalid={Boolean(invalid)}
              onChange={(event) => onChange(event.target.value)}
            />
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="absolute top-1/2 right-1 -translate-y-1/2"
              onClick={onReveal}
              aria-label={revealed ? `Hide ${field.key}` : `Show ${field.key}`}
            >
              {revealed ? <EyeOff /> : <Eye />}
            </Button>
          </div>
        ) : (
          <Input
            id={`setup-${field.key}`}
            type="text"
            className="h-8 border-foreground/20 bg-background font-mono text-[13px]"
            value={typeof value === "string" ? value : ""}
            autoComplete="off"
            aria-invalid={Boolean(invalid)}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
          {type === "password" ? (
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={`Generate ${field.key}`}
              onClick={() => onChange(generateSetupSecret(field.key))}
            >
              <Sparkles />
            </Button>
          ) : null}
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={`Copy ${field.key}`}
            onClick={() => {
              const text = setupFieldCopyText(field, value);
              if (!text.trim()) {
                toast.error("Nothing to copy");
                return;
              }
              void navigator.clipboard.writeText(text).then(
                () => toast.success("Copied"),
                () => toast.error("Copy failed"),
              );
            }}
          >
            <Copy />
          </Button>
        </div>
      </div>

      {envLayer ? (
        <div className="w-full min-w-0 sm:w-52 sm:shrink-0">
          <ScopeToggle
            fieldKey={field.key}
            origin={origin}
            clusterId={clusterId}
            busy={busy}
            pending={
              layerBusy === `${field.key}:local`
                ? "cluster"
                : layerBusy === `${field.key}:global`
                  ? "shared"
                  : null
            }
            onOverride={onOverride}
            onReset={onReset}
          />
        </div>
      ) : null}
    </div>
  );
}

function ChoiceField({
  id,
  value,
  options,
  invalid,
  onChange,
}: {
  id: string;
  value: string;
  options: string[];
  invalid: boolean;
  onChange: (next: string) => void;
}) {
  const choices = options.includes(value) || !value.trim() ? options : [value, ...options];
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next);
      }}
    >
      <SelectTrigger
        id={id}
        size="sm"
        aria-invalid={invalid}
        className="h-8 w-full min-w-0 border-foreground/20 bg-background font-mono text-[13px]"
      >
        <SelectValue placeholder="Select" />
      </SelectTrigger>
      <SelectContent
        side="bottom"
        align="start"
        alignItemWithTrigger={false}
        positionMethod="fixed"
        className="z-[80] min-w-(--anchor-width)"
      >
        {choices.map((option) => (
          <SelectItem key={option} value={option} className="font-mono text-[13px]">
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TimezoneField({
  id,
  value,
  invalid,
  onChange,
}: {
  id: string;
  value: string;
  invalid: boolean;
  onChange: (next: string) => void;
}) {
  const zones = useMemo(() => ianaTimeZones(), []);
  const selected = zones.includes(value) ? value : null;
  return (
    <Combobox.Root
      items={zones}
      value={selected}
      inputValue={value}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next);
      }}
      onInputValueChange={(next) => onChange(next)}
    >
      <div className="relative">
        <Combobox.Input
          id={id}
          className="h-8 w-full rounded-lg border border-foreground/20 bg-background pr-8 pl-2.5 font-mono text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
          aria-invalid={invalid}
        />
        <Combobox.Trigger
          className="absolute top-1/2 right-1 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Show timezones"
        >
          <ChevronDown className="size-3.5" />
        </Combobox.Trigger>
      </div>
      <Combobox.Portal>
        <Combobox.Positioner className="z-50" sideOffset={4}>
          <Combobox.Popup className="max-h-56 w-(--anchor-width) overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
            <Combobox.Empty className="px-2 py-1.5 text-xs text-muted-foreground">
              Custom timezone
            </Combobox.Empty>
            <Combobox.List>
              {(zone: string) => (
                <Combobox.Item
                  key={zone}
                  value={zone}
                  className="cursor-default rounded-md px-2 py-1 font-mono text-[13px] outline-none data-highlighted:bg-muted"
                >
                  {zone}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

function BooleanToggle({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const on = value.trim().toLowerCase() === "true";
  return (
    <Button
      type="button"
      size="xs"
      variant={on ? "default" : "outline"}
      className="w-14"
      onClick={() => onChange(on ? "false" : "true")}
      aria-pressed={on}
    >
      {on ? "ON" : "OFF"}
    </Button>
  );
}

function PveTemplatesEditor({
  value,
  open,
  onToggle,
  onChange,
}: {
  value: PveTemplatesMap;
  open: boolean;
  onToggle: () => void;
  onChange: (next: PveTemplatesMap) => void;
}) {
  const filled = PVE_TEMPLATE_KEYS.filter((name) => {
    const entry = value[name];
    return entry?.id.trim() && entry?.image_url.trim();
  }).length;
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        onClick={onToggle}
      >
        {open ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
        <span className="tabular-nums">
          {filled}/{PVE_TEMPLATE_KEYS.length} templates
        </span>
      </button>
      {open
        ? PVE_TEMPLATE_KEYS.map((name) => {
            const entry = value[name] ?? { id: "", image_url: "" };
            const urlInvalid = setupFieldInvalidMessage(
              { key: `${name}_url`, label: name, valueType: "url" },
              entry.image_url,
            );
            return (
              <div key={name} className="grid gap-1.5 sm:grid-cols-[7rem_1fr]">
                <p className="col-span-full font-mono text-[11px] text-muted-foreground">
                  {name}
                </p>
                <Input
                  id={`pve-${name}-id`}
                  className="h-8 border-foreground/20 bg-background font-mono text-[13px]"
                  value={entry.id}
                  aria-label={`${name} id`}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      [name]: { ...entry, id: event.target.value },
                    })
                  }
                />
                <div>
                  <Input
                    id={`pve-${name}-url`}
                    className="h-8 border-foreground/20 bg-background font-mono text-[13px]"
                    value={entry.image_url}
                    aria-label={`${name} image url`}
                    aria-invalid={Boolean(urlInvalid)}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        [name]: { ...entry, image_url: event.target.value },
                      })
                    }
                  />
                  {urlInvalid ? (
                    <p className="mt-0.5 text-[11px] text-red-500">{urlInvalid}</p>
                  ) : null}
                </div>
              </div>
            );
          })
        : null}
    </div>
  );
}
