"use client";

import { useEffect, useMemo, useState } from "react";
import { Info, KeyRound, Pencil, Plus, Search, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SecretDetailsDialog } from "@/components/project-secrets/secret-details-dialog";
import { SecretFormDialog } from "@/components/project-secrets/secret-form-dialog";
import {
  formatSecretDate,
  secretTypeLabel,
  type SecretRow,
} from "@/components/project-secrets/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchProject, stargateJson } from "@/lib/stargate";
import type { StargateProject } from "@/lib/project-types";

export function ProjectSecretsPage({ projectId }: { projectId: string }) {
  const q = `project_id=${encodeURIComponent(projectId)}`;
  const [project, setProject] = useState<StargateProject | null>(null);
  const [secrets, setSecrets] = useState<SecretRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editSecret, setEditSecret] = useState<SecretRow | null>(null);
  const [detailsName, setDetailsName] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState<string | null>(null);

  async function load() {
    const data = await stargateJson<{ secrets?: SecretRow[] }>(`/secrets?${q}`);
    setSecrets(data.secrets ?? []);
  }

  useEffect(() => {
    void fetchProject(projectId)
      .then(setProject)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, [projectId]);

  useEffect(() => {
    void load().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const filtered = useMemo(() => {
    const qtext = search.trim().toLowerCase();
    if (!qtext) return secrets;
    return secrets.filter((row) => {
      const hay = [
        row.name,
        row.type,
        secretTypeLabel(row.type),
        row.username,
        row.description,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(qtext);
    });
  }, [secrets, search]);

  const allChecked =
    filtered.length > 0 &&
    filtered.every((row) => row.name && selected.includes(row.name));

  function toggleAll(checked: boolean) {
    const names = filtered.map((row) => row.name).filter((name): name is string => Boolean(name));
    if (checked) {
      setSelected([...new Set([...selected, ...names])]);
      return;
    }
    const drop = new Set(names);
    setSelected(selected.filter((name) => !drop.has(name)));
  }

  async function remove(name: string) {
    try {
      await stargateJson(`/secrets/${encodeURIComponent(name)}?${q}`, {
        method: "DELETE",
      });
      toast.success("Deleted");
      setSelected((current) => current.filter((item) => item !== name));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  if (error) {
    return <EmptyState title="Secrets unavailable" description={error} />;
  }

  return (
    <div>
      <PageHeader
        kicker="Infrastructure"
        title="Secrets"
        description={
          <div className="space-y-3">
            <p>Project-scoped credentials stored in secrets-storage.</p>
            {project ? (
              <Badge variant="success">Project: {project.name}</Badge>
            ) : null}
          </div>
        }
      />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="relative min-w-56 flex-1 max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            placeholder="Search by name, type, or username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus />
          Add Secret
        </Button>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title="No secrets found"
          description={
            search.trim()
              ? "No secrets match this search"
              : "Get started by creating your first secret"
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={(value) => toggleAll(value === true)}
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => {
              const name = row.name || "";
              const ssh = row.type === "ssh_key";
              return (
                <TableRow key={name}>
                  <TableCell>
                    <Checkbox
                      checked={selected.includes(name)}
                      onCheckedChange={(value) =>
                        setSelected(
                          value === true
                            ? [...selected, name]
                            : selected.filter((item) => item !== name),
                        )
                      }
                    />
                  </TableCell>
                  <TableCell className="font-medium">{name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.description || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={ssh ? "info" : "success"}>
                      {ssh ? <KeyRound /> : <UserRound />}
                      {secretTypeLabel(row.type)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.username || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatSecretDate(row.createdAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatSecretDate(row.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setDetailsName(name)}
                      >
                        <Info />
                        Details
                      </Button>
                      {row.type === "ssh_key" || row.type === "login_password" ? (
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => setEditSecret(row)}
                        >
                          <Pencil />
                          Edit
                        </Button>
                      ) : null}
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setDeleteName(name)}
                      >
                        <Trash2 />
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <SecretFormDialog
        projectId={projectId}
        open={addOpen}
        onOpenChange={setAddOpen}
        mode="create"
        onSaved={load}
      />
      <SecretFormDialog
        projectId={projectId}
        open={Boolean(editSecret)}
        onOpenChange={(open) => {
          if (!open) setEditSecret(null);
        }}
        mode="edit"
        secret={editSecret}
        onSaved={load}
      />
      <SecretDetailsDialog
        projectId={projectId}
        open={Boolean(detailsName)}
        onOpenChange={(open) => {
          if (!open) setDetailsName(null);
        }}
        name={detailsName}
      />
      <ConfirmAction
        open={Boolean(deleteName)}
        onOpenChange={(open) => {
          if (!open) setDeleteName(null);
        }}
        title="Delete this secret?"
        description={deleteName || ""}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteName) void remove(deleteName);
        }}
      />
    </div>
  );
}
