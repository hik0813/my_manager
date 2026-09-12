import { handle, readJson } from "@/lib/api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson<Record<string, unknown>>(req);
  return handle(async () => {
    const patch: Record<string, unknown> = {};
    for (const k of ["name", "status", "progress", "next_action"]) if (k in body) patch[k] = body[k];
    // 손을 댔다는 것 자체가 활동이다
    patch.last_active_at = new Date().toISOString();

    const res = await db().from("projects").update(patch).eq("id", id).select("*").single();
    if (res.error) throw new Error(res.error.message);
    return { project: res.data };
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async () => {
    const res = await db().from("projects").delete().eq("id", id);
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });
}
