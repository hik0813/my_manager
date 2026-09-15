"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CaptureType } from "@/lib/types";

export type Capture = {
  id: string;
  text: string;
  type: CaptureType | "pending" | "failed";
  fields: Record<string, unknown>;
  error?: string | null;
  created_at: string;
  _optimistic?: boolean;
};

export const TYPE_LABEL: Record<string, string> = {
  pending: "분류 중",
  failed: "분류 실패",
  task: "할일",
  idea: "아이디어",
  meal: "식단",
  error: "에러",
  log: "한 줄",
};

const CYCLE: CaptureType[] = ["task", "idea", "meal", "error", "log"];

export function notifyCaptureChanged() {
  window.dispatchEvent(new CustomEvent("capture:changed"));
}

export default function QuickCapture() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [recent, setRecent] = useState<Capture[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/capture?limit=8");
      if (!res.ok) return;
      const data = (await res.json()) as { captures: Capture[] };
      setRecent(data.captures);
    } catch {
      /* 오프라인이면 목록만 비어 있고 입력은 계속 가능 */
    }
  }, []);

  useEffect(() => {
    if (open) {
      void load();
      // 열면 즉시 키보드 포커스
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    if (new URLSearchParams(window.location.search).get("capture") === "1") setOpen(true);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** 저장 → 낙관적 삽입 → 백그라운드 분류 */
  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    const value = text.trim();
    if (!value) return;

    const tempId = `temp-${Date.now()}`;
    setText("");
    setError(null);
    setRecent((prev) => [
      { id: tempId, text: value, type: "pending", fields: {}, created_at: new Date().toISOString(), _optimistic: true },
      ...prev,
    ]);
    inputRef.current?.focus();

    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "저장 실패");
      const { capture } = (await res.json()) as { capture: Capture };
      setRecent((prev) => prev.map((c) => (c.id === tempId ? capture : c)));
      notifyCaptureChanged();

      // 분류는 UI를 기다리게 하지 않는다
      void fetch(`/api/capture/${capture.id}/classify`, { method: "POST" })
        .then(async (r) => {
          if (!r.ok) return;
          const { capture: done } = (await r.json()) as { capture: Capture };
          setRecent((prev) => prev.map((c) => (c.id === done.id ? done : c)));
          notifyCaptureChanged();
        })
        .catch(() => undefined);
    } catch (err) {
      setRecent((prev) => prev.filter((c) => c.id !== tempId));
      setText(value);
      setError(err instanceof Error ? err.message : "저장하지 못했습니다. 다시 시도하세요.");
    }
  }

  /**
   * 분류가 틀렸을 때 한 번의 탭으로 카테고리 변경.
   * 응답이 오기 전에 또 누르면 서버가 같은 이전 상태를 두 번 읽어 행이 중복 생성된다.
   * 그래서 처리 중인 항목은 잠근다.
   */
  async function cycleType(c: Capture) {
    if (pending.has(c.id)) return;
    const current = CYCLE.indexOf(c.type as CaptureType);
    const next = CYCLE[(current + 1) % CYCLE.length];
    setPending((p) => new Set(p).add(c.id));
    setRecent((prev) => prev.map((x) => (x.id === c.id ? { ...x, type: next } : x)));
    try {
      const res = await fetch(`/api/capture/${c.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: next }),
      });
      if (!res.ok) throw new Error("변경 실패");
      const { capture } = (await res.json()) as { capture: Capture };
      setRecent((prev) => prev.map((x) => (x.id === capture.id ? capture : x)));
      notifyCaptureChanged();
    } catch {
      setRecent((prev) => prev.map((x) => (x.id === c.id ? c : x)));
      setError("카테고리를 바꾸지 못했습니다. 네트워크를 확인하세요.");
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(c.id);
        return n;
      });
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="빠른 기록"
        onClick={() => setOpen(true)}
        className="fixed z-40 tap press h-14 w-14 rounded-full bg-accent text-bg text-2xl font-light shadow-lg flex items-center justify-center right-[max(1rem,calc(50vw-20rem))]"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)" }}
      >
        +
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60" onClick={() => setOpen(false)}>
          <div
            className="bg-surface border-t border-line rounded-t-2xl px-4 pt-3 pb-4 safe-bottom max-h-[85dvh] flex flex-col w-full max-w-2xl mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded bg-line" />

            <form onSubmit={save} className="flex gap-2">
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                enterKeyHint="done"
                placeholder="한 줄 적고 엔터"
                className="tap flex-1 rounded-[10px] bg-surface2 border border-line px-3 py-3 outline-none focus:border-accent"
              />
              <button type="submit" className="tap press rounded-[10px] bg-accent text-bg font-semibold px-4">
                저장
              </button>
            </form>

            {error && <p className="text-sm text-danger mt-2">{error}</p>}

            <div className="mt-3 overflow-y-auto">
              {recent.length === 0 ? (
                <p className="text-sm text-dim py-4">
                  아무거나 한 줄 적어라. 할일인지 식단인지 에러인지는 저장한 뒤에 알아서 나뉜다.
                </p>
              ) : (
                <ul>
                  {recent.map((c) => (
                    <li key={c.id} className="flex items-start gap-2 border-b border-line py-2.5">
                      <button
                        type="button"
                        onClick={() => cycleType(c)}
                        disabled={c.type === "pending" || c._optimistic || pending.has(c.id)}
                        className={`tap shrink-0 text-[11px] px-2 py-1 rounded border disabled:opacity-50 ${
                          c.type === "pending"
                            ? "text-dim border-line"
                            : c.type === "failed"
                              ? "text-danger border-danger/40"
                              : "text-accent border-accent/40"
                        }`}
                      >
                        {pending.has(c.id) ? "바꾸는 중" : (TYPE_LABEL[c.type] ?? c.type)}
                      </button>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm leading-snug">{c.text}</span>
                        {/* 왜 실패했는지 숨기면 고칠 방법이 없다 */}
                        {c.type === "failed" && c.error && (
                          <span className="block text-[11px] text-danger mt-0.5 break-all">{c.error}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
