import { handle, readJson } from "@/lib/api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const year = new URL(req.url).searchParams.get("year");
  return handle(async () => {
    let q = db().from("timeline_events").select("*").order("happened_at", { ascending: false }).limit(300);
    if (year) q = q.gte("happened_at", `${year}-01-01`).lte("happened_at", `${year}-12-31`);
    const res = await q;
    if (res.error) throw new Error(res.error.message);
    return { events: res.data };
  });
}

export async function POST(req: Request) {
  const body = await readJson<{ title?: string; kind?: string; happened_at?: string; body?: string }>(req);
  return handle(async () => {
    if (!body.title?.trim() || !body.happened_at) throw new Error("제목과 날짜가 필요합니다.");
    const res = await db()
      .from("timeline_events")
      .insert({
        title: body.title.trim(),
        kind: body.kind ?? "event",
        happened_at: body.happened_at,
        body: body.body ?? null,
      })
      .select("*")
      .single();
    if (res.error) throw new Error(res.error.message);
    return { event: res.data };
  });
}
