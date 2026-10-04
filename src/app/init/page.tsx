"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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

import {
  ClusterctlSshKeyPicker,
  type ClusterctlSshStatus,
} from "@/components/clusterctl-ssh-key-picker";
import {
  GIT_PULL_NONE,
  GitPullSecretSelect,
} from "@/components/git-pull-secret-select";
import { ConfirmAction } from "@/components/confirm-action";
import { SuggestInput } from "@/components/suggest-input";
import { JobProgress, type JobStep, type JobStepState } from "@/components/job-progress";
import { useJobSession } from "@/components/job-session";
import { PageHeader } from "@/components/page-header";
import { TemplateProfilePanel } from "@/components/template-profile-panel";
import { notifyAtlasClustersChanged } from "@/components/atlas-cluster-selection";
import { useEnsureClusterctlSshKey } from "@/hooks/use-ensure-clusterctl-ssh";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchAtlasProjectClusters,
  fetchBootstrapStatus,
  fetchExecutionLogExcerpt,
  formatLogExcerpt,
  isHubRemote,
  queueAtlasInit,
  queueDockerPull,
  queueReposSync,
  waitHubExecution,
  type BootstrapStatus,
} from "@/lib/api";
import { writeAtlasOperatorPubkey } from "@/lib/clusterctl-ssh";
import { loadGitPullSecrets } from "@/lib/git-pull";
import { executionLogHref, projectHref, projectIdFromPath } from "@/lib/project-href";
import type { SecretOption } from "@/lib/project-sources";
import { fetchProject, stargateJson } from "@/lib/stargate";
import { useCan } from "@/lib/authz";
import { environmentNames } from "@/lib/cluster-groups";
import { INIT_TEMPLATES } from "@/lib/templates";
import { templateOpensHostsAfterInit } from "@/lib/template-profiles";
import { notify, notifyExecution } from "@/lib/notification-inbox";
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

const APPLY_WAIT_MS = 600_000;

type TemplateName = (typeof INIT_TEMPLATES)[number];

const CLUSTER_TEMPLATES = INIT_TEMPLATES.filter(
  (name) => name !== "pve_templates" && name !== "infra_edge",
);

