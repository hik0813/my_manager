"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Heatmap from "@/components/Heatmap";
import { Empty, ErrorText, Pill } from "@/components/ui";
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

/** 실패를 조용히 삼키지 않는다. 호출부가 항상 사람이 읽을 문구를 받는다. */
async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* 본문이 JSON이 아닐 수 있다 */
  }
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error;
    throw new Error(msg ?? `요청이 실패했습니다 (${res.status}). 잠시 뒤 다시 시도하세요.`);
  }
  return body as T;
}

function useAsyncError() {
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    }
  }, []);
  return { error, setError, run };
}

function Retry({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="tap press rounded-[10px] border border-line px-3 py-2 text-[13px] mt-1">
      다시 시도
    </button>
  );
}

function RecordsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = ((params.get("tab") as TabKey) ?? "log") as TabKey;

  // 탭을 URL에 반영해서 뒤로가기와 새로고침이 자연스럽게 동작한다
  function pick(next: TabKey) {
    router.replace(next === "log" ? "/records" : `/records?tab=${next}`, { scroll: false });
  }

  return (
    <div>
      <h1 className="text-lg font-semibold mb-3">기록</h1>

      <div className="scroll-x flex gap-2 mb-4 pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => pick(t.key)}
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
  const [logs, setLogs] = useState<DailyLog[] | null>(null);
  const [today, setToday] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const { error, run } = useAsyncError();

  const load = useCallback(() => {
    void run(async () => {
      const d = await call<{ logs: DailyLog[]; today: string }>("/api/logs?days=182");
      setLogs(d.logs ?? []);
      setToday(d.today);
    });
  }, [run]);

  useEffect(load, [load]);

  if (error) {
    return (
      <div>
        <ErrorText>{error}</ErrorText>
        <Retry onClick={load} />
      </div>
    );
  }
  if (logs === null) return <p className="text-sm text-dim">불러오는 중</p>;

  const shown = picked ? logs.filter((l) => l.date === picked) : logs;

  return (
    <div>
      <Heatmap logs={logs} today={today} onPick={(d) => setPicked((cur) => (cur === d ? null : d))} />

      {picked && (
        <div className="flex items-center gap-2 mt-3">
          <Pill tone="accent">{picked}</Pill>
          <button onClick={() => setPicked(null)} className="tap press text-[12px] text-dim">
            전체 보기
          </button>
        </div>
      )}

      {shown.length === 0 ? (
        <Empty>
          {picked ? "이 날은 기록이 없다. 칸을 다시 눌러 전체로 돌아가라." : "아직 한 줄도 없다. 오늘 화면 하단 입력칸에 한 줄만 적어라."}
        </Empty>
      ) : (
        <ul className="mt-4">
          {shown.map((l) => (
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
  const [meals, setMeals] = useState<Meal[] | null>(null);
  const [kcal, setKcal] = useState(0);
  const [name, setName] = useState("");
  const [manual, setManual] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const { error, run } = useAsyncError();

  const load = useCallback(() => {
    void run(async () => {
      const d = await call<{ meals: Meal[]; total_kcal: number }>("/api/meals");
      setMeals(d.meals);
      setKcal(d.total_kcal);
    });
  }, [run]);

  useEffect(load, [load]);

  function add() {
    if (!name.trim()) return;
    void run(async () => {
      const d = await call<{ meal: Meal }>("/api/meals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, kcal: manual.trim() === "" ? null : Number(manual) }),
      });
      setNotice(d.meal.kcal == null ? "식약처 DB에 없다. 오른쪽 칸에 칼로리를 직접 넣으면 그대로 저장된다." : null);
      setName("");
      setManual("");
      load();
    });
  }

  function remove(id: string) {
    setMeals((prev) => prev?.filter((m) => m.id !== id) ?? null);
    void run(async () => {
      await call(`/api/meals/${id}`, { method: "DELETE" });
      load();
    });
  }

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="음식 이름"
          className="tap flex-1 min-w-0 rounded-[10px] bg-surface2 border border-line px-3 py-2.5 outline-none focus:border-accent"
        />
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value.replace(/[^0-9]/g, ""))}
          inputMode="numeric"
          placeholder="kcal"
          className="tap w-20 rounded-[10px] bg-surface2 border border-line px-3 py-2.5 outline-none focus:border-accent"
        />
        <button onClick={add} className="tap press rounded-[10px] bg-accent text-bg font-semibold px-3">
          추가
        </button>
      </div>

      {error && <ErrorText>{error}</ErrorText>}
      {notice && <p className="text-[13px] text-muted mb-2">{notice}</p>}

      <p className="text-[13px] text-dim mb-2">오늘 합계 {kcal} kcal</p>

      {meals === null ? (
        <p className="text-sm text-dim">불러오는 중</p>
      ) : meals.length === 0 ? (
        <Empty>오늘 기록이 없다. 음식 이름만 넣으면 식약처 DB에서 칼로리를 찾아 붙인다.</Empty>
      ) : (
        <ul>
          {meals.map((m) => (
            <li key={m.id} className="flex items-center gap-2 border-b border-line py-2.5">
              <span className="flex-1 text-[15px] truncate">{m.name}</span>
              <span className="text-[13px] text-muted tabular-nums">{m.kcal ?? "—"} kcal</span>
              <Pill>{m.source === "mfds" ? "DB" : "수동"}</Pill>
              <button onClick={() => remove(m.id)} className="tap text-[12px] text-dim px-1" aria-label="삭제">
                ✕
              </button>
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
  const [rows, setRows] = useState<ErrorLog[] | null>(null);
  const [similar, setSimilar] = useState<ErrorLog[]>([]);
  const [form, setForm] = useState({ title: "", message: "", solution: "" });
  const { error, run } = useAsyncError();

  const load = useCallback(
    (query: string) => {
      void run(async () => {
        const d = await call<{ errors: ErrorLog[] }>(`/api/errors?q=${encodeURIComponent(query)}`);
        setRows(d.errors);
      });
    },
    [run],
  );

  useEffect(() => {
    const t = setTimeout(() => load(q), 200);
    return () => clearTimeout(t);
  }, [q, load]);

  function save() {
    if (!form.title.trim()) return;
    void run(async () => {
      const d = await call<{ similar: ErrorLog[] }>("/api/errors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      setSimilar(d.similar ?? []);
      setForm({ title: "", message: "", solution: "" });
      load(q);
    });
  }

  function remove(id: string) {
    setRows((prev) => prev?.filter((r) => r.id !== id) ?? null);
    void run(async () => {
      await call(`/api/errors/${id}`, { method: "DELETE" });
      load(q);
    });
  }

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="에러 검색 (제목·본문·해결법)"
        className="tap w-full rounded-[10px] bg-surface2 border border-line px-3 py-2.5 mb-3 outline-none focus:border-accent"
      />

      <details className="mb-4 rounded-[10px] border border-line p-3" onToggle={() => setSimilar([])}>
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
          <button onClick={save} className="tap press rounded bg-accent text-bg font-semibold px-4 py-2">
            저장
          </button>
        </div>
      </details>

      {error && <ErrorText>{error}</ErrorText>}

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

      {rows === null ? (
        <p className="text-sm text-dim">불러오는 중</p>
      ) : rows.length === 0 ? (
        <Empty>{q ? "검색 결과가 없다. 다른 키워드로." : "기록된 에러가 없다. 다음에 막히면 여기에 남겨라."}</Empty>
      ) : (
        <ul>
          {rows.map((e) => (
            <li key={e.id} className="border-b border-line py-2.5">
              <div className="flex items-start gap-2">
                <p className="text-[15px] flex-1">{e.title}</p>
                <button onClick={() => remove(e.id)} className="tap text-[12px] text-dim px-1" aria-label="삭제">
                  ✕
                </button>
              </div>
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
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const { error, run } = useAsyncError();

  const load = useCallback(
    (query: string) => {
      void run(async () => {
        const d = await call<{ notes: Note[] }>(`/api/notes?q=${encodeURIComponent(query)}`);
        setNotes(d.notes);
      });
    },
    [run],
  );

  useEffect(() => {
    const t = setTimeout(() => load(q), 200);
    return () => clearTimeout(t);
  }, [q, load]);

  function throwLink() {
    if (!url.trim()) return;
    setBusy(true);
    void run(async () => {
      await call("/api/links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      setUrl("");
      load(q);
    }).finally(() => setBusy(false));
  }

  function remove(id: string) {
    setNotes((prev) => prev?.filter((n) => n.id !== id) ?? null);
    void run(async () => {
      await call(`/api/notes/${id}`, { method: "DELETE" });
      load(q);
    });
  }

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && throwLink()}
          inputMode="url"
          placeholder="링크 던지기 — 붙여넣고 엔터"
          className="tap flex-1 min-w-0 rounded-[10px] bg-surface2 border border-line px-3 py-2.5 outline-none focus:border-accent"
        />
        <button onClick={throwLink} disabled={busy} className="tap press rounded-[10px] bg-accent text-bg font-semibold px-3 disabled:opacity-40">
          {busy ? "읽는 중" : "요약"}
        </button>
      </div>

      {error && <ErrorText>{error}</ErrorText>}

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="문서 검색"
        className="tap w-full rounded-[10px] bg-surface2 border border-line px-3 py-2.5 mb-3 outline-none focus:border-accent"
      />

      {notes === null ? (
        <p className="text-sm text-dim">불러오는 중</p>
      ) : notes.length === 0 ? (
        <Empty>비어 있다. 링크를 던지거나, + 로 아이디어를 한 줄 적으면 여기에 쌓인다.</Empty>
      ) : (
        <ul>
          {notes.map((n) => (
            <li key={n.id} className="border-b border-line py-2.5">
              <div className="flex items-center gap-2">
                <Pill>{n.type}</Pill>
                <span className="text-[15px] flex-1 truncate">{n.title}</span>
                <button onClick={() => remove(n.id)} className="tap text-[12px] text-dim px-1" aria-label="삭제">
                  ✕
                </button>
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
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [answered, setAnswered] = useState<number | null>(null);
  const [result, setResult] = useState<{ correct: boolean; answer_index: number; explanation: string | null; next_in_days: number | null } | null>(null);
  const { error, run } = useAsyncError();

  const load = useCallback(() => {
    void run(async () => {
      const d = await call<{ reviews: Review[] }>("/api/reviews");
      setReviews(d.reviews);
    });
  }, [run]);

  useEffect(load, [load]);

  function answer(id: string, choice: number) {
    if (answered !== null) return; // 채점 중 중복 클릭 차단
    setAnswered(choice);
    void run(async () => {
      const d = await call<{ correct: boolean; answer_index: number; explanation: string | null; next_in_days: number | null }>(
        "/api/reviews",
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, choice }) },
      );
      setResult(d);
    });
  }

  function next() {
    setResult(null);
    setAnswered(null);
    setReviews((prev) => (prev ? prev.slice(1) : prev));
  }

  if (error) {
    return (
      <div>
        <ErrorText>{error}</ErrorText>
        <Retry onClick={load} />
      </div>
    );
  }
  if (reviews === null) return <p className="text-sm text-dim">불러오는 중</p>;

  const current = reviews[0];
  if (!current) return <Empty>지금 풀 문제가 없다. &apos;오늘 배울 기술&apos;이 쌓이면 3일 뒤부터 여기로 온다.</Empty>;

  return (
    <div>
      <p className="text-[11px] text-dim mb-1">{current.topic}</p>
      <p className="text-[15px] mb-3">{current.question}</p>

      <ul className="space-y-2">
        {current.choices.map((c, i) => {
          const isAnswer = result && i === result.answer_index;
          const isMine = answered === i;
          const tone = !result
            ? "border-line"
            : isAnswer
              ? "border-ok text-ok"
              : isMine
                ? "border-danger text-danger"
                : "border-line text-dim";
          return (
            <li key={i}>
              <button
                onClick={() => answer(current.id, i)}
                disabled={answered !== null}
                className={`tap press w-full text-left rounded-[10px] border px-3 py-3 text-[15px] ${tone}`}
              >
                {c}
              </button>
            </li>
          );
        })}
      </ul>

      {result && (
        <div className={`mt-3 rounded-[10px] border p-3 ${result.correct ? "border-ok/40" : "border-danger/40"}`}>
          <p className={`text-sm ${result.correct ? "text-ok" : "text-danger"}`}>{result.correct ? "맞았다" : "틀렸다"}</p>
          {result.explanation && <p className="text-[13px] text-muted mt-1">{result.explanation}</p>}
          {result.next_in_days && <p className="text-[11px] text-dim mt-1">{result.next_in_days}일 뒤에 다시 물어본다.</p>}
          <button onClick={next} className="tap press mt-2 rounded-[10px] bg-accent text-bg font-semibold px-4 py-2 text-[14px]">
            다음 문제
          </button>
        </div>
      )}

      <p className="text-[11px] text-dim mt-3">남은 문제 {reviews.length - 1}개</p>
    </div>
  );
}

/* ── 활동 기록 타임라인 ──────────────────────────────────── */
function TimelineTab() {
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [year, setYear] = useState<string>("all");
  const [form, setForm] = useState({ title: "", happened_at: "", kind: "event" });
  const { error, run } = useAsyncError();

  const load = useCallback(() => {
    void run(async () => {
      const d = await call<{ events: TimelineEvent[] }>("/api/timeline");
      setEvents(d.events);
    });
  }, [run]);

  useEffect(load, [load]);

  function add() {
    if (!form.title.trim() || !form.happened_at) return;
    void run(async () => {
      await call("/api/timeline", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      setForm({ title: "", happened_at: "", kind: "event" });
      load();
    });
  }

  function remove(id: string) {
    setEvents((prev) => prev?.filter((e) => e.id !== id) ?? null);
    void run(async () => {
      await call(`/api/timeline/${id}`, { method: "DELETE" });
      load();
    });
  }

  const all = events ?? [];
  const years = [...new Set(all.map((e) => e.happened_at.slice(0, 4)))].sort().reverse();
  const shown = year === "all" ? all : all.filter((e) => e.happened_at.startsWith(year));

  function exportText() {
    const text = shown.map((e) => `${e.happened_at}\t${e.kind}\t${e.title}${e.body ? `\t${e.body}` : ""}`).join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `timeline-${year}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

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
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="대회 · 프로젝트 · 행사"
          className="tap flex-1 min-w-0 rounded-[10px] bg-surface2 border border-line px-3 py-2.5 outline-none focus:border-accent"
        />
        <button onClick={add} className="tap press rounded-[10px] bg-accent text-bg font-semibold px-3">
          추가
        </button>
      </div>

      {error && <ErrorText>{error}</ErrorText>}

      {events === null ? (
        <p className="text-sm text-dim">불러오는 중</p>
      ) : all.length === 0 ? (
        <Empty>비어 있다. 참가한 대회나 끝낸 프로젝트를 날짜와 함께 남겨두면 나중에 자기소개서가 된다.</Empty>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="scroll-x flex gap-1.5">
              {["all", ...years].map((y) => (
                <button
                  key={y}
                  onClick={() => setYear(y)}
                  className={`tap shrink-0 rounded-full px-2.5 py-1 text-[12px] border ${
                    year === y ? "border-accent text-accent" : "border-line text-muted"
                  }`}
                >
                  {y === "all" ? "전체" : y}
                </button>
              ))}
            </div>
            <button onClick={exportText} className="tap press shrink-0 text-[12px] text-accent">
              내보내기
            </button>
          </div>

          {shown.length === 0 ? (
            <Empty>{year}년에는 기록이 없다.</Empty>
          ) : (
            <ul>
              {shown.map((e) => (
                <li key={e.id} className="flex gap-3 border-b border-line py-2.5">
                  <span className="text-[11px] text-dim w-20 shrink-0 tabular-nums">{e.happened_at}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px]">{e.title}</p>
                    {e.body && <p className="text-[13px] text-muted">{e.body}</p>}
                  </div>
                  <button onClick={() => remove(e.id)} className="tap text-[12px] text-dim px-1" aria-label="삭제">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
