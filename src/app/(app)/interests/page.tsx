"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Thumb from "@/components/Thumb";
import { Empty, ErrorText, Pill } from "@/components/ui";
import { GROUP_ORDER } from "@/lib/categories";
import { relKo } from "@/lib/dates";
import type { Item } from "@/lib/types";

type FeedItem = Item & { source_title: string; image: string | null };
type FeedGroup = {
  key: string;
  label: string;
  hint: string;
  group: (typeof GROUP_ORDER)[number];
  items: FeedItem[];
  unseen: number;
};

function Row({ item, onOpen }: { item: FeedItem; onOpen: (i: FeedItem) => void }) {
  return (
    <li className="border-b border-line">
      <button onClick={() => onOpen(item)} className="tap press w-full text-left flex gap-3 py-3">
        <Thumb src={item.image} fallback={item.source_title} />
        <div className="min-w-0 flex-1">
          <p className={`text-[14px] leading-snug line-clamp-2 ${item.seen_at ? "text-dim" : "text-text"}`}>
            {item.title}
          </p>
          {item.summary && <p className="text-[12px] text-muted mt-0.5 line-clamp-1">{item.summary}</p>}
          <p className="text-[11px] text-dim mt-1 truncate">
            {item.source_title} · {relKo(item.published_at ?? item.created_at)}
          </p>
        </div>
      </button>
    </li>
  );
}

export default function InterestsPage() {
  const [feed, setFeed] = useState<FeedGroup[] | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [group, setGroup] = useState<string>("전체");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/items?days=7");
      const data = (await res.json()) as { feed?: FeedGroup[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "불러오지 못했습니다.");
      setFeed(data.feed ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
      setFeed([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openItem(item: FeedItem) {
    void fetch(`/api/items/${item.id}/seen`, { method: "POST" });
    setFeed((prev) =>
      prev
        ? prev.map((g) => ({
            ...g,
            items: g.items.map((i) => (i.id === item.id ? { ...i, seen_at: new Date().toISOString() } : i)),
            unseen: Math.max(0, g.unseen - (item.seen_at ? 0 : 1)),
          }))
        : prev,
    );
    if (item.url) window.open(item.url, "_blank", "noopener");
  }

  const groups = useMemo(() => (feed ?? []).filter((g) => group === "전체" || g.group === group), [feed, group]);
  const available = useMemo(
    () => GROUP_ORDER.filter((g) => (feed ?? []).some((f) => f.group === g)),
    [feed],
  );
  const totalUnseen = (feed ?? []).reduce((s, g) => s + g.unseen, 0);

  if (feed === null) return <p className="text-sm text-dim py-6">불러오는 중</p>;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h1 className="text-lg font-semibold">관심사</h1>
        {totalUnseen > 0 && <span className="text-[12px] text-dim">안 본 것 {totalUnseen}</span>}
      </div>

      {error && <ErrorText>{error}</ErrorText>}

      {/* 큰 묶음으로 먼저 거른다 — 게임만 보고 싶을 때 뉴스까지 스크롤하지 않게 */}
      {available.length > 1 && (
        <div className="scroll-x flex gap-2 mb-4 pb-1">
          {["전체", ...available].map((g) => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className={`tap shrink-0 rounded-full px-3 py-1.5 text-[13px] border ${
                group === g ? "border-accent text-accent" : "border-line text-muted"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {groups.length === 0 ? (
        <Empty>
          아직 수집된 게 없다. 더보기 → 지금 수집을 누르면 채워진다. 그래도 비면 같은 화면에서 빨간 소스의 에러를 읽어라.
        </Empty>
      ) : (
        groups.map((g, gi) => {
          const isOpen = open[g.key] ?? gi === 0;
          return (
            <section key={g.key} className="mb-1">
              <button
                onClick={() => setOpen((o) => ({ ...o, [g.key]: !isOpen }))}
                aria-expanded={isOpen}
                className="tap press w-full flex items-center gap-3 py-3 border-b border-line text-left"
              >
                <span
                  aria-hidden="true"
                  className={`shrink-0 text-dim text-[11px] transition-transform ${isOpen ? "rotate-90" : ""}`}
                >
                  ▶
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] leading-tight">{g.label}</span>
                  <span className="block text-[11px] text-dim truncate">{g.hint}</span>
                </span>
                {g.unseen > 0 ? <Pill tone="accent">{g.unseen}</Pill> : <Pill>{g.items.length}</Pill>}
              </button>

              {isOpen && (
                <ul>
                  {g.items.map((i) => (
                    <Row key={i.id} item={i} onOpen={openItem} />
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
