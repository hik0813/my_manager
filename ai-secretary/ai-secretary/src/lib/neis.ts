import { env } from "./env";
import { fetchJson } from "./http";
import { kstCompact, kstNow } from "./dates";

/**
 * NEIS 오픈API — 급식 / 시간표 / 학사일정.
 * 키가 없으면 null을 돌려주고 화면은 "설정 필요"를 보여준다 (에러로 앱을 죽이지 않는다).
 */

const BASE = "https://open.neis.go.kr/hub";

type NeisBlock<T> = Record<string, ({ head?: unknown[] } | { row?: T[] })[]>;

function rowsOf<T>(json: unknown, endpoint: string): T[] {
  const block = json as NeisBlock<T> & { RESULT?: { CODE: string; MESSAGE: string } };
  if (block?.RESULT?.CODE && block.RESULT.CODE !== "INFO-000") {
    if (block.RESULT.CODE === "INFO-200") return []; // 해당 날짜 데이터 없음
    throw new Error(`NEIS ${endpoint}: ${block.RESULT.CODE} ${block.RESULT.MESSAGE}`);
  }
  const arr = (block as Record<string, unknown>)[endpoint];
  if (!Array.isArray(arr)) return [];
  for (const part of arr) {
    const row = (part as { row?: T[] }).row;
    if (Array.isArray(row)) return row;
  }
  return [];
}

function baseParams(): URLSearchParams | null {
  const key = env("NEIS_API_KEY");
  const atpt = env("NEIS_ATPT_CODE");
  const school = env("NEIS_SCHOOL_CODE");
  if (!key || !atpt || !school) return null;
  return new URLSearchParams({
    KEY: key,
    Type: "json",
    pIndex: "1",
    pSize: "100",
    ATPT_OFCDC_SC_CODE: atpt,
    SD_SCHUL_CODE: school,
  });
}

export type Meal = { type: string; dishes: string[]; kcal: string | null };

export async function getMeal(dateIso?: string): Promise<Meal[] | null> {
  const p = baseParams();
  if (!p) return null;
  p.set("MLSV_YMD", dateIso ? dateIso.replace(/-/g, "") : kstCompact());
  const json = await fetchJson(`${BASE}/mealServiceDietInfo?${p}`, {}, { timeoutMs: 10_000, retries: 1 });
  const rows = rowsOf<{ MMEAL_SC_NM: string; DDISH_NM: string; CAL_INFO?: string }>(json, "mealServiceDietInfo");
  return rows.map((r) => ({
    type: r.MMEAL_SC_NM,
    dishes: r.DDISH_NM.split(/<br\s*\/?>/i).map((d) => d.replace(/\([0-9.]+\)/g, "").trim()).filter(Boolean),
    kcal: r.CAL_INFO ?? null,
  }));
}

export type Lesson = { period: string; subject: string };

export async function getTimetable(dateIso?: string): Promise<Lesson[] | null> {
  const p = baseParams();
  const grade = env("NEIS_GRADE");
  const klass = env("NEIS_CLASS");
  if (!p || !grade || !klass) return null;

  const d = dateIso ? dateIso.replace(/-/g, "") : kstCompact();
  const now = kstNow();
  const year = Number(d.slice(0, 4));
  const month = Number(d.slice(4, 6));
  p.set("ALL_TI_YMD", d);
  p.set("GRADE", grade);
  p.set("CLASS_NM", klass);
  p.set("AY", String(year || now.getUTCFullYear()));
  p.set("SEM", month >= 8 ? "2" : "1");

  // 고등학교 기준. 중학교는 misTimetable, 초등학교는 elsTimetable.
  const endpoint = env("NEIS_SCHOOL_LEVEL") === "mis" ? "misTimetable" : env("NEIS_SCHOOL_LEVEL") === "els" ? "elsTimetable" : "hisTimetable";
  const json = await fetchJson(`${BASE}/${endpoint}?${p}`, {}, { timeoutMs: 10_000, retries: 1 });
  const rows = rowsOf<{ PERIO: string; ITRT_CNTNT: string }>(json, endpoint);
  return rows.map((r) => ({ period: r.PERIO, subject: r.ITRT_CNTNT }));
}

export type SchoolEvent = { date: string; name: string };

export async function getSchedule(fromIso?: string, toIso?: string): Promise<SchoolEvent[] | null> {
  const p = baseParams();
  if (!p) return null;
  const from = (fromIso ?? "").replace(/-/g, "") || kstCompact();
  const to = (toIso ?? "").replace(/-/g, "") || from;
  p.set("AA_FROM_YMD", from);
  p.set("AA_TO_YMD", to);
  const json = await fetchJson(`${BASE}/SchoolSchedule?${p}`, {}, { timeoutMs: 10_000, retries: 1 });
  const rows = rowsOf<{ AA_YMD: string; EVENT_NM: string }>(json, "SchoolSchedule");
  return rows
    .filter((r) => r.EVENT_NM && r.EVENT_NM !== "-")
    .map((r) => ({
      date: `${r.AA_YMD.slice(0, 4)}-${r.AA_YMD.slice(4, 6)}-${r.AA_YMD.slice(6, 8)}`,
      name: r.EVENT_NM,
    }));
}

/** 급식·시간표·학사일정을 한 번에. 실패한 항목만 null이 된다. */
export async function getSchoolDay(dateIso?: string) {
  const [meal, timetable, schedule] = await Promise.allSettled([
    getMeal(dateIso),
    getTimetable(dateIso),
    getSchedule(dateIso, dateIso),
  ]);
  return {
    meal: meal.status === "fulfilled" ? meal.value : null,
    timetable: timetable.status === "fulfilled" ? timetable.value : null,
    schedule: schedule.status === "fulfilled" ? schedule.value : null,
    errors: [meal, timetable, schedule]
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason))),
  };
}
