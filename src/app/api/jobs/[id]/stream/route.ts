import { followJobLog, getJob } from "@/server/jobs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    if (!getJob(id)) {
      return new Response(JSON.stringify({ error: "job not found" }), { status: 404 });
    }
    const stream = followJobLog(id);
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 400 });
  }
}
