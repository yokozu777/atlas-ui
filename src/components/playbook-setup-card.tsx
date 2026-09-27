"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { FileCode, Play, Server, Settings2 } from "lucide-react";

import { useClusterOverlays } from "@/components/cluster-overlays";
import { EmptyState } from "@/components/empty-state";
import { HostsTopologyDialog } from "@/components/hosts-topology-dialog";
import { Panel } from "@/components/panel";
import { PlaybookSetupDialog } from "@/components/playbook-setup-dialog";
import { SetupProgressBar } from "@/components/playbook-setup-progress";
import { SectionHeader } from "@/components/section-header";
import { projectApiQuery } from "@/components/hosts-groups/helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ClusterPhase } from "@/lib/api";
import {
  phaseAliasForPlaybook,
  playbookNameFromVarsFile,
  setupProgressFromValues,
  setupSchemaForVarsFile,
  valuesFromVarsSetupFile,
  varsFileBaseName,
} from "@/lib/playbook-setup";
import { projectHref } from "@/lib/project-href";
import { stargateJson } from "@/lib/stargate";
import { useCan } from "@/lib/authz";

type VarsSetupFilePayload = {
  name: string;
  path: string;
  keys?: Record<string, { origin?: string; value?: unknown; comment?: string }>;
  nested?: Record<
    string,
    { origin?: string; value?: unknown; comment?: string }
  >;
};

type VarsSetupRow = {
  name: string;
  path: string;
  missing: number;
  total: number;
  phaseAlias: string;
};

