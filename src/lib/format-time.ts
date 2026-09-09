export function formatSeconds(total: number): string {
  const safe = Math.max(0, Math.round(total));
  const seconds = safe % 60;
  const minutes = Math.floor(safe / 60) % 60;
  const hours = Math.floor(safe / 3600);
  if (hours > 0) {
    if (minutes === 0 && seconds === 0) {
      return `${hours}h`;
    }
    if (seconds === 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}

export function formatDuration(
  startedAt?: string | null,
  finishedAt?: string | null,
): string | null {
  if (!startedAt || !finishedAt) {
    return null;
  }
  const start = Date.parse(startedAt);
  const end = Date.parse(finishedAt);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return null;
  }
  return formatSeconds((end - start) / 1000);
}

export function formatAge(iso?: string | null, now = Date.now()): string | null {
  if (!iso) {
    return null;
  }
  const t = Date.parse(iso);
  if (Number.isNaN(t)) {
    return null;
  }
  const seconds = Math.max(0, Math.round((now - t) / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function metaString(
  meta: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = meta?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export function metaExitCode(meta: Record<string, unknown> | null): number | null {
  const value = meta?.exit_code;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function runCommandLabel(meta: Record<string, unknown> | null): string {
  const phases = meta?.phases;
  if (Array.isArray(phases) && phases.length > 0) {
    return phases.map(String).join(", ");
  }
  return metaString(meta, "command") ?? metaString(meta, "header") ?? "—";
}
