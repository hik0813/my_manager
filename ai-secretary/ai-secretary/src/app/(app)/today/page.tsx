"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Empty, Pill, Section } from "@/components/ui";
import { dday, relKo } from "@/lib/dates";
import type { Alert, DailyLog, Item, Meal, Project, Task } from "@/lib/types";

type SchoolDay = {
  meal: { type: string; dishes: string[]; kcal: string | null }[] | null;
  timetable: { period: string; subject: string }[] | null;
  schedule: { date: string; name: string }[] | null;
  errors: string[];
};

type TodayData = {
  date: string;
  school: SchoolDay | null;
  briefing: { date: string; body: string } | null;
  tasks: Task[];
  stalled_projects: Project[];
  log: DailyLog | null;
  meals: Meal[];
  total_kcal: number;
  alerts: Alert[];
  reviews_due: number;
  _stale?: boolean;
};

export default function TodayPage() {
  const [data, setData] = useState<TodayData | null>(null);
  const [highlights, setHighlights] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [oneLiner, setOneLiner] = useState("");
  const [savingLog, setSavingLog] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, i] = await Promise.all([fetch("/api/today"), fetch("/api/items?days=3")]);
      if (!t.ok) throw new Error(((await t.json()) as { error?: string }).error ?? "불러오지 못했습니다.");
      const today = (await t.json()) as TodayData;
      setData(today);
      setOneLiner(today.log?.one_liner ?? "");
      if (i.ok) setHighlights(((await i.json()) as { highlights: Item[] }).highlights);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    }
  }, []);

  useEffect(() => {
    void load();
    const handler = () => void load();
    window.addEventListener("capture:changed", handler);
    return () => window.removeEventListener("capture:changed", handler);
  }, [load]);

  async function toggleTask(t: Task) {
    setData((d) => (d ? { ...d, tasks: d.tasks.filter((x) => x.id !== t.id) } : d));
    await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ done: true }),
    }).catch(() => undefined);
  }

  async function saveLog() {
    if (!oneLiner.trim()) return;
    setSavingLog(true);
    await fetch("/api/logs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ one_liner: oneLiner }),
    }).catch(() => undefined);
    setSavingLog(false);
    void load();
  }

  async function openItem(item: Item) {
    setHighlights((prev) => prev.filter((h) => h.id !== item.id));
    void fetch(`/api/items/${item.id}/seen`, { method: "POST" });
    if (item.url) window.open(item.url, "_blank", "noopener");
  }

  if (error && !data) {
    return (
      <div>
        <h1 className="text-lg font-semibold mb-2">오늘</h1>
        <p className="text-sm text-danger">{error}</p>
        <button onClick={() => void load()} className="tap press mt-3 rounded-[10px] border border-line px-4 py-2 text-sm">
          다시 시도
        </button>
      </div>
    );
  }

  if (!data) return <p className="text-dim text-sm py-6">불러오는 중</p>;

  const hour = new Date().getHours();
  const phase = hour < 11 ? "아침" : hour < 18 ? "낮" : "밤";
  const unreadCritical = data.alerts.filter((a) => a.level === "critical");

  return (
    <div>
      <header className="flex items-baseline justify-between mb-4">
        <h1 className="text-lg font-semibold">
          {phase} <span className="text-dim text-sm font-normal ml-1">{data.date}</span>
        </h1>
        {data._stale && <Pill>오프라인 · 마지막 데이터</Pill>}
      </header>

      {unreadCritical.length > 0 && (
        <div className="mb-5 rounded-[10px] border border-danger/50 bg-danger/10 p-3">
          {unreadCritical.map((a) => (
            <p key={a.id} className="text-sm text-danger">
              {a.title}
            </p>
          ))}
        </div>
      )}

      {data.briefing && (
        <section className="mb-6">
          <p className="text-[15px] leading-relaxed whitespace-pre-line">{data.briefing.body}</p>
          <p className="text-[11px] text-dim mt-1">{data.briefing.date} 브리핑</p>
        </section>
      )}

      <Section title="오늘의 핵심">
        {highlights.length === 0 ? (
          <Empty>
            아직 올릴 만한 소식이 없다. 더보기 → 지금 수집을 누르면 바로 채워진다.
          </Empty>
        ) : (
          <ul>
            {highlights.map((h) => (
              <li key={h.id} className="border-b border-line py-3">
                <button onClick={() => void openItem(h)} className="tap press text-left w-full">
                  <div className="flex items-start gap-2">
                    <span className="text-accent text-xs mt-0.5 shrink-0">{h.score}</span>
                    <div>
                      <p className="text-[15px] leading-snug">{h.title}</p>
                      {h.summary && <p className="text-[13px] text-muted mt-0.5 line-clamp-2">{h.summary}</p>}
                      <p className="text-[11px] text-dim mt-1">
                        {String((h.payload as { _source_title?: string })._source_title ?? h.source_key)} · {relKo(h.published_at ?? h.created_at)}
                      </p>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {data.school && (
        <Section title="학교">
          {data.school.timetable?.length ? (
            <div className="scroll-x flex gap-2 mb-2 pb-1">
              {data.school.timetable.map((l) => (
                <span key={l.period} className="shrink-0 rounded border border-line px-2 py-1 text-[12px]">
                  <span className="text-dim mr-1">{l.period}</span>
                  {l.subject}
                </span>
              ))}
            </div>
          ) : null}

          {data.school.meal?.length ? (
            data.school.meal.map((m) => (
              <p key={m.type} className="text-[13px] text-muted leading-relaxed">
                <span className="text-text">{m.type}</span> {m.dishes.join(" · ")}
              </p>
            ))
          ) : (
            <Empty>급식 정보가 없다. Vercel 환경변수에 NEIS_API_KEY와 학교코드를 넣고 재배포하면 여기에 뜬다.</Empty>
          )}

          {data.school.schedule?.length ? (
            <p className="text-[13px] text-accent mt-2">{data.school.schedule.map((s) => s.name).join(", ")}</p>
          ) : null}
        </Section>
      )}

      <Section title={`할일 ${data.tasks.length > 0 ? `(${data.tasks.length})` : ""}`} right={<Link href="/projects" className="text-[12px] text-dim">전체</Link>}>
        {data.tasks.length === 0 ? (
          <Empty>할일이 없다. 오른쪽 아래 + 를 눌러 한 줄 적으면 알아서 할일로 들어간다.</Empty>
        ) : (
          <ul>
            {data.tasks.slice(0, 6).map((t) => (
              <li key={t.id} className="flex items-center gap-3 border-b border-line py-2.5">
                <button
                  onClick={() => void toggleTask(t)}
                  aria-label="완료"
                  className="tap shrink-0 h-6 w-6 rounded border border-line"
                />
                <span className="flex-1 text-[15px]">{t.title}</span>
                {t.due_at && (
                  <span className={`text-[11px] ${Date.parse(t.due_at) < Date.now() + 86_400_000 ? "text-danger" : "text-dim"}`}>
                    {dday(t.due_at)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {data.stalled_projects.length > 0 && (
        <Section title="멈춰 있는 프로젝트">
          <ul>
            {data.stalled_projects.map((p) => (
              <li key={p.id} className="border-b border-line py-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[15px]">{p.name}</span>
                  <Pill tone="danger">{p.stall_days ?? p.stalled_days}일째</Pill>
                </div>
                <p className="text-[13px] text-muted">{p.next_action ?? "다음 할 일이 비어 있다. 하나만 정해라."}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        title="식단"
        right={<span className="text-[12px] text-dim">{data.total_kcal > 0 ? `${data.total_kcal} kcal` : ""}</span>}
      >
        {data.meals.length === 0 ? (
          <Empty>오늘 먹은 걸 + 로 적으면 칼로리는 알아서 붙는다.</Empty>
        ) : (
          <p className="text-[13px] text-muted">{data.meals.map((m) => m.name).join(" · ")}</p>
        )}
      </Section>

      {data.reviews_due > 0 && (
        <Link href="/records?tab=review" className="block mb-6 rounded-[10px] border border-accent/40 p-3">
          <p className="text-sm text-accent">복습할 문제 {data.reviews_due}개</p>
          <p className="text-[13px] text-muted mt-0.5">전에 배운 걸 지금 확인하면 30일까지 남는다.</p>
        </Link>
      )}

      {/* 하루 한 줄 — '오늘' 화면을 벗어나지 않고 입력한다.
          라벨이 없으면 바로 위 '식단' 섹션의 입력칸으로 오해한다 (실제로 그런 사고가 있었다). */}
      <section className="sticky bottom-24 pt-3 bg-gradient-to-t from-bg via-bg to-transparent">
        <div className="flex items-baseline justify-between mb-1.5">
          <h2 className="text-[13px] font-semibold text-muted">하루 한 줄</h2>
          <span className="text-[11px] text-dim">먹은 건 + 로 적어라</span>
        </div>
        <div className="flex gap-2">
          <input
            value={oneLiner}
            onChange={(e) => setOneLiner(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveLog();
            }}
            placeholder="오늘 하루를 한 줄로 (식단 아님)"
            className="tap flex-1 rounded-[10px] bg-surface2 border border-line px-3 py-3 outline-none focus:border-accent"
          />
          <button
            onClick={() => void saveLog()}
            disabled={savingLog || !oneLiner.trim()}
            className="tap press rounded-[10px] border border-line px-4 text-sm disabled:opacity-40"
          >
            {data.log ? "고침" : "적기"}
          </button>
        </div>
        {data.log && <p className="text-[11px] text-dim mt-1">오늘 기록됨</p>}
      </section>
    </div>
  );
}
