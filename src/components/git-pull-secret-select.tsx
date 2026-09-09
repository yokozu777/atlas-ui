"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select";
import type { SecretOption } from "@/lib/project-sources";

export const GIT_PULL_NONE = "none";
export const GIT_PULL_INHERIT = "inherit";

export function GitPullSecretSelect({
  id,
  label,
  hint,
  value,
  secrets,
  onValueChange,
  disabled,
  inheritLabel,
  compact,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  secrets: SecretOption[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
  inheritLabel?: string;
  compact?: boolean;
}) {
  const globalSecrets = secrets.filter((row) => row.group === "global");
  const projectSecrets = secrets.filter((row) => row.group === "project");
  const selected =
    value === GIT_PULL_NONE
      ? inheritLabel
        ? inheritLabel
        : "Machine default (SSH_KEY / config.yaml)"
      : value === GIT_PULL_INHERIT
        ? inheritLabel || "Project default"
        : secrets.find((row) => row.id === value)?.name || value;

  return (
    <div className="space-y-2">
      {compact ? null : (
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor={id}>{label}</Label>
          <Button
            variant="link"
            size="xs"
            className="h-auto px-0"
            render={<Link href="/secrets" />}
          >
            <Plus />
            Add SSH key
          </Button>
        </div>
      )}
      <Select
        value={value}
        onValueChange={(next) => onValueChange(next ?? GIT_PULL_NONE)}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full">
          <span className="min-w-0 flex-1 truncate text-left">{selected}</span>
        </SelectTrigger>
        <SelectContent>
          {inheritLabel ? (
            <SelectItem value={GIT_PULL_INHERIT}>{inheritLabel}</SelectItem>
          ) : (
            <SelectItem value={GIT_PULL_NONE}>
              Machine default (SSH_KEY / config.yaml)
            </SelectItem>
          )}
          {globalSecrets.length ? (
            <SelectGroup>
              <SelectLabel>Global</SelectLabel>
              {globalSecrets.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : null}
          {projectSecrets.length ? (
            <SelectGroup>
              <SelectLabel>Project</SelectLabel>
              {projectSecrets.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : null}
        </SelectContent>
      </Select>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
