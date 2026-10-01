"use client";

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
  DEFAULT_LIBRARY_GIT_URL,
  fetchLibraryGit,
  installLibraryGit,
  listLibraryRefs,
  probeLibraryGit,
  saveLibraryIgnoreHostKey,
  type LibraryGitStatus,
} from "@/lib/proxmox";

function formatFetchedAt(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function LibrarySetupForm() {
  const [path, setPath] = useState("");
  const [gitUrl, setGitUrl] = useState(DEFAULT_LIBRARY_GIT_URL);
  const [ignoreHostKey, setIgnoreHostKey] = useState(false);
  const [status, setStatus] = useState<LibraryGitStatus | null>(null);
  const [refs, setRefs] = useState<string[]>([]);
  const [selectedRef, setSelectedRef] = useState("");
  const [busy, setBusy] = useState<"probe" | "refs" | "install" | "load" | null>(
    "load",
  );

  function applyStatus(next: LibraryGitStatus) {
    setStatus(next);
    if (next.gitUrl) setGitUrl(next.gitUrl);
    if (next.dest || next.libraryRoot) setPath(next.dest || next.libraryRoot || "");
    if (typeof next.ignoreHostKey === "boolean") setIgnoreHostKey(next.ignoreHostKey);
  }

  useEffect(() => {
    let cancelled = false;
    void fetchLibraryGit()
      .then((data) => {
        if (!cancelled) applyStatus(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) toast.error(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setBusy(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onProbe(event: React.FormEvent) {
    event.preventDefault();
    setBusy("probe");
    try {
      applyStatus(await probeLibraryGit({ url: gitUrl, dest: path }));
      toast.success("Library path saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onCheckVersion() {
    setBusy("refs");
    try {
      const data = await listLibraryRefs({ url: gitUrl, ignoreHostKey });
      const next = data.refs ?? [];
      setRefs(next);
      setSelectedRef((prev) => (prev && next.includes(prev) ? prev : next[0] || ""));
      if (!next.length) toast.error("No main branch or tags on that Git URL");
    } catch (err) {
      setRefs([]);
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
      const result = await installLibraryGit({
        url: gitUrl,
        dest: path,
        ref: selectedRef,
        ignoreHostKey,
      });
      applyStatus(result);
      toast.success(result.version ? `proxmox-library ${result.version}` : `${selectedRef} ready`);
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
      await saveLibraryIgnoreHostKey(checked);
    } catch (err) {
      setIgnoreHostKey(previous);
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  const installed = Boolean(status?.configured);
  const fetchedAt = formatFetchedAt(status?.fetchedAt);
  const usingRef = (status?.ref || "").trim();
  const hint = !status
    ? null
    : status.error
      ? status.error
      : status.ok
        ? null
        : "Destination is empty — Check version, then Install";

  return (
    <form onSubmit={onProbe} className="flex max-w-xl flex-col gap-4">
      <div className="space-y-2">
        <Label htmlFor="library-git-url">Git URL</Label>
        <Input
          id="library-git-url"
          value={gitUrl}
          onChange={(event) => {
            setGitUrl(event.target.value);
            setRefs([]);
            setSelectedRef("");
          }}
          placeholder={DEFAULT_LIBRARY_GIT_URL}
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
        <Label htmlFor="library-root">Checkout path</Label>
        <Input
          id="library-root"
          value={path}
          onChange={(event) => setPath(event.target.value)}
          placeholder="atlas-proxmox-library"
          required
        />
        <p className="text-xs text-muted-foreground">
          Default is <code className="font-mono">atlas-proxmox-library</code> next
          to atlas-ui. Must contain <code className="font-mono">./proxmox-library</code>{" "}
          and <code className="font-mono">proxmoxlib/__main__.py</code> after install.
          Saved as <code className="font-mono">libraryRoot</code>.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="library-ref">Version</Label>
        <Select
          value={selectedRef || null}
          onValueChange={(value) => setSelectedRef(value || "")}
          disabled={busy !== null || refs.length === 0}
        >
          <SelectTrigger id="library-ref" className="w-full">
            <span className="truncate font-mono">
              {selectedRef || (refs.length ? "Select version" : "Check version first")}
            </span>
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger>
            {refs.map((ref) => (
              <SelectItem key={ref} value={ref}>
                <span className="font-mono">{ref}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {status?.ok && status.version ? (
        <p className="font-mono text-sm text-muted-foreground">
          proxmox-library {status.version}
        </p>
      ) : null}
      {usingRef ? (
        <p className="text-sm text-muted-foreground">Using {usingRef}</p>
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
          {busy === "install" ? (installed ? "Updating…" : "Installing…") : installed ? "Update" : "Install"}
        </Button>
        <Button type="submit" disabled={busy !== null}>
          {busy === "probe" ? "Checking…" : "Update path"}
        </Button>
      </div>
    </form>
  );
}
