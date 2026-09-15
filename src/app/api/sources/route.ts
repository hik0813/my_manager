import { handle } from "@/lib/api";
import { db } from "@/lib/db";
import { SOURCE_DEFS, syncSources } from "@/lib/collectors/run";

export const dynamic = "force-dynamic";

/** 소스 헬스체크 화면용. 3회 이상 실패한 소스가 위로 온다. */
export async function GET() {
  return handle(async () => {
    await syncSources();
    const res = await db().from("sources").select("*").order("fail_count", { ascending: false });
    if (res.error) throw new Error(res.error.message);

    const counts = await db()
      .from("items")
      .select("source_key")
      .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
      .limit(2000);
    const per: Record<string, number> = {};
    for (const r of ((counts.data ?? []) as { source_key: string }[])) {
      const base = r.source_key.split(":")[0];
      per[base] = (per[base] ?? 0) + 1;
    }

    return {
      sources: res.data,
      items_7d: per,
      declared: SOURCE_DEFS.length,
    };
  });
}
