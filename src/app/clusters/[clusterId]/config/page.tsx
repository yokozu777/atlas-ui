"use client";

import { use } from "react";

import { CommandPanel } from "@/components/command-panel";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

export default function ConfigPage({
  params,
}: {
  params: Promise<{ clusterId: string }>;
}) {
  const clusterId = decodeURIComponent(use(params).clusterId);
  return <ClusterConfigView key={clusterId} clusterId={clusterId} />;
}

export function ClusterConfigView({ clusterId }: { clusterId: string }) {
  const [phase, setPhase] = useState("k8s-addons");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <PageHeader
        kicker="Cluster"
        title="Config"
        description="Read-only clusterctl config show / effective dumps."
      />
      <Panel className="max-w-md space-y-2 p-4">
        <Label htmlFor="phase">config show PHASE</Label>
        <Input id="phase" value={phase} onChange={(e) => setPhase(e.target.value)} />
      </Panel>
      <CommandPanel
        clusterId={clusterId}
        argv={["config", "show", phase, "--json"]}
        label="config show --json"
        json
      />
      <CommandPanel
        clusterId={clusterId}
        argv={["config", "effective", "--json"]}
        label="config effective --json"
        json
      />
    </div>
  );
}
