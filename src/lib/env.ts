/** Server-only env access. Never import this from a "use client" module. */

/**
 * 붙여넣기 사고를 여기서 흡수한다.
 * - 앞뒤 공백·줄바꿈 (대시보드에서 복사하면 자주 붙는다)
 * - 값을 감싼 따옴표 ("https://..." 처럼 통째로 붙여넣은 경우)
 */
function normalize(raw: string | undefined): string | undefined {
  if (raw == null) return undefined;
  let v = raw.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    v = v.slice(1, -1).trim();
  }
  return v.length > 0 ? v : undefined;
}

export function env(name: string): string | undefined {
  return normalize(process.env[name]);
}

export function requireEnv(name: string): string {
  const v = env(name);
  if (!v) {
    throw new Error(
      `환경변수 ${name}가 없습니다. Vercel 프로젝트 설정(Environment Variables) 또는 .env.local에 추가하고 재배포하세요.`,
    );
  }
  return v;
}

/** URL이어야 하는 값은 모양까지 확인하고, 틀리면 무엇이 틀렸는지 말해준다. */
export function requireUrlEnv(name: string, hint: string): string {
  const v = requireEnv(name);
  let parsed: URL;
  try {
    parsed = new URL(v);
  } catch {
    throw new Error(
      `환경변수 ${name}의 값이 URL이 아닙니다. 지금 값: "${v.slice(0, 60)}". ${hint}`,
    );
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(
      `환경변수 ${name}은 http(s) 주소여야 합니다. 지금은 "${parsed.protocol}"로 시작합니다. ${hint}`,
    );
  }
  return v.replace(/\/+$/, ""); // 끝 슬래시 제거
}

export const APP_URL = env("NEXT_PUBLIC_APP_URL")?.replace(/\/+$/, "") ?? "http://localhost:3000";
/**
 * 주의: 사양서에 적혀 있던 "claude-sonnet-4-6"은 존재하지 않는 모델 ID였다.
 * 그 값으로는 API가 404를 돌려주고 분류·브리핑·요약·퀴즈가 전부 실패한다.
 */
export const CLAUDE_MODEL = env("ANTHROPIC_MODEL") ?? "claude-sonnet-5";
