"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import {
  GIT_PULL_NONE,
  GitPullSecretSelect,
} from "@/components/git-pull-secret-select";
import { Button } from "@/components/ui/button";
import {
  fetchClusterctlSshSecretId,
  loadClusterctlSshKeys,
  saveClusterctlSshSecretId,
} from "@/lib/clusterctl-ssh";
import type { SecretOption } from "@/lib/project-sources";

export type ClusterctlSshStatus = {
  sshSecretId: string | null;
  secretCount: number;
  ready: boolean;
};

export function ClusterctlSshKeyPicker({
  id = "clusterctl-ssh-secret",
  label = "Default SSH key",
  hint,
  compact = false,
  disabled = false,
  reloadToken = 0,
  onAdd,
  onStatus,
}: {
  id?: string;
  label?: string;
  hint?: string;
  compact?: boolean;
  disabled?: boolean;
  reloadToken?: number;
  onAdd?: () => void;
  onStatus?: (status: ClusterctlSshStatus) => void;
}) {
  const [value, setValue] = useState(GIT_PULL_NONE);
  const [secrets, setSecrets] = useState<SecretOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  const emit = useCallback((secretId: string | null, rows: SecretOption[]) => {
    onStatusRef.current?.({
      sshSecretId: secretId,
      secretCount: rows.length,
      ready: true,
    });
  }, []);

  const load = useCallback(async () => {
    const [rows, sshSecretId] = await Promise.all([
      loadClusterctlSshKeys(),
      fetchClusterctlSshSecretId(),
    ]);
    setSecrets(rows);
    setValue(sshSecretId || GIT_PULL_NONE);
    setReady(true);
    emit(sshSecretId, rows);
  }, [emit]);

  useEffect(() => {
    setReady(false);
    onStatusRef.current?.({
      sshSecretId: null,
      secretCount: 0,
      ready: false,
    });
    void load().catch((err: unknown) => {
      toast.error(err instanceof Error ? err.message : String(err));
      setReady(true);
      onStatusRef.current?.({
        sshSecretId: null,
        secretCount: 0,
        ready: true,
      });
    });
  }, [load, reloadToken]);

  async function onValueChange(next: string) {
    const sshSecretId = next === GIT_PULL_NONE ? null : next;
    setValue(next);
    setBusy(true);
    try {
      await saveClusterctlSshSecretId(sshSecretId);
      emit(sshSecretId, secrets);
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      await load().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <p className="text-xs text-muted-foreground">Loading SSH keys…</p>
    );
  }

  if (secrets.length === 0) {
    return (
      <div className="space-y-2">
        {compact ? null : (
          <p className="text-sm font-medium">{label}</p>
        )}
        <p className="text-xs text-muted-foreground">
          No SSH keys in Secrets Manager
        </p>
        {onAdd ? (
          <Button
            type="button"
            size="sm"
            disabled={disabled}
            onClick={onAdd}
          >
            Add SSH key
          </Button>
        ) : compact ? null : (
          <Button
            variant="link"
            size="xs"
            className="h-auto px-0"
            render={<Link href="/secrets" />}
          >
            Add SSH key
          </Button>
        )}
      </div>
    );
  }

  return (
    <GitPullSecretSelect
      id={id}
      label={label}
      hint={hint}
      value={value}
      secrets={secrets}
      onValueChange={(next) => void onValueChange(next)}
      disabled={disabled || busy}
      compact={compact}
      noneLabel="Select SSH key"
      onAdd={onAdd}
    />
  );
}
