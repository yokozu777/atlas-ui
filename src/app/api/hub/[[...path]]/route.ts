import { NextResponse } from "next/server";

import {
  createLocalProject,
  getLocalProject,
  listLocalProjects,
} from "@/server/projects-local";
import { stargateAccessToken, stargateApiUrl } from "@/server/stargate";
import type { ProjectKind } from "@/lib/project-types";
import { isProjectKind } from "@/lib/project-types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

async function proxyHub(request: Request, pathname: string) {
  const base = stargateApiUrl();
  if (!base) {
    return null;
  }
  const url = new URL(request.url);
  const target = `${base}/${pathname}${url.search}`;
  const token = await stargateAccessToken();
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }
  const method = request.method;
  const body =
    method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();
  const upstream = await fetch(target, {
    method,
    headers,
    body,
    cache: "no-store",
  });
  const out = new Headers();
  const pass = ["content-type", "cache-control", "x-accel-buffering", "content-disposition"];
  for (const key of pass) {
    const value = upstream.headers.get(key);
    if (value) {
      out.set(key, value);
    }
  }
  if (upstream.headers.get("content-type")?.includes("text/event-stream")) {
    out.set("cache-control", "no-cache");
    out.set("x-accel-buffering", "no");
  }
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: out,
  });
}

async function localProjects(request: Request, parts: string[]) {
  if (parts.length === 0 || (parts.length === 1 && parts[0] === "")) {
    if (request.method === "GET") {
      const projects = await listLocalProjects();
      return NextResponse.json({ success: true, projects });
    }
    if (request.method === "POST") {
      const body = (await request.json()) as {
        name?: string;
        description?: string;
        kind?: string;
        cluster_id?: string;
        clusterctlRoot?: string;
      };
      if (!isProjectKind(body.kind)) {
        return NextResponse.json(
          { success: false, error: "kind is required (atlas or ansible)" },
          { status: 400 },
        );
      }
      try {
        const project = await createLocalProject({
          name: body.name ?? "",
          description: body.description,
          kind: body.kind as ProjectKind,
          cluster_id: body.cluster_id,
          clusterctlRoot: body.clusterctlRoot,
        });
        return NextResponse.json({ success: true, project });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ success: false, error: message }, { status: 400 });
      }
    }
  }
  if (parts.length === 1 && request.method === "GET") {
    const project = await getLocalProject(parts[0]);
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, project });
  }
  return NextResponse.json(
    {
      success: false,
      error:
        "Hub API is not configured (set HUB_API_URL). Local mode only supports project list/create.",
    },
    { status: 503 },
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  const parts = (await context.params).path ?? [];
  const pathname = `api/${parts.join("/")}`;
  const remote = await proxyHub(request, pathname);
  if (remote) {
    return remote;
  }
  if (parts[0] === "projects") {
    return localProjects(request, parts.slice(1));
  }
  return NextResponse.json(
    { success: false, error: "HUB_API_URL is not set" },
    { status: 503 },
  );
}

export const POST = GET;
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
