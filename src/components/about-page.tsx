"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  BookOpen,
  Compass,
  FileText,
  FolderGit2,
  Layers,
  Mail,
  Scale,
  Terminal,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { SectionHeader } from "@/components/section-header";
import { Badge } from "@/components/ui/badge";
import { stargateJson } from "@/lib/stargate";

type HubAbout = {
  version?: string;
  python?: string;
  plane?: string;
  clusterctl?: {
    version?: string;
    dest?: string | null;
    ok?: boolean;
    error?: string | null;
  };
};

export function AboutPage({
  consoleVersion,
  nextVersion,
}: {
  consoleVersion: string;
  nextVersion: string;
}) {
  const [hub, setHub] = useState<HubAbout | null>(null);
  const [hubError, setHubError] = useState<string | null>(null);

  useEffect(() => {
    void stargateJson<HubAbout>("/about")
      .then((data) => {
        setHub(data);
        setHubError(null);
      })
      .catch((err: unknown) => {
        setHub(null);
        setHubError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  const clusterctl = hub?.clusterctl;
  const clusterctlLabel = clusterctl?.ok
    ? clusterctl.version || "ok"
    : clusterctl?.error || "not installed";

  return (
    <div className="space-y-10">
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/atlas-logo.png"
          alt="Atlas"
          width={192}
          height={192}
          className="h-auto w-full max-w-[12rem] shrink-0"
        />
        <PageHeader
          className="mb-0"
          kicker="Atlas"
          title="Welcome to Atlas"
          description="A calm console for the infrastructure you already keep in Git."
        />
      </div>

      <Panel className="space-y-4 p-6 sm:p-8">
        <SectionHeader
          className="mb-0"
          title="Our mission"
          icon={<Compass />}
        />
        <div className="max-w-3xl space-y-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
          <p>
            Atlas is a self-hosted control plane for Infrastructure as Code. It
            gives platform teams one place to design, review, and run the work
            they already trust in Git.
          </p>
          <p>
            Ansible playbooks and Atlas clusterctl live side by side: inventory,
            cluster.yaml, workers, secrets, and repeatable executions—without
            giving up the files on disk.
          </p>
          <p>
            We exist so complex infrastructure stays orderly. Safer changes
            ship faster, fewer mistakes slip through, and the same playbooks
            scale from a lab to hundreds of servers.
          </p>
        </div>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-3">
        <PurposeCard
          icon={<BookOpen />}
          title="Ansible"
          body="Open playbooks, inventory, vaults, and the scheduler without leaving the console."
        />
        <PurposeCard
          icon={<Layers />}
          title="Clusters"
          body="Guide cluster.yaml, pipeline order, and docker or local executors for Atlas environments."
        />
        <PurposeCard
          icon={<Users />}
          title="Team"
          body="Roles, secrets, and distributed workers so the right people run the right jobs."
        />
      </div>

      <section>
        <SectionHeader title="Versions" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <VersionChip label="atlas-ui" value={consoleVersion} />
          <VersionChip label="Next.js" value={nextVersion} />
          <VersionChip
            label="Hub"
            value={
              hubError ? (
                <span className="text-destructive">{hubError}</span>
              ) : hub ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  {hub.version}
                  {hub.plane ? (
                    <Badge variant="outline">{hub.plane}</Badge>
                  ) : null}
                </span>
              ) : (
                "Loading…"
              )
            }
          />
          <VersionChip
            label="Python"
            value={hubError ? "—" : hub?.python || "Loading…"}
          />
          <VersionChip
            label="atlas-clusterctl"
            value={
              hubError ? (
                "—"
              ) : hub ? (
                <span className="flex flex-col gap-1">
                  <span>{clusterctlLabel}</span>
                  {clusterctl?.dest ? (
                    <span className="font-sans text-xs font-normal text-muted-foreground">
                      {clusterctl.dest}
                    </span>
                  ) : null}
                </span>
              ) : (
                "Loading…"
              )
            }
          />
        </div>
      </section>

      <section>
        <SectionHeader title="Links" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <LinkTile
            href="/docs"
            icon={<FileText />}
            label="Docs"
            hint="Console documentation"
          />
          <LinkTile
            href="https://github.com/yokozu777/atlas-ui"
            icon={<FolderGit2 />}
            label="GitHub"
            hint="yokozu777/atlas-ui"
            external
          />
          <LinkTile
            href="https://github.com/yokozu777/atlas-clusterctl"
            icon={<Terminal />}
            label="clusterctl"
            hint="yokozu777/atlas-clusterctl"
            external
          />
          <LinkTile
            icon={<Scale />}
            label="License"
            hint="Apache 2.0"
          />
          <LinkTile
            href="mailto:test@test.local"
            icon={<Mail />}
            label="Maintainer"
            hint="test@test.local"
          />
        </div>
      </section>
    </div>
  );
}

function PurposeCard({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Panel className="space-y-3 p-5">
      <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
        {icon}
      </span>
      <h3 className="font-display text-lg font-medium">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
    </Panel>
  );
}

function VersionChip({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <Panel className="space-y-1.5 p-4">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <div className="min-w-0 break-all font-mono text-sm">{value}</div>
    </Panel>
  );
}

function LinkTile({
  href,
  icon,
  label,
  hint,
  external,
}: {
  href?: string;
  icon: ReactNode;
  label: string;
  hint: string;
  external?: boolean;
}) {
  const className =
    "flex items-center gap-3 rounded-xl bg-card px-4 py-4 transition-colors";
  const body = (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {hint}
        </span>
      </span>
    </>
  );
  if (!href) {
    return <div className={className}>{body}</div>;
  }
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={`${className} hover:bg-white/5`}
      >
        {body}
      </a>
    );
  }
  if (href.startsWith("mailto:")) {
    return (
      <a href={href} className={`${className} hover:bg-white/5`}>
        {body}
      </a>
    );
  }
  return (
    <Link href={href} className={`${className} hover:bg-white/5`}>
      {body}
    </Link>
  );
}
