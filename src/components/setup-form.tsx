"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_CLUSTERCTL_GIT_URL,
  cloneClusterctlGit,
  fetchClusterctlGit,
  pullClusterctlGit,
  saveSetup,
  type ClusterctlGitStatus,
} from "@/lib/api";

export function SetupForm({
  defaultPath = "",
  defaultGitUrl = DEFAULT_CLUSTERCTL_GIT_URL,
  submitLabel = "Save and probe",
  redirectTo = "/projects",
}: {
  defaultPath?: string;
  defaultGitUrl?: string;
  submitLabel?: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [path, setPath] = useState(defaultPath);
  const [gitUrl, setGitUrl] = useState(defaultGitUrl);
  const [status, setStatus] = useState<ClusterctlGitStatus | null>(null);
  const [busy, setBusy] = useState<"probe" | "clone" | "pull" | null>(null);

  function applyStatus(next: ClusterctlGitStatus) {
    setStatus(next);
    if (next.gitUrl) {
      setGitUrl(next.gitUrl);
    }
    if (next.dest || next.clusterctlRoot) {
      setPath(next.dest || next.clusterctlRoot || "");
    }
  }

  useEffect(() => {
    void fetchClusterctlGit()
      .then((data) => applyStatus(data))
      .catch(() => undefined);
  }, []);

  async function onProbe(e: React.FormEvent) {
    e.preventDefault();
    setBusy("probe");
    try {
      const result = await saveSetup(path);
      applyStatus(result);
      toast.success(result.version || "clusterctl OK");
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onClone() {
    setBusy("clone");
    try {
      const result = await cloneClusterctlGit({ url: gitUrl, dest: path });
      applyStatus(result);
      toast.success(result.version || "cloned atlas-clusterctl");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onPull() {
    setBusy("pull");
    try {
      const result = await pullClusterctlGit({ url: gitUrl, dest: path });
      applyStatus(result);
      toast.success(result.version || "updated atlas-clusterctl");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const hint = !status
    ? null
    : status.error ||
      (status.ok
        ? status.version
        : status.exists
          ? status.isRepo
            ? "Git checkout present"
            : "Destination exists"
          : "Destination is empty — Clone from GitHub");

  return (
    <form onSubmit={onProbe} className="flex max-w-xl flex-col gap-4">
      <div className="space-y-2">
        <Label htmlFor="clusterctl-git-url">Git URL</Label>
        <Input
          id="clusterctl-git-url"
          value={gitUrl}
          onChange={(e) => setGitUrl(e.target.value)}
          placeholder={DEFAULT_CLUSTERCTL_GIT_URL}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="clusterctl-root">Checkout path</Label>
        <Input
          id="clusterctl-root"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="atlas-clusterctl"
          required
        />
        <p className="text-xs text-muted-foreground">
          Default is <code className="font-mono">atlas-clusterctl</code> next
          to the atlas-ui directory. Must contain{" "}
          <code className="font-mono">./cluster</code> and{" "}
          <code className="font-mono">clusterctl/__main__.py</code> after clone.
        </p>
      </div>
      {hint ? (
        <p
          className={
            status?.error
              ? "font-mono text-sm text-destructive"
              : "font-mono text-sm text-muted-foreground"
          }
        >
          {hint}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void onClone()}>
          {busy === "clone" ? "Cloning…" : "Clone"}
        </Button>
        <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void onPull()}>
          {busy === "pull" ? "Pulling…" : "Pull"}
        </Button>
        <Button type="submit" disabled={busy !== null}>
          {busy === "probe" ? "Checking…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
