"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useExecutionStream } from "@/hooks/use-execution-stream";
import {
  isActiveExecutionStatus,
  isClusterAtlasRun,
  type AtlasExecution,
} from "@/lib/atlas-run";
import {
  atlasRunProgressFromText,
  packMapFocusFromProgress,
  packMapPhaseAliases,
  packMapRoleProgress,
  packMapRoleProgressByPhase,
  type PackMapRoleProgress,
  type PackMapRunFocus,
} from "@/lib/atlas-run-progress";
import { executionIdOf } from "@/lib/project-dashboard";
import { stargateJson } from "@/lib/stargate";

const POLL_MS = 4000;

export function useAtlasMapLiveFocus(
  projectId: string,
  clusterId: string | null,
): PackMapRunFocus & {
  roles: PackMapRoleProgress | null;
  rolesByPhase: Record<string, PackMapRoleProgress> | null;
} {
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [phases, setPhases] = useState<string[]>([]);
  const ticket = useRef(0);
  const { text } = useExecutionStream(
    projectId,
    clusterId ? executionId : null,
  );

  useEffect(() => {
    const selected = clusterId;
    if (!selected) {
      setExecutionId(null);
      setStatus(null);
      setPhases([]);
      return;
    }
    let stopped = false;
    async function poll() {
      const mine = ++ticket.current;
      try {
        const data = await stargateJson<{ executions?: AtlasExecution[] }>(
          `/executions?project_id=${encodeURIComponent(projectId)}`,
        );
        if (stopped || mine !== ticket.current) return;
        const active = (data.executions ?? []).find(
          (row) =>
            isClusterAtlasRun(row, selected) &&
            isActiveExecutionStatus(row.status),
        );
        if (!active) {
          setExecutionId(null);
          setStatus(null);
          setPhases([]);
          return;
        }
        setExecutionId(executionIdOf(active) || null);
        setStatus(active.status ?? null);
        setPhases(active.runParams?.phases ?? []);
      } catch {
        // Keep the phase already on screen if the list request fails.
      }
    }
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      stopped = true;
      ticket.current += 1;
      window.clearInterval(timer);
    };
  }, [clusterId, projectId]);

  const loggedPhases = useMemo(() => packMapPhaseAliases(text), [text]);
  const mapPhases = phases.length > 0 ? phases : loggedPhases;
  const progress = useMemo(
    () =>
      executionId
        ? atlasRunProgressFromText({ status, text, phases: mapPhases })
        : { steps: [] },
    [executionId, mapPhases, status, text],
  );
  const focus = useMemo(
    () => packMapFocusFromProgress(progress, status),
    [progress, status],
  );
  const roles = useMemo(
    () =>
      executionId && focus.alias
        ? packMapRoleProgress(text, status)
        : null,
    [executionId, focus.alias, status, text],
  );
  const rolesByPhase = useMemo(
    () => (executionId ? packMapRoleProgressByPhase(text, status) : null),
    [executionId, status, text],
  );

  return { ...focus, roles, rolesByPhase };
}
