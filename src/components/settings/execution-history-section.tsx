"use client";

import { useEffect, useState } from "react";
import { History, Trash2 } from "lucide-react";

import { ConfirmAction } from "@/components/confirm-action";
import { SettingsSection } from "@/components/settings/settings-section";
import type { HubSettings, HubStats } from "@/components/settings/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export function ExecutionHistorySection({
  settings,
  stats,
  onPatch,
  onClear,
}: {
  settings: HubSettings;
  stats: HubStats;
  onPatch: (partial: Partial<HubSettings>) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [count, setCount] = useState(String(settings.retention_count ?? 200));
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setCount(String(settings.retention_count ?? 200));
  }, [settings.retention_count]);

  return (
    <SettingsSection icon={<History className="size-4" />} title="Execution history">
      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          checked={Boolean(settings.save_history)}
          onCheckedChange={(value) => void onPatch({ save_history: value === true })}
        />
        <span>
          <span className="font-medium">Save execution history</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Stores run metadata and logs for later review.
          </span>
        </span>
      </label>
      <div className="space-y-2">
        <Label>Retention mode</Label>
        <RadioGroup
          value={settings.retention_mode ?? "count"}
          onValueChange={(value) => {
            if (value === "count" || value === "size") {
              void onPatch({ retention_mode: value });
            }
          }}
        >
          <Label className="font-normal">
            <RadioGroupItem value="count" />
            Keep last N runs
          </Label>
          <div className="flex flex-wrap items-center gap-2 pl-6">
            <Input
              className="w-24"
              type="number"
              min={1}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              onBlur={() => {
                const value = Number(count);
                if (!Number.isFinite(value) || value < 1) return;
                void onPatch({ retention_count: value });
              }}
            />
            <span className="text-sm text-muted-foreground">runs</span>
          </div>
          <p className="pl-6 text-xs text-muted-foreground">
            Oldest runs are deleted first.
          </p>
          <Label className="font-normal">
            <RadioGroupItem value="size" />
            Keep last {settings.retention_size_mb ?? 200} MB
          </Label>
        </RadioGroup>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p className="text-sm text-muted-foreground">
          Current usage: {stats.count ?? 0} runs • {stats.size_mb ?? 0} MB
        </p>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => setConfirmClear(true)}
        >
          <Trash2 />
          Clear history...
        </Button>
      </div>
      <ConfirmAction
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear execution history"
        description="Delete all execution records and logs for every project."
        confirmLabel="Clear"
        destructive
        onConfirm={() => void onClear()}
      />
    </SettingsSection>
  );
}
