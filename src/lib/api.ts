import { NextResponse } from "next/server";

/** 라우트 공통 응답. 에러는 사과하지 않고 무엇이 어떻게 잘못됐는지 말한다. */
export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data as object, { status: 200, ...init });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function handle<T>(fn: () => Promise<T>) {
  try {
    return ok(await fn());
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api]", message);
    return fail(message, 500);
  }
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new Error("요청 본문이 JSON이 아닙니다.");
  }
}
