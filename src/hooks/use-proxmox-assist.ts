"use client";

import { createContext, useEffect, useState } from "react";

import {
  fetchProxmoxCatalog,
  listHypervisors,
  type Hypervisor,
  type ProxmoxCatalog,
  type ProxmoxStorage,
} from "@/lib/proxmox";

export type ProxmoxAssistContextValue = {
  enabled: boolean;
  matched: boolean;
  hasHostField: boolean;
  hypervisors: Hypervisor[];
  nodes: string[];
  storages: ProxmoxStorage[];
  bridges: Array<ProxmoxBridge | string>;
  groups: string[];
  error: string | null;
  tokenBusy: boolean;
  onHostValue: (value: string, picked: boolean) => void;
  onCreateToken: () => void;
  onPickToken: (tokenId: string) => void;
};

export const ProxmoxAssistContext = createContext<ProxmoxAssistContextValue | null>(
  null,
);

export const PROXMOX_SETUP_KEYS = new Set([
  "provision_pve_host",
  "provision_proxmox_target_node",
  "provision_pve_inventory_name",
  "provision_pve_inventory_group",
  "provision_vm_cloudinit_storage",
  "provision_vm_network_bridge",
  "provision_proxmox_token_id",
  "provision_proxmox_token_secret",
]);

const EMPTY_CATALOG: ProxmoxCatalog = {
  matched: false,
  host: "",
  hypervisorId: null,
  sshUser: "",
  nodes: [],
  storages: [],
  bridges: [],
  inventoryGroups: [],
  error: null,
};

export function useProxmoxCatalog(input: {
  enabled: boolean;
  projectId: string;
  clusterId: string;
  host: string;
  node: string;
}) {
  const [hypervisors, setHypervisors] = useState<Hypervisor[]>([]);
  const [catalog, setCatalog] = useState<ProxmoxCatalog>(EMPTY_CATALOG);

  useEffect(() => {
    if (!input.enabled) return;
    let cancelled = false;
    void listHypervisors()
      .then((rows) => {
        if (!cancelled) setHypervisors(rows);
      })
      .catch(() => {
        if (!cancelled) setHypervisors([]);
      });
    return () => {
      cancelled = true;
    };
  }, [input.enabled]);

  useEffect(() => {
    if (!input.enabled) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetchProxmoxCatalog({
        projectId: input.projectId,
        clusterId: input.clusterId,
        host: input.host,
        node: input.node,
      })
        .then((data) => {
          if (!cancelled) setCatalog(data);
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setCatalog({
              ...EMPTY_CATALOG,
              host: input.host,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [input.clusterId, input.enabled, input.host, input.node, input.projectId]);

  return { hypervisors, catalog };
}
