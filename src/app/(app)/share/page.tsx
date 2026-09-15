"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Note = { id: string; title: string; body: string | null; source_url: string | null };

/**
 * iOS 공유시트 대응.
 * 단축어(Shortcuts)에서 `/share?text=...` 또는 `?url=...` 로 열면 자동 저장된다.
 */
function ShareInner() {
  const params = useSearchParams();
  const incoming = params.get("url") ?? params.get("text") ?? "";
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [note, setNote] = useState<Note | null>(null);
  const [message, setMessage] = useState("");
  const [input, setInput] = useState(incoming);

  async function save(value: string) {
    setState("working");
    setMessage("");
    try {
      const res = await fetch("/api/links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      const data = (await res.json()) as { note?: Note; error?: string };
      if (!res.ok || !data.note) throw new Error(data.error ?? "저장 실패");
      setNote(data.note);
      setState("done");
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : "저장하지 못했습니다.");
    }
  }

  useEffect(() => {
    if (incoming) void save(incoming);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);

  return (
    <div>
      <h1 className="text-lg font-semibold mb-1">링크 던지기</h1>
      <p className="text-sm text-muted mb-4">붙여넣으면 본문을 읽고 3줄로 줄여서 문서고에 넣는다.</p>

      <div className="flex gap-2 mb-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="https://"
          inputMode="url"
          className="tap flex-1 rounded-[10px] bg-surface2 border border-line px-3 py-3 outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={() => void save(input)}
          disabled={state === "working" || !input.trim()}
          className="tap press rounded-[10px] bg-accent text-bg font-semibold px-4 disabled:opacity-40"
        >
          {state === "working" ? "읽는 중" : "저장"}
        </button>
      </div>

      {state === "error" && <p className="text-sm text-danger">{message}</p>}

      {note && (
        <div className="rounded-[10px] border border-line bg-surface p-3">
          <p className="font-medium mb-1">{note.title}</p>
          <p className="text-sm text-muted whitespace-pre-line">{note.body}</p>
          {note.source_url && (
            <a href={note.source_url} className="text-xs text-accent mt-2 inline-block" target="_blank" rel="noreferrer">
              원문 열기
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={null}>
      <ShareInner />
    </Suspense>
  );
}
