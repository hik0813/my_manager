/** 외부 호출 공통 규칙: 타임아웃 + 1회 재시도. 실패는 절대 조용히 삼키지 않는다. */

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 12_000,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        "user-agent": "personal-assistant/1.0 (+single-user)",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchRetry(
  url: string,
  init: RequestInit = {},
  { timeoutMs = 12_000, retries = 1 }: { timeoutMs?: number; retries?: number } = {},
): Promise<Response> {
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs);
      if (res.status >= 500 && attempt < retries) {
        last = new HttpError(`${res.status} ${res.statusText}`, res.status);
        await sleep(600 * (attempt + 1));
        continue;
      }
      return res;
    } catch (e) {
      last = e;
      if (attempt < retries) await sleep(600 * (attempt + 1));
    }
  }
  throw last instanceof Error ? last : new HttpError(String(last));
}

export async function fetchJson<T = unknown>(
  url: string,
  init: RequestInit = {},
  opts?: { timeoutMs?: number; retries?: number },
): Promise<T> {
  const res = await fetchRetry(url, init, opts);
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new HttpError(`${res.status} ${res.statusText} — ${body}`, res.status);
  }
  return (await res.json()) as T;
}

export async function fetchText(
  url: string,
  init: RequestInit = {},
  opts?: { timeoutMs?: number; retries?: number },
): Promise<string> {
  const res = await fetchRetry(url, init, opts);
  if (!res.ok) throw new HttpError(`${res.status} ${res.statusText}`, res.status);
  return res.text();
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
