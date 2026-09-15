import { handle, readJson } from "@/lib/api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const res = await db().from("goals").select("*").order("target_at", { ascending: true, nullsFirst: false });
    if (res.error) throw new Error(res.error.message);
    return { goals: res.data };
  });
}

export async function POST(req: Request) {
  const body = await readJson<{ title?: string; target_at?: string | null; metric?: string | null }>(req);
  return handle(async () => {
    if (!body.title?.trim()) throw new Error("목표 제목이 없습니다.");
    const res = await db()
      .from("goals")
      .insert({ title: body.title.trim(), target_at: body.target_at ?? null, metric: body.metric ?? null })
      .select("*")
      .single();
    if (res.error) throw new Error(res.error.message);
    return { goal: res.data };
  });
}
