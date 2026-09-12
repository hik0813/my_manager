import { handle, readJson } from "@/lib/api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const res = await db().from("watchlist").select("*").order("created_at", { ascending: false });
    if (res.error) throw new Error(res.error.message);
    return { watchlist: res.data };
  });
}

/** 찜 등록. Steam 위시리스트는 비공식 엔드포인트 대신 앱ID 수동 등록. */
export async function POST(req: Request) {
  const body = await readJson<{ kind?: string; ref?: string; label?: string; threshold_pct?: number }>(req);
  return handle(async () => {
    if (!body.kind || !body.ref?.trim()) throw new Error("kind와 ref가 필요합니다. (예: steam_app / 730)");
    const res = await db()
      .from("watchlist")
      .upsert(
        {
          kind: body.kind,
          ref: body.ref.trim(),
          label: body.label?.trim() || body.ref.trim(),
          threshold_pct: body.threshold_pct ?? 5,
        },
        { onConflict: "kind,ref" },
      )
      .select("*")
      .single();
    if (res.error) throw new Error(res.error.message);
    return { watch: res.data };
  });
}
