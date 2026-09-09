"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select";
import {
  asSyncDirection,
  gitOf,
  layoutOrDefault,
  repoRefOf,
  repoSubdirOf,
  repoUrlOf,
  type RepoLayout,
  type RepoSource,
  type SecretOption,
  type SyncDirection,
} from "@/lib/project-sources";
import { stargateJson } from "@/lib/stargate";
import { cn } from "@/lib/utils";

const NONE = "none";

const BINDING_OPTIONS: { value: SyncDirection; label: string }[] = [
  { value: "none", label: "None (no sync binding)" },
  { value: "push", label: "Push only (Project Storage → Git)" },
  { value: "pull", label: "Pull only (Git → Project Storage)" },
  { value: "both", label: "Bidirectional (both directions)" },
];

export function EditSourceDialog({
  projectId,
  open,
  onOpenChange,
  repo,
  layout,
  secrets,
  onSaved,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repo: RepoSource | undefined;
  layout: RepoLayout | null | undefined;
  secrets: SecretOption[];
  onSaved: () => Promise<void> | void;
}) {
  const [url, setUrl] = useState("");
  const [ref, setRef] = useState("main");
  const [subdir, setSubdir] = useState("");
  const [auth, setAuth] = useState(NONE);
  const [binding, setBinding] = useState<SyncDirection>("pull");
  const [playbooks, setPlaybooks] = useState("playbooks");
  const [roles, setRoles] = useState("roles");
  const [inventories, setInventories] = useState("inventories");
  const [pathsOpen, setPathsOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setUrl(repoUrlOf(repo));
    setRef(repoRefOf(repo));
    setSubdir(repoSubdirOf(repo));
    setAuth(gitOf(repo).authSecretId || NONE);
    setBinding(asSyncDirection(repo?.syncDirection || "pull"));
    const next = layoutOrDefault(layout);
    setPlaybooks(next.playbooks);
    setRoles(next.roles);
    setInventories(next.inventories);
    setPathsOpen(false);
  }, [open, repo, layout]);

  const knownIds = new Set(secrets.map((row) => row.id));
  const orphanAuth = auth !== NONE && !knownIds.has(auth);

  function gitConfig() {
    return {
      mode: "git" as const,
      git: {
        ...(repo?.git ?? {}),
        repo: url.trim(),
        ref: ref.trim() || "main",
        subdir: subdir.trim(),
        authSecretId: auth === NONE ? null : auth,
      },
      syncDirection: binding,
    };
  }

  async function testConn() {
    setBusy(true);
    try {
      const result = await stargateJson<{
        success?: boolean;
        error?: string;
        message?: string;
      }>(`/projects/${projectId}/sources/test`, {
        method: "POST",
        body: JSON.stringify({
          sourceKey: "repo",
          config: gitConfig(),
        }),
      });
      if (result.success === false) {
        throw new Error(result.error || "Test failed");
      }
      toast.success(result.message || "Connection ok");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!url.trim()) {
      toast.error("Repository URL is required");
      return;
    }
    setBusy(true);
    try {
      await stargateJson(`/projects/${projectId}/sources`, {
        method: "PUT",
        body: JSON.stringify({
          sources: {
            repo: {
              ...(repo ?? {}),
              ...gitConfig(),
            },
          },
          repoLayout: {
            playbooks: playbooks.trim() || "playbooks",
            roles: roles.trim() || "roles",
            inventories: inventories.trim() || "inventories",
          },
        }),
      });
      toast.success("Source saved");
      onOpenChange(false);
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const globalSecrets = secrets.filter((row) => row.group === "global");
  const projectSecrets = secrets.filter((row) => row.group === "project");
  const authLabel =
    auth === NONE
      ? "none (public)"
      : secrets.find((row) => row.id === auth)?.name ||
        (orphanAuth ? `${auth} (saved)` : auth);
  const bindingLabel =
    BINDING_OPTIONS.find((row) => row.value === binding)?.label ?? binding;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-slot="edit-source-dialog"
        className="max-h-[min(90vh,44rem)] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>Edit Source: Repository Workspace</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="source-url">Repository URL *</Label>
            <Input
              id="source-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="git@host:org/repo.git"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="source-ref">Branch/Tag/Commit *</Label>
            <Input
              id="source-ref"
              value={ref}
              onChange={(event) => setRef(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="source-subdir">Subdirectory (optional)</Label>
            <Input
              id="source-subdir"
              value={subdir}
              onChange={(event) => setSubdir(event.target.value)}
              placeholder="inventories"
            />
            <p className="text-xs text-muted-foreground">
              If empty: syncs entire repo/workspace (roles, playbooks,
              inventories, ansible.cfg, etc.). If specified: syncs only that
              subdirectory.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label>Authentication Secret (optional)</Label>
              <Button
                variant="link"
                size="xs"
                className="h-auto px-0"
                render={<Link href="/secrets" />}
              >
                <Plus />
                Add SSH key
              </Button>
            </div>
            <Select
              value={auth}
              onValueChange={(value) => setAuth(value ?? NONE)}
            >
              <SelectTrigger className="w-full">
                <span className="min-w-0 flex-1 truncate text-left">{authLabel}</span>
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger>
                <SelectItem value={NONE}>none (public)</SelectItem>
                {orphanAuth ? (
                  <SelectItem value={auth}>{auth} (saved)</SelectItem>
                ) : null}
                {globalSecrets.length > 0 ? (
                  <SelectGroup>
                    <SelectLabel>Global</SelectLabel>
                    {globalSecrets.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name}
                        {row.type ? ` (${row.type})` : ""}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null}
                {projectSecrets.length > 0 ? (
                  <SelectGroup>
                    <SelectLabel>Project</SelectLabel>
                    {projectSecrets.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name}
                        {row.type ? ` (${row.type})` : ""}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              SSH key or token for private repositories
            </p>
          </div>
          <div className="space-y-2 border-t border-foreground/10 pt-4">
            <Label>Source Binding (Sync Direction)</Label>
            <p className="text-xs text-muted-foreground">
              Configure bidirectional synchronization between Project Storage
              and Git
            </p>
            <Select
              value={binding}
              onValueChange={(value) =>
                setBinding(asSyncDirection(value ?? "none"))
              }
            >
              <SelectTrigger className="w-full">
                <span className="min-w-0 flex-1 truncate text-left">
                  {bindingLabel}
                </span>
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger>
                {BINDING_OPTIONS.map((row) => (
                  <SelectItem key={row.value} value={row.value}>
                    {row.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">Push:</span> Copy
              from Project Storage to Git
              <br />
              <span className="font-medium text-foreground/80">Pull:</span> Copy
              from Git to Project Storage
              <br />
              <span className="font-medium text-foreground/80">Bidirectional:</span>{" "}
              Sync both directions (push then pull)
            </p>
          </div>
          <div className="space-y-2 border-t border-foreground/10 pt-4">
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full justify-between rounded-none px-0 py-1 font-medium"
              onClick={() => setPathsOpen((value) => !value)}
            >
              <span>
                Ansible Entity Paths{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  (Advanced)
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "size-4 text-muted-foreground transition-transform",
                  pathsOpen && "rotate-180",
                )}
              />
            </Button>
            <p className="text-xs text-muted-foreground">
              Custom paths relative to repository root (or subdir). Used during
              playbook execution; they do not affect Git sync.
            </p>
            {pathsOpen ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="layout-playbooks">Playbooks Path</Label>
                  <Input
                    id="layout-playbooks"
                    value={playbooks}
                    onChange={(event) => setPlaybooks(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="layout-roles">Roles Path</Label>
                  <Input
                    id="layout-roles"
                    value={roles}
                    onChange={(event) => setRoles(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="layout-inventories">Inventories Path</Label>
                  <Input
                    id="layout-inventories"
                    value={inventories}
                    onChange={(event) => setInventories(event.target.value)}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void testConn()}
          >
            Test Connection
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void save()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
