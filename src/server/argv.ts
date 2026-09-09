const SUBCOMMANDS = new Set([
  "use",
  "run",
  "plan",
  "stages",
  "list",
  "init",
  "config",
  "workspace",
  "validate",
  "smoke",
  "playbooks",
  "repos",
  "limits",
  "vars",
]);

const MUTATING_COMMANDS = new Set(["run", "init"]);

export function assertSafeArgv(argv: string[]): string[] {
  if (!Array.isArray(argv) || argv.length === 0) {
    throw new Error("argv must be a non-empty array");
  }
  const cleaned = argv.map((item) => {
    if (typeof item !== "string") {
      throw new Error("argv entries must be strings");
    }
    if (item.includes("\0")) {
      throw new Error("argv must not contain NUL");
    }
    return item;
  });
  const command = cleaned[0];
  if (!SUBCOMMANDS.has(command)) {
    throw new Error(`unsupported clusterctl command: ${command}`);
  }
  if (command === "playbooks" || command === "repos") {
    const sub = cleaned[1];
    if (!sub || !["sync", "status", "show"].includes(sub)) {
      throw new Error(`${command} requires sync|status|show`);
    }
  }
  if (command === "workspace") {
    const sub = cleaned[1];
    if (!sub || !["show", "id", "reset"].includes(sub)) {
      throw new Error("workspace requires show|id|reset");
    }
  }
  if (command === "config") {
    const sub = cleaned[1];
    if (!sub || !["show", "effective"].includes(sub)) {
      throw new Error("config requires show|effective");
    }
  }
  return cleaned;
}

export function isMutatingArgv(argv: string[]): boolean {
  const command = argv[0];
  if (MUTATING_COMMANDS.has(command)) {
    return true;
  }
  if ((command === "repos" || command === "playbooks") && argv[1] === "sync") {
    return true;
  }
  if (command === "workspace" && argv[1] === "reset") {
    return true;
  }
  return false;
}

export function injectClusterFlag(argv: string[], clusterId?: string): string[] {
  if (!clusterId) {
    return argv;
  }
  if (argv.includes("--cluster")) {
    return argv;
  }
  if (argv[0] === "use" || argv[0] === "init") {
    return argv;
  }
  return [argv[0], "--cluster", clusterId, ...argv.slice(1)];
}
