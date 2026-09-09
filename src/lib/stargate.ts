import type { ProjectKind, StargateProject } from "@/lib/project-types";

let refreshInFlight: Promise<boolean> | null = null;

async function refreshStargateSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch("/api/auth/refresh", { method: "POST" })
      .then((res) => res.ok)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function stargateFetch(
  path: string,
  init?: RequestInit,
  retried = false,
): Promise<Response> {
  const isForm =
    typeof FormData !== "undefined" && init?.body instanceof FormData;
  const headers: Record<string, string> = isForm
    ? {}
    : { "Content-Type": "application/json" };
  const extra = init?.headers;
  if (extra) {
    if (extra instanceof Headers) {
      extra.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(extra)) {
      for (const [key, value] of extra) {
        headers[key] = value;
      }
    } else {
      Object.assign(headers, extra);
    }
  }
  if (isForm) {
    delete headers["Content-Type"];
    delete headers["content-type"];
  }
  const res = await fetch(`/api/hub${path}`, {
    cache: "no-store",
    ...init,
    headers,
  });
  if (res.status === 401 && !retried) {
    const ok = await refreshStargateSession();
    if (ok) {
      return stargateFetch(path, init, true);
    }
  }
  return res;
}

export async function fetchProjects(
  includeArchived = false,
): Promise<StargateProject[]> {
  const q = includeArchived ? "?include_archived=true" : "";
  const res = await stargateFetch(`/projects${q}`);
  const data = (await res.json()) as {
    projects?: StargateProject[];
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || data.detail || "projects failed");
  }
  return data.projects ?? [];
}

export async function fetchProject(id: string): Promise<StargateProject> {
  const res = await stargateFetch(`/projects/${encodeURIComponent(id)}`);
  const data = (await res.json()) as {
    project?: StargateProject;
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || data.detail || "project failed");
  }
  if (!data.project) {
    throw new Error("project missing");
  }
  return data.project;
}

export async function createProject(input: {
  name: string;
  description?: string;
  kind: ProjectKind;
  cluster_id?: string;
  clusterctlRoot?: string;
}): Promise<StargateProject> {
  const res = await stargateFetch("/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const data = (await res.json()) as {
    project?: StargateProject;
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || data.detail || "create failed");
  }
  if (!data.project) {
    throw new Error("create failed");
  }
  return data.project;
}

export async function stargateJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await stargateFetch(path, init);
  const data = (await res.json()) as T & { error?: string; detail?: unknown };
  if (!res.ok) {
    const detail = data.detail;
    const detailText =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail
              .map((item) =>
                typeof item === "object" && item && "msg" in item
                  ? String((item as { msg: unknown }).msg)
                  : JSON.stringify(item),
              )
              .join("; ")
          : undefined;
    throw new Error(data.error || detailText || `stargate ${path} failed`);
  }
  return data;
}

export async function stargateDownload(path: string, fallbackName: string) {
  const res = await stargateFetch(path);
  if (!res.ok) {
    let message = `stargate ${path} failed`;
    try {
      const data = (await res.json()) as { error?: string; detail?: string };
      message = data.error || data.detail || message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") || "";
  const match = /filename="?([^"]+)"?/i.exec(disposition);
  const name = match?.[1] || fallbackName;
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export async function loginStargate(username: string, password: string) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    error?: string;
    user?: { username: string; must_change_password?: boolean };
  };
  if (!res.ok) {
    throw new Error(data.error || "login failed");
  }
  return data;
}

export async function changePasswordStargate(
  oldPassword: string,
  newPassword: string,
) {
  const res = await fetch("/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      old_password: oldPassword,
      new_password: newPassword,
    }),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok) {
    throw new Error(data.error || "password change failed");
  }
  return data;
}

export async function logoutStargate() {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function fetchMe() {
  const res = await fetch("/api/auth/me", { cache: "no-store" });
  if (res.status === 401) {
    const ok = await refreshStargateSession();
    if (ok) {
      const retry = await fetch("/api/auth/me", { cache: "no-store" });
      if (!retry.ok) {
        return null;
      }
      return retry.json() as Promise<{
        username?: string;
        remote?: boolean;
        must_change_password?: boolean;
      }>;
    }
    return null;
  }
  if (!res.ok) {
    return null;
  }
  return res.json() as Promise<{
    username?: string;
    remote?: boolean;
    must_change_password?: boolean;
  }>;
}
