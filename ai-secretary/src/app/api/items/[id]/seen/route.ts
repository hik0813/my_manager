import { handle } from "@/lib/api";
import { db } from "@/lib/db";
import { SOURCE_DEFS } from "@/lib/collectors/run";

export const dynamic = "force-dynamic";

/** 열람 기록 = 스코어링의 학습 데이터. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async () => {
    const sb = db();
    const res = await sb.from("items").update({ seen_at: new Date().toISOString() }).eq("id", id).select("source_key").single();
    if (res.error) throw new Error(res.error.message);

    const key = (res.data as { source_key: string }).source_key;
    const def = SOURCE_DEFS.find((d) => d.key === key || d.key === key.split(":")[0]);
    await sb.from("views").insert({ category: def?.category ?? "etc" });
    return { ok: true };
  });
}