export function PlaybookSetupCard({
  projectId,
  clusterId,
  variant = "full",
}: {
  projectId: string;
  clusterId: string;
  variant?: "full" | "summary";
}) {
  const { openRun } = useClusterOverlays();
  const can = useCan();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const q = projectApiQuery(projectId, clusterId);
  const [rows, setRows] = useState<VarsSetupRow[]>([]);
  const [pveFactory, setPveFactory] = useState(false);
  const [hasEnvLayer, setHasEnvLayer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<VarsSetupRow | null>(null);
  const [hostsOpen, setHostsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [setupData, yamlData] = await Promise.all([
        stargateJson<{
          files?: VarsSetupFilePayload[];
          pveFactory?: boolean;
          hasEnvLayer?: boolean;
        }>(`/atlas/vars-setup?${q}`),
        stargateJson<{ phases?: ClusterPhase[] }>(
          `/projects/${encodeURIComponent(projectId)}/atlas/cluster-yaml?${q}`,
        ).catch(() => ({ phases: [] as ClusterPhase[] })),
      ]);
      const phases = yamlData.phases ?? [];
      const factory = Boolean(setupData.pveFactory);
      const next = (setupData.files ?? [])
        .filter((file) => varsFileBaseName(file.name) !== "proxmox.yml")
        .map((file) => {
          const schema = setupSchemaForVarsFile(file.name, "", {
            pveFactory: factory,
          });
          const values = valuesFromVarsSetupFile(schema, file);
          const progress = setupProgressFromValues(schema, values);
          return {
            name: file.name,
            path: file.path,
            missing: progress.missing,
            total: progress.total,
            phaseAlias: phaseAliasForPlaybook(
              playbookNameFromVarsFile(file.name),
              phases,
            ),
          };
        });
      setRows(next);
      setPveFactory(factory);
      setHasEnvLayer(Boolean(setupData.hasEnvLayer));
      setError(null);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId, q]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get("hosts") !== "1") return;
    if (loading) return;
    if (!pveFactory) setHostsOpen(true);
    const next = new URLSearchParams(searchParams.toString());
    next.delete("hosts");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [searchParams, router, pathname, loading, pveFactory]);

  const title = variant === "summary" ? "Configuration" : "Vars setup";
  const hostsDialog = (
    <HostsTopologyDialog
      open={hostsOpen}
      onOpenChange={setHostsOpen}
      projectId={projectId}
      clusterId={clusterId}
    />
  );
  const hostsButton = (
    <Button size="sm" variant="outline" onClick={() => setHostsOpen(true)}>
      <Server />
      Hosts
    </Button>
  );

  const dialog = selected ? (
    <PlaybookSetupDialog
      open
      onOpenChange={(next) => {
        if (!next) setSelected(null);
      }}
      projectId={projectId}
      clusterId={clusterId}
      fileName={selected.name}
      path={selected.path}
      files={rows.map((row) => ({
        name: row.name,
        path: row.path,
        missing: row.missing,
      }))}
      onFileChange={(file) => {
        const next = rows.find((row) => row.path === file.path);
        if (next) setSelected(next);
      }}
      pveFactory={pveFactory}
      hasEnvLayer={hasEnvLayer}
      onSaved={() => void load()}
    />
  ) : null;

  if (loading && rows.length === 0) {
    return (
      <div id="cluster-configuration">
        <SectionHeader
          title={title}
          icon={variant === "summary" ? <Settings2 /> : undefined}
          actions={variant === "summary" ? hostsButton : undefined}
        />
        <Skeleton className={variant === "summary" ? "h-16 rounded-xl" : "h-28 rounded-xl"} />
        {dialog}
        {hostsDialog}
      </div>
    );
  }

  if (error) {
    return (
      <div id="cluster-configuration">
        <SectionHeader
          title={title}
          icon={variant === "summary" ? <Settings2 /> : undefined}
          actions={variant === "summary" ? hostsButton : undefined}
        />
        <Panel className="p-4">
          <p className="font-mono text-xs whitespace-pre-wrap text-destructive">
            {error}
          </p>
        </Panel>
        {dialog}
        {hostsDialog}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div id="cluster-configuration">
        <SectionHeader
          title={title}
          icon={variant === "summary" ? <Settings2 /> : undefined}
          actions={variant === "summary" ? hostsButton : undefined}
        />
        <EmptyState
          title="No group vars files"
          description="Pull inventory or add overlay YAML under group_vars, then configure it here."
        />
        {dialog}
        {hostsDialog}
      </div>
    );
  }

  const filled = rows.reduce(
    (sum, row) => sum + Math.max(0, row.total - row.missing),
    0,
  );
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const missingFiles = rows.filter((row) => row.total > 0 && row.missing > 0).length;
  const readyFiles = rows.length - missingFiles;

  function openFirstFile() {
    const first =
      rows.find((row) => row.total > 0 && row.missing > 0) ?? rows[0];
    if (first) {
      setSelected(first);
    }
  }

  if (variant === "summary") {
    return (
      <div id="cluster-configuration">
        <SectionHeader
          title="Configuration"
          icon={<Settings2 />}
          actions={
            <>
              {hostsButton}
              <Button size="sm" onClick={openFirstFile}>
                <Settings2 />
                Configure
              </Button>
              <Button
                size="sm"
                variant="outline"
                render={<Link href={projectHref(projectId, "/hosts?tab=vars")} />}
              >
                <FileCode />
                Vars
              </Button>
            </>
          }
        />
        <Panel className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={missingFiles > 0 ? "warning" : "success"}>
              {missingFiles > 0
                ? `${missingFiles} missing`
                : `${readyFiles}/${rows.length} ready`}
            </Badge>
            {missingFiles > 0 ? (
              <span className="text-sm text-muted-foreground">
                {readyFiles}/{rows.length} ready
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 flex flex-wrap items-center text-sm text-muted-foreground">
            {rows.map((row, index) => (
              <span key={row.path} className="inline-flex min-w-0 items-center">
                {index > 0 ? (
                  <span className="px-1.5 text-muted-foreground/50" aria-hidden>
                    ·
                  </span>
                ) : null}
                <button
                  type="button"
                  className="max-w-full truncate rounded-sm text-left underline-offset-2 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onClick={() => setSelected(row)}
                >
                  {row.name}
                </button>
              </span>
            ))}
          </p>
        </Panel>
        {dialog}
        {hostsDialog}
      </div>
    );
  }

  return (
    <div>
      <SectionHeader title="Vars setup" />
      <Panel>
        {total > 0 ? (
          <div className="border-b border-foreground/10 px-4 py-3">
            <SetupProgressBar filled={filled} total={total} />
          </div>
        ) : null}
        <div className="divide-y divide-foreground/10">
          {rows.map((row) => {
            const varsHref = projectHref(
              projectId,
              `/hosts?tab=vars&file=${encodeURIComponent(row.path)}`,
            );
            const needsSetup = row.total > 0 && row.missing > 0;
            const filledRow = Math.max(0, row.total - row.missing);
            return (
              <div
                key={row.path}
                className="flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-white/5 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {row.name}
                    </span>
                    {row.total > 0 ? (
                      <Badge variant={needsSetup ? "warning" : "success"}>
                        {needsSetup ? `${row.missing} missing` : "Ready"}
                      </Badge>
                    ) : (
                      <Badge variant="outline">YAML</Badge>
                    )}
                  </div>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {row.path}
                  </p>
                  {row.total > 0 ? (
                    <SetupProgressBar
                      compact
                      filled={filledRow}
                      total={row.total}
                      className="max-w-xs"
                    />
                  ) : null}
                </div>
                <span className="flex shrink-0 flex-wrap items-center gap-1">
                  <Button
                    size="sm"
                    variant={needsSetup ? "default" : "outline"}
                    onClick={() => setSelected(row)}
                  >
                    Configure
                  </Button>
                  {row.phaseAlias ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!can("atlas.execute")}
                      onClick={() => openRun({ phases: row.phaseAlias })}
                    >
                      <Play />
                      Run
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    render={<Link href={varsHref} />}
                  >
                    Full file
                  </Button>
                </span>
              </div>
            );
          })}
        </div>
      </Panel>
      {dialog}
    </div>
  );
}
