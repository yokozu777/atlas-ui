"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  DEFAULT_CLUSTERCTL_GIT_URL,
  ensureClusterctlGit,
  fetchClusterctlGit,
  installClusterctlGit,
  listClusterctlRefs,
  saveClusterctlIgnoreHostKey,
  saveSetup,
  type ClusterctlGitStatus,
} from "@/lib/api";

function formatFetchedAt(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

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
  const [ignoreHostKey, setIgnoreHostKey] = useState(false);
  const [status, setStatus] = useState<ClusterctlGitStatus | null>(null);
  const [refs, setRefs] = useState<string[]>([]);
  const [refDates, setRefDates] = useState<Record<string, string>>({});
  const [selectedRef, setSelectedRef] = useState("");
  const [busy, setBusy] = useState<"probe" | "refs" | "install" | "ensure" | null>(
    "ensure",
  );

  function applyStatus(next: ClusterctlGitStatus) {
    setStatus(next);
    if (next.gitUrl) {
      setGitUrl(next.gitUrl);
    }
    if (next.dest || next.clusterctlRoot) {
      setPath(next.dest || next.clusterctlRoot || "");
    }
    if (typeof next.ignoreHostKey === "boolean") {
      setIgnoreHostKey(next.ignoreHostKey);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchClusterctlGit();
        if (cancelled) {
          return;
        }
        applyStatus(data);
        if (!data.configured && !data.error) {
          const installed = await ensureClusterctlGit({
            url: data.gitUrl,
            dest: data.dest,
          });
          if (!cancelled) {
            applyStatus(installed);
          }
        }
      } catch {
        if (!cancelled) {
          try {
            applyStatus(await fetchClusterctlGit());
          } catch {
            // hub/setup not ready yet
          }
        }
      } finally {
        if (!cancelled) {
          setBusy(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
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

  async function onCheckVersion() {
    setBusy("refs");
    try {
      const data = await listClusterctlRefs({ url: gitUrl, ignoreHostKey });
      const next = data.refs ?? [];
      setRefs(next);
      setRefDates(data.refDates ?? {});
      setSelectedRef((prev) => (prev && next.includes(prev) ? prev : next[0] || ""));
      if (!next.length) {
        toast.error("No main branch or tags on that Git URL");
      }
    } catch (err) {
      setRefs([]);
      setRefDates({});
      setSelectedRef("");
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onInstall() {
    if (!selectedRef) {
      toast.error("Check version and pick a ref first");
      return;
    }
    setBusy("install");
    try {
      const result = await installClusterctlGit({
        url: gitUrl,
        dest: path,
        ref: selectedRef,
        ignoreHostKey,
      });
      applyStatus(result);
      toast.success(result.version || `${selectedRef} ready`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onIgnoreHostKey(checked: boolean) {
    const previous = ignoreHostKey;
    setIgnoreHostKey(checked);
    try {
      await saveClusterctlIgnoreHostKey(checked);
    } catch (err) {
      setIgnoreHostKey(previous);
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  const installed = Boolean(status?.configured);
  const fetchedAt = formatFetchedAt(status?.fetchedAt);
  const versionLine = status?.ok ? (status.version || "").trim() : "";
  const usingRef = (status?.ref || "").trim();
  const selectedWhen = formatFetchedAt(selectedRef ? refDates[selectedRef] : null);
  const hint = !status
    ? busy === "ensure"
      ? "Installing latest clusterctl…"
      : null
    : status.error
      ? status.error
      : status.ok
        ? null
        : status.exists
          ? status.isRepo
            ? "Git checkout present"
            : "Destination exists"
          : busy === "ensure"
            ? "Installing latest clusterctl…"
            : "Destination is empty — Check version, then Install";

  return (
    <form onSubmit={onProbe} className="flex max-w-xl flex-col gap-4">
      <div className="space-y-2">
        <Label htmlFor="clusterctl-git-url">Git URL</Label>
        <Input
          id="clusterctl-git-url"
          value={gitUrl}
          onChange={(e) => {
            setGitUrl(e.target.value);
            setRefs([]);
            setRefDates({});
            setSelectedRef("");
          }}
          placeholder={DEFAULT_CLUSTERCTL_GIT_URL}
        />
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={ignoreHostKey}
            disabled={busy !== null}
            aria-label="Ignore SSH host key"
            className="mt-0.5"
            onCheckedChange={(value) => void onIgnoreHostKey(value === true)}
          />
          <span>
            <span className="block">Ignore SSH host key</span>
            <span className="block text-xs text-muted-foreground">
              Skip host key verification for git@ URLs. The hub accepts the Git
              server key without checking known_hosts.
            </span>
          </span>
        </label>
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
          <code className="font-mono">clusterctl/__main__.py</code> after
          install.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="clusterctl-ref">Version</Label>
        <Select
          value={selectedRef || null}
          onValueChange={(value) => setSelectedRef(value || "")}
          disabled={busy !== null || refs.length === 0}
        >
          <SelectTrigger id="clusterctl-ref" className="w-full">
            <span className="flex min-w-0 flex-1 items-center gap-3">
              <span className="truncate font-mono">
                {selectedRef || (refs.length ? "Select version" : "Check version first")}
              </span>
              {selectedWhen ? (
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {selectedWhen}
                </span>
              ) : null}
            </span>
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger>
            {refs.map((ref) => {
              const when = formatFetchedAt(refDates[ref]);
              return (
                <SelectItem key={ref} value={ref}>
                  <span className="flex w-full min-w-0 items-center gap-3 pr-4">
                    <span className="font-mono">{ref}</span>
                    {when ? (
                      <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground">
                        {when}
                      </span>
                    ) : null}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      {versionLine || usingRef ? (
        <div className="space-y-1">
          {versionLine ? (
            <p className="font-mono text-sm text-muted-foreground">{versionLine}</p>
          ) : null}
          {usingRef ? (
            <p className="text-sm text-muted-foreground">Using {usingRef}</p>
          ) : null}
        </div>
      ) : null}
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
      {fetchedAt ? (
        <p className="text-sm text-muted-foreground">Last fetched {fetchedAt}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy !== null}
          onClick={() => void onCheckVersion()}
        >
          {busy === "refs" ? "Checking…" : "Check version"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy !== null || !selectedRef}
          onClick={() => void onInstall()}
        >
          {busy === "install"
            ? installed
              ? "Updating…"
              : "Installing…"
            : installed
              ? "Update"
              : "Install"}
        </Button>
        <Button type="submit" disabled={busy !== null}>
          {busy === "probe" ? "Checking…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
