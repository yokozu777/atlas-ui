"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { JsonBlock } from "@/components/json-block";
import { Panel } from "@/components/panel";
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

function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs">{children ?? "—"}</span>;
}

function yesNo(value: boolean | undefined) {
  if (value === undefined) return "—";
  return value ? "yes" : "no";
}

function lineList(values?: string[] | null) {
  if (!values?.length) return null;
  return <JsonBlock value={values.join("\n")} mask={false} framed={false} />;
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
  const [phaseOverride, setPhaseOverride] = useState<string | null>(null);
  const [show, setShow] = useState<ConfigShowReport | null>(null);
  const [effective, setEffective] = useState<ConfigEffectivePayload | null>(
    null,
  );
  const [showError, setShowError] = useState<string | null>(null);
  const [effectiveError, setEffectiveError] = useState<string | null>(null);
  const [loadingShow, setLoadingShow] = useState(false);
  const [loadingEffective, setLoadingEffective] = useState(false);

  const phase = phaseOverride ?? lastAlias;

  useEffect(() => {
    setPhaseOverride(null);
  }, [clusterId, lastAlias]);

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
    void loadShow();
  }, [ready, clusterId, loadShow]);

  useEffect(() => {
    if (!ready || !clusterId) return;
    void loadEffective();
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
    return <EmptyState title="Loading config" />;
  }

  const ansibleLines =
    show?.ansible?.lines ?? show?.ansible_lines ?? [];
  const runtimeLines =
    show?.ansible?.runtime_lines ?? show?.ansible_runtime_lines ?? [];
  const boundary = show?.ansible?.boundary ?? show?.boundary ?? phase;
  const phaseRef = show?.ansible?.phase_ref ?? show?.phase_ref ?? "";
  const executionMismatch =
    Boolean(show?.execution_effective) &&
    show?.execution_effective !== show?.execution_configured;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Label htmlFor="config-phase">Phase</Label>
          {phases.length ? (
            <Select
              value={phase || undefined}
              onValueChange={(value) => {
                if (value) setPhaseOverride(value);
              }}
            >
              <SelectTrigger
                id="config-phase"
                size="sm"
                className="min-w-56 font-mono"
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
                    className="font-mono whitespace-nowrap"
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
        <Button
          size="sm"
          variant="outline"
          onClick={refresh}
          disabled={loadingShow || loadingEffective}
        >
          <RefreshCw />
          Refresh
        </Button>
      </div>

      {showError ? (
        <p className="text-sm text-destructive">{showError}</p>
      ) : null}

      <Panel className="p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Cluster">
            <Mono>{show?.cluster_id || clusterId}</Mono>
          </Field>
          <Field label="Display name">
            {show?.display_name || "—"}
          </Field>
          <Field label="Schema">
            {show?.schema_version != null ? `v${show.schema_version}` : "—"}
          </Field>
          <Field label="Deployable">
            <Badge variant={show?.deployable ? "success" : "outline"}>
              {yesNo(show?.deployable)}
            </Badge>
          </Field>
          <Field label="Execution effective">
            <Mono>{show?.execution_effective || (loadingShow ? "…" : "—")}</Mono>
          </Field>
          <Field label="Execution configured">
            <Mono>{show?.execution_configured || "—"}</Mono>
          </Field>
          <Field label="Resolved via">
            <Mono>{show?.execution_source || "—"}</Mono>
          </Field>
          <Field label="Docker image">
            <Mono>{show?.docker_image || "—"}</Mono>
          </Field>
          <Field label="Docker CLI">
            {yesNo(show?.docker_available)}
          </Field>
          <Field label="SSH key">
            <Mono>
              {show?.ssh_key || "—"}{" "}
              {show ? `(${show.ssh_key_ok ? "ok" : "missing"})` : ""}
            </Mono>
          </Field>
          <Field label="Workspace">
            <div className="font-mono text-xs">
              <div>{show?.workspace_id || "—"}</div>
              {show?.workspace_root ? <div>{show.workspace_root}</div> : null}
            </div>
          </Field>
          <Field label="Inventory">
            <Mono>{show?.inventory || "—"}</Mono>
          </Field>
        </div>
        {executionMismatch ? (
          <p className="mt-4 text-xs text-warning">
            Effective execution differs from cluster.yaml (override active).
          </p>
        ) : null}
        {show?.cascade_paths?.length ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-muted-foreground">
              Cascade ({show.cascade_paths.length})
            </p>
            <StackList>
              {show.cascade_paths.map((path) => (
                <StackListRow
                  key={path}
                  className="px-0 py-1"
                  title={
                    <span className="font-mono text-xs font-normal break-all">
                      {path}
                    </span>
                  }
                />
              ))}
            </StackList>
          </div>
        ) : null}
      </Panel>

      <Panel className="space-y-3 p-4">
        <p className="text-sm font-medium">
          Ansible runtime
          {show?.workspace_root ? (
            <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
              {show.workspace_root}
            </span>
          ) : null}
        </p>
        {lineList(runtimeLines) || (
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
        {lineList(ansibleLines) || (
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
  );
}
