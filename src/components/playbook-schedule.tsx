"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { stargateJson } from "@/lib/stargate";

type ScheduleDoc = {
  enabled?: boolean;
  cron?: string;
  timezone?: string;
};

export function PlaybookScheduleForm({
  projectId,
  playbookId,
}: {
  projectId: string;
  playbookId: string;
}) {
  const [enabled, setEnabled] = useState(false);
  const [cron, setCron] = useState("0 2 * * *");
  const [timezone, setTimezone] = useState("UTC");
  const [nextRun, setNextRun] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refreshNextRun() {
    const data = await stargateJson<{
      success?: boolean;
      next_run_time?: string;
    }>(
      `/projects/${projectId}/playbooks/${playbookId}/schedule/next-run`,
    ).catch(() => ({ success: false as boolean, next_run_time: undefined as string | undefined }));
    setNextRun(data.next_run_time ?? null);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await stargateJson<{
        success?: boolean;
        schedule?: ScheduleDoc | null;
      }>(`/projects/${projectId}/playbooks/${playbookId}/schedule`);
      if (cancelled) return;
      const schedule = data.schedule;
      if (schedule) {
        setEnabled(Boolean(schedule.enabled));
        setCron(schedule.cron || "0 2 * * *");
        setTimezone(schedule.timezone || "UTC");
      }
      if (schedule?.enabled) {
        await refreshNextRun();
      }
    })().catch((err: unknown) => {
      if (!cancelled) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, playbookId]);

  async function save() {
    setBusy(true);
    try {
      await stargateJson(
        `/projects/${projectId}/playbooks/${playbookId}/schedule`,
        {
          method: "PUT",
          body: JSON.stringify({ enabled, cron, timezone }),
        },
      );
      toast.success("Schedule saved");
      if (enabled) {
        await refreshNextRun();
      } else {
        setNextRun(null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="p-4">
      <div className="mb-4 space-y-3">
        <Label className="font-normal">
          <Checkbox
            checked={enabled}
            onCheckedChange={(value) => setEnabled(value === true)}
          />
          Enable cron schedule
        </Label>
        <div className="space-y-2">
          <Label htmlFor="cron">Cron (minute hour day month weekday)</Label>
          <Input
            id="cron"
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            placeholder="0 2 * * *"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tz">Timezone</Label>
          <Input
            id="tz"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="UTC"
          />
        </div>
        {nextRun ? (
          <p className="text-sm text-muted-foreground">Next run: {nextRun}</p>
        ) : null}
      </div>
      <Button onClick={() => void save()} disabled={busy}>
        Save schedule
      </Button>
    </Panel>
  );
}
