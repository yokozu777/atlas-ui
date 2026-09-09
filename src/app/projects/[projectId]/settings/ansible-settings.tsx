"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import {
  parseProjectSettingsInnerTab,
  ProjectSettingsView,
  type ProjectSettingsInnerTab,
} from "@/components/project-settings-view";
import { projectHref } from "@/lib/project-href";

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

  useEffect(() => {
    if (searchParams.get("tab") === "vaults") {
      router.replace(projectHref(projectId, "/vault"));
    }
  }, [searchParams, projectId, router]);

  function setInnerTab(next: ProjectSettingsInnerTab) {
    const href =
      next === "sources"
        ? projectHref(projectId, "/settings")
        : `${projectHref(projectId, "/settings")}?tab=${next}`;
    router.replace(href, { scroll: false });
  }

  return (
    <ProjectSettingsView
      projectId={projectId}
      innerTab={innerTab}
      onInnerTabChange={setInnerTab}
    />
  );
}
