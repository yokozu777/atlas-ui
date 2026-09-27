import { homedir } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type AtlasUiConfig = {
  clusterctlRoot: string;
  clusterctlFetchedAt?: string;
};

const CONFIG_DIR_NAME = "atlas-ui";
const CONFIG_FILE_NAME = "config.json";

export function configFilePath(): string {
  const override = process.env.ATLAS_UI_CONFIG?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(homedir(), ".config", CONFIG_DIR_NAME, CONFIG_FILE_NAME);
}

export async function loadConfig(): Promise<AtlasUiConfig | null> {
  const envRoot = process.env.ATLAS_CLUSTER_ROOT?.trim();
  try {
    const raw = await readFile(/* turbopackIgnore: true */ configFilePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<AtlasUiConfig>;
    const clusterctlRoot = parsed.clusterctlRoot?.trim();
    if (clusterctlRoot) {
      return {
        clusterctlRoot,
        clusterctlFetchedAt: parsed.clusterctlFetchedAt?.trim() || undefined,
      };
    }
  } catch {
    // missing or invalid — fall through to env
  }
  if (envRoot) {
    return { clusterctlRoot: envRoot };
  }
  return null;
}

export async function saveConfig(config: AtlasUiConfig): Promise<void> {
  const file = configFilePath();
  await mkdir(/* turbopackIgnore: true */ path.dirname(file), { recursive: true });
  let existing: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(
      await readFile(/* turbopackIgnore: true */ file, "utf8"),
    ) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") {
      existing = parsed;
    }
  } catch {
    existing = {};
  }
  const payload: Record<string, unknown> = {
    ...existing,
    clusterctlRoot: config.clusterctlRoot,
  };
  if (config.clusterctlFetchedAt) {
    payload.clusterctlFetchedAt = config.clusterctlFetchedAt;
  }
  await writeFile(
    /* turbopackIgnore: true */ file,
    JSON.stringify(payload, null, 2) + "\n",
  );
}

