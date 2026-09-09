import { readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";

export type RunLogEntry = {
  stamp: string;
  dir: string;
  meta: Record<string, unknown> | null;
};

export async function listRunLogs(logsDir: string): Promise<RunLogEntry[]> {
  let names: string[];
  try {
    names = await readdir(/* turbopackIgnore: true */ logsDir);
  } catch {
    return [];
  }
  const entries: RunLogEntry[] = [];
  for (const name of names) {
    if (name === "latest" || name === "run_cluster.log") {
      continue;
    }
    const dir = path.join(logsDir, name);
    let meta: Record<string, unknown> | null = null;
    try {
      meta = JSON.parse(
        await readFile(/* turbopackIgnore: true */ path.join(dir, "meta.json"), "utf8"),
      ) as Record<string, unknown>;
    } catch {
      meta = null;
    }
    entries.push({ stamp: name, dir, meta });
  }
  entries.sort((a, b) => b.stamp.localeCompare(a.stamp));
  return entries;
}

export async function readRunLog(logsDir: string, stamp: string): Promise<string> {
  const safe = path.basename(stamp);
  const file = path.join(logsDir, safe, "run.log");
  const resolvedLogs = await realpath(/* turbopackIgnore: true */ logsDir);
  const resolvedFile = await realpath(/* turbopackIgnore: true */ file);
  if (!resolvedFile.startsWith(resolvedLogs + path.sep)) {
    throw new Error("invalid log path");
  }
  return readFile(/* turbopackIgnore: true */ resolvedFile, "utf8");
}
