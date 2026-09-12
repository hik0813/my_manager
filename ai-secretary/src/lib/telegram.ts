import { env } from "./env";
import { fetchRetry } from "./http";

/**
 * 1차 알림 채널. 토큰이 없으면 조용히 스킵하되 결과를 반환해서
 * 호출부가 "안 보냈다"는 사실을 로그에 남길 수 있게 한다.
 */
export async function sendTelegram(
  text: string,
  opts: { silent?: boolean; url?: string } = {},
): Promise<{ ok: boolean; reason?: string }> {
  const token = env("TELEGRAM_BOT_TOKEN");
  const chatId = env("TELEGRAM_CHAT_ID");
  if (!token || !chatId) return { ok: false, reason: "TELEGRAM_BOT_TOKEN/CHAT_ID 미설정" };

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    disable_notification: opts.silent ?? false,
  };
  if (opts.url) {
    body.reply_markup = { inline_keyboard: [[{ text: "앱에서 열기", url: opts.url }]] };
  }

  try {
    const res = await fetchRetry(
      `https://api.telegram.org/bot${token}/sendMessage`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
      { timeoutMs: 10_000, retries: 1 },
    );
    if (!res.ok) return { ok: false, reason: `${res.status} ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
