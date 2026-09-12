import sourcesJson from "@config/sources.json";
import { db } from "../db";
import { raiseAlert } from "../alerts";
import { changeRate, scoreItem, type ScoringContext } from "../scoring";
import type { Item, Schedule, SourceDef, SourceRow } from "../types";
import { collectGithub } from "./github";
import { collectLlm } from "./llm";
import { collectRest } from "./rest";
import { collectRss } from "./rss";
import { renderDeep } from "./path";
import { stableId, type CollectResult } from "./kinds";

export const SOURCE_DEFS = sourcesJson as SourceDef[];

const HEALTH_FAIL_THRESHOLD = 3;

export type RunReport = {
  slot: string;
  ran: number;
  ok: number;
  failed: number;
  inserted: number;
  snapshots: number;
  details: { key: string; ok: boolean; items?: number; error?: string; skipped?: string }[];
};

function matchesSlot(def: SourceDef, slot: string): boolean {
  const s: Schedule = def.schedule ?? "daily";
  if (slot === "all") return true;
  if (s === "hourly") return true;
  if (s === "daily") return slot === "morning";
  return s === slot;
}

/** config/sources.json → sources 테이블 동기화. JSON이 단일 진실이다. */
export async function syncSources(): Promise<void> {
  const sb = db();
  const rows = SOURCE_DEFS.map((d) => ({
    key: d.key,
    category: d.category,
    kind: d.kind,
    config: d as unknown as Record<string, unknown>,
    enabled: d.enabled !== false,
  }));
  const res = await sb.from("sources").upsert(rows, { onConflict: "key" });
  if (res.error) throw new Error(res.error.message);

  // JSON에서 사라진 소스는 비활성화 (데이터는 남긴다)
  const keys = rows.map((r) => r.key);
  const off = await sb.from("sources").update({ enabled: false }).not("key", "in", `(${keys.map((k) => `"${k}"`).join(",")})`);
  if (off.error) throw new Error(off.error.message);
}

async function watchTerms(): Promise<{ terms: string[]; steamApps: { ref: string; label: string }[]; packages: string[]; byKind: Record<string, { ref: string; label: string }[]> }> {
  const sb = db();
  const res = await sb.from("watchlist").select("kind, ref, label");
  if (res.error) throw new Error(res.error.message);
  const rows = (res.data ?? []) as { kind: string; ref: string; label: string }[];
  const byKind: Record<string, { ref: string; label: string }[]> = {};
  for (const r of rows) (byKind[r.kind] ??= []).push({ ref: r.ref, label: r.label });
  return {
    terms: rows.flatMap((r) => [r.label.toLowerCase(), r.ref.toLowerCase()]),
    steamApps: byKind["steam_app"] ?? [],
    packages: (byKind["package"] ?? []).map((p) => p.ref),
    byKind,
  };
}

function missingEnv(def: SourceDef): string[] {
  return (def.requires ?? []).filter((k) => !process.env[k]);
}

/** 어댑터 dispatch. 여기 4개 말고는 없다. */
async function runAdapter(
  def: SourceDef,
  vars: Record<string, string>,
  ctx: { packages: string[] },
): Promise<CollectResult> {
  // 자동수집이 불가능한 대상(포챔스 메타 등)은 정적 링크 카드로 선언한다 — 네트워크 호출 없음.
  if (def.links?.length) {
    return {
      items: def.links.map((l) => ({
        external_id: stableId(l.url),
        title: l.title,
        url: l.url,
        summary: null,
        published_at: null,
        payload: { static_link: true },
      })),
    };
  }

  switch (def.kind) {
    case "rss":
      return collectRss(def);
    case "rest":
      return collectRest(def, vars);
    case "github":
      return collectGithub(def, { packages: ctx.packages });
    case "llm":
      return collectLlm(def);
    default:
      throw new Error(`${def.key}: 알 수 없는 kind "${def.kind}"`);
  }
}

/** foreach가 있으면 찜 목록만큼 소스를 복제한다. */
function expand(def: SourceDef, byKind: Record<string, { ref: string; label: string }[]>): { def: SourceDef; vars: Record<string, string> }[] {
  if (!def.foreach) return [{ def, vars: {} }];
  const rows = byKind[def.foreach.watch_kind] ?? [];
  return rows.map((r) => ({
    def: { ...renderDeep(def, { ref: r.ref, label: r.label }), key: `${def.key}:${r.ref}` },
    vars: { ref: r.ref, label: r.label },
  }));
}

