"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/today";

  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "암구호가 맞지 않습니다. 다시 입력하세요.");
        setBusy(false);
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError("서버에 연결하지 못했습니다. 네트워크를 확인하고 다시 시도하세요.");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh flex flex-col justify-center px-6 safe-top safe-bottom">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8">
          <div className="h-6 w-6 rounded-full bg-accent mb-4" />
          <h1 className="text-xl font-semibold">개인 비서</h1>
          <p className="text-muted text-sm mt-1">암구호를 입력하면 1년 동안 다시 묻지 않는다.</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="password"
            inputMode="text"
            autoComplete="current-password"
            autoFocus
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="암구호"
            className="tap w-full rounded-[10px] bg-surface2 border border-line px-4 py-3 outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={busy || passphrase.length === 0}
            className="tap press w-full rounded-[10px] bg-accent text-bg font-semibold py-3 disabled:opacity-40"
          >
            {busy ? "확인 중" : "들어가기"}
          </button>
        </form>

        {error && (
          <p className="mt-3 text-sm text-danger">{error}</p>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
