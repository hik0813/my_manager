import { db } from "./db";
import { APP_URL } from "./env";
import { escapeHtml, sendTelegram } from "./telegram";

export const DAILY_ALERT_LIMIT = 3;
const DEDUPE_WINDOW_DAYS = 7;

export type AlertInput = {
  kind: "price" | "vuln" | "stalled" | "due" | "source";
  dedupeKey: string;
  title: string;
  body?: string;
  level?: "info" | "warn" | "critical";
  url?: string;
};

/**
 * 조건에 맞는 알림만 보낸다.
 * - 같은 dedupe_key는 7일간 재발송 금지
 * - 하루 최대 3건 (critical은 예외 없이 한도에 포함된다 — 조용한 앱이 목적)
 */
export async function raiseAlert(a: AlertInput): Promise<{ sent: boolean; reason?: string }> {
  const sb = db();
  const since = new Date(Date.now() - DEDUPE_WINDOW_DAYS * 86_400_000).toISOString();

  const dup = await sb
    .from("alerts")
    .select("id")
    .eq("dedupe_key", a.dedupeKey)
    .gte("created_at", since)
    .limit(1);
  if (dup.error) throw new Error(dup.error.message);
  if (dup.data && dup.data.length > 0) return { sent: false, reason: "7일 내 동일 알림" };

  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const countRes = await sb
    .from("alerts")
    .select("id", { count: "exact", head: true })
    .not("sent_at", "is", null)
    .gte("sent_at", dayAgo);
  if (countRes.error) throw new Error(countRes.error.message);
  const overLimit = (countRes.count ?? 0) >= DAILY_ALERT_LIMIT;

  const inserted = await sb
    .from("alerts")
    .insert({
      kind: a.kind,
      dedupe_key: a.dedupeKey,
      title: a.title,
      body: a.body ?? null,
      level: a.level ?? "info",
    })
    .select("id")
    .single();
  if (inserted.error) throw new Error(inserted.error.message);

  // 한도를 넘으면 기록만 남기고 푸시는 하지 않는다. 앱에서는 보인다.
  if (overLimit) return { sent: false, reason: "하루 3건 한도 초과 (앱에만 기록)" };

  const icon = a.level === "critical" ? "🔴" : a.level === "warn" ? "🟡" : "🔵";
  const text = `${icon} <b>${escapeHtml(a.title)}</b>${a.body ? `\n${escapeHtml(a.body)}` : ""}`;
  const res = await sendTelegram(text, { url: a.url ?? `${APP_URL}/today` });

  if (res.ok) {
    await sb.from("alerts").update({ sent_at: new Date().toISOString() }).eq("id", inserted.data.id);
    return { sent: true };
  }
  return { sent: false, reason: res.reason };
}
