"use client";

import { useMemo } from "react";

import { JobProgress } from "@/components/job-progress";
import {
  atlasRunProgress,
  atlasRunProgressFromText,
} from "@/lib/atlas-run-progress";
import type { ParsedLogLine } from "@/lib/execution-log";

export function AtlasRunProgressCard({
  status,
  lines,
  text,
  phases,
  executor,
  selectedId,
  onSelect,
}: {
  status?: string | null;
  lines?: ParsedLogLine[];
  text?: string;
  phases?: string[];
  executor?: string | null;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const progress = useMemo(
    () =>
      lines
        ? atlasRunProgress({ status, lines, phases, executor })
        : atlasRunProgressFromText({
            status,
            text: text ?? "",
            phases,
            executor,
          }),
    [status, lines, text, phases, executor],
  );
  return (
    <JobProgress
      steps={progress.steps}
      currentLabel={progress.currentLabel}
      selectedId={selectedId}
      onSelect={onSelect}
    />
  );
}
