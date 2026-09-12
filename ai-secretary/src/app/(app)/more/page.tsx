"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Empty, Pill, Section } from "@/components/ui";
import { relKo } from "@/lib/dates";
import type { Alert, SourceRow, WatchItem } from "@/lib/types";

type SourcesData = { sources: SourceRow[]; items_7d: Record<string, number>; declared: number };
type LatestMetric = { metric_key: string; label: string | null; value: number; change_pct: number | null };

export default function MorePage() {
  const router = useRouter();
  const [sources, setSources] = useState<SourcesData | null>(null);
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [report, setReport] = useState<{ date: string; body: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [watchForm, setWatchForm] = useState({ kind: "steam_app", ref: "", label: "", threshold_pct: 5 });
  const [metricForm, setMetricForm] = useState({ metric_key: "", value: "" });
  const [latest, setLatest] = useState<LatestMetric[]>([]);

  const load = useCallback(async () => {
    const [s, w, a, r, m] = await Promise.all([
      fetch("/api/sources"),
      fetch("/api/watchlist"),
      fetch("/api/alerts"),
      fetch("/api/briefing?kind=weekly"),
      fetch("/api/snapshots"),
    ]);
    if (s.ok) setSources((await s.json()) as SourcesData);
    if (w.ok) setWatchlist(((await w.json()) as { watchlist: WatchItem[] }).watchlist);
    if (a.ok) setAlerts(((await a.json()) as { alerts: Alert[] }).alerts);
    if (r.ok) {
      const d = (await r.json()) as { briefings: { date: string; body: string }[] };
      setReport(d.briefings[0] ?? null);
    }
    if (m.ok) setLatest(((await m.json()) as { latest: LatestMetric[] }).latest);
  }, []);

  async function addMetric() {
    const value = Number(metricForm.value);
    if (!metricForm.metric_key.trim() || !Number.isFinite(value)) return;
    await fetch("/api/snapshots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ metric_key: metricForm.metric_key, value }),
    });
    setMetricForm({ metric_key: "", value: "" });
    void load();
  }

  useEffect(() => {
    void load();
  }, [load]);

  async function collectNow() {
    setBusy("collect");
    setMessage(null);
    try {
      const res = await fetch("/api/sources/run?slot=all", { method: "POST" });
      const d = (await res.json()) as { report?: { ok: number; failed: number; inserted: number }; error?: string };
      if (!res.ok) throw new Error(d.error ?? "수집 실패");
      setMessage(`성공 ${d.report?.ok} · 실패 ${d.report?.failed} · 항목 ${d.report?.inserted}건`);
      void load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "수집 실패");
    } finally {
      setBusy(null);
    }
  }

  async function regenerate(kind: "morning" | "weekly") {
    setBusy(kind);
    setMessage(null);
    try {
      const res = await fetch(`/api/briefing?kind=${kind}`, { method: "POST" });
      const d = (await res.json()) as { body?: string; error?: string };
      if (!res.ok) throw new Error(d.error ?? "생성 실패");
      setMessage(kind === "weekly" ? "주간 리포트를 새로 만들었다." : "아침 브리핑을 새로 만들었다.");
      void load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setBusy(null);
    }
  }

  async function addWatch() {
    if (!watchForm.ref.trim()) return;
    await fetch("/api/watchlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(watchForm),
    });
    setWatchForm({ ...watchForm, ref: "", label: "" });
    void load();
  }

  async function removeWatch(id: string) {
    setWatchlist((prev) => prev.filter((w) => w.id !== id));
    await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  const broken = sources?.sources.filter((s) => s.fail_count >= 3) ?? [];

  return (
    <div>
      <h1 className="text-lg font-semibold mb-4">더보기</h1>
      {message && <p className="text-[13px] text-accent mb-3">{message}</p>}

      <Section
        title="수집 소스"
        right={
          <button onClick={() => void collectNow()} disabled={busy === "collect"} className="tap press text-[12px] text-accent disabled:opacity-40">
            {busy === "collect" ? "수집 중" : "지금 수집"}
          </button>
        }
      >
        {broken.length > 0 && (
          <div className="mb-3 rounded-[10px] border border-danger/50 p-3">
            <p className="text-[13px] text-danger mb-1">3회 이상 연속 실패</p>
            {broken.map((s) => (
              <p key={s.key} className="text-[12px] text-muted">
                {s.key} — {s.last_error?.slice(0, 120)}
              </p>
            ))}
          </div>
        )}

        {!sources ? (
          <p className="text-sm text-dim">불러오는 중</p>
        ) : (
          <ul>
            {sources.sources.map((s) => (
              <li key={s.key} className="flex items-center gap-2 border-b border-line py-2">
                <span className="flex-1 text-[14px] truncate">{(s.config as { title?: string }).title ?? s.key}</span>
                <span className="text-[11px] text-dim">7일 {sources.items_7d[s.key] ?? 0}건</span>
                {s.fail_count > 0 ? (
                  <Pill tone="danger">실패 {s.fail_count}</Pill>
                ) : s.last_ok_at ? (
                  <Pill tone="ok">{relKo(s.last_ok_at)}</Pill>
                ) : (
                  <Pill>미실행</Pill>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="찜 목록">
        <div className="flex gap-2 mb-2">
          <select
            value={watchForm.kind}
            onChange={(e) => setWatchForm({ ...watchForm, kind: e.target.value })}
            className="tap rounded-[10px] bg-surface2 border border-line px-2 py-2.5"
          >
            <option value="steam_app">Steam 앱ID</option>
            <option value="itad_game">ITAD 게임ID</option>
            <option value="part">부품 검색어</option>
            <option value="package">패키지(npm:next)</option>
          </select>
          <input
            value={watchForm.ref}
            onChange={(e) => setWatchForm({ ...watchForm, ref: e.target.value })}
            placeholder="값"
            className="tap flex-1 min-w-0 rounded-[10px] bg-surface2 border border-line px-3 py-2.5 outline-none focus:border-accent"
          />
          <button onClick={() => void addWatch()} className="tap press rounded-[10px] bg-accent text-bg font-semibold px-3">
            추가
          </button>
        </div>
        <input
          value={watchForm.label}
          onChange={(e) => setWatchForm({ ...watchForm, label: e.target.value })}
          placeholder="표시 이름 (선택)"
          className="tap w-full rounded-[10px] bg-surface2 border border-line px-3 py-2.5 mb-3 outline-none focus:border-accent"
        />

        {watchlist.length === 0 ? (
          <Empty>찜한 게 없다. Steam 앱ID를 넣으면 동접자·리뷰·소식이 매일 쌓이고 가격 변동 때 알림이 온다.</Empty>
        ) : (
          <ul>
            {watchlist.map((w) => (
              <li key={w.id} className="flex items-center gap-2 border-b border-line py-2">
                <Pill>{w.kind}</Pill>
                <span className="flex-1 text-[14px] truncate">{w.label}</span>
                <span className="text-[11px] text-dim">±{w.threshold_pct}%</span>
                <button onClick={() => void removeWatch(w.id)} className="tap text-[12px] text-dim px-1">
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="추이 · 수동 지표">
        <div className="flex gap-2 mb-2">
          <input
            value={metricForm.metric_key}
            onChange={(e) => setMetricForm({ ...metricForm, metric_key: e.target.value })}
            placeholder="pochams_usage|가디안"
            className="tap flex-1 min-w-0 rounded-[10px] bg-surface2 border border-line px-3 py-2.5 outline-none focus:border-accent"
          />
          <input
            value={metricForm.value}
            onChange={(e) => setMetricForm({ ...metricForm, value: e.target.value })}
            inputMode="decimal"
            placeholder="값"
            className="tap w-20 rounded-[10px] bg-surface2 border border-line px-3 py-2.5 outline-none focus:border-accent"
          />
          <button onClick={() => void addMetric()} className="tap press rounded-[10px] bg-accent text-bg font-semibold px-3">
            기록
          </button>
        </div>
        <p className="text-[11px] text-dim mb-2">
          자동 수집이 막힌 것(포챔스 시즌 사용률 등)은 여기에 직접 넣으면 추이가 쌓인다.
        </p>

        {latest.length === 0 ? (
          <Empty>쌓인 값이 없다. 수집을 한 번 돌리거나 위에 직접 하나 넣어라.</Empty>
        ) : (
          <ul>
            {latest.map((m) => (
              <li key={m.metric_key} className="flex items-center gap-2 border-b border-line py-2">
                <span className="flex-1 text-[13px] truncate">{m.label ?? m.metric_key}</span>
                <span className="text-[13px] tabular-nums">{m.value}</span>
                {m.change_pct !== null && (
                  <Pill tone={Math.abs(m.change_pct) >= 5 ? "accent" : "muted"}>
                    {m.change_pct > 0 ? "+" : ""}
                    {m.change_pct.toFixed(1)}%
                  </Pill>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="주간 방향성 리포트"
        right={
          <button onClick={() => void regenerate("weekly")} disabled={busy === "weekly"} className="tap press text-[12px] text-accent disabled:opacity-40">
            {busy === "weekly" ? "쓰는 중" : "지금 생성"}
          </button>
        }
      >
        {report ? (
          <>
            <p className="text-[11px] text-dim mb-1">{report.date}</p>
            <p className="text-[15px] leading-relaxed whitespace-pre-line">{report.body}</p>
          </>
        ) : (
          <Empty>아직 리포트가 없다. 일요일 21시에 자동으로 생기고, 지금 생성으로 당겨볼 수도 있다.</Empty>
        )}
      </Section>

      <Section title="알림 기록">
        {alerts.length === 0 ? (
          <Empty>조용하다. 가격 변동·취약점·5일 정체·마감 24시간·소스 실패일 때만 울린다.</Empty>
        ) : (
          <ul>
            {alerts.map((a) => (
              <li key={a.id} className="border-b border-line py-2">
                <div className="flex items-center gap-2">
                  <Pill tone={a.level === "critical" ? "danger" : a.level === "warn" ? "accent" : "muted"}>{a.kind}</Pill>
                  <span className="flex-1 text-[14px]">{a.title}</span>
                  <span className="text-[11px] text-dim">{a.sent_at ? "발송" : "앱에만"}</span>
                </div>
                {a.body && <p className="text-[12px] text-muted mt-0.5">{a.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="데이터">
        <div className="flex flex-col gap-2">
          <a href="/api/backup" className="tap press rounded-[10px] border border-line px-4 py-3 text-[15px]">
            전체 백업 내려받기 (JSON)
          </a>
          <button onClick={() => void regenerate("morning")} disabled={busy === "morning"} className="tap press rounded-[10px] border border-line px-4 py-3 text-left text-[15px] disabled:opacity-40">
            {busy === "morning" ? "쓰는 중" : "아침 브리핑 다시 만들기"}
          </button>
          <button onClick={() => void logout()} className="tap press rounded-[10px] border border-line px-4 py-3 text-left text-[15px] text-danger">
            로그아웃
          </button>
        </div>
      </Section>
    </div>
  );
}
