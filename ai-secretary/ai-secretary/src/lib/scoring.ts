import type { Item } from "./types";

export type ScoringContext = {
  /** 찜/구독 라벨·참조 문자열 (소문자) */
  watchTerms: string[];
  /** 소스키 → 카테고리 */
  categoryOf: Record<string, string>;
  /** 최근 7일간 카테고리별 열람 수 */
  viewCounts: Record<string, number>;
  /** 소스키 → 전일 대비 변화율(%) 최대값 */
  changePct: Record<string, number>;
};

/**
 * 0~100. 상위 3개만 '오늘의 핵심'으로 올라간다.
 * 가중치는 "내가 등록한 것 > 큰 변화 > 내 관심 카테고리 > 신선도" 순.
 */
export function scoreItem(item: Item, ctx: ScoringContext): number {
  let score = 0;

  // 1) 내가 찜/구독한 대상인가 — 가장 큰 가중치
  const hay = `${item.title} ${item.summary ?? ""}`.toLowerCase();
  const watched = ctx.watchTerms.some((t) => t.length >= 2 && hay.includes(t));
  if (watched) score += 40;

  // 2) 변화폭이 임계치를 넘었는가
  const change = Math.abs(ctx.changePct[item.source_key] ?? 0);
  if (change >= 20) score += 25;
  else if (change >= 10) score += 18;
  else if (change >= 5) score += 12;

  // 보안 취약점은 항상 최우선
  if (item.payload && (item.payload as { vuln?: boolean }).vuln) score += 30;

  // 3) 최근 7일간 자주 열어본 카테고리인가 (seen_at 기반 학습)
  const cat = ctx.categoryOf[item.source_key] ?? "etc";
  const views = ctx.viewCounts[cat] ?? 0;
  const total = Object.values(ctx.viewCounts).reduce((a, b) => a + b, 0);
  if (total > 0) score += Math.round(Math.min(1, views / total) * 20);

  // 4) 발행 신선도 — 24시간 안이면 만점, 7일이면 0
  const published = item.published_at ? Date.parse(item.published_at) : Date.parse(item.created_at);
  if (Number.isFinite(published)) {
    const ageH = (Date.now() - published) / 3_600_000;
    if (ageH <= 24) score += 15;
    else if (ageH <= 72) score += 9;
    else if (ageH <= 168) score += 4;
  }

  // 이미 본 것은 상단에서 밀어낸다
  if (item.seen_at) score -= 25;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/** 전일 대비 변화율(%) */
export function changeRate(previous: number, current: number): number {
  if (!Number.isFinite(previous) || previous === 0) return 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}
