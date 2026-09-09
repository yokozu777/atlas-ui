"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useClusterOverlays } from "@/components/cluster-overlays";
import { useAtlasClusterSelection } from "@/components/atlas-cluster-selection";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { clusterHref, fetchClusters, runClusterctl, type ClusterRow } from "@/lib/api";

function parseRunPhases(query: string): string | undefined {
  const tagged = query.match(/--phases\s+(\S+)/i);
  if (tagged) {
    return tagged[1];
  }
  const prefix = query.match(/^run\s+(\S+)/i);
  if (prefix && !prefix[1].startsWith("-")) {
    return prefix[1];
  }
  return undefined;
}

export function CommandPalette({
  clusterId,
  projectId = null,
  atlasProjectId = null,
}: {
  clusterId: string | null;
  projectId?: string | null;
  atlasProjectId?: string | null;
}) {
  const router = useRouter();
  const { openRun, openInspect } = useClusterOverlays();
  const { setClusterId } = useAtlasClusterSelection();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [clusters, setClusters] = useState<ClusterRow[]>([]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    function onPalette() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("atlas-ui:palette", onPalette);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("atlas-ui:palette", onPalette);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    void fetchClusters()
      .then(setClusters)
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : String(err));
      });
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  const runPhases = parseRunPhases(query);

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
      title="Command palette"
      description="use, plan, run --phases"
    >
      <Command>
      <CommandInput
        placeholder="use, plan, run --phases …"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No command</CommandEmpty>
        <CommandGroup heading="workspace">
          <CommandItem
            value="projects"
            onSelect={() => {
              router.push("/projects");
              close();
            }}
          >
            projects
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="clusterctl">
          <CommandItem
            value="plan --json"
            disabled={!clusterId}
            onSelect={() => {
              if (!clusterId) return;
              openInspect("plan");
              close();
            }}
          >
            plan
            <span className="ml-auto font-mono text-xs text-muted-foreground">
              --json
            </span>
          </CommandItem>
          <CommandItem
            value="validate --json"
            disabled={!clusterId}
            onSelect={() => {
              if (!clusterId) return;
              openInspect("validate");
              close();
            }}
          >
            validate
          </CommandItem>
          <CommandItem
            value="smoke --json"
            disabled={!clusterId}
            onSelect={() => {
              if (!clusterId) return;
              openInspect("smoke");
              close();
            }}
          >
            smoke
          </CommandItem>
          <CommandItem
            value="run"
            disabled={!clusterId}
            onSelect={() => {
              if (!clusterId) return;
              openRun();
              close();
            }}
          >
            run
            <span className="ml-auto font-mono text-xs text-muted-foreground">
              sheet
            </span>
          </CommandItem>
          <CommandItem
            value="hosts"
            disabled={!projectId && !clusterId}
            onSelect={() => {
              if (projectId) {
                router.push(`/projects/${encodeURIComponent(projectId)}/hosts`);
              } else if (clusterId) {
                router.push(clusterHref(clusterId, "/hosts"));
              } else {
                return;
              }
              close();
            }}
          >
            hosts
          </CommandItem>
          <CommandItem
            value="vars"
            disabled={!projectId && !clusterId}
            onSelect={() => {
              if (projectId) {
                router.push(`/projects/${encodeURIComponent(projectId)}/vars`);
              } else if (clusterId) {
                router.push(clusterHref(clusterId, "/vars"));
              } else {
                return;
              }
              close();
            }}
          >
            vars
          </CommandItem>
          <CommandItem
            value="inventory"
            disabled={!projectId}
            onSelect={() => {
              if (!projectId) return;
              router.push(`/projects/${encodeURIComponent(projectId)}/inventory`);
              close();
            }}
          >
            inventory
          </CommandItem>
          <CommandItem
            value="ansible config"
            disabled={!projectId}
            onSelect={() => {
              if (!projectId) return;
              router.push(
                `/projects/${encodeURIComponent(projectId)}/ansible-config`,
              );
              close();
            }}
          >
            ansible config
          </CommandItem>
          <CommandItem
            value="handbook role docs"
            disabled={!projectId}
            onSelect={() => {
              if (!projectId) return;
              router.push(`/projects/${encodeURIComponent(projectId)}/handbook`);
              close();
            }}
          >
            handbook
          </CommandItem>
          <CommandItem
            value="workspace"
            disabled={!projectId && !clusterId}
            onSelect={() => {
              if (projectId) {
                router.push(
                  `/projects/${encodeURIComponent(projectId)}/workspace`,
                );
              } else if (clusterId) {
                router.push(clusterHref(clusterId, "/workspace"));
              } else {
                return;
              }
              close();
            }}
          >
            workspace
          </CommandItem>
          {atlasProjectId ? (
            <CommandItem
              value="cluster definition yaml"
              onSelect={() => {
                router.push(
                  `/projects/${encodeURIComponent(atlasProjectId)}/cluster-yaml`,
                );
                close();
              }}
            >
              cluster definition
            </CommandItem>
          ) : null}
          {runPhases ? (
            <CommandItem
              value={`run --phases ${runPhases}`}
              disabled={!clusterId}
              onSelect={() => {
                if (!clusterId) return;
                openRun({ phases: runPhases });
                close();
              }}
            >
              run --phases {runPhases}
            </CommandItem>
          ) : null}
          <CommandItem
            value="init"
            onSelect={() => {
              router.push(
                atlasProjectId
                  ? `/projects/${encodeURIComponent(atlasProjectId)}/init`
                  : "/init",
              );
              close();
            }}
          >
            init
          </CommandItem>
          <CommandItem
            value="settings"
            onSelect={() => {
              router.push("/settings");
              close();
            }}
          >
            settings
          </CommandItem>
          <CommandItem
            value="docs"
            onSelect={() => {
              router.push("/docs");
              close();
            }}
          >
            docs
          </CommandItem>
          <CommandItem
            value="server logs"
            onSelect={() => {
              router.push("/server-logs");
              close();
            }}
          >
            server logs
          </CommandItem>
          <CommandItem
            value="secrets manager"
            onSelect={() => {
              router.push("/secrets");
              close();
            }}
          >
            secrets manager
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="use">
          {clusters.map((row) => (
            <CommandItem
              key={row.id}
              value={`use ${row.id}`}
              onSelect={() => {
                setClusterId(row.id);
                if (!atlasProjectId) {
                  void (async () => {
                    try {
                      if (row.kind === "deployable") {
                        await runClusterctl({ argv: ["use", row.id] });
                        toast.success(`active: ${row.id}`);
                      }
                      router.push(clusterHref(row.id));
                      close();
                    } catch (err) {
                      toast.error(
                        err instanceof Error ? err.message : String(err),
                      );
                    }
                  })();
                  return;
                }
                close();
              }}
            >
              <span className="font-mono">{row.id}</span>
              {row.active ? (
                <span className="ml-2 text-xs text-muted-foreground">active</span>
              ) : null}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
      </Command>
    </CommandDialog>
  );
}
