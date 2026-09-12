import { fail, handle, readJson } from "@/lib/api";
import { rematerialize } from "@/lib/capture";
import { db } from "@/lib/db";
import type { CaptureType } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID: CaptureType[] = ["task", "idea", "meal", "error", "log"];

/** 분류가 틀렸을 때 카테고리 변경 (탭 한 번) */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { type } = await readJson<{ type?: CaptureType }>(req);
  if (!type || !VALID.includes(type)) return fail(`type은 ${VALID.join(" | ")} 중 하나여야 합니다.`, 400);

  return handle(async () => {
    const target = await rematerialize(id, type);
    const res = await db()
      .from("captures")
      .update({ type, target_table: target.table, target_id: target.id, error: null })
      .eq("id", id)
      .select("*")
      .single();
    if (res.error) throw new Error(res.error.message);
    return { capture: res.data };
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async () => {
    const sb = db();
    const cur = await sb.from("captures").select("target_table, target_id").eq("id", id).single();
    const row = cur.data as { target_table: string | null; target_id: string | null } | null;
    if (row?.target_table && row.target_id && row.target_table !== "daily_logs") {
      await sb.from(row.target_table).delete().eq("id", row.target_id);
    }
    const res = await sb.from("captures").delete().eq("id", id);
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });
}
