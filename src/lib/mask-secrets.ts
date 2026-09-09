const SECRET_KEY = /password|token|secret|key|credential/i;

export function isSecretKey(name: string): boolean {
  return SECRET_KEY.test(name);
}

export function maskSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(maskSecrets);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (isSecretKey(key) && (typeof nested === "string" || typeof nested === "number")) {
        out[key] = "***";
      } else {
        out[key] = maskSecrets(nested);
      }
    }
    return out;
  }
  return value;
}

export function maskArgvPreview(argv: string[]): string {
  const out = [...argv];
  for (let i = 0; i < out.length; i += 1) {
    if (out[i] === "-e" && out[i + 1]) {
      const match = out[i + 1].match(/^([^=]+)=(.*)$/);
      if (match && isSecretKey(match[1])) {
        out[i + 1] = `${match[1]}=***`;
      }
    }
  }
  return `./cluster ${out.join(" ")}`;
}
