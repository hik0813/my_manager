/**
 * 1인 전용 세션.
 * 쿠키 값 = `${expiresAtMs}.${base64url(HMAC-SHA256(secret, expiresAtMs))}`
 * Web Crypto만 쓰므로 edge middleware와 node 라우트 양쪽에서 같은 코드가 돈다.
 */

export const SESSION_COOKIE = "sid";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365; // 365일 — 아이폰에서 매번 로그인하면 안 쓰게 된다

function secret(): string {
  const s = process.env.SESSION_SECRET ?? process.env.APP_PASSPHRASE;
  if (!s) throw new Error("SESSION_SECRET(또는 APP_PASSPHRASE)가 설정되지 않았습니다.");
  return s;
}

function b64url(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return b64url(sig);
}

export async function createSessionCookieValue(): Promise<string> {
  const exp = String(Date.now() + SESSION_MAX_AGE * 1000);
  return `${exp}.${await sign(exp)}`;
}

/** 상수시간 문자열 비교 (edge에서도 동작). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifySessionCookieValue(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return false;
  const exp = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expMs = Number(exp);
  if (!Number.isFinite(expMs) || expMs < Date.now()) return false;
  return safeEqual(sig, await sign(exp));
}

/** cron 라우트 전용 인증. Authorization: Bearer ${CRON_SECRET} */
export function verifyCronRequest(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  // Vercel Cron은 CRON_SECRET을 Authorization 헤더로 자동 첨부한다.
  return safeEqual(token, expected);
}
