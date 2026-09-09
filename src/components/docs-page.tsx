"use client";

import { useCallback } from "react";

import { EmptyState } from "@/components/empty-state";
import { MarkdownDoc } from "@/components/markdown-doc";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { docsHref, menuDocId, resolveDocLink } from "@/lib/docs-href";
import type { DocFile } from "@/lib/docs-types";

export function DocsPage({
  current,
  menu,
}: {
  current: DocFile;
  menu: DocFile;
}) {
  const onMenu = current.id === menuDocId(current.id);
  const resolveHref = useCallback((fromId: string, href: string) => {
    const next = resolveDocLink(fromId, href);
    if (!next) {
      return null;
    }
    return { href: docsHref(next), id: next };
  }, []);

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <PageHeader
        kicker="System"
        title="Docs"
        description="Topics from index.md. Open a link to read the page."
      />
      {onMenu ? (
        <DocPanel
          file={current}
          missing="docs/index.md was not found."
          resolveHref={resolveHref}
        />
      ) : (
        <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(16rem,20rem)_1fr]">
          <DocPanel
            file={menu}
            missing="docs/index.md was not found."
            currentId={current.id}
            compact
            resolveHref={resolveHref}
          />
          <DocPanel
            file={current}
            missing="This document was not found."
            resolveHref={resolveHref}
          />
        </div>
      )}
    </div>
  );
}

function DocPanel({
  file,
  missing,
  currentId,
  compact,
  resolveHref,
}: {
  file: DocFile;
  missing: string;
  currentId?: string;
  compact?: boolean;
  resolveHref: (
    fromId: string,
    href: string,
  ) => { href: string; id: string } | null;
}) {
  if (!file.markdown) {
    return <EmptyState title="Docs unavailable" description={file.error || missing} />;
  }
  return (
    <Panel className={compact ? "p-4 md:p-5" : "p-6 md:p-8"}>
      <MarkdownDoc
        markdown={file.markdown}
        currentId={file.id}
        activeId={currentId ?? file.id}
        compact={compact}
        resolveHref={resolveHref}
      />
    </Panel>
  );
}
