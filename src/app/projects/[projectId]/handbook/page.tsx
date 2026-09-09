"use client";

import { Suspense, use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAtlasClusterSelection } from "@/components/atlas-cluster-selection";
import { EmptyState } from "@/components/empty-state";
import { MarkdownDoc } from "@/components/markdown-doc";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { projectApiQuery } from "@/components/hosts-groups/helpers";
import {
  isAllowedHandbookRel,
  resolveRelativeMd,
} from "@/lib/docs-href";
import { projectHref } from "@/lib/project-href";
import { stargateJson } from "@/lib/stargate";

type HandbookFile = { path: string; title: string };
type HandbookPack = { id: string; name: string; files: HandbookFile[] };

function handbookHref(projectId: string, pack: string, doc?: string | null): string {
  const params = new URLSearchParams();
  params.set("tab", pack);
  if (doc) {
    params.set("doc", doc);
  }
  return `${projectHref(projectId, "/handbook")}?${params.toString()}`;
}

function packMenuMarkdown(pack: HandbookPack): string {
  const lines = [
    `# ${pack.name}`,
    "",
    "README and docs for this role repository.",
    "",
  ];
  for (const file of pack.files) {
    lines.push(`- [${file.title}](${file.path})`);
  }
  return `${lines.join("\n")}\n`;
}

export default function HandbookPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  return (
    <Suspense fallback={<EmptyState title="Loading handbook" />}>
      <HandbookPageInner params={params} />
    </Suspense>
  );
}

function HandbookPageInner({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const projectId = decodeURIComponent(use(params).projectId);
  const { clusterId } = useAtlasClusterSelection();
  const q = projectApiQuery(projectId, clusterId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") ?? "";
  const docParam = searchParams.get("doc") ?? "";
  const [packs, setPacks] = useState<HandbookPack[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuMarkdown, setMenuMarkdown] = useState<string>("");
  const [article, setArticle] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPacks(null);
    setError(null);
    void stargateJson<{ packs?: HandbookPack[] }>(`/roles/handbook?${q}`)
      .then((data) => {
        if (!cancelled) {
          setPacks(data.packs ?? []);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPacks([]);
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [q]);

  const pack = useMemo(() => {
    if (!packs || packs.length === 0) {
      return null;
    }
    return packs.find((row) => row.id === tabParam) ?? packs[0];
  }, [packs, tabParam]);

  const hasIndex = Boolean(
    pack?.files.some((file) => file.path === "docs/index.md"),
  );
  const menuId = hasIndex ? "docs/index.md" : "__menu.md";
  const selectedDoc =
    pack && docParam && pack.files.some((file) => file.path === docParam)
      ? docParam
      : null;
  const onMenu = !selectedDoc || selectedDoc === menuId;

  useEffect(() => {
    if (!pack) {
      setMenuMarkdown("");
      return;
    }
    if (!hasIndex) {
      setMenuMarkdown(packMenuMarkdown(pack));
      return;
    }
    let cancelled = false;
    const fileQ = `${q}&pack=${encodeURIComponent(pack.id)}&doc=${encodeURIComponent("docs/index.md")}`;
    void stargateJson<{ markdown?: string }>(`/roles/handbook/file?${fileQ}`)
      .then((data) => {
        if (!cancelled) {
          setMenuMarkdown(data.markdown ?? packMenuMarkdown(pack));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMenuMarkdown(packMenuMarkdown(pack));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pack, hasIndex, q]);

  useEffect(() => {
    if (!pack || onMenu) {
      setArticle(null);
      setDocError(null);
      return;
    }
    if (!selectedDoc) {
      return;
    }
    let cancelled = false;
    const fileQ = `${q}&pack=${encodeURIComponent(pack.id)}&doc=${encodeURIComponent(selectedDoc)}`;
    void stargateJson<{ markdown?: string }>(`/roles/handbook/file?${fileQ}`)
      .then((data) => {
        if (!cancelled) {
          setArticle(data.markdown ?? "");
          setDocError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setArticle(null);
          setDocError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pack, q, selectedDoc, onMenu]);

  const resolveHref = useCallback(
    (fromId: string, href: string) => {
      if (!pack) {
        return null;
      }
      const from = fromId === "__menu.md" ? "README.md" : fromId;
      const next = resolveRelativeMd(from, href);
      if (!next || !isAllowedHandbookRel(next)) {
        return null;
      }
      if (!pack.files.some((file) => file.path === next)) {
        return null;
      }
      return { href: handbookHref(projectId, pack.id, next), id: next };
    },
    [pack, projectId],
  );

  function setTab(next: string) {
    router.replace(handbookHref(projectId, next), { scroll: false });
  }

  if (error) {
    return (
      <div className="flex min-h-0 flex-col gap-4">
        <PageHeader
          kicker="Automation"
          title="Handbook"
          description="README and docs from each role repository. One tab per repo."
        />
        <EmptyState title="Handbook unavailable" description={error} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <PageHeader
        kicker="Automation"
        title="Handbook"
        description="README and docs from each role repository. One tab per repo."
      />
      {packs === null ? (
        <EmptyState title="Loading handbook" />
      ) : packs.length === 0 ? (
        <EmptyState
          title="No role repositories"
          description="Select a cluster with playbook repos, or add README.md / docs to the roles source."
        />
      ) : (
        <Tabs value={pack?.id} onValueChange={setTab}>
          <TabsList variant="line" className="h-auto flex-wrap">
            {packs.map((row) => (
              <TabsTrigger key={row.id} value={row.id}>
                {row.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {packs.map((row) => (
            <TabsContent key={row.id} value={row.id} className="mt-6">
              {row.id !== pack?.id ? null : row.files.length === 0 ? (
                <EmptyState
                  title="No handbook files"
                  description="This repository has no README.md or docs/*.md."
                />
              ) : onMenu ? (
                <Panel className="p-6 md:p-8">
                  <MarkdownDoc
                    markdown={menuMarkdown}
                    currentId={menuId}
                    activeId={selectedDoc ?? menuId}
                    resolveHref={resolveHref}
                  />
                </Panel>
              ) : (
                <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(16rem,20rem)_1fr]">
                  <Panel className="p-4 md:p-5">
                    <MarkdownDoc
                      markdown={menuMarkdown}
                      currentId={menuId}
                      activeId={selectedDoc ?? menuId}
                      compact
                      resolveHref={resolveHref}
                    />
                  </Panel>
                  <Panel className="p-6 md:p-8">
                    {docError ? (
                      <EmptyState title="Document unavailable" description={docError} />
                    ) : article == null ? (
                      <EmptyState title="Loading handbook" />
                    ) : (
                      <MarkdownDoc
                        markdown={article}
                        currentId={selectedDoc ?? "README.md"}
                        activeId={selectedDoc ?? menuId}
                        resolveHref={resolveHref}
                      />
                    )}
                  </Panel>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
