import { handle, readJson } from "@/lib/api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson<Record<string, unknown>>(req);
  return handle(async () => {
    const patch: Record<string, unknown> = {};
    for (const k of ["title", "note", "due_at", "priority", "project_id"]) {
      if (k in body) patch[k] = body[k];
    }
    if ("done" in body) patch.done_at = body.done ? new Date().toISOString() : null;

    const res = await db().from("tasks").update(patch).eq("id", id).select("*").single();
    if (res.error) throw new Error(res.error.message);

    const projectId = (res.data as { project_id: string | null }).project_id;
    if (projectId) {
      await db().from("projects").update({ last_active_at: new Date().toISOString() }).eq("id", projectId);
    }
    return { task: res.data };
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async () => {
    const res = await db().from("tasks").delete().eq("id", id);
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });
}
