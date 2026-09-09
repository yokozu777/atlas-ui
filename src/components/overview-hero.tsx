"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Braces, Flame, ListTree, Play, ShieldCheck } from "lucide-react";

import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { clusterHref } from "@/lib/api";
import { projectHref, projectIdFromPath } from "@/lib/project-href";
import { cn } from "@/lib/utils";

export type OverviewHeroKind = "running" | "ok" | "fail" | "idle";

const HERO = {
  running: {
    word: "Running",
    rail: "bg-chart-1",
    tint: "bg-[color-mix(in_oklch,var(--chart-1)_12%,var(--card))]",
    pulse: true,
  },
  ok: {
    word: "Last run ok",
    rail: "bg-success",
    tint: "bg-[color-mix(in_oklch,var(--success)_12%,var(--card))]",
    pulse: false,
  },
  fail: {
    word: "Last run failed",
    rail: "bg-destructive",
    tint: "bg-[color-mix(in_oklch,var(--destructive)_12%,var(--card))]",
    pulse: false,
  },
  idle: {
    word: "Idle",
    rail: "bg-info",
    tint: "bg-[color-mix(in_oklch,var(--info)_12%,var(--card))]",
    pulse: false,
  },
} as const;

export function overviewHeroKind(opts: {
  running: boolean;
  lastStatus: "ok" | "fail" | "unknown" | null;
}): OverviewHeroKind {
  if (opts.running) {
    return "running";
  }
  if (opts.lastStatus === "ok") {
    return "ok";
  }
  if (opts.lastStatus === "fail") {
    return "fail";
  }
  return "idle";
}

export function OverviewHero({
  kind,
  title,
  clusterId,
  meta,
  onRun,
  onInspect,
}: {
  kind: OverviewHeroKind;
  title: string;
  clusterId: string;
  meta: string[];
  onRun: () => void;
  onInspect: (kind: "plan" | "validate" | "smoke") => void;
}) {
  const visual = HERO[kind];
  const projectId = projectIdFromPath(usePathname());
  const varsHref = projectId
    ? projectHref(projectId, "/vars")
    : clusterHref(clusterId, "/vars");
  return (
    <Panel className={cn("flex min-h-[16rem]", visual.tint)}>
      <div
        className={cn(
          "w-1.5 shrink-0",
          visual.rail,
          visual.pulse && "animate-pulse",
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-6 p-6">
        <div className="space-y-3">
          <p className="text-[13px] text-muted-foreground">Status</p>
          <h2 className="font-display text-4xl font-medium tracking-tighter md:text-5xl">
            {visual.word}
          </h2>
          <p className="text-lg text-foreground">{title}</p>
          <p className="font-mono text-sm text-chart-1">{clusterId}</p>
          {meta.length > 0 ? (
            <p className="text-sm text-muted-foreground">{meta.join(" · ")}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={onRun}>
            <Play />
            Run
          </Button>
          <Button type="button" variant="outline" onClick={() => onInspect("plan")}>
            <ListTree />
            Plan
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onInspect("validate")}
          >
            <ShieldCheck />
            Validate
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onInspect("smoke")}
          >
            <Flame />
            Smoke
          </Button>
          <Button
            type="button"
            variant="outline"
            render={<Link href={varsHref} />}
          >
            <Braces />
            Vars
          </Button>
        </div>
      </div>
    </Panel>
  );
}
