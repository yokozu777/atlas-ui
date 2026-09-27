"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import {
  parseProjectSettingsInnerTab,
  projectSettingsHref,
  ProjectSettingsView,
  type ProjectSettingsInnerTab,
} from "@/components/project-settings-view";

export function AnsibleProjectSettingsPage({ projectId }: { projectId: string }) {
  return (
    <Suspense fallback={<EmptyState title="Loading settings" />}>
      <AnsibleProjectSettingsInner projectId={projectId} />
    </Suspense>
  );
}

function AnsibleProjectSettingsInner({ projectId }: { projectId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const innerTab = parseProjectSettingsInnerTab(searchParams.get("tab"));

  function setInnerTab(next: ProjectSettingsInnerTab) {
    router.replace(projectSettingsHref(projectId, next), {
      scroll: false,
    });
  }

  return (
    <ProjectSettingsView
      projectId={projectId}
      innerTab={innerTab}
      onInnerTabChange={setInnerTab}
    />
  );
}
