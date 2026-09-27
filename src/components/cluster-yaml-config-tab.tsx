"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Activity, RefreshCw } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { JsonBlock } from "@/components/json-block";
import { Panel } from "@/components/panel";
import { SectionHeader } from "@/components/section-header";
import { StackList, StackListRow } from "@/components/stack-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchConfigEffective,
  fetchConfigShow,
  type ClusterPhase,
  type ConfigEffectivePayload,
  type ConfigShowReport,
} from "@/lib/api";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm break-all">{children ?? "—"}</div>
    </div>
  );
}

function cascadeLayer(path: string): { title: string; hint: string } {
  const rel = path.includes("/clusters/")
    ? (path.split("/clusters/").pop() ?? path)
    : path;
  const id = rel.replace(/\/cluster\.ya?ml$/i, "");
  const [env, name] = id.split("/");
  if (env === "default" && name === "default") {
    return { title: "Organization defaults", hint: id };
  }
  if (name === "default") {
    return { title: `${env} environment defaults`, hint: id };
  }
  return { title: id || path, hint: "This cluster" };
}

function executionCopy(show: ConfigShowReport | null): string {
  if (!show) return "—";
  const effective = show.execution_effective || "";
  if (effective.startsWith("docker") || show.execution_configured === "docker") {
    return show.docker_image
      ? `Runs in Docker (${show.docker_image})`
      : "Runs in Docker";
  }
  if (effective.includes("local") || show.execution_configured === "local") {
    return "Runs Ansible on this machine (local)";
  }
  return effective || show.execution_configured || "—";
}

