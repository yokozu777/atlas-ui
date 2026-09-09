"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { useAtlasClusterSelection } from "@/components/atlas-cluster-selection";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { StackList, StackListRow } from "@/components/stack-list";
import { YamlEditor } from "@/components/yaml-editor";
import { Button } from "@/components/ui/button";
import { projectApiQuery } from "@/components/hosts-groups/helpers";
import { stargateJson } from "@/lib/stargate";

type RoleNode = {
  type?: string;
  name?: string;
  id?: string;
  path?: string;
  children?: RoleNode[];
};

type RoleFile = { path: string; name: string };

function collectRoles(nodes: RoleNode[] | undefined, acc: RoleNode[] = []) {
  for (const node of nodes ?? []) {
    if (node.type === "role") {
      acc.push(node);
    }
    collectRoles(node.children, acc);
  }
  return acc;
}

export default function RolesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  return (
    <Suspense fallback={<EmptyState title="Loading roles" />}>
      <RolesPageInner params={params} />
    </Suspense>
  );
}

function RolesPageInner({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const projectId = decodeURIComponent(use(params).projectId);
  const { clusterId } = useAtlasClusterSelection();
  const q = projectApiQuery(projectId, clusterId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const roleParam = searchParams.get("role");
  const [roles, setRoles] = useState<RoleNode[]>([]);
  const [files, setFiles] = useState<RoleFile[]>([]);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void stargateJson<{ tree?: RoleNode[] }>(`/roles/storage?${q}`)
      .then((data) => setRoles(collectRoles(data.tree)))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, [q]);

  useEffect(() => {
    if (!roleParam || roles.length === 0) {
      return;
    }
    const match = roles.find((role) => {
      const path = role.path || role.id || role.name || "";
      return (
        path === roleParam ||
        role.id === roleParam ||
        role.name === roleParam ||
        role.path === roleParam
      );
    });
    const path = match
      ? match.path || match.id || match.name || ""
      : roleParam;
    if (path && path !== selectedRole) {
      void openRole(path).catch((err: unknown) =>
        toast.error(err instanceof Error ? err.message : String(err)),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleParam, roles]);

  async function openRole(path: string) {
    setSelectedRole(path);
    setSelectedFile(null);
    setContent("");
    const data = await stargateJson<{ files?: RoleFile[] }>(
      `/roles/files/${encodeURIComponent(path)}?${q}`,
    );
    setFiles(data.files ?? []);
  }

  function selectRole(role: RoleNode) {
    const id = role.id || role.path || role.name || "";
    router.replace(`?role=${encodeURIComponent(id)}`, { scroll: false });
  }

  async function openFile(filePath: string) {
    if (!selectedRole) return;
    const parts = selectedRole.split("/");
    const pack = parts[0];
    const role = parts.slice(1).join("/") || pack;
    setSelectedFile(filePath);
    const data = await stargateJson<{ content?: string }>(
      `/roles/file/${encodeURIComponent(pack)}/${encodeURIComponent(role)}/${filePath}?${q}`,
    );
    setContent(data.content ?? "");
  }

  async function saveFile() {
    if (!selectedRole || !selectedFile) return;
    setBusy(true);
    try {
      const parts = selectedRole.split("/");
      const pack = parts[0];
      const role = parts.slice(1).join("/") || pack;
      await stargateJson(
        `/roles/file/${encodeURIComponent(pack)}/${encodeURIComponent(role)}/${selectedFile}?${q}`,
        { method: "PUT", body: JSON.stringify({ content }) },
      );
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return <EmptyState title="Roles unavailable" description={error} />;
  }

  return (
    <div>
      <PageHeader
        kicker="Infrastructure"
        title="Role configurator"
        description="Browse cluster or project roles, edit a file, save back to the repo."
        actions={
          selectedFile ? (
            <Button onClick={() => void saveFile()} disabled={busy}>
              Save file
            </Button>
          ) : null
        }
      />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Panel className="p-3">
          <p className="mb-2 text-xs text-muted-foreground">Roles</p>
          {roles.length === 0 ? (
            <EmptyState title="No roles" />
          ) : (
            <StackList>
              {roles.map((role) => {
                const path = role.path || role.id || role.name || "";
                return (
                  <StackListRow
                    key={path}
                    className={
                      path === selectedRole ? "bg-white/5" : undefined
                    }
                    onClick={() => selectRole(role)}
                    title={role.name || path}
                  />
                );
              })}
            </StackList>
          )}
        </Panel>
        <Panel className="p-3">
          <p className="mb-2 text-xs text-muted-foreground">Files</p>
          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground">Select a role</p>
          ) : (
            <StackList>
              {files.map((file) => (
                <StackListRow
                  key={file.path}
                  className={
                    file.path === selectedFile ? "bg-white/5" : undefined
                  }
                  onClick={() => void openFile(file.path)}
                  title={
                    <span className="font-mono text-xs font-normal">
                      {file.path}
                    </span>
                  }
                />
              ))}
            </StackList>
          )}
        </Panel>
        <Panel className="p-3 text-sm text-muted-foreground">
          {selectedFile ?? "Open a file to edit defaults/main.yml or tasks."}
        </Panel>
      </div>
      {selectedFile ? <YamlEditor value={content} onChange={setContent} /> : null}
    </div>
  );
}
