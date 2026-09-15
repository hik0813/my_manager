import { handle, readJson } from "@/lib/api";
import { addDays, kstDate } from "@/lib/dates";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** 히트맵용: 기본 최근 1년 */
export async function GET(req: Request) {
  const days = Number(new URL(req.url).searchParams.get("days") ?? 365);
  return handle(async () => {
    const from = addDays(kstDate(), -Math.min(400, Math.max(7, days)));
    const res = await db().from("daily_logs").select("*").gte("date", from).order("date", { ascending: false });
    if (res.error) throw new Error(res.error.message);
    return { logs: res.data, from, today: kstDate() };
  });
}

export async function POST(req: Request) {
  const body = await readJson<{ one_liner?: string; mood?: number | null; date?: string }>(req);
  return handle(async () => {
    if (!body.one_liner?.trim()) throw new Error("한 줄이 비어 있습니다.");
    const res = await db()
      .from("daily_logs")
      .upsert(
        { date: body.date ?? kstDate(), one_liner: body.one_liner.trim(), mood: body.mood ?? null },
        { onConflict: "date" },
      )
      .select("*")
      .single();
    if (res.error) throw new Error(res.error.message);
    return { log: res.data };
  });
}
