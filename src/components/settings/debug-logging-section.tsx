"use client";

import { useEffect, useState } from "react";
import { Bug } from "lucide-react";
import { toast } from "sonner";

import { SettingsHint, SettingsSection } from "@/components/settings/settings-section";
import type { HubSettings } from "@/components/settings/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

const LEVELS = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"];

export function DebugLoggingSection({
  settings,
  onPatch,
}: {
  settings: HubSettings;
  onPatch: (partial: Partial<HubSettings>) => Promise<void>;
}) {
  const [logSize, setLogSize] = useState(String(settings.max_log_size_mb ?? 10));
  const [uploadSize, setUploadSize] = useState(String(settings.max_upload_size_mb ?? 10));
  const [ttl, setTtl] = useState(String(settings.host_status_ttl_seconds ?? 300));

  useEffect(() => {
    setLogSize(String(settings.max_log_size_mb ?? 10));
    setUploadSize(String(settings.max_upload_size_mb ?? 10));
    setTtl(String(settings.host_status_ttl_seconds ?? 300));
  }, [settings.max_log_size_mb, settings.max_upload_size_mb, settings.host_status_ttl_seconds]);

  async function commitNumber(key: keyof HubSettings, raw: string, min: number, max: number) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < min || value > max) {
      toast.error(`Value must be between ${min} and ${max}`);
      return;
    }
    await onPatch({ [key]: value } as Partial<HubSettings>);
  }

  return (
    <SettingsSection icon={<Bug className="size-4" />} title="Debug mode & logging">
      <SettingsHint>
        Debug mode is not recommended for production. It enables verbose hub logs.
        Log file size changes apply after a hub restart.
      </SettingsHint>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          checked={Boolean(settings.debug_mode)}
          onCheckedChange={(value) => void onPatch({ debug_mode: value === true })}
        />
        <span>
          <span className="font-medium">Debug mode</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Enables detailed logging for errors.
          </span>
        </span>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Logging level</Label>
          <Select
            value={settings.log_level ?? "INFO"}
            onValueChange={(value) => void onPatch({ log_level: value || "INFO" })}
          >
            <SelectTrigger className="w-full">
              <span>{settings.log_level ?? "INFO"}</span>
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger>
              {LEVELS.map((level) => (
                <SelectItem key={level} value={level}>
                  {level}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Changes apply immediately without restart.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Max log file size (MB)</Label>
          <Input
            type="number"
            min={1}
            max={1024}
            value={logSize}
            onChange={(e) => setLogSize(e.target.value)}
            onBlur={() => void commitNumber("max_log_size_mb", logSize, 1, 1024)}
          />
          <p className="text-xs text-muted-foreground">MB (1–1024). Applies after restart.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Maximum upload file size</Label>
          <Input
            type="number"
            min={1}
            max={1024}
            value={uploadSize}
            onChange={(e) => setUploadSize(e.target.value)}
            onBlur={() => void commitNumber("max_upload_size_mb", uploadSize, 1, 1024)}
          />
          <p className="text-xs text-muted-foreground">
            MB (1–1024). Limits file size when uploading. Applies immediately.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Host status TTL (seconds)</Label>
          <Input
            type="number"
            min={30}
            max={86400}
            value={ttl}
            onChange={(e) => setTtl(e.target.value)}
            onBlur={() => void commitNumber("host_status_ttl_seconds", ttl, 30, 86400)}
          />
        </div>
      </div>
    </SettingsSection>
  );
}
