"use client";

import Link from "next/link";
import { use } from "react";

import { PageHeader } from "@/components/page-header";
import { PlaybookScheduleForm } from "@/components/playbook-schedule";
import { Button } from "@/components/ui/button";
import { projectHref } from "@/lib/project-href";

export default function PlaybookSchedulePage({
  params,
}: {
  params: Promise<{ projectId: string; playbookId: string }>;
}) {
  const { projectId, playbookId } = use(params);
  const pid = decodeURIComponent(projectId);
  const pbid = decodeURIComponent(playbookId);

  return (
    <div>
      <PageHeader
        kicker="Playbook"
        title="Schedule"
        description="Cron on the hub worker (GET/PUT …/schedule). Not a visual playbook editor."
        actions={
          <Button
            variant="outline"
            render={<Link href={projectHref(pid, `/playbooks/${pbid}`)} />}
          >
            YAML editor
          </Button>
        }
      />
      <PlaybookScheduleForm projectId={pid} playbookId={pbid} />
    </div>
  );
}
