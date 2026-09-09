const DEFAULT_DOC = "ui/docs/index.md";

export function defaultDocId(): string {
  return DEFAULT_DOC;
}

export function docsHref(id: string): string {
  if (!id || id === DEFAULT_DOC) {
    return "/docs";
  }
  return `/docs?doc=${encodeURIComponent(id)}`;
}

export function parseDocId(raw: string | null | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = (value ?? "").replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!trimmed) {
    return DEFAULT_DOC;
  }
  if (trimmed.startsWith("clusterctl/") || trimmed.startsWith("ui/")) {
    const id = normalizeDocId(trimmed);
    const parsed = sourceAndRel(id);
    if (parsed && isAllowedDocRel(parsed.rel)) {
      return id;
    }
  }
  return DEFAULT_DOC;
}

export function normalizeDocId(id: string): string {
  const parts: string[] = [];
  for (const part of id.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}

function sourceAndRel(id: string): { source: "ui" | "clusterctl"; rel: string } | null {
  if (id.startsWith("clusterctl/")) {
    return { source: "clusterctl", rel: id.slice("clusterctl/".length) };
  }
  if (id.startsWith("ui/")) {
    return { source: "ui", rel: id.slice("ui/".length) };
  }
  return null;
}

export function isAllowedDocRel(rel: string): boolean {
  const n = rel.replace(/\\/g, "/");
  if (!n || n.startsWith("/") || n.split("/").includes("..")) {
    return false;
  }
  if (!n.endsWith(".md")) {
    return false;
  }
  if (!n.includes("/")) {
    return true;
  }
  return n.startsWith("docs/") || n.startsWith("documentation/");
}

export function menuDocId(currentId: string): string {
  return currentId.startsWith("clusterctl/")
    ? "clusterctl/docs/index.md"
    : "ui/docs/index.md";
}

export function isAllowedHandbookRel(rel: string): boolean {
  const n = rel.replace(/\\/g, "/");
  if (!n || n.startsWith("/") || n.split("/").includes("..")) {
    return false;
  }
  if (!n.endsWith(".md")) {
    return false;
  }
  if (n === "README.md") {
    return true;
  }
  return n.startsWith("docs/");
}

export function resolveRelativeMd(fromPath: string, href: string): string | null {
  const raw = href.trim();
  if (!raw || raw.startsWith("#") || /^[a-z]+:/i.test(raw) || raw.startsWith("/")) {
    return null;
  }
  const [pathPart] = raw.split("#");
  if (!pathPart) {
    return null;
  }
  const decoded = decodeURIComponent(pathPart).replace(/\\/g, "/");
  if (!decoded.endsWith(".md")) {
    return null;
  }
  const from = fromPath.replace(/\\/g, "/");
  const slash = from.lastIndexOf("/");
  const fromDir = slash === -1 ? "" : from.slice(0, slash);
  const combined = normalizeDocId(fromDir ? `${fromDir}/${decoded}` : decoded);
  if (!combined.endsWith(".md")) {
    return null;
  }
  return combined;
}

export function resolveDocLink(fromId: string, href: string): string | null {
  const raw = href.trim();
  if (!raw || raw.startsWith("#") || /^[a-z]+:/i.test(raw)) {
    return null;
  }
  const [pathPart] = raw.split("#");
  if (!pathPart) {
    return null;
  }
  if (pathPart.startsWith("/docs")) {
    try {
      const url = new URL(pathPart, "http://local");
      return parseDocId(url.searchParams.get("doc"));
    } catch {
      return null;
    }
  }
  const decoded = decodeURIComponent(pathPart).replace(/\\/g, "/");
  if (decoded.startsWith("clusterctl/") || decoded.startsWith("ui/")) {
    const id = normalizeDocId(decoded);
    const parsed = sourceAndRel(id);
    if (!parsed || !isAllowedDocRel(parsed.rel)) {
      return null;
    }
    return id;
  }
  if (!decoded.endsWith(".md")) {
    return null;
  }
  const from = sourceAndRel(fromId);
  if (!from) {
    return null;
  }
  const slash = from.rel.lastIndexOf("/");
  const fromDir = slash === -1 ? from.source : `${from.source}/${from.rel.slice(0, slash)}`;
  const combined = normalizeDocId(`${fromDir}/${decoded}`);
  const parsed = sourceAndRel(combined);
  if (!parsed || parsed.source !== from.source || !isAllowedDocRel(parsed.rel)) {
    return null;
  }
  return combined;
}