function TemplateChoiceCard({
  name,
  selected,
  dimmed,
  onSelect,
}: {
  name: TemplateName;
  selected: boolean;
  dimmed: boolean;
  onSelect: (name: TemplateName) => void;
}) {
  const family = TEMPLATE_FAMILY[name];
  const Icon = TEMPLATE_ICON[name] ?? FAMILY_ICON[family];
  return (
    <Card
      className={cn(
        "cursor-pointer transition-colors",
        selected && "ring-2",
        selected && FAMILY_RING[family],
        dimmed && "opacity-50",
      )}
      onClick={() => onSelect(name)}
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
            <CardTitle className="text-base font-medium">{name}</CardTitle>
            <CardDescription>{TEMPLATE_BLURBS[name]}</CardDescription>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}

function TemplateSection({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">{title}</h2>
        {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function sanitizeClusterSegment(value: string) {
  return value.replaceAll("/", "").trim();
}

function composeClusterId(env: string, name: string) {
  const envPart = sanitizeClusterSegment(env);
  const namePart = sanitizeClusterSegment(name);
  if (!envPart || !namePart) {
    return "";
  }
  return `${envPart}/${namePart}`;
}

type ApplyPhase = "idle" | "sync" | "pubkey" | "docker";
type ApplyFail = "sync" | "pubkey" | "docker" | "ssh" | null;

const REPO_KINDS = new Set(["workspace", "lock", "git_repo"]);

function dockerNeedsPull(status: BootstrapStatus | null | undefined): boolean {
  return Boolean(status?.docker_image) && status?.docker_image_present !== true;
}

function bootstrapNeedsDialog(status: BootstrapStatus): boolean {
  return (status.missing?.length ?? 0) > 0 || dockerNeedsPull(status);
}

function patchSteps(
  steps: JobStep[],
  id: string,
  state: JobStepState,
  extra?: Partial<JobStep>,
): JobStep[] {
  return steps.map((step) =>
    step.id === id ? { ...step, ...extra, state } : step,
  );
}

function syncItemState(phase: ApplyPhase, fail: ApplyFail): JobStepState {
  if (fail === "sync") return "fail";
  if (phase === "sync") return "running";
  if (phase === "idle" && fail == null) return "pending";
  return "ok";
}

function pubItemState(phase: ApplyPhase, fail: ApplyFail): JobStepState {
  if (fail === "pubkey") return "fail";
  if (fail === "sync" || fail === "ssh") return "pending";
  if (phase === "idle" || phase === "sync") return "pending";
  if (phase === "pubkey") return "running";
  return "ok";
}

function sshItemState(fail: ApplyFail): JobStepState {
  if (fail === "ssh") return "fail";
  return "pending";
}

function dockerItemState(phase: ApplyPhase, fail: ApplyFail): JobStepState {
  if (fail === "docker") return "fail";
  if (fail === "sync" || fail === "pubkey" || fail === "ssh") return "pending";
  if (phase === "idle" || phase === "sync" || phase === "pubkey") return "pending";
  if (phase === "docker") return "running";
  return "ok";
}

function missingItemState(
  kind: string,
  phase: ApplyPhase,
  fail: ApplyFail,
): JobStepState {
  if (kind === "ssh_key") return sshItemState(fail);
  if (kind === "operator_pub") return pubItemState(phase, fail);
  return syncItemState(phase, fail);
}

function applyProgressSteps(
  bootstrap: BootstrapStatus,
  phase: ApplyPhase,
  fail: ApplyFail,
): JobStep[] {
  const steps: JobStep[] = (bootstrap.missing ?? []).map((item, index) => ({
    id: `${item.kind}-${item.name ?? index}`,
    label: item.label || item.name || item.kind,
    detail: item.path ?? undefined,
    state: missingItemState(item.kind, phase, fail),
  }));
  if (dockerNeedsPull(bootstrap)) {
    steps.push({
      id: "docker",
      label: "Docker executor image is not pulled",
      detail: bootstrap.docker_image ?? undefined,
      state: dockerItemState(phase, fail),
    });
  }
  return steps;
}

function ExecutionErrorPanel({
  title,
  excerpt,
  href,
}: {
  title: string;
  excerpt?: string | null;
  href?: string | null;
}) {
  return (
    <div className="space-y-2 rounded-md bg-destructive/10 px-3 py-3 text-sm text-destructive">
      <p className="font-medium">{title}</p>
      {excerpt ? (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-destructive/90">
          {excerpt}
        </pre>
      ) : null}
      {href ? (
        <Link href={href} className="inline-block underline underline-offset-4">
          Open execution log
        </Link>
      ) : null}
    </div>
  );
}

export default function InitPage() {
  const { startJob } = useJobSession();
  const pathname = usePathname();
  const router = useRouter();
  const canExecute = useCan()("atlas.execute");
  const {
    promptAdd: promptAddSshKey,
    refresh: refreshSshKey,
    formOpen: sshFormOpen,
    dialog: sshDialog,
  } = useEnsureClusterctlSshKey();
  const [clusterEnv, setClusterEnv] = useState("");
  const [envOptions, setEnvOptions] = useState<string[]>([]);
  const [clusterName, setClusterName] = useState("");
  const [template, setTemplate] = useState<string>("k8s_full");
  const [fromCluster, setFromCluster] = useState("");
  const [dnsSuffix, setDnsSuffix] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [force, setForce] = useState(false);
  const [noValidate, setNoValidate] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Init");
  const [bootstrapOpen, setBootstrapOpen] = useState(false);
  const [bootstrap, setBootstrap] = useState<BootstrapStatus | null>(null);
  const [bootstrapClusterId, setBootstrapClusterId] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyPhase, setApplyPhase] = useState<ApplyPhase>("idle");
  const [applyFail, setApplyFail] = useState<ApplyFail>(null);
  const [initSteps, setInitSteps] = useState<JobStep[] | null>(null);
  const [failedLogHref, setFailedLogHref] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [errorExcerpt, setErrorExcerpt] = useState<string | null>(null);
  const [sshPickerEpoch, setSshPickerEpoch] = useState(0);
  const [sshStatus, setSshStatus] = useState<ClusterctlSshStatus>({
    sshSecretId: null,
    secretCount: 0,
    ready: false,
  });
  const [initKeyError, setInitKeyError] = useState<string | null>(null);
  const [writePubKey, setWritePubKey] = useState(true);
  const [gitPullSecrets, setGitPullSecrets] = useState<SecretOption[]>([]);
  const [gitPullSecretId, setGitPullSecretId] = useState(GIT_PULL_NONE);
  const [gitPullBusy, setGitPullBusy] = useState(false);
  const clusterId = composeClusterId(clusterEnv, clusterName);

  useEffect(() => {
    if (!formOpen) return;
    let cancelled = false;
    void fetchAtlasProjectClusters(projectIdFromPath(pathname))
      .then((data) => {
        if (!cancelled) {
          setEnvOptions(environmentNames(data.clusters.map((row) => row.id)));
        }
      })
      .catch(() => {
        if (!cancelled) setEnvOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [formOpen, pathname]);
  const fromOverride = fromCluster.trim().length > 0;
  const sshReady =
    sshStatus.ready && Boolean(sshStatus.sshSecretId);

  function handleSshStatus(status: ClusterctlSshStatus) {
    setSshStatus(status);
    if (status.sshSecretId) setInitKeyError(null);
  }

  function doneHref(projectId: string) {
    const href = projectHref(projectId);
    if (!fromOverride && !templateOpensHostsAfterInit(template)) return href;
    return `${href}?hosts=1`;
  }

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

  async function failExecution(
    projectId: string,
    executionId: string,
    title: string,
  ) {
    const href = executionLogHref(projectId, executionId);
    setFailedLogHref(href);
    setApplyError(title);
    notifyExecution("error", title, projectId, executionId);
    try {
      const raw = await fetchExecutionLogExcerpt(projectId, executionId);
      setErrorExcerpt(formatLogExcerpt(raw) || null);
    } catch {
      setErrorExcerpt(null);
    }
  }

  async function loadBootstrapDialog(projectId: string, clusterId: string) {
    setBusyLabel("Checking workspace…");
    setApplyError(null);
    setFailedLogHref(null);
    setErrorExcerpt(null);
    notifyAtlasClustersChanged(clusterId);
    const status = await fetchBootstrapStatus(clusterId, projectId);
    if (!bootstrapNeedsDialog(status)) {
      toast.success("Cluster initialized");
      router.push(doneHref(projectId));
      return;
    }
    setBootstrap(status);
    setBootstrapClusterId(status.cluster_id || clusterId);
    setBootstrapOpen(true);
    await loadGitPullBinding(projectId).catch(() => undefined);
  }

  async function loadGitPullBinding(projectId: string) {
    const [project, secrets] = await Promise.all([
      fetchProject(projectId),
      loadGitPullSecrets(projectId),
    ]);
    setGitPullSecrets(secrets);
    setGitPullSecretId(project.gitPull?.defaultSecretId || GIT_PULL_NONE);
  }

  async function saveGitPullBinding(projectId: string, secretId: string) {
    setGitPullSecretId(secretId);
    setGitPullBusy(true);
    try {
      await stargateJson(`/projects/${encodeURIComponent(projectId)}`, {
        method: "PUT",
        body: JSON.stringify({
          gitPull: {
            defaultSecretId: secretId === GIT_PULL_NONE ? null : secretId,
          },
        }),
      });
      toast.success("Saved git pull key");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      await loadGitPullBinding(projectId).catch(() => undefined);
    } finally {
      setGitPullBusy(false);
    }
  }

  async function requireGitPullKey(projectId: string) {
    const needsGit = (bootstrap?.missing ?? []).some(
      (item) => item.kind === "git_repo",
    );
    if (!needsGit) return true;
    if (gitPullSecretId && gitPullSecretId !== GIT_PULL_NONE) return true;
    const message = "Select a Playbook git pull key to clone repositories";
    setApplyError(message);
    notify("error", message, { href: projectHref(projectId, "/settings") });
    return false;
  }

  async function addBootstrapSshKey() {
    const ok = await promptAddSshKey();
    setSshPickerEpoch((n) => n + 1);
    await refreshSshKey().catch(() => undefined);
    return ok;
  }

  async function requireClusterctlSsh() {
    if (!sshStatus.ready) {
      toast.error("Loading SSH keys…");
      return false;
    }
    if (sshStatus.sshSecretId) return true;
    if (sshStatus.secretCount > 0) {
      const message = "Select an Atlas SSH key from Secrets Manager";
      setInitKeyError(message);
      setFormOpen(true);
      notify("error", message, { href: "/secrets" });
      return false;
    }
    const added = await addBootstrapSshKey();
    if (added || (await refreshSshKey())) return true;
    const message = "Add an Atlas SSH key in Secrets Manager to init the cluster";
    setInitKeyError(message);
    setFormOpen(true);
    notify("error", message, { href: "/secrets" });
    return false;
  }

  async function runInit() {
    if (!canExecute) {
      toast.error("atlas.execute required");
      return;
    }
    if (!(await requireClusterctlSsh())) return;
    setBusy(true);
    setBusyLabel("Initializing…");
    setFailedLogHref(null);
    setApplyError(null);
    setErrorExcerpt(null);
    setInitSteps([
      { id: "queue", label: "Queue init", state: "running" },
      { id: "worker", label: "clusterctl init on worker", state: "pending" },
      { id: "workspace", label: "Checking workspace", state: "pending" },
    ]);
    try {
      const argv = buildArgv();
      const pid = projectIdFromPath(pathname);
      if (pid || (await isHubRemote())) {
        const result = await queueAtlasInit({ argv, projectId: pid ?? undefined });
        const dest = pid || projectIdFromPath(pathname);
        const executionId = result.executionId;
        if (!dest || !executionId) {
          toast.success("Init queued on worker");
          setFormOpen(false);
          setInitSteps(null);
          return;
        }
        setFormOpen(false);
        setInitSteps((steps) =>
          patchSteps(
            patchSteps(steps ?? [], "queue", "ok"),
            "worker",
            "running",
            { detail: "QUEUED" },
          ),
        );
        notifyExecution("success", "Init queued on worker", dest, executionId);
        const status = await waitHubExecution(
          dest,
          executionId,
          180_000,
          (next) => {
            if (
              next === "SUCCESS" ||
              next === "FAILED" ||
              next === "CANCELED" ||
              next === "TIMEOUT"
            ) {
              return;
            }
            setInitSteps((steps) =>
              patchSteps(steps ?? [], "worker", "running", { detail: next }),
            );
          },
        );
        if (status !== "SUCCESS") {
          setInitSteps((steps) =>
            patchSteps(steps ?? [], "worker", "fail", { detail: status }),
          );
          await failExecution(
            dest,
            executionId,
            status === "TIMEOUT" ? "Init timed out" : "Init failed",
          );
          return;
        }
        setInitSteps((steps) =>
          patchSteps(
            patchSteps(steps ?? [], "worker", "ok", { detail: "SUCCESS" }),
            "workspace",
            "running",
          ),
        );
        const createdId = result.clusterId || clusterId.trim();
        if (writePubKey) {
          try {
            await writeAtlasOperatorPubkey(dest, createdId);
          } catch (err) {
            toast.error(
              err instanceof Error
                ? err.message
                : "Could not write the Atlas public key to the cluster",
            );
          }
        }
        await loadBootstrapDialog(dest, createdId);
        setInitSteps(null);
        return;
      }
      await startJob({ argv, wait: false });
      setFormOpen(false);
      setInitSteps(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setApplyError(message);
      toast.error(message);
      setInitSteps((steps) => {
        if (!steps) return steps;
        const running = steps.find((step) => step.state === "running");
        return running ? patchSteps(steps, running.id, "fail") : steps;
      });
    } finally {
      setBusy(false);
      setBusyLabel("Init");
    }
  }

  async function applyBootstrap() {
    const pid = projectIdFromPath(pathname);
    const clusterId = bootstrapClusterId.trim();
    if (!pid || !clusterId) {
      toast.error("Missing project or cluster id");
      return;
    }
    setFailedLogHref(null);
    setApplyError(null);
    setErrorExcerpt(null);
    setApplyFail(null);
    try {
      const missing = bootstrap?.missing ?? [];
      const needsRepos = missing.some((item) => REPO_KINDS.has(item.kind));
      const needsPub = missing.some((item) => item.kind === "operator_pub");
      const sshBlocked = missing.some((item) => item.kind === "ssh_key");
      if (needsRepos && !(await requireGitPullKey(pid))) return;
      setApplying(true);
      if (needsRepos) {
        setApplyPhase("sync");
        const sync = await queueReposSync({ clusterId, projectId: pid });
        if (sync.executionId) {
          const syncStatus = await waitHubExecution(
            pid,
            sync.executionId,
            APPLY_WAIT_MS,
          );
          if (syncStatus !== "SUCCESS") {
            setApplyFail("sync");
            await failExecution(
              pid,
              sync.executionId,
              syncStatus === "TIMEOUT" ? "Repos sync timed out" : "Repos sync failed",
            );
            return;
          }
        } else if (sync.exitCode) {
          const message = sync.log?.trim() || "Repos sync failed";
          setApplyFail("sync");
          setApplyError(message);
          setErrorExcerpt(message);
          toast.error(message);
          return;
        }
      }
      if (needsPub && !sshBlocked) {
        setApplyPhase("pubkey");
        try {
          await writeAtlasOperatorPubkey(pid, clusterId);
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : "Could not write the Atlas public key to the cluster";
          setApplyFail("pubkey");
          setApplyError(message);
          toast.error(message);
          return;
        }
      }
      if (sshBlocked) {
        const message = "Select an Atlas SSH key in Secrets Manager";
        setApplyPhase("idle");
        setApplyFail("ssh");
        setApplyError(message);
        notify("error", message, { href: "/secrets" });
        const next = await fetchBootstrapStatus(clusterId, pid);
        setBootstrap(next);
        return;
      }
      if (dockerNeedsPull(bootstrap)) {
        setApplyPhase("docker");
        const pull = await queueDockerPull({ clusterId, projectId: pid });
        if (pull.executionId) {
          const pullStatus = await waitHubExecution(
            pid,
            pull.executionId,
            APPLY_WAIT_MS,
          );
          if (pullStatus !== "SUCCESS") {
            setApplyFail("docker");
            await failExecution(
              pid,
              pull.executionId,
              pullStatus === "TIMEOUT" ? "Docker pull timed out" : "Docker pull failed",
            );
            return;
          }
        } else if (pull.exitCode) {
          const message = pull.log?.trim() || "Docker pull failed";
          setApplyFail("docker");
          setApplyError(message);
          setErrorExcerpt(message);
          toast.error(message);
          return;
        }
      }
      const next = await fetchBootstrapStatus(clusterId, pid);
      setBootstrap(next);
      setApplyPhase("idle");
      if ((next.missing?.length ?? 0) === 0 && !dockerNeedsPull(next)) {
        setBootstrapOpen(false);
        notifyAtlasClustersChanged(clusterId);
        toast.success(
          dockerNeedsPull(bootstrap)
            ? "Workspace and executor image applied"
            : "Workspace applied",
        );
        router.push(doneHref(pid));
      } else {
        toast.success("Apply finished — some items are still missing");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setApplyError(message);
      toast.error(message);
    } finally {
      setApplying(false);
      if (!applyFail) {
        setApplyPhase("idle");
      }
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clusterId) {
      return;
    }
    if (force) {
      setFormOpen(false);
      setConfirmOpen(true);
      return;
    }
    void runInit();
  }

  return (
    <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,42rem)_minmax(20rem,1fr)]">
      <div className="flex min-w-0 flex-col gap-8">
      <PageHeader
        className="mb-0"
        kicker="Project"
        title="New cluster"
        description="Scaffold a new inventory leaf from a template or an existing cluster."
      />
      {bootstrapOpen ? null : applyError || failedLogHref || errorExcerpt ? (
        <ExecutionErrorPanel
          title={applyError || "Init did not finish successfully"}
          excerpt={errorExcerpt}
          href={failedLogHref}
        />
      ) : null}
      <div className="flex flex-col gap-8">
        <TemplateSection
          title="Proxmox VM templates"
          note="Guest VMs do not deploy without this leaf. Build the golden images here first."
        >
          <TemplateChoiceCard
            name="pve_templates"
            selected={!fromOverride && template === "pve_templates"}
            dimmed={fromOverride}
            onSelect={setTemplate}
          />
        </TemplateSection>
        <TemplateSection
          title="Edge / ingress infrastructure"
          note="DNS, certificates, APT and YUM mirrors, Helm charts, and the container registry cache."
        >
          <TemplateChoiceCard
            name="infra_edge"
            selected={!fromOverride && template === "infra_edge"}
            dimmed={fromOverride}
            onSelect={setTemplate}
          />
        </TemplateSection>
        <TemplateSection title="Clusters">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {CLUSTER_TEMPLATES.map((name) => (
              <TemplateChoiceCard
                key={name}
                name={name}
                selected={!fromOverride && template === name}
                dimmed={fromOverride}
                onSelect={setTemplate}
              />
            ))}
          </div>
        </TemplateSection>
      </div>
      {initSteps ? (
        <JobProgress
          steps={initSteps}
          currentLabel={
            busy
              ? initSteps.find((step) => step.state === "running")?.label
              : undefined
          }
        />
      ) : null}
      <Button
        type="button"
        disabled={busy || !canExecute}
        onClick={() => {
          setInitKeyError(null);
          setFormOpen(true);
        }}
      >
        {busy ? "Initializing…" : "Init"}
      </Button>
      <Dialog
        open={formOpen}
        modal={!sshFormOpen}
        onOpenChange={(open) => {
          if (!busy && !sshFormOpen) setFormOpen(open);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Init cluster</DialogTitle>
            <DialogDescription>
              {fromOverride
                ? `Copy from ${fromCluster.trim()}`
                : `Template ${template}`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <div className="space-y-2">
                  <Label htmlFor="env">Environment</Label>
                  {envOptions.length > 0 ? (
                    <SuggestInput
                      id="env"
                      value={clusterEnv}
                      options={envOptions.map((name) => ({
                        value: name,
                        label: name,
                      }))}
                      placeholder="demo"
                      ariaLabel="Environment"
                      className="h-10 text-sm"
                      onChange={(value) =>
                        setClusterEnv(value.replaceAll("/", ""))
                      }
                    />
                  ) : (
                    <Input
                      id="env"
                      required
                      className="font-mono"
                      value={clusterEnv}
                      onChange={(e) =>
                        setClusterEnv(e.target.value.replaceAll("/", ""))
                      }
                      placeholder="demo"
                      pattern="[a-z][a-z0-9._-]+"
                      title="lowercase env, e.g. demo"
                      autoComplete="off"
                    />
                  )}
                </div>
                <span className="pb-2 font-mono text-muted-foreground">/</span>
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    required
                    className="font-mono"
                    value={clusterName}
                    onChange={(e) =>
                      setClusterName(e.target.value.replaceAll("/", ""))
                    }
                    placeholder="k8s"
                    pattern="[a-z][a-z0-9._-]+"
                    title="lowercase name, e.g. k8s"
                    autoComplete="off"
                  />
                </div>
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                {clusterId || "env/name"}
              </p>
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
            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
              <div className="font-medium">Atlas SSH key</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Root SSH on new VMs. Required for docker validate. Playbook git
                clone uses a separate git pull key.
              </p>
              <div className="mt-2">
                <ClusterctlSshKeyPicker
                  id="init-clusterctl-ssh"
                  label="Atlas SSH key"
                  compact
                  disabled={busy}
                  reloadToken={sshPickerEpoch}
                  onAdd={() => void addBootstrapSshKey()}
                  onStatus={handleSshStatus}
                />
              </div>
              <Label className="mt-3 font-normal">
                <Checkbox
                  checked={writePubKey}
                  onCheckedChange={(value) => setWritePubKey(value === true)}
                />
                Write public key to the cluster
              </Label>
            </div>
            {initKeyError ? (
              <p className="text-sm text-destructive">{initKeyError}</p>
            ) : null}
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
            <Button type="submit" disabled={busy || !sshReady || !clusterId || !canExecute}>
              {busy ? busyLabel : "Init"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={bootstrapOpen}
        modal={!sshFormOpen}
        onOpenChange={(open) => {
          if (!applying && !sshFormOpen) setBootstrapOpen(open);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Missing after init</DialogTitle>
            <DialogDescription>
              The cluster leaf is on disk. Sync git playbooks
              {dockerNeedsPull(bootstrap)
                ? " and pull the docker executor image"
                : ""}{" "}
              before the first run.
            </DialogDescription>
          </DialogHeader>
          {(applying || applyFail) && bootstrap ? (
            <div className="max-h-[min(28rem,50vh)] overflow-y-auto">
              <JobProgress
                steps={applyProgressSteps(bootstrap, applyPhase, applyFail)}
                currentLabel={
                  applyPhase === "sync"
                    ? "Syncing playbooks…"
                    : applyPhase === "pubkey"
                      ? "Writing operator public key…"
                      : applyPhase === "docker"
                        ? `Pulling ${bootstrap.docker_image ?? "image"}…`
                        : undefined
                }
              />
            </div>
          ) : (
            <ul className="max-h-[min(28rem,50vh)] space-y-2 overflow-y-auto text-sm">
              {(bootstrap?.missing ?? []).map((item, index) => (
                <li
                  key={`${item.kind}-${item.name ?? index}`}
                  className="rounded-md bg-muted/50 px-3 py-2"
                >
                  <div className="font-medium">
                    {item.label || item.name || item.kind}
                  </div>
                  {item.path ? (
                    <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
                      {item.path}
                    </div>
                  ) : null}
                  {item.kind === "ssh_key" ? (
                    <Link
                      href="/secrets"
                      className="mt-1 inline-block text-xs underline underline-offset-4"
                    >
                      Select Atlas SSH key
                    </Link>
                  ) : null}
                </li>
              ))}
              {dockerNeedsPull(bootstrap) ? (
                <li className="rounded-md bg-muted/50 px-3 py-2">
                  <div className="font-medium">
                    Docker executor image is not pulled
                  </div>
                  <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
                    {bootstrap?.docker_image}
                  </div>
                </li>
              ) : null}
            </ul>
          )}
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            <div className="font-medium">Playbook git pull key</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Used to clone playbook repositories. Not the Atlas key for VMs.
            </p>
            <div className="mt-2">
              <GitPullSecretSelect
                id="bootstrap-git-pull"
                label="Playbook git pull key"
                compact
                value={gitPullSecretId}
                secrets={gitPullSecrets}
                onValueChange={(next) => {
                  const pid = projectIdFromPath(pathname);
                  if (pid) void saveGitPullBinding(pid, next);
                }}
                disabled={applying || gitPullBusy}
                noneLabel="Select git pull key"
              />
            </div>
          </div>
          {applyError ? (
            <ExecutionErrorPanel
              title={applyError}
              excerpt={errorExcerpt}
              href={failedLogHref}
            />
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={applying}
              onClick={() => setBootstrapOpen(false)}
            >
              Close
            </Button>
            <Button
              type="button"
              disabled={applying}
              onClick={() => void applyBootstrap()}
            >
              {applying && applyPhase === "docker"
                ? "Pulling image…"
                : applying && applyPhase === "pubkey"
                  ? "Writing public key…"
                  : applying && applyPhase === "sync"
                    ? "Syncing playbooks…"
                    : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmAction
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Replace cluster inventory?"
        description={`Replace existing clusters/${clusterId}/ ?`}
        confirmLabel="Replace"
        destructive
        onConfirm={runInit}
      />
      {sshDialog}
      </div>
      <TemplateProfilePanel
        template={template}
        className="xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto"
      />
    </div>
  );
}
