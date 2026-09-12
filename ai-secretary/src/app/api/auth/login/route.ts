import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createSessionCookieValue, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { fail, readJson } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const expected = process.env.APP_PASSPHRASE;
  if (!expected) return fail("APP_PASSPHRASE가 서버에 설정되어 있지 않습니다.", 500);

  const { passphrase } = await readJson<{ passphrase?: string }>(req).catch(() => ({ passphrase: undefined }));
  if (!passphrase) return fail("암구호를 입력하세요.", 400);

  // 타이밍 공격 방지: 길이를 맞춘 해시끼리 비교한다.
  const a = crypto.createHash("sha256").update(passphrase).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  if (!crypto.timingSafeEqual(a, b)) {
    return fail("암구호가 맞지 않습니다.", 401);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: SESSION_COOKIE,
    value: await createSessionCookieValue(),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
