"use client";

import { use, useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { JsonBlock } from "@/components/json-block";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { stargateJson } from "@/lib/stargate";

export function StargateJsonPage({
  params,
  suffix,
  title,
  kicker,
}: {
  params: Promise<{ projectId: string }>;
  suffix: string;
  title: string;
  kicker: string;
}) {
  const projectId = decodeURIComponent(use(params).projectId);
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const path = suffix.startsWith("/")
      ? suffix
      : `/projects/${projectId}${suffix ? `/${suffix}` : ""}`;
    void stargateJson(path)
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, [projectId, suffix]);

  if (error) {
    return <EmptyState title={`${title} unavailable`} description={error} />;
  }

  return (
    <div>
      <PageHeader kicker={kicker} title={title} />
      <Panel className="p-4">
        <JsonBlock value={data} />
      </Panel>
    </div>
  );
}
