import { handle } from "@/lib/api";
import { categoryMeta, type CategoryMeta } from "@/lib/categories";
import { db } from "@/lib/db";
import { SOURCE_DEFS } from "@/lib/collectors/run";
import type { Item } from "@/lib/types";

export const dynamic = "force-dynamic";

export type FeedItem = Item & {
  source_title: string;
  image: string | null;
};

export type FeedGroup = CategoryMeta & {
  items: FeedItem[];
  unseen: number;
};

function isHttpUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\//.test(v);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? 7);

  return handle(async () => {
    const since = new Date(Date.now() - Math.min(30, Math.max(1, days)) * 86_400_000).toISOString();
    const res = await db()
      .from("items")
      .select("*")
      .gte("created_at", since)
      .order("score", { ascending: false })
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(500);
    if (res.error) throw new Error(res.error.message);

    // 소스키 → 카테고리·제목. foreach로 복제된 키("steam_news:730")는 앞부분으로 되찾는다.
    const catOf: Record<string, string> = {};
    const titleOf: Record<string, string> = {};
    for (const d of SOURCE_DEFS) {
      catOf[d.key] = d.category;
      titleOf[d.key] = d.title;
    }
    const base = (key: string) => key.split(":")[0];

    const items: FeedItem[] = (res.data as Item[]).map((i) => ({
      ...i,
      source_title: titleOf[i.source_key] ?? titleOf[base(i.source_key)] ?? i.source_key,
      image: isHttpUrl((i.payload as { image?: unknown })?.image) ? (i.payload as { image: string }).image : null,
    }));

    const grouped = new Map<string, FeedItem[]>();
    for (const i of items) {
      const cat = catOf[i.source_key] ?? catOf[base(i.source_key)] ?? "etc";
      const list = grouped.get(cat);
      if (list) list.push(i);
      else grouped.set(cat, [i]);
    }

    const feed: FeedGroup[] = [...grouped.entries()].map(([cat, list]) => ({
      ...categoryMeta(cat),
      items: list.slice(0, 40),
      unseen: list.filter((i) => !i.seen_at).length,
    }));

    // 오늘의 핵심 — 카테고리당 최대 1개로 제한해 한 분야가 다 먹지 않게
    const used = new Set<string>();
    const highlights: FeedItem[] = [];
    for (const i of items) {
      if (i.seen_at) continue;
      const cat = catOf[i.source_key] ?? catOf[base(i.source_key)] ?? "etc";
      if (used.has(cat)) continue;
      used.add(cat);
      highlights.push(i);
      if (highlights.length === 3) break;
    }

    return { feed, highlights };
  });
}
