/** Server-only env access. Never import this from a "use client" module. */

export function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export function requireEnv(name: string): string {
  const v = env(name);
  if (!v) {
    throw new Error(
      `환경변수 ${name}가 없습니다. .env.local 또는 Vercel 프로젝트 설정에 추가하세요.`,
    );
  }
  return v;
}

export const APP_URL = env("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000";
export const CLAUDE_MODEL = env("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6";
