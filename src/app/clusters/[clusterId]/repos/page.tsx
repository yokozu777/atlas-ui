"use client";

import { use } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { CommandPanel } from "@/components/command-panel";
import { ConfirmAction } from "@/components/confirm-action";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { queueReposSync, waitHubExecution } from "@/lib/api";
import { currentNavProjectId } from "@/lib/project-href";

export default function ReposPage({
  params,
}: {
  params: Promise<{ clusterId: string }>;
}) {
  const clusterId = decodeURIComponent(use(params).clusterId);
  return <ClusterReposView key={clusterId} clusterId={clusterId} />;
}

export function ClusterReposView({ clusterId }: { clusterId: string }) {
  const [repo, setRepo] = useState("");
  const [phase, setPhase] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function runSync() {
    setBusy(true);
    try {
      const result = await queueReposSync({
        clusterId,
        projectId: currentNavProjectId() ?? undefined,
        repo: repo.trim() || undefined,
        phase: phase.trim() || undefined,
      });
      if (result.executionId) {
        toast.success("Sync queued on worker");
        const projectId = currentNavProjectId();
        if (projectId) {
          const done = await waitHubExecution(projectId, result.executionId);
          if (done === "SUCCESS") {
            toast.success("Repo sync finished");
          } else if (done === "TIMEOUT") {
            toast.error("Repo sync is still running; refresh status later");
          } else {
            toast.error(`Repo sync ${done.toLowerCase()}`);
          }
        }
      } else if (result.exitCode) {
        toast.error("Repo sync failed");
      } else {
        toast.success("Repo sync finished");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <PageHeader
        kicker="Cluster"
        title="Repos"
        description="Playbook repo status, sync, and show."
      />
      <CommandPanel
        clusterId={clusterId}
        argv={["repos", "status", "--json"]}
        label="repos status --json"
        json
      />
      <Panel className="grid max-w-lg gap-2 p-4">
        <Label htmlFor="repo">sync --repo (optional)</Label>
        <Input id="repo" value={repo} onChange={(e) => setRepo(e.target.value)} />
        <Label htmlFor="phase">sync --phase (optional)</Label>
        <Input id="phase" value={phase} onChange={(e) => setPhase(e.target.value)} />
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => setConfirmOpen(true)}
        >
          Sync
        </Button>
      </Panel>
      <CommandPanel
        clusterId={clusterId}
        argv={["repos", "show"]}
        label="repos show"
      />
      <ConfirmAction
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Sync playbook repos?"
        description={`./cluster repos sync${repo.trim() ? ` --repo ${repo.trim()}` : ""}${phase.trim() ? ` --phase ${phase.trim()}` : ""} — ${clusterId}`}
        confirmLabel="Sync"
        onConfirm={() => void runSync()}
      />
    </div>
  );
}
