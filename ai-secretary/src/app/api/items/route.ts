import { handle } from "@/lib/api";
import { db } from "@/lib/db";
import { SOURCE_DEFS } from "@/lib/collectors/run";
import type { Item } from "@/lib/types";

export const dynamic = "force-dynamic";

export type FeedGroup = {
  category: string;
  title: string;
  items: Item[];
};

const CATEGORY_LABEL: Record<string, string> = {
  dev: "개발 · IT",
  ai: "AI",
  game: "게임",
  gamedev: "게임 개발",
  security: "보안",
  hardware: "하드웨어",
  music: "음악",
  learn: "학습",
  etc: "기타",
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? 7);
  const category = url.searchParams.get("category");

  return handle(async () => {
    const since = new Date(Date.now() - Math.min(30, Math.max(1, days)) * 86_400_000).toISOString();
    const res = await db()
      .from("items")
      .select("*")
      .gte("created_at", since)
      .order("score", { ascending: false })
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(400);
    if (res.error) throw new Error(res.error.message);

    const catOf: Record<string, string> = {};
    const titleOf: Record<string, string> = {};
    for (const d of SOURCE_DEFS) {
      catOf[d.key] = d.category;
      titleOf[d.key] = d.title;
    }

    const items = (res.data as Item[]).map((i) => ({
      ...i,
      payload: { ...i.payload, _source_title: titleOf[i.source_key] ?? titleOf[i.source_key.split(":")[0]] ?? i.source_key },
    }));

    const groups = new Map<string, Item[]>();
    for (const i of items) {
      const cat = catOf[i.source_key] ?? catOf[i.source_key.split(":")[0]] ?? "etc";
      if (category && cat !== category) continue;
      (groups.get(cat) ?? groups.set(cat, []).get(cat)!).push(i);
    }

    const feed: FeedGroup[] = [...groups.entries()]
      .map(([cat, list]) => ({ category: cat, title: CATEGORY_LABEL[cat] ?? cat, items: list.slice(0, 40) }))
      .sort((a, b) => (b.items[0]?.score ?? 0) - (a.items[0]?.score ?? 0));

    // 오늘의 핵심 3개 — 카테고리 편중을 막기 위해 카테고리당 최대 2개
    const perCat: Record<string, number> = {};
    const highlights: Item[] = [];
    for (const i of items) {
      if (i.seen_at) continue;
      const cat = catOf[i.source_key] ?? "etc";
      if ((perCat[cat] ?? 0) >= 2) continue;
      perCat[cat] = (perCat[cat] ?? 0) + 1;
      highlights.push(i);
      if (highlights.length === 3) break;
    }

    return { feed, highlights };
  });
}
