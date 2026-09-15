"use client";

import { useCallback, useEffect, useState } from "react";
import { Empty, Pill } from "@/components/ui";
import { relKo } from "@/lib/dates";
import type { Item } from "@/lib/types";

type FeedGroup = { category: string; title: string; items: Item[] };

export default function InterestsPage() {
  const [feed, setFeed] = useState<FeedGroup[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/items?days=7");
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "불러오지 못했습니다.");
      const data = (await res.json()) as { feed: FeedGroup[] };
      setFeed(data.feed);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openItem(item: Item) {
    void fetch(`/api/items/${item.id}/seen`, { method: "POST" });
    setFeed((prev) =>
      prev.map((g) => ({ ...g, items: g.items.map((i) => (i.id === item.id ? { ...i, seen_at: new Date().toISOString() } : i)) })),
    );
    if (item.url) window.open(item.url, "_blank", "noopener");
  }

  const ItemRow = ({ i }: { i: Item }) => (
    <li className="border-b border-line py-2.5">
      <button onClick={() => openItem(i)} className="tap press text-left w-full">
        <p className={`text-[15px] leading-snug ${i.seen_at ? "text-dim" : ""}`}>{i.title}</p>
        {i.summary && <p className="text-[13px] text-muted mt-0.5 line-clamp-2">{i.summary}</p>}
        <p className="text-[11px] text-dim mt-1">
          {String((i.payload as { _source_title?: string })._source_title ?? i.source_key)} · {relKo(i.published_at ?? i.created_at)}
        </p>
      </button>
    </li>
  );

  return (
    <div>
      <h1 className="text-lg font-semibold mb-4">관심사</h1>
      {error && <p className="text-sm text-danger mb-3">{error}</p>}
      {loading && <p className="text-sm text-dim">불러오는 중</p>}

      {!loading && feed.length === 0 && !error && (
        <Empty>
          아직 수집된 게 없다. 더보기 → 지금 수집을 누르거나, config/sources.json에 소스를 하나 추가해라.
        </Empty>
      )}

      {/* '오늘의 핵심'은 오늘 화면이 이미 보여준다. 여기서 또 보여주면
          관심사 탭의 상단 1/3을 똑같은 카드 3개가 먹는다. */}

      {feed.map((g, gi) => {
        const unseen = g.items.filter((i) => !i.seen_at).length;
        // 첫 카테고리는 펼쳐둔다 — 들어오자마자 할 게 있어야 한다
        const isOpen = open[g.category] ?? gi === 0;
        return (
          <section key={g.category} className="mb-2">
            <button
              onClick={() => setOpen((o) => ({ ...o, [g.category]: !isOpen }))}
              className="tap press w-full flex items-center justify-between py-2.5 border-b border-line"
            >
              <span className="text-[15px]">{g.title}</span>
              <span className="flex items-center gap-2">
                {unseen > 0 && <Pill tone="accent">{unseen}</Pill>}
                <span className="text-dim text-xs">{isOpen ? "닫기" : "열기"}</span>
              </span>
            </button>
            {isOpen && (
              <ul className="pl-1">
                {g.items.map((i) => (
                  <ItemRow key={i.id} i={i} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
