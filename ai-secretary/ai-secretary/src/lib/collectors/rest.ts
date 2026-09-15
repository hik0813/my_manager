import { fetchJson } from "../http";
import { pick, pickNumber, pickString, render, renderDeep } from "./path";
import { clean, stableId, toIso, type CollectResult, type NormalizedItem, type SnapshotPoint } from "./kinds";
import type { SourceDef } from "../types";

/**
 * 필드 지정 방식 두 가지:
 *  - "$.a.b"                 → 그 경로의 값
 *  - "{{$.name}} 최저가"     → 템플릿. {{$.경로}}는 행에서, {{ref}}·{{label}}은 vars에서 채운다.
 */
function resolveField(row: unknown, spec: string | undefined, vars: Record<string, string>): string | undefined {
  if (!spec) return undefined;
  if (spec.startsWith("$")) return pickString(row, spec);
  const filled = spec.replace(/\{\{\s*(\$[^}]*?)\s*\}\}/g, (_m, p: string) => pickString(row, p) ?? "");
  return render(filled, vars).trim() || undefined;
}

function snapshotValue(row: unknown, def: SourceDef): number | undefined {
  const raw = pickNumber(row, def.snapshot!.value);
  if (raw === undefined) return undefined;
  if (!def.snapshot!.divisor) return raw;
  const d = pickNumber(row, def.snapshot!.divisor);
  if (!d) return undefined;
  return Math.round((raw / d) * 1000) / 10; // 백분율, 소수 1자리
}

/**
 * 임의의 JSON REST 엔드포인트 → items (+ snapshots).
 * root가 배열이면 목록으로, 아니면 단일 값(스냅샷 위주)으로 처리한다.
 */
export async function collectRest(def: SourceDef, vars: Record<string, string> = {}): Promise<CollectResult> {
  const url = render(def.endpoint ?? "", vars);
  if (!url) throw new Error(`${def.key}: endpoint가 비어 있습니다.`);

  const init: RequestInit = {
    method: def.method ?? "GET",
    headers: renderDeep(def.headers ?? {}, vars),
  };
  if (def.body !== undefined) {
    init.body = JSON.stringify(renderDeep(def.body, vars));
    init.headers = { "content-type": "application/json", ...(init.headers as Record<string, string>) };
  }

  const data = await fetchJson<unknown>(url, init, { timeoutMs: 15_000, retries: 1 });
  const rooted = def.root ? pick(data, def.root) : data;
  if (rooted == null) throw new Error(`${def.key}: root 경로 "${def.root}"가 비었습니다.`);

  const items: NormalizedItem[] = [];
  const snapshots: SnapshotPoint[] = [];

  const rows = Array.isArray(rooted) ? rooted.slice(0, def.limit ?? 20) : [rooted];

  for (const row of rows) {
    const title = clean(resolveField(row, def.map?.title, vars), 200);
    if (title) {
      const link = resolveField(row, def.map?.url, vars) ?? null;
      items.push({
        external_id: stableId(resolveField(row, def.map?.external_id, vars) ?? link ?? title),
        title,
        url: link,
        summary: clean(resolveField(row, def.map?.summary, vars), 400),
        published_at: toIso(resolveField(row, def.map?.published_at, vars)),
        payload: (typeof row === "object" && row ? (row as Record<string, unknown>) : { value: row }),
      });
    }

    if (def.snapshot) {
      const value = snapshotValue(row, def);
      if (value !== undefined) {
        snapshots.push({
          metric_key: render(def.snapshot.metric_key, { ...vars, title: title ?? "" }),
          value,
          label: def.snapshot.label ? render(def.snapshot.label, { ...vars, title: title ?? "" }) : (title ?? vars.label ?? def.title),
        });
      }
    }
  }

  if (items.length === 0 && snapshots.length === 0) {
    throw new Error(`${def.key}: 응답에서 아무 것도 뽑지 못했습니다 (root/map 경로 확인).`);
  }
  return { items, snapshots };
}
