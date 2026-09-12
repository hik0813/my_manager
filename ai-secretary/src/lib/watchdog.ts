import { raiseAlert } from "./alerts";
import { computeChangePct } from "./collectors/run";
import { kstDate } from "./dates";
import { db } from "./db";
import type { Item, Project, Task, WatchItem } from "./types";

/**
 * 알림을 보낼 조건은 다섯 가지뿐이다. 그 외에는 침묵한다.
 *  1) 찜한 가격이 임계치 이상 변동
 *  2) 내 라이브러리 보안 취약점 발견
 *  3) 프로젝트 5일 이상 정체
 *  4) 마감 24시간 이내 할일
 *  5) 소스 연속 실패 (수집 파이프라인에서 직접 발생)
 */
export async function runWatchdog(): Promise<{ checked: string[]; raised: number }> {
  const sb = db();
  const checked: string[] = [];
  let raised = 0;

  // 1) 가격 변동
  const [watchRes, changes] = await Promise.all([sb.from("watchlist").select("*"), computeChangePct()]);
  const watches = (watchRes.data ?? []) as WatchItem[];
  for (const w of watches) {
    for (const prefix of ["itad_price", "naver_part_price"]) {
      const metric = `${prefix}|${w.ref}`;
      const pct = changes[metric];
      if (pct === undefined) continue;
      if (Math.abs(pct) < Number(w.threshold_pct)) continue;
      const dir = pct < 0 ? "하락" : "상승";
      const r = await raiseAlert({
        kind: "price",
        dedupeKey: `price:${metric}:${Math.round(pct)}`,
        level: pct < 0 ? "info" : "warn",
        title: `${w.label} 가격 ${Math.abs(pct).toFixed(1)}% ${dir}`,
        body: `임계치 ${w.threshold_pct}% 초과`,
      });
      if (r.sent) raised++;
    }
  }
  checked.push("price");

  // 2) 보안 취약점 — 지난 24시간에 새로 들어온 것만
  const vulns = await sb
    .from("items")
    .select("*")
    .eq("source_key", "osv_vulns")
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString())
    .limit(10);
  for (const v of ((vulns.data ?? []) as Item[])) {
    const r = await raiseAlert({
      kind: "vuln",
      dedupeKey: `vuln:${v.external_id}`,
      level: "critical",
      title: `취약점: ${v.title}`,
      body: v.summary ?? undefined,
      url: v.url ?? undefined,
    });
    if (r.sent) raised++;
  }
  checked.push("vuln");

  // 3) 정체된 프로젝트
  const stalled = await sb.from("projects_with_stall").select("*").gte("stall_days", 5).neq("status", "done");
  for (const p of ((stalled.data ?? []) as Project[])) {
    const days = p.stall_days ?? p.stalled_days;
    const r = await raiseAlert({
      kind: "stalled",
      dedupeKey: `stalled:${p.id}:${Math.floor(days / 5)}`,
      level: "warn",
      title: `${p.name} ${days}일째 멈춰 있다`,
      body: p.next_action ? `다음 할 일: ${p.next_action}` : "다음 할 일이 비어 있다. 하나만 정해라.",
    });
    if (r.sent) raised++;
    // 컬럼도 최신값으로 맞춘다
    await sb.from("projects").update({ stalled_days: days }).eq("id", p.id);
  }
  checked.push("stalled");

  // 4) 마감 24시간 이내 할일
  const soon = await sb
    .from("tasks")
    .select("*")
    .is("done_at", null)
    .not("due_at", "is", null)
    .lte("due_at", new Date(Date.now() + 86_400_000).toISOString());
  for (const t of ((soon.data ?? []) as Task[])) {
    const r = await raiseAlert({
      kind: "due",
      dedupeKey: `due:${t.id}:${kstDate()}`,
      level: "warn",
      title: `마감 임박: ${t.title}`,
      body: t.due_at ? `기한 ${t.due_at.slice(0, 16).replace("T", " ")}` : undefined,
    });
    if (r.sent) raised++;
  }
  checked.push("due");

  return { checked, raised };
}
