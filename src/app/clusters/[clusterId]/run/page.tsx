"use client";

import { use, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { RunSheet } from "@/components/run-sheet";
import { Button } from "@/components/ui/button";

export default function RunPage({
  params,
}: {
  params: Promise<{ clusterId: string }>;
}) {
  const clusterId = decodeURIComponent(use(params).clusterId);
  return <ClusterRunView key={clusterId} clusterId={clusterId} />;
}

export function ClusterRunView({ clusterId }: { clusterId: string }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <PageHeader
        kicker="Cluster"
        title="Run"
        description="Preview argv in the sheet on the right. Confirm there; output is on Logs."
        actions={
          <Button type="button" onClick={() => setOpen(true)}>
            Open run sheet
          </Button>
        }
      />
      <Panel className="px-4 py-3 font-mono text-sm text-chart-1">
        {clusterId}
      </Panel>
      <RunSheet
        clusterId={clusterId}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  );
}
