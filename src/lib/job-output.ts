export function stripJobDecorations(log: string): string {
  return log
    .replace(/^\$ \.\/cluster[^\n]*\n/, "")
    .replace(/\n\[exit [^\n]*\]\s*$/, "")
    .replace(/\n\[canceled[^\n]*\]\s*$/, "")
    .replace(/\n\[spawn error\][^\n]*\s*$/, "")
    .trim();
}

export function parseJobJson<T>(log: string): T {
  const body = stripJobDecorations(log);
  return JSON.parse(body) as T;
}
