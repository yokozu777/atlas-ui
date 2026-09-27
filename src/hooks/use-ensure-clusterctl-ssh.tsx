"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

import { GlobalSecretFormDialog } from "@/components/global-secrets/global-secret-form-dialog";
import { fetchClusterctlSshSecretId } from "@/lib/clusterctl-ssh";

export function useEnsureClusterctlSshKey(): {
  ensure: () => Promise<boolean>;
  promptAdd: () => Promise<boolean>;
  refresh: () => Promise<boolean>;
  configured: boolean | null;
  formOpen: boolean;
  dialog: ReactNode;
} {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const waiter = useRef<{ resolve: (ok: boolean) => void } | null>(null);
  const saved = useRef(false);

  const refresh = useCallback(async () => {
    const id = await fetchClusterctlSshSecretId();
    const ok = Boolean(id);
    setConfigured(ok);
    return ok;
  }, []);

  const settle = useCallback((ok: boolean) => {
    waiter.current?.resolve(ok);
    waiter.current = null;
  }, []);

  const openForm = useCallback(() => {
    saved.current = false;
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      waiter.current = { resolve };
    });
  }, []);

  const ensure = useCallback(async () => {
    if (await refresh()) return true;
    return openForm();
  }, [openForm, refresh]);

  const promptAdd = useCallback(async () => openForm(), [openForm]);

  async function onSaved() {
    saved.current = true;
    const ok = await refresh();
    setOpen(false);
    settle(ok);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next && !saved.current) {
      settle(false);
    }
  }

  const dialog = (
    <GlobalSecretFormDialog
      open={open}
      onOpenChange={onOpenChange}
      mode="create"
      sshOnly
      forceClusterctl
      title="Add Atlas SSH key"
      description="Paste an existing OpenSSH private key or generate Ed25519. Atlas stores it in Secrets Manager and uses it as root SSH on new VMs. Playbook git clone uses a separate git pull key. The private key is shown only once after generate."
      onSaved={onSaved}
    />
  );

  return { ensure, promptAdd, refresh, configured, formOpen: open, dialog };
}
