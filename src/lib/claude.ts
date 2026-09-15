import { CLAUDE_MODEL, requireEnv } from "./env";
import { fetchRetry, HttpError } from "./http";

/**
 * Claude Messages API 얇은 래퍼. 서버에서만 호출된다.
 * SDK 대신 fetch를 쓰는 이유: 의존성 하나 줄이고 타임아웃을 직접 통제하기 위해.
 */

type ContentBlock = { type: string; text?: string };
type MessagesResponse = { content: ContentBlock[] };

export async function askClaude(opts: {
  system?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}): Promise<string> {
  const res = await fetchRetry(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": requireEnv("ANTHROPIC_API_KEY"),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: opts.maxTokens ?? 1024,
        temperature: opts.temperature ?? 0.3,
        ...(opts.system ? { system: opts.system } : {}),
        messages: [{ role: "user", content: opts.prompt }],
      }),
    },
    { timeoutMs: opts.timeoutMs ?? 45_000, retries: 1 },
  );

  if (!res.ok) {
    throw new HttpError(`Claude API ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status);
  }
  const data = (await res.json()) as MessagesResponse;
  return data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();
}

/** 모델이 앞뒤로 설명을 붙여도 JSON만 뽑아낸다. */
export function extractJson<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : raw).trim();
  const start = body.search(/[[{]/);
  if (start < 0) throw new Error(`JSON을 찾지 못했습니다: ${raw.slice(0, 200)}`);
  const opener = body[start];
  const closer = opener === "{" ? "}" : "]";
  const end = body.lastIndexOf(closer);
  if (end < start) throw new Error(`JSON이 끊겼습니다: ${raw.slice(0, 200)}`);
  return JSON.parse(body.slice(start, end + 1)) as T;
}

export async function askClaudeJson<T>(opts: {
  system?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}): Promise<T> {
  return extractJson<T>(await askClaude(opts));
}
