"use client";

import { useState, type ComponentType } from "react";
import { toast } from "sonner";
import {
  Database,
  GitBranch,
  Globe,
  Layers,
  Radio,
  Server,
  Workflow,
} from "lucide-react";

import { ConfirmAction } from "@/components/confirm-action";
import { useJobSession } from "@/components/job-session";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { INIT_TEMPLATES } from "@/lib/templates";
import { cn } from "@/lib/utils";

const TEMPLATE_FAMILY: Record<
  (typeof INIT_TEMPLATES)[number],
  "k8s" | "infra" | "data" | "ci"
> = {
  k8s_full: "k8s",
  infra_edge: "infra",
  pve_templates: "infra",
  redis: "data",
  postgresql: "data",
  kafka: "data",
  jenkins_agent: "ci",
  gitlab_runner: "ci",
};

const FAMILY_ICON_CLASS: Record<
  (typeof TEMPLATE_FAMILY)[keyof typeof TEMPLATE_FAMILY],
  string
> = {
  k8s: "bg-chart-1/20 text-chart-1 ring-chart-1/30",
  infra: "bg-chart-2/20 text-chart-2 ring-chart-2/30",
  data: "bg-chart-3/20 text-chart-3 ring-chart-3/30",
  ci: "bg-chart-5/20 text-chart-5 ring-chart-5/30",
};

const FAMILY_RING: Record<
  (typeof TEMPLATE_FAMILY)[keyof typeof TEMPLATE_FAMILY],
  string
> = {
  k8s: "ring-chart-1",
  infra: "ring-chart-2",
  data: "ring-chart-3",
  ci: "ring-chart-5",
};

const FAMILY_ICON: Record<
  (typeof TEMPLATE_FAMILY)[keyof typeof TEMPLATE_FAMILY],
  ComponentType<{ className?: string }>
> = {
  k8s: Layers,
  infra: Globe,
  data: Database,
  ci: GitBranch,
};

const TEMPLATE_ICON: Partial<
  Record<(typeof INIT_TEMPLATES)[number], ComponentType<{ className?: string }>>
> = {
  pve_templates: Server,
  kafka: Radio,
  jenkins_agent: Workflow,
};

const TEMPLATE_BLURBS: Record<(typeof INIT_TEMPLATES)[number], string> = {
  k8s_full: "Kubernetes core, addons, and node foundation",
  infra_edge: "Edge / ingress infrastructure",
  pve_templates: "Proxmox VM templates",
  redis: "Redis cluster",
  postgresql: "PostgreSQL cluster",
  kafka: "Kafka cluster",
  jenkins_agent: "Jenkins agent nodes",
  gitlab_runner: "GitLab runner nodes",
};

export default function InitPage() {
  const { startJob } = useJobSession();
  const [clusterId, setClusterId] = useState("");
  const [template, setTemplate] = useState<string>("k8s_full");
  const [fromCluster, setFromCluster] = useState("");
  const [dnsSuffix, setDnsSuffix] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [force, setForce] = useState(false);
  const [noValidate, setNoValidate] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fromOverride = fromCluster.trim().length > 0;

  function buildArgv() {
    const argv = ["init", clusterId];
    if (fromOverride) {
      argv.push("--from", fromCluster.trim());
    } else {
      argv.push("--template", template);
    }
    if (dnsSuffix.trim()) argv.push("--dns-suffix", dnsSuffix.trim());
    if (displayName.trim()) argv.push("--display-name", displayName.trim());
    if (force) argv.push("--force");
    if (noValidate) argv.push("--no-validate");
    return argv;
  }

  async function runInit() {
    try {
      await startJob({ argv: buildArgv(), wait: false });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (force) {
      setConfirmOpen(true);
      return;
    }
    void runInit();
  }

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <PageHeader
        kicker="Home"
        title="Init cluster"
        description="Scaffold a new inventory leaf from a template or an existing cluster."
      />
      <form onSubmit={onSubmit} className="flex flex-col gap-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {INIT_TEMPLATES.map((name) => {
            const family = TEMPLATE_FAMILY[name];
            const selected = !fromOverride && template === name;
            const Icon = TEMPLATE_ICON[name] ?? FAMILY_ICON[family];
            return (
              <Card
                key={name}
                className={cn(
                  "cursor-pointer transition-colors",
                  selected && "ring-2",
                  selected && FAMILY_RING[family],
                  fromOverride && "opacity-50",
                )}
                onClick={() => {
                  if (!fromOverride) setTemplate(name);
                }}
              >
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg ring-1",
                        FAMILY_ICON_CLASS[family],
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 space-y-1">
                      <CardTitle className="text-base font-medium">
                        {name}
                      </CardTitle>
                      <CardDescription>{TEMPLATE_BLURBS[name]}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
        <Panel className="flex flex-col gap-5 p-6">
          <div className="space-y-2">
            <Label htmlFor="id">Cluster id (env/name)</Label>
            <Input
              id="id"
              required
              className="font-mono"
              value={clusterId}
              onChange={(e) => setClusterId(e.target.value)}
              placeholder="demo/k8s"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="from">Or copy --from (overrides template)</Label>
            <Input
              id="from"
              className="font-mono"
              value={fromCluster}
              onChange={(e) => setFromCluster(e.target.value)}
              placeholder="leave empty to use --template"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dns">--dns-suffix</Label>
            <Input
              id="dns"
              className="font-mono"
              value={dnsSuffix}
              onChange={(e) => setDnsSuffix(e.target.value)}
              placeholder="lab.example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dn">--display-name</Label>
            <Input
              id="dn"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <Label className="font-normal">
            <Checkbox
              checked={force}
              onCheckedChange={(value) => setForce(value === true)}
            />
            --force
          </Label>
          <Label className="font-normal">
            <Checkbox
              checked={noValidate}
              onCheckedChange={(value) => setNoValidate(value === true)}
            />
            --no-validate
          </Label>
          <Button type="submit">Init</Button>
        </Panel>
      </form>
      <ConfirmAction
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Replace cluster inventory?"
        description={`Replace existing clusters/${clusterId}/ ?`}
        confirmLabel="Replace"
        destructive
        onConfirm={runInit}
      />
    </div>
  );
}
