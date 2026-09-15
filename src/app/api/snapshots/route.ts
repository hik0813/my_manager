import { handle, readJson } from "@/lib/api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** 최근 값 + 전일 대비 변화율 */
export async function GET(req: Request) {
  const metric = new URL(req.url).searchParams.get("metric_key");
  return handle(async () => {
    let q = db().from("snapshots").select("*").order("captured_at", { ascending: false }).limit(200);
    if (metric) q = q.eq("metric_key", metric);
    const res = await q;
    if (res.error) throw new Error(res.error.message);

    const rows = (res.data ?? []) as { metric_key: string; value: number; label: string | null; captured_at: string }[];
    const latest = new Map<string, { metric_key: string; label: string | null; value: number; captured_at: string; change_pct: number | null }>();
    for (const r of rows) {
      const cur = latest.get(r.metric_key);
      if (!cur) latest.set(r.metric_key, { ...r, value: Number(r.value), change_pct: null });
      else if (cur.change_pct === null && Number(r.value) !== 0) {
        cur.change_pct = ((cur.value - Number(r.value)) / Math.abs(Number(r.value))) * 100;
      }
    }
    return { snapshots: rows, latest: [...latest.values()] };
  });
}

/**
 * 수동 입력.
 * 자동 수집이 막힌 지표(포챔스 시즌별 사용률 등)를 직접 넣는 자리다.
 */
export async function POST(req: Request) {
  const body = await readJson<{ metric_key?: string; value?: number; label?: string }>(req);
  return handle(async () => {
    if (!body.metric_key?.trim() || typeof body.value !== "number") {
      throw new Error("metric_key와 숫자 value가 필요합니다. (예: pochams_usage|가디안 / 12.4)");
    }
    const res = await db()
      .from("snapshots")
      .insert({ metric_key: body.metric_key.trim(), value: body.value, label: body.label ?? null, meta: { manual: true } })
      .select("*")
      .single();
    if (res.error) throw new Error(res.error.message);
    return { snapshot: res.data };
  });
}
