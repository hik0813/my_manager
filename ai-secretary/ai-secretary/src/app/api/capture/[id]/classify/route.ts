import { handle } from "@/lib/api";
import { classifyText, materialize } from "@/lib/capture";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async () => {
    const sb = db();
    const cur = await sb.from("captures").select("*").eq("id", id).single();
    if (cur.error) throw new Error(cur.error.message);
    const row = cur.data as { id: string; text: string; type: string };
    if (row.type !== "pending") return { capture: row };

    const projects = await sb.from("projects").select("name").eq("status", "active");
    const names = ((projects.data ?? []) as { name: string }[]).map((p) => p.name);

    try {
      const classification = await classifyText(row.text, names);
      const target = await materialize(classification, row.text);
      const updated = await sb
        .from("captures")
        .update({
          type: classification.type,
          target_table: target.table,
          target_id: target.id,
          fields: classification as unknown as Record<string, unknown>,
          error: null,
        })
        .eq("id", id)
        .select("*")
        .single();
      if (updated.error) throw new Error(updated.error.message);
      return { capture: updated.data };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // 분류가 실패해도 원문은 남는다. 사용자가 탭 한 번으로 직접 지정할 수 있다.
      const failed = await sb
        .from("captures")
        .update({ type: "failed", error: message.slice(0, 300) })
        .eq("id", id)
        .select("*")
        .single();
      if (failed.error) throw new Error(failed.error.message);
      return { capture: failed.data };
    }
  });
}
