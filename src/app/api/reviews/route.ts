import { handle, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { gradeReview } from "@/lib/reviews";

export const dynamic = "force-dynamic";

/** 오늘 풀 복습 문제 */
export async function GET() {
  return handle(async () => {
    const res = await db()
      .from("reviews")
      .select("*")
      .is("done_at", null)
      .lte("due_at", new Date().toISOString())
      .order("due_at", { ascending: true })
      .limit(5);
    if (res.error) throw new Error(res.error.message);
    return { reviews: res.data };
  });
}

export async function POST(req: Request) {
  const { id, choice } = await readJson<{ id?: string; choice?: number }>(req);
  return handle(async () => {
    if (!id || typeof choice !== "number") throw new Error("id와 choice가 필요합니다.");
    return gradeReview(id, choice);
  });
}
