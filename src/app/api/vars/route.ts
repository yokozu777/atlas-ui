import { NextResponse } from "next/server";

import { loadVarsCatalog, readVarsFile, writeVarsFile } from "@/server/vars";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clusterId = url.searchParams.get("clusterId") ?? "";
  const rel = url.searchParams.get("rel");
  if (!clusterId) {
    return NextResponse.json({ error: "clusterId required" }, { status: 400 });
  }
  try {
    if (rel) {
      const payload = await readVarsFile(clusterId, rel);
      return NextResponse.json(payload);
    }
    const catalog = await loadVarsCatalog(clusterId);
    return NextResponse.json(catalog);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  const body = (await request.json()) as {
    clusterId?: string;
    rel?: string;
    content?: string;
  };
  if (!body.clusterId || !body.rel) {
    return NextResponse.json({ error: "clusterId and rel required" }, { status: 400 });
  }
  if (typeof body.content !== "string") {
    return NextResponse.json({ error: "content must be a string" }, { status: 400 });
  }
  try {
    const file = await writeVarsFile(body.clusterId, body.rel, body.content);
    return NextResponse.json({ ok: true, file });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
