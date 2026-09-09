import type { AnsiColor, AnsiToken } from "./types";

const FG_BASIC: Record<number, AnsiColor> = {
  30: "black",
  31: "red",
  32: "green",
  33: "yellow",
  34: "blue",
  35: "magenta",
  36: "cyan",
  37: "white",
  90: "bright-black",
  91: "bright-red",
  92: "bright-green",
  93: "bright-yellow",
  94: "bright-blue",
  95: "bright-magenta",
  96: "bright-cyan",
  97: "bright-white",
};

export const ANSI_FG_CLASS: Record<AnsiColor, string> = {
  black: "text-muted-foreground",
  red: "text-destructive",
  green: "text-success",
  yellow: "text-warning",
  blue: "text-info",
  magenta: "text-info",
  cyan: "text-info",
  white: "text-foreground",
  "bright-black": "text-muted-foreground",
  "bright-red": "text-destructive",
  "bright-green": "text-success",
  "bright-yellow": "text-warning",
  "bright-blue": "text-info",
  "bright-magenta": "text-info",
  "bright-cyan": "text-info",
  "bright-white": "text-foreground",
};

type Style = {
  fg?: AnsiColor;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
};

function stylesEqual(a: Style, b: Style): boolean {
  return (
    a.fg === b.fg &&
    a.bold === b.bold &&
    a.dim === b.dim &&
    a.underline === b.underline
  );
}

function applySgr(style: Style, params: number[]): Style {
  let next: Style = { ...style };
  let i = 0;
  while (i < params.length) {
    const code = params[i] ?? 0;
    if (code === 0) {
      next = {};
      i += 1;
      continue;
    }
    if (code === 1) {
      next = { ...next, bold: true, dim: undefined };
      i += 1;
      continue;
    }
    if (code === 2) {
      next = { ...next, dim: true, bold: undefined };
      i += 1;
      continue;
    }
    if (code === 4) {
      next = { ...next, underline: true };
      i += 1;
      continue;
    }
    if (code === 22) {
      next = { ...next, bold: undefined, dim: undefined };
      i += 1;
      continue;
    }
    if (code === 24) {
      next = { ...next, underline: undefined };
      i += 1;
      continue;
    }
    if (code === 39) {
      next = { ...next, fg: undefined };
      i += 1;
      continue;
    }
    const fg = FG_BASIC[code];
    if (fg) {
      next = { ...next, fg };
      i += 1;
      continue;
    }
    if (code === 38 || code === 48) {
      const mode = params[i + 1];
      if (mode === 5) {
        i += 3;
        continue;
      }
      if (mode === 2) {
        i += 5;
        continue;
      }
      i += 2;
      continue;
    }
    i += 1;
  }
  return next;
}

function readCsiEnd(raw: string, start: number): number {
  let i = start;
  while (i < raw.length) {
    const code = raw.charCodeAt(i);
    if (code >= 0x40 && code <= 0x7e) {
      return i + 1;
    }
    i += 1;
  }
  return raw.length;
}

function skipEscape(raw: string, start: number): number {
  const next = raw[start + 1];
  if (next === "[") {
    return readCsiEnd(raw, start + 2);
  }
  if (next === "]") {
    let i = start + 2;
    while (i < raw.length) {
      const ch = raw.charCodeAt(i);
      if (ch === 0x07) {
        return i + 1;
      }
      if (ch === 0x1b && raw[i + 1] === "\\") {
        return i + 2;
      }
      i += 1;
    }
    return raw.length;
  }
  if (next === "(" || next === ")") {
    return Math.min(raw.length, start + 3);
  }
  return Math.min(raw.length, start + 2);
}

export function stripAndParseAnsi(raw: string): {
  plain: string;
  tokens: AnsiToken[];
} {
  const tokens: AnsiToken[] = [];
  let plain = "";
  let style: Style = {};
  let i = 0;

  const push = (text: string) => {
    if (!text) {
      return;
    }
    plain += text;
    const last = tokens[tokens.length - 1];
    if (last && stylesEqual(last, style)) {
      last.text += text;
      return;
    }
    tokens.push({
      text,
      fg: style.fg,
      bold: style.bold,
      dim: style.dim,
      underline: style.underline,
    });
  };

  while (i < raw.length) {
    const ch = raw.charCodeAt(i);
    if (ch === 0x1b) {
      const end = skipEscape(raw, i);
      if (raw[i + 1] === "[") {
        const body = raw.slice(i + 2, end - 1);
        const cmd = raw[end - 1];
        if (cmd === "m") {
          const params = body
            .split(";")
            .filter((part) => part.length > 0)
            .map((part) => Number.parseInt(part, 10))
            .map((n) => (Number.isFinite(n) ? n : 0));
          style = applySgr(style, params.length ? params : [0]);
        }
      }
      i = end;
      continue;
    }
    if (ch === 0x07) {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < raw.length) {
      const code = raw.charCodeAt(j);
      if (code === 0x1b || code === 0x07) {
        break;
      }
      j += 1;
    }
    push(raw.slice(i, j));
    i = j;
  }

  if (tokens.length === 0) {
    return { plain, tokens: [{ text: plain }] };
  }
  return { plain, tokens };
}