export async function runCollection(slot: string): Promise<RunReport> {
  const sb = db();
  await syncSources();
  const watch = await watchTerms();

  const report: RunReport = { slot, ran: 0, ok: 0, failed: 0, inserted: 0, snapshots: 0, details: [] };

  const planned = SOURCE_DEFS.filter((d) => d.enabled !== false && matchesSlot(d, slot)).flatMap((d) =>
    expand(d, watch.byKind),
  );

  for (const { def, vars } of planned) {
    const missing = missingEnv(def);
    if (missing.length > 0) {
      report.details.push({ key: def.key, ok: true, skipped: `환경변수 없음: ${missing.join(", ")}` });
      continue;
    }

    report.ran++;
    const parentKey = def.foreach ? def.key.split(":")[0] : def.key;

    try {
      const result = await runAdapter(def, vars, { packages: watch.packages });

      if (result.items.length > 0) {
        const rows = result.items.map((i) => ({
          source_key: def.key,
          external_id: i.external_id,
          title: i.title,
          url: i.url ?? null,
          summary: i.summary ?? null,
          published_at: i.published_at ?? null,
          payload: i.payload ?? {},
        }));
        // dedupe: (source_key, external_id) unique. 이미 있으면 최신 값으로 갱신.
        const up = await sb.from("items").upsert(rows, { onConflict: "source_key,external_id", ignoreDuplicates: false });
        if (up.error) throw new Error(up.error.message);
        report.inserted += rows.length;
      }

      if (result.snapshots?.length) {
        const snaps = result.snapshots.map((s) => ({
          metric_key: s.metric_key,
          value: s.value,
          label: s.label ?? null,
          meta: s.meta ?? {},
        }));
        const sres = await sb.from("snapshots").insert(snaps);
        if (sres.error) throw new Error(sres.error.message);
        report.snapshots += snaps.length;
      }

      await sb
        .from("sources")
        .update({ last_ok_at: new Date().toISOString(), fail_count: 0, last_error: null, notified_at: null })
        .eq("key", parentKey);

      report.ok++;
      report.details.push({ key: def.key, ok: true, items: result.items.length });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      report.failed++;
      report.details.push({ key: def.key, ok: false, error: message });

      // 실패를 조용히 삼키지 않는다 — fail_count 증가 + 로그 + 연속 3회면 알림
      const cur = await sb.from("sources").select("fail_count, notified_at").eq("key", parentKey).single();
      const failCount = ((cur.data as Pick<SourceRow, "fail_count"> | null)?.fail_count ?? 0) + 1;
      await sb
        .from("sources")
        .update({ fail_count: failCount, last_error: message.slice(0, 500) })
        .eq("key", parentKey);

      console.error(`[collect] ${def.key} 실패 (${failCount}회):`, message);

      if (failCount >= HEALTH_FAIL_THRESHOLD) {
        await raiseAlert({
          kind: "source",
          dedupeKey: `source-fail:${parentKey}`,
          level: "warn",
          title: `수집 소스 "${def.title}" 가 ${failCount}회 연속 실패`,
          body: message.slice(0, 300),
        }).catch((err) => console.error("[collect] 헬스 알림 실패:", err));
        await sb.from("sources").update({ notified_at: new Date().toISOString() }).eq("key", parentKey);
      }
    }
  }

  await rescoreRecentItems();
  return report;
}

/** 수집 직후 최근 항목 스코어를 다시 계산한다. */
export async function rescoreRecentItems(): Promise<number> {
  const sb = db();
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();

  const [itemsRes, viewsRes, watch] = await Promise.all([
    sb.from("items").select("*").gte("created_at", since).limit(1000),
    sb.from("views").select("category").gte("viewed_at", new Date(Date.now() - 7 * 86_400_000).toISOString()),
    watchTerms(),
  ]);
  if (itemsRes.error) throw new Error(itemsRes.error.message);

  const items = (itemsRes.data ?? []) as Item[];
  const viewCounts: Record<string, number> = {};
  for (const v of (viewsRes.data ?? []) as { category: string }[]) {
    viewCounts[v.category] = (viewCounts[v.category] ?? 0) + 1;
  }

  const categoryOf: Record<string, string> = {};
  for (const d of SOURCE_DEFS) categoryOf[d.key] = d.category;
  for (const i of items) {
    if (!categoryOf[i.source_key]) {
      const base = i.source_key.split(":")[0];
      categoryOf[i.source_key] = categoryOf[base] ?? "etc";
    }
  }

  const changePct = await computeChangePct();

  const ctx: ScoringContext = { watchTerms: watch.terms, categoryOf, viewCounts, changePct };
  const updates = items.map((i) => ({ id: i.id, score: scoreItem(i, ctx) })).filter((u, idx) => u.score !== items[idx].score);

  for (let i = 0; i < updates.length; i += 100) {
    const chunk = updates.slice(i, i + 100);
    await Promise.all(chunk.map((u) => sb.from("items").update({ score: u.score }).eq("id", u.id)));
  }
  return updates.length;
}

/** 소스별 최근 스냅샷 변화율(%) — 스코어링과 가격 알림이 함께 쓴다. */
export async function computeChangePct(): Promise<Record<string, number>> {
  const sb = db();
  const res = await sb
    .from("snapshots")
    .select("metric_key, value, captured_at")
    .gte("captured_at", new Date(Date.now() - 3 * 86_400_000).toISOString())
    .order("captured_at", { ascending: false })
    .limit(2000);
  if (res.error) throw new Error(res.error.message);

  const byMetric: Record<string, { value: number; at: string }[]> = {};
  for (const r of (res.data ?? []) as { metric_key: string; value: number; captured_at: string }[]) {
    (byMetric[r.metric_key] ??= []).push({ value: Number(r.value), at: r.captured_at });
  }

  const out: Record<string, number> = {};
  for (const [metric, points] of Object.entries(byMetric)) {
    if (points.length < 2) continue;
    const rate = changeRate(points[points.length - 1].value, points[0].value);
    const sourceKey = metric.split("|")[0];
    out[sourceKey] = Math.max(Math.abs(out[sourceKey] ?? 0), Math.abs(rate)) * Math.sign(rate || 1);
    out[metric] = rate;
  }
  return out;
}
