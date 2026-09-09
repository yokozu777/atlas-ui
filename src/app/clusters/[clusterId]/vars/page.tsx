"use client";

import dynamic from "next/dynamic";
import { use, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, TerminalChrome } from "@/components/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fetchVarsCatalog,
  fetchVarsFile,
  isHubRemote,
  saveVarsFile,
  type VarsFile,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const YamlEditor = dynamic(
  () => import("@/components/yaml-editor").then((mod) => mod.YamlEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[28rem] bg-black/50 p-4 text-sm text-muted-foreground">
        Loading editor…
      </div>
    ),
  },
);

function layerBadgeVariant(layer: string) {
  if (layer === "org") return "info" as const;
  if (layer === "env") return "warning" as const;
  return "default" as const;
}

export default function VarsPage({
  params,
}: {
  params: Promise<{ clusterId: string }>;
}) {
  const clusterId = decodeURIComponent(use(params).clusterId);
  return <ClusterVarsView key={clusterId} clusterId={clusterId} />;
}

export function ClusterVarsView({ clusterId }: { clusterId: string }) {
  const [files, setFiles] = useState<VarsFile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [hubReadOnly, setHubReadOnly] = useState(false);

  const current = useMemo(
    () => files.find((file) => file.rel === selected) ?? null,
    [files, selected],
  );
  const dirty = content !== original;

  useEffect(() => {
    void isHubRemote().then(setHubReadOnly);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchVarsCatalog(clusterId)
      .then((catalog) => {
        if (cancelled) return;
        setFiles(catalog.files);
        setError(null);
        const next = catalog.files[0]?.rel ?? null;
        setSelected(next);
        if (next) setLoadingFile(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFiles([]);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clusterId]);

  useEffect(() => {
    if (!selected) {
      return;
    }
    let cancelled = false;
    void fetchVarsFile(clusterId, selected)
      .then((payload) => {
        if (cancelled) return;
        setContent(payload.content);
        setOriginal(payload.content);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingFile(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clusterId, selected]);

  async function persist() {
    if (!selected) return;
    setSaving(true);
    try {
      await saveVarsFile(clusterId, selected, content);
      setOriginal(content);
      toast.success("saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function onSave() {
    if (!current) return;
    if (current.secret || current.layer !== "leaf") {
      setConfirmOpen(true);
      return;
    }
    void persist();
  }

  const confirmTitle = current?.secret
    ? "Write secrets file?"
    : "Write policy-layer vars?";
  const confirmDescription = current?.secret
    ? `Overwrite ${current.rel} on disk.`
    : `${current?.layer} layer ${current?.rel} is shared with sibling clusters.`;

  return (
    <div className="flex min-h-0 flex-col gap-6">
      <PageHeader
        kicker="Cluster"
        title="Vars"
        description="Connected YAML for this cluster, including secrets. Org/env layers affect other leaves."
      />
      {error ? (
        <p className="font-mono text-xs whitespace-pre-wrap text-destructive">{error}</p>
      ) : null}
      {loadingList ? (
        <p className="text-sm text-muted-foreground">Loading catalog…</p>
      ) : files.length === 0 ? (
        <EmptyState
          title="No vars files"
          description="cluster.yaml, hosts, group_vars, and host_vars appear here."
        />
      ) : (
        <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Layer</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Secret</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file) => (
                <TableRow
                  key={file.rel}
                  className={cn(
                    "cursor-pointer border-l-2 border-l-transparent",
                    file.rel === selected && "border-l-chart-1 bg-chart-1/10",
                  )}
                  onClick={() => {
                    if (file.rel === selected) return;
                    setLoadingFile(true);
                    setSelected(file.rel);
                  }}
                >
                  <TableCell className="font-mono font-medium break-all whitespace-normal">
                    {file.rel.split("/").slice(-2).join("/")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={layerBadgeVariant(file.layer)}>
                      {file.layer}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {file.kind}
                  </TableCell>
                  <TableCell>
                    {file.secret ? (
                      <Badge variant="warning">secret</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Panel className="flex min-h-0 flex-col">
            <TerminalChrome
              label={current?.rel ?? "—"}
              actions={
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    hubReadOnly || !dirty || saving || loadingFile || !current
                  }
                  onClick={onSave}
                >
                  {hubReadOnly ? "read-only on hub" : saving ? "Saving…" : "Save"}
                </Button>
              }
            />
            {hubReadOnly ? (
              <p className="border-b border-foreground/10 px-4 py-2 text-xs text-muted-foreground">
                Vars are read-only on hub. Writes are a later slice.
              </p>
            ) : null}
            {current && current.layer !== "leaf" ? (
              <p className="border-b border-foreground/10 px-4 py-2 text-xs text-warning">
                {current.layer} layer is shared with sibling clusters.
              </p>
            ) : null}
            {current?.secret ? (
              <p className="border-b border-foreground/10 px-4 py-2 text-xs text-warning">
                Secrets file — save writes the full text to disk.
              </p>
            ) : null}
            <YamlEditor
              value={content}
              readOnly={hubReadOnly || loadingFile || !current}
              onChange={setContent}
            />
          </Panel>
        </div>
      )}
      <ConfirmAction
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel="Write"
        destructive={Boolean(current?.secret)}
        onConfirm={persist}
      />
    </div>
  );
}
