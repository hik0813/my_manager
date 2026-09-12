"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Heatmap from "@/components/Heatmap";
import { Empty, Pill } from "@/components/ui";
import { relKo } from "@/lib/dates";
import type { DailyLog, ErrorLog, Meal, Note, Review, TimelineEvent } from "@/lib/types";

const TABS = [
  { key: "log", label: "한 줄" },
  { key: "meal", label: "식단" },
  { key: "error", label: "에러" },
  { key: "doc", label: "문서고" },
  { key: "review", label: "복습" },
  { key: "timeline", label: "타임라인" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function RecordsInner() {
  const params = useSearchParams();
  const [tab, setTab] = useState<TabKey>((params.get("tab") as TabKey) ?? "log");

  return (
    <div>
      <h1 className="text-lg font-semibold mb-3">기록</h1>

      <div className="scroll-x flex gap-2 mb-4 pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`tap shrink-0 rounded-full px-3 py-1.5 text-[13px] border ${
              tab === t.key ? "border-accent text-accent" : "border-line text-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "log" && <LogTab />}
      {tab === "meal" && <MealTab />}
      {tab === "error" && <ErrorTab />}
      {tab === "doc" && <DocTab />}
      {tab === "review" && <ReviewTab />}
      {tab === "timeline" && <TimelineTab />}
    </div>
  );
}

export default function RecordsPage() {
  return (
    <Suspense fallback={null}>
      <RecordsInner />
    </Suspense>
  );
}

/* ── 하루 한 줄 ───────────────────────────────────────────── */
function LogTab() {
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [today, setToday] = useState("");

  useEffect(() => {
    void fetch("/api/logs?days=182")
      .then((r) => r.json())
      .then((d: { logs: DailyLog[]; today: string }) => {
        setLogs(d.logs ?? []);
        setToday(d.today);
      })
      .catch(() => undefined);
  }, []);

  if (!today) return <p className="text-sm text-dim">불러오는 중</p>;

  return (
    <div>
      <Heatmap logs={logs} today={today} />
      {logs.length === 0 ? (
        <Empty>아직 한 줄도 없다. 오늘 화면 하단 입력칸에 한 줄만 적어라.</Empty>
      ) : (
        <ul className="mt-4">
          {logs.map((l) => (
            <li key={l.id} className="border-b border-line py-2.5">
              <p className="text-[11px] text-dim">{l.date}</p>
              <p className="text-[15px]">{l.one_liner}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── 식단 ────────────────────────────────────────────────── */
function MealTab() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [kcal, setKcal] = useState(0);
  const [name, setName] = useState("");
  const [manual, setManual] = useState<number | "">("");
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/meals");
    if (!res.ok) return;
    const d = (await res.json()) as { meals: Meal[]; total_kcal: number };
    setMeals(d.meals);
    setKcal(d.total_kcal);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (!name.trim()) return;
    const res = await fetch("/api/meals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, kcal: manual === "" ? null : Number(manual) }),
    });
    const d = (await res.json()) as { meal?: Meal; error?: string };
    if (d.meal && d.meal.kcal == null) setNotice("식약처 DB에 없다. 칼로리를 직접 넣으면 그대로 저장된다.");
    else setNotice(null);
    setName("");
    setManual("");
    void load();
  }

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void add()}
          placeholder="음식 이름"
          className="tap flex-1 rounded-[10px] bg-surface2 border border-line px-3 py-2.5 outline-none focus:border-accent"
        />
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value === "" ? "" : Number(e.target.value))}
          inputMode="numeric"
          placeholder="kcal"
          className="tap w-20 rounded-[10px] bg-surface2 border border-line px-3 py-2.5 outline-none focus:border-accent"
        />
        <button onClick={() => void add()} className="tap press rounded-[10px] bg-accent text-bg font-semibold px-3">
          추가
        </button>
      </div>
      {notice && <p className="text-[13px] text-muted mb-2">{notice}</p>}

      <p className="text-[13px] text-dim mb-2">오늘 합계 {kcal} kcal</p>
      {meals.length === 0 ? (
        <Empty>오늘 기록이 없다. 음식 이름만 넣으면 식약처 DB에서 칼로리를 찾아 붙인다.</Empty>
      ) : (
        <ul>
          {meals.map((m) => (
            <li key={m.id} className="flex items-center gap-2 border-b border-line py-2.5">
              <span className="flex-1 text-[15px]">{m.name}</span>
              <span className="text-[13px] text-muted tabular-nums">{m.kcal ?? "—"} kcal</span>
              <Pill>{m.source === "mfds" ? "DB" : "수동"}</Pill>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── 에러 아카이브 ───────────────────────────────────────── */
function ErrorTab() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ErrorLog[]>([]);
  const [similar, setSimilar] = useState<ErrorLog[]>([]);
  const [form, setForm] = useState({ title: "", message: "", solution: "" });

  const load = useCallback(async (query: string) => {
    const res = await fetch(`/api/errors?q=${encodeURIComponent(query)}`);
    if (!res.ok) return;
    setRows(((await res.json()) as { errors: ErrorLog[] }).errors);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(q), 200);
    return () => clearTimeout(t);
  }, [q, load]);

  async function save() {
    if (!form.title.trim()) return;
    const res = await fetch("/api/errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const d = (await res.json()) as { similar: ErrorLog[] };
      setSimilar(d.similar ?? []);
      setForm({ title: "", message: "", solution: "" });
      void load(q);
    }
  }

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="에러 검색 (제목·본문·해결법)"
        className="tap w-full rounded-[10px] bg-surface2 border border-line px-3 py-2.5 mb-3 outline-none focus:border-accent"
      />

      <details className="mb-4 rounded-[10px] border border-line p-3">
        <summary className="text-[13px] text-muted cursor-pointer">새 에러 기록</summary>
        <div className="mt-2 space-y-2">
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="한 줄 제목"
            className="tap w-full rounded bg-surface2 border border-line px-3 py-2 outline-none focus:border-accent"
          />
          <textarea
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            placeholder="에러 메시지"
            rows={3}
            className="tap w-full rounded bg-surface2 border border-line px-3 py-2 outline-none focus:border-accent"
          />
          <textarea
            value={form.solution}
            onChange={(e) => setForm({ ...form, solution: e.target.value })}
            placeholder="해결법"
            rows={2}
            className="tap w-full rounded bg-surface2 border border-line px-3 py-2 outline-none focus:border-accent"
          />
          <button onClick={() => void save()} className="tap press rounded bg-accent text-bg font-semibold px-4 py-2">
            저장
          </button>
        </div>
      </details>

      {similar.length > 0 && (
        <div className="mb-4 rounded-[10px] border border-accent/40 p-3">
          <p className="text-[13px] text-accent mb-1">전에 비슷한 걸 겪었다</p>
          {similar.map((s) => (
            <p key={s.id} className="text-[13px] text-muted">
              {s.title} — {s.solution ?? "해결법 미기록"}
            </p>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <Empty>{q ? "검색 결과가 없다. 다른 키워드로." : "기록된 에러가 없다. 다음에 막히면 여기에 남겨라."}</Empty>
      ) : (
        <ul>
          {rows.map((e) => (
            <li key={e.id} className="border-b border-line py-2.5">
              <p className="text-[15px]">{e.title}</p>
              {e.solution && <p className="text-[13px] text-ok mt-0.5">{e.solution}</p>}
              {e.message && <p className="text-[12px] text-dim mt-0.5 line-clamp-2">{e.message}</p>}
              <p className="text-[11px] text-dim mt-1">{relKo(e.created_at)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── 문서고 (기획문서 + 링크 요약) ───────────────────────── */
function DocTab() {
  const [q, setQ] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (query: string) => {
    const res = await fetch(`/api/notes?q=${encodeURIComponent(query)}`);
    if (!res.ok) return;
    setNotes(((await res.json()) as { notes: Note[] }).notes);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(q), 200);
    return () => clearTimeout(t);
  }, [q, load]);

  async function throwLink() {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "요약 실패");
      setUrl("");
      void load(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : "실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void throwLink()}
          inputMode="url"
          placeholder="링크 던지기 — 붙여넣고 엔터"
          className="tap flex-1 rounded-[10px] bg-surface2 border border-line px-3 py-2.5 outline-none focus:border-accent"
        />
        <button onClick={() => void throwLink()} disabled={busy} className="tap press rounded-[10px] bg-accent text-bg font-semibold px-3 disabled:opacity-40">
          {busy ? "읽는 중" : "요약"}
        </button>
      </div>
      {error && <p className="text-[13px] text-danger mb-2">{error}</p>}

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="문서 검색"
        className="tap w-full rounded-[10px] bg-surface2 border border-line px-3 py-2.5 mb-3 outline-none focus:border-accent"
      />

      {notes.length === 0 ? (
        <Empty>비어 있다. 링크를 던지거나, + 로 아이디어를 한 줄 적으면 여기에 쌓인다.</Empty>
      ) : (
        <ul>
          {notes.map((n) => (
            <li key={n.id} className="border-b border-line py-2.5">
              <div className="flex items-center gap-2">
                <Pill>{n.type}</Pill>
                <span className="text-[15px] flex-1">{n.title}</span>
              </div>
              {n.body && <p className="text-[13px] text-muted mt-1 whitespace-pre-line line-clamp-4">{n.body}</p>}
              {n.source_url && (
                <a href={n.source_url} target="_blank" rel="noreferrer" className="text-[11px] text-accent mt-1 inline-block">
                  원문
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── 간격 반복 복습 ──────────────────────────────────────── */
function ReviewTab() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [result, setResult] = useState<{ correct: boolean; explanation: string | null; next_in_days: number | null } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/reviews");
    if (!res.ok) return;
    setReviews(((await res.json()) as { reviews: Review[] }).reviews);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function answer(id: string, choice: number) {
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, choice }),
    });
    if (!res.ok) return;
    setResult((await res.json()) as { correct: boolean; explanation: string | null; next_in_days: number | null });
    setTimeout(() => {
      setResult(null);
      setReviews((prev) => prev.filter((r) => r.id !== id));
    }, 2500);
  }

  const current = reviews[0];

  if (!current) {
    return <Empty>지금 풀 문제가 없다. '오늘 배울 기술'이 쌓이면 3일 뒤부터 여기로 온다.</Empty>;
  }

  return (
    <div>
      <p className="text-[11px] text-dim mb-1">{current.topic}</p>
      <p className="text-[15px] mb-3">{current.question}</p>
      <ul className="space-y-2">
        {current.choices.map((c, i) => (
          <li key={i}>
            <button
              onClick={() => void answer(current.id, i)}
              className="tap press w-full text-left rounded-[10px] border border-line px-3 py-3 text-[15px]"
            >
              {c}
            </button>
          </li>
        ))}
      </ul>
      {result && (
        <div className={`mt-3 rounded-[10px] border p-3 ${result.correct ? "border-ok/40" : "border-danger/40"}`}>
          <p className={`text-sm ${result.correct ? "text-ok" : "text-danger"}`}>{result.correct ? "맞았다" : "틀렸다"}</p>
          {result.explanation && <p className="text-[13px] text-muted mt-1">{result.explanation}</p>}
          {result.next_in_days && <p className="text-[11px] text-dim mt-1">{result.next_in_days}일 뒤에 다시 물어본다.</p>}
        </div>
      )}
      <p className="text-[11px] text-dim mt-3">남은 문제 {reviews.length - 1}개</p>
    </div>
  );
}

/* ── 활동 기록 타임라인 ──────────────────────────────────── */
function TimelineTab() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [form, setForm] = useState({ title: "", happened_at: "", kind: "event" });

  const load = useCallback(async () => {
    const res = await fetch("/api/timeline");
    if (!res.ok) return;
    setEvents(((await res.json()) as { events: TimelineEvent[] }).events);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (!form.title.trim() || !form.happened_at) return;
    await fetch("/api/timeline", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ title: "", happened_at: "", kind: "event" });
    void load();
  }

  function exportText() {
    const text = events
      .map((e) => `${e.happened_at}\t${e.kind}\t${e.title}${e.body ? `\t${e.body}` : ""}`)
      .join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "timeline.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const years = [...new Set(events.map((e) => e.happened_at.slice(0, 4)))];

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input
          value={form.happened_at}
          onChange={(e) => setForm({ ...form, happened_at: e.target.value })}
          type="date"
          className="tap rounded-[10px] bg-surface2 border border-line px-2 py-2.5 outline-none focus:border-accent"
        />
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && void add()}
          placeholder="대회 · 프로젝트 · 행사"
          className="tap flex-1 rounded-[10px] bg-surface2 border border-line px-3 py-2.5 outline-none focus:border-accent"
        />
        <button onClick={() => void add()} className="tap press rounded-[10px] bg-accent text-bg font-semibold px-3">
          추가
        </button>
      </div>

      {events.length === 0 ? (
        <Empty>비어 있다. 참가한 대회나 끝낸 프로젝트를 날짜와 함께 남겨두면 나중에 자기소개서가 된다.</Empty>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-dim">{years.join(" · ")}</span>
            <button onClick={exportText} className="tap press text-[12px] text-accent">
              텍스트로 내보내기
            </button>
          </div>
          <ul>
            {events.map((e) => (
              <li key={e.id} className="flex gap-3 border-b border-line py-2.5">
                <span className="text-[11px] text-dim w-20 shrink-0 tabular-nums">{e.happened_at}</span>
                <div>
                  <p className="text-[15px]">{e.title}</p>
                  {e.body && <p className="text-[13px] text-muted">{e.body}</p>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
