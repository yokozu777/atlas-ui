"use client";

import { PageHeader } from "@/components/page-header";
import { VarsTab } from "@/components/hosts-groups/vars-tab";

export function VarsPage({ projectId }: { projectId: string }) {
  return (
    <div>
      <PageHeader
        kicker="Infrastructure"
        title="Vars"
        description="Group and host variables"
      />
      <VarsTab projectId={projectId} />
    </div>
  );
}
