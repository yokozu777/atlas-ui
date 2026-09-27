"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { projectApiQuery } from "@/components/hosts-groups/helpers";
import {
  fetchBootstrapStatus,
  fetchConfigShow,
  fetchReposStatus,
  type BootstrapStatus,
  type ConfigShowReport,
  type ReposStatusPayload,
} from "@/lib/api";
import {
  buildPackMapGraph,
  type PackMapAuth,
  type PackMapGraph,
  type PackMapVarsFile,
} from "@/lib/atlas-pack-map";
import { parseClusterYaml } from "@/lib/cluster-yaml-model";
import { stargateJson } from "@/lib/stargate";

type VarsSetupList = {
  files?: Array<{
    name: string;
    path?: string;
    exists?: boolean;
  }>;
};

async function fetchPackMapSources(projectId: string, clusterId: string, q: string) {
  const [yamlData, reposData, bootstrapData, setupData, showData, groupData] =
    await Promise.all([
      stargateJson<{ content?: string }>(
        `/projects/${encodeURIComponent(projectId)}/atlas/cluster-yaml?${q}`,
      ),
      fetchReposStatus(clusterId).catch(() => null),
      fetchBootstrapStatus(clusterId, projectId).catch(() => null),
      stargateJson<VarsSetupList>(`/atlas/vars-setup?${q}`).catch(() => null),
      fetchConfigShow(clusterId).catch(() => null),
      stargateJson<{ groups?: Record<string, unknown> }>(
        `/inventory/groups?${q}`,
      ).catch(() => null),
    ]);
  const show = showData as ConfigShowReport | null;
  return {
    yamlText: yamlData.content ?? "",
    repos: reposData,
    bootstrap: bootstrapData,
    varsFiles: setupData
      ? (setupData.files ?? []).map((file) => ({
          name: file.name,
          path: file.path,
          exists: file.exists,
        }))
      : null,
    auth: show
      ? { sshKey: show.ssh_key ?? null, sshKeyOk: show.ssh_key_ok ?? null }
      : null,
    inventoryGroups: groupData?.groups ? Object.keys(groupData.groups) : null,
  };
}

export function useAtlasPackMap(projectId: string, clusterId: string | null) {
  const q = projectApiQuery(projectId, clusterId);
  const scope = `${projectId}:${clusterId ?? ""}`;
  const [seenScope, setSeenScope] = useState(scope);
  const [yamlText, setYamlText] = useState<string | null>(null);
  const [yamlError, setYamlError] = useState<string | null>(null);
  const [repos, setRepos] = useState<ReposStatusPayload | null>(null);
  const [bootstrap, setBootstrap] = useState<BootstrapStatus | null>(null);
  const [varsFiles, setVarsFiles] = useState<PackMapVarsFile[] | null>(null);
  const [auth, setAuth] = useState<PackMapAuth | null>(null);
  const [inventoryGroups, setInventoryGroups] = useState<string[] | null>(null);
  const generation = useRef(0);

  if (seenScope !== scope) {
    setSeenScope(scope);
    setYamlText(null);
    setYamlError(null);
    setRepos(null);
    setBootstrap(null);
    setVarsFiles(null);
    setAuth(null);
    setInventoryGroups(null);
  }

  const load = useCallback(() => {
    if (!clusterId) {
      return Promise.resolve();
    }
    const ticket = generation.current + 1;
    generation.current = ticket;
    return fetchPackMapSources(projectId, clusterId, q)
      .then((data) => {
        if (generation.current !== ticket) {
          return;
        }
        setYamlText(data.yamlText);
        setRepos(data.repos);
        setBootstrap(data.bootstrap);
        setVarsFiles(data.varsFiles);
        setAuth(data.auth);
        setInventoryGroups(data.inventoryGroups);
        setYamlError(null);
      })
      .catch((err: unknown) => {
        if (generation.current !== ticket) {
          return;
        }
        setYamlError(err instanceof Error ? err.message : String(err));
        setYamlText(null);
      });
  }, [clusterId, projectId, q]);

  useEffect(() => {
    if (!clusterId) {
      return;
    }
    void load();
  }, [clusterId, load]);

  const parsed = useMemo(
    () => (yamlText == null ? null : parseClusterYaml(yamlText)),
    [yamlText],
  );

  const graph = useMemo<PackMapGraph | null>(() => {
    if (!clusterId || !parsed?.ok) {
      return null;
    }
    return buildPackMapGraph({
      clusterId,
      draft: parsed.draft,
      repos,
      bootstrap,
      varsFiles,
      auth,
      inventoryGroups,
    });
  }, [auth, bootstrap, clusterId, inventoryGroups, parsed, repos, varsFiles]);

  const loading = Boolean(clusterId) && yamlText == null && yamlError == null;

  return { graph, parsed, yamlText, yamlError, loading, reload: load };
}
