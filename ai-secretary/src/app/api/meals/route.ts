import { handle, readJson } from "@/lib/api";
import { kstDate, kstDayRange } from "@/lib/dates";
import { db } from "@/lib/db";
import { searchFood } from "@/lib/mfds";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const date = new URL(req.url).searchParams.get("date") ?? kstDate();
  return handle(async () => {
    const { from, to } = kstDayRange(date);
    const res = await db()
      .from("meals")
      .select("*")
      .gte("eaten_at", from)
      .lt("eaten_at", to)
      .order("eaten_at", { ascending: true });
    if (res.error) throw new Error(res.error.message);
    const meals = res.data as { kcal: number | null }[];
    const kcal = meals.reduce((sum, m) => sum + (Number(m.kcal) || 0), 0);
    return { meals: res.data, total_kcal: Math.round(kcal), date };
  });
}

/** 음식명만 주면 식약처 조회 → 실패하면 준 값 그대로 저장(수동 폴백). */
export async function POST(req: Request) {
  const body = await readJson<{ name?: string; kcal?: number | null; carb?: number | null; protein?: number | null; fat?: number | null }>(req);
  return handle(async () => {
    if (!body.name?.trim()) throw new Error("음식 이름이 없습니다.");
    let row = {
      name: body.name.trim(),
      kcal: body.kcal ?? null,
      carb: body.carb ?? null,
      protein: body.protein ?? null,
      fat: body.fat ?? null,
      source: "manual",
    };

    if (row.kcal == null) {
      try {
        const hit = (await searchFood(row.name, 1))[0];
        if (hit) row = { ...row, kcal: hit.kcal, carb: hit.carb, protein: hit.protein, fat: hit.fat, source: "mfds" };
      } catch {
        /* 조회 실패 → 수동 값으로 저장 */
      }
    }

    const res = await db().from("meals").insert(row).select("*").single();
    if (res.error) throw new Error(res.error.message);
    return { meal: res.data };
  });
}
