/** 앱의 하루는 KST 기준이다. 서버는 UTC로 돌기 때문에 항상 이 함수를 거친다. */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function kstNow(d: Date = new Date()): Date {
  return new Date(d.getTime() + KST_OFFSET_MS);
}

/** YYYY-MM-DD (KST) */
export function kstDate(d: Date = new Date()): string {
  return kstNow(d).toISOString().slice(0, 10);
}

/** YYYYMMDD (NEIS 등 국내 API 포맷) */
export function kstCompact(d: Date = new Date()): string {
  return kstDate(d).replace(/-/g, "");
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(aIso: string, bIso: string): number {
  const a = Date.parse(aIso + "T00:00:00Z");
  const b = Date.parse(bIso + "T00:00:00Z");
  return Math.round((b - a) / 86_400_000);
}

/** "3일 전", "내일", "2시간 뒤" 같은 한국어 상대 표기 */
export function relKo(input: string | Date | null | undefined): string {
  if (!input) return "";
  const t = typeof input === "string" ? Date.parse(input) : input.getTime();
  if (!Number.isFinite(t)) return "";
  const diff = t - Date.now();
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60_000);
  const hour = Math.round(abs / 3_600_000);
  const day = Math.round(abs / 86_400_000);
  const future = diff > 0;
  if (min < 1) return "방금";
  if (min < 60) return future ? `${min}분 뒤` : `${min}분 전`;
  if (hour < 24) return future ? `${hour}시간 뒤` : `${hour}시간 전`;
  if (day === 1) return future ? "내일" : "어제";
  if (day < 30) return future ? `${day}일 뒤` : `${day}일 전`;
  const month = Math.round(day / 30);
  return future ? `${month}개월 뒤` : `${month}개월 전`;
}

export function dday(targetIso: string | null | undefined): string {
  if (!targetIso) return "";
  const n = daysBetween(kstDate(), targetIso.slice(0, 10));
  if (n === 0) return "D-DAY";
  return n > 0 ? `D-${n}` : `D+${-n}`;
}

/** 하루 구간(KST)을 UTC ISO 범위로 */
export function kstDayRange(dateIso: string): { from: string; to: string } {
  const from = new Date(Date.parse(dateIso + "T00:00:00Z") - KST_OFFSET_MS);
  const to = new Date(from.getTime() + 86_400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}