export function ClusterYamlConfigTab({
  clusterId,
  phases,
  ready,
}: {
  clusterId: string | null;
  phases: ClusterPhase[];
  ready: boolean;
}) {
  const lastAlias = phases.at(-1)?.alias ?? "";
  const [phaseState, setPhaseState] = useState<{
    clusterId: string;
    alias: string | null;
  }>({ clusterId: "", alias: null });
  const [show, setShow] = useState<ConfigShowReport | null>(null);
  const [effective, setEffective] = useState<ConfigEffectivePayload | null>(
    null,
  );
  const [showError, setShowError] = useState<string | null>(null);
  const [effectiveError, setEffectiveError] = useState<string | null>(null);
  const [loadingShow, setLoadingShow] = useState(false);
  const [loadingEffective, setLoadingEffective] = useState(false);
  const [techOpen, setTechOpen] = useState(false);

  const phaseOverride =
    clusterId && phaseState.clusterId === clusterId ? phaseState.alias : null;
  const phase =
    phaseOverride && phases.some((row) => row.alias === phaseOverride)
      ? phaseOverride
      : lastAlias;

  const loadShow = useCallback(async () => {
    if (!clusterId) return;
    setLoadingShow(true);
    setShowError(null);
    try {
      setShow(await fetchConfigShow(clusterId, phase || undefined));
    } catch (err) {
      setShow(null);
      setShowError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingShow(false);
    }
  }, [clusterId, phase]);

  const loadEffective = useCallback(async () => {
    if (!clusterId) return;
    setLoadingEffective(true);
    setEffectiveError(null);
    try {
      setEffective(await fetchConfigEffective(clusterId));
    } catch (err) {
      setEffective(null);
      setEffectiveError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingEffective(false);
    }
  }, [clusterId]);

  useEffect(() => {
    if (!ready || !clusterId) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void loadShow();
    });
    return () => {
      cancelled = true;
    };
  }, [ready, clusterId, loadShow]);

  useEffect(() => {
    if (!ready || !clusterId) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void loadEffective();
    });
    return () => {
      cancelled = true;
    };
  }, [ready, clusterId, loadEffective]);

  function refresh() {
    void loadShow();
    void loadEffective();
  }

  if (!clusterId) {
    return (
      <EmptyState
        title="No cluster selected"
        description="Choose a cluster in the header."
      />
    );
  }

  if (!ready) {
    return <EmptyState title="Loading runtime" />;
  }

  const ansibleLines = show?.ansible?.lines ?? show?.ansible_lines ?? [];
  const runtimeLines =
    show?.ansible?.runtime_lines ?? show?.ansible_runtime_lines ?? [];
  const boundary = show?.ansible?.boundary ?? show?.boundary ?? phase;
  const phaseRef = show?.ansible?.phase_ref ?? show?.phase_ref ?? "";
  const executionMismatch =
    Boolean(show?.execution_effective) &&
    show?.execution_effective !== show?.execution_configured;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="What's actually running"
        icon={<Activity />}
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={refresh}
            disabled={loadingShow || loadingEffective}
          >
            <RefreshCw />
            Refresh
          </Button>
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="config-phase">Resolved for phase</Label>
          {phases.length ? (
            <Select
              value={phase || undefined}
              onValueChange={(value) => {
                if (value && clusterId) {
                  setPhaseState({ clusterId, alias: value });
                }
              }}
            >
              <SelectTrigger
                id="config-phase"
                size="sm"
                className="min-w-56"
              >
                <SelectValue placeholder="Phase" />
              </SelectTrigger>
              <SelectContent
                side="bottom"
                align="start"
                alignItemWithTrigger={false}
                positionMethod="fixed"
                className="w-max min-w-(--anchor-width) overflow-x-visible"
              >
                {phases.map((row) => (
                  <SelectItem
                    key={row.alias}
                    value={row.alias}
                    className="whitespace-nowrap"
                  >
                    {row.ref ? `${row.alias} · ${row.ref}` : row.alias}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">
              No phases in cluster.yaml; using clusterctl default.
            </p>
          )}
        </div>
      </div>

      {showError ? (
        <p className="text-sm text-destructive">{showError}</p>
      ) : null}

      <Panel className="p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Runnable">
            <Badge variant={show?.deployable ? "success" : "outline"}>
              {show?.deployable ? "Yes" : "Policy stub — not runnable"}
            </Badge>
          </Field>
          <Field label="Executor">
            {loadingShow && !show ? "…" : executionCopy(show)}
          </Field>
          <Field label="SSH key">
            {show ? (
              show.ssh_key_ok ? (
                <span title={show.ssh_key}>Ready</span>
              ) : (
                <span className="text-warning">
                  Missing
                  {show.ssh_key ? ` · ${show.ssh_key}` : ""}
                </span>
              )
            ) : (
              "—"
            )}
          </Field>
          <Field label="Inventory">{show?.inventory || "—"}</Field>
          <Field label="Workspace">
            {show?.workspace_id || show?.workspace_root || "—"}
          </Field>
          <Field label="Display name">{show?.display_name || "—"}</Field>
        </div>
        {executionMismatch ? (
          <p className="mt-4 text-xs text-warning">
            Runtime executor differs from cluster.yaml (an override is active).
          </p>
        ) : null}
        {show?.cascade_paths?.length ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-muted-foreground">Inherited from</p>
            <StackList>
              {show.cascade_paths.map((path) => {
                const layer = cascadeLayer(path);
                return (
                  <StackListRow
                    key={path}
                    className="px-0 py-1"
                    title={layer.title}
                    description={
                      <span title={path}>
                        {layer.hint}
                      </span>
                    }
                  />
                );
              })}
            </StackList>
          </div>
        ) : null}
      </Panel>

      <div>
        <Button
          size="sm"
          variant="ghost"
          className="px-0"
          onClick={() => setTechOpen((open) => !open)}
        >
          {techOpen ? "Hide technical details" : "Technical details"}
        </Button>
        {techOpen ? (
          <div className="mt-3 space-y-4">
            <Panel className="space-y-3 p-4">
              <p className="text-sm font-medium">Ansible runtime</p>
              {runtimeLines.length ? (
                <pre className="overflow-x-auto font-mono text-xs text-muted-foreground">
                  {runtimeLines.join("\n")}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {loadingShow ? "Loading…" : "No runtime lines."}
                </p>
              )}
            </Panel>
            <Panel className="space-y-3 p-4">
              <p className="text-sm font-medium">
                Ansible{" "}
                <span className="font-mono text-xs font-normal text-muted-foreground">
                  {boundary}
                  {phaseRef ? ` → ${phaseRef}` : ""}
                </span>
              </p>
              {ansibleLines.length ? (
                <pre className="overflow-x-auto font-mono text-xs text-muted-foreground">
                  {ansibleLines.join("\n")}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {loadingShow ? "Loading…" : "No ansible lines."}
                </p>
              )}
            </Panel>
            {effectiveError ? (
              <p className="text-sm text-destructive">{effectiveError}</p>
            ) : null}
            <JsonBlock
              value={effective?.effective ?? (loadingEffective ? "Loading…" : {})}
              label="config effective"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
