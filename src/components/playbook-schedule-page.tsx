"use client";

import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { PlaybookScheduleForm } from "@/components/playbook-schedule";
import { Button } from "@/components/ui/button";
import { projectHref } from "@/lib/project-href";

export function PlaybookSchedulePage({
  projectId,
  playbookId,
}: {
  projectId: string;
  playbookId: string;
}) {
  return (
    <div>
      <PageHeader
        kicker="Playbook"
        title="Schedule"
        description="Cron on the hub worker (GET/PUT …/schedule). Not a visual playbook editor."
        actions={
          <Button
            variant="outline"
            render={<Link href={projectHref(projectId, `/playbooks/${playbookId}`)} />}
          >
            YAML editor
          </Button>
        }
      />
      <PlaybookScheduleForm projectId={projectId} playbookId={playbookId} />
    </div>
  );
}
