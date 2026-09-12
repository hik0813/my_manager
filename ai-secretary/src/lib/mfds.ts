import { env } from "./env";
import { fetchJson } from "./http";

/**
 * 식약처 식품영양성분 DB (공공데이터포털).
 * 응답 필드 코드는 API 버전에 따라 다르다. 아래 MAP만 고치면 된다.
 */
const FIELD = {
  name: ["FOOD_NM_KR", "DESC_KOR"],
  kcal: ["AMT_NUM1", "NUTR_CONT1"],
  carb: ["AMT_NUM6", "NUTR_CONT2"],
  protein: ["AMT_NUM3", "NUTR_CONT3"],
  fat: ["AMT_NUM4", "NUTR_CONT4"],
  serving: ["SERVING_SIZE", "SERVING_WT"],
} as const;

export type Nutrition = {
  name: string;
  kcal: number | null;
  carb: number | null;
  protein: number | null;
  fat: number | null;
  serving: string | null;
};

function firstOf(row: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

function num(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** 음식명 검색. 키가 없거나 결과가 없으면 빈 배열 → 화면은 수동 입력으로 폴백한다. */
export async function searchFood(query: string, limit = 5): Promise<Nutrition[]> {
  const key = env("DATA_GO_KR_KEY");
  if (!key || !query.trim()) return [];

  const url =
    `https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo01/getFoodNtrCpntDbInq01` +
    `?serviceKey=${encodeURIComponent(key)}&type=json&numOfRows=${limit}&pageNo=1` +
    `&FOOD_NM_KR=${encodeURIComponent(query.trim())}`;

  const json = await fetchJson<{ body?: { items?: Record<string, unknown>[] }; response?: { body?: { items?: Record<string, unknown>[] } } }>(
    url,
    {},
    { timeoutMs: 10_000, retries: 1 },
  );

  const items = json.body?.items ?? json.response?.body?.items ?? [];
  return items.map((row) => ({
    name: firstOf(row, FIELD.name) ?? query,
    kcal: num(firstOf(row, FIELD.kcal)),
    carb: num(firstOf(row, FIELD.carb)),
    protein: num(firstOf(row, FIELD.protein)),
    fat: num(firstOf(row, FIELD.fat)),
    serving: firstOf(row, FIELD.serving),
  }));
}
