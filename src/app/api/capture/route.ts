import { handle, readJson } from "@/lib/api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 8);
  return handle(async () => {
    const res = await db()
      .from("captures")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(Math.min(50, Math.max(1, limit)));
    if (res.error) throw new Error(res.error.message);
    return { captures: res.data };
  });
}

/** 저장은 무조건 빠르게. 분류는 별도 라우트가 백그라운드에서 한다. */
export async function POST(req: Request) {
  const { text } = await readJson<{ text?: string }>(req);
  if (!text || !text.trim()) return handle(async () => ({ error: "빈 내용은 저장하지 않는다." }));
  return handle(async () => {
    const res = await db().from("captures").insert({ text: text.trim() }).select("*").single();
    if (res.error) throw new Error(res.error.message);
    return { capture: res.data };
  });
}
