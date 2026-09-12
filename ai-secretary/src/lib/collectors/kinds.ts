export type NormalizedItem = {
  external_id: string;
  title: string;
  url?: string | null;
  summary?: string | null;
  published_at?: string | null;
  payload?: Record<string, unknown>;
};

export type SnapshotPoint = {
  metric_key: string;
  value: number;
  label?: string;
  meta?: Record<string, unknown>;
};

export type CollectResult = {
  items: NormalizedItem[];
  snapshots?: SnapshotPoint[];
};

/** 제목/요약에서 태그를 걷어내고 길이를 자른다. */
export function clean(html: string | undefined | null, max = 400): string | null {
  if (!html) return null;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max) + "…" : text;
}

export function toIso(input: unknown): string | null {
  if (!input) return null;
  if (typeof input === "number") {
    // 초 단위 epoch도 흔하다
    const ms = input < 1e12 ? input * 1000 : input;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof input !== "string") return null;
  const n = Number(input);
  if (Number.isFinite(n) && input.trim().length >= 9) return toIso(n);
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function stableId(...parts: (string | number | undefined | null)[]): string {
  const raw = parts.filter(Boolean).join("|");
  if (raw.length <= 180) return raw;
  // 길면 간단한 해시로 줄인다 (충돌 확률은 개인용 규모에서 무시 가능)
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
  return raw.slice(0, 120) + "#" + (h >>> 0).toString(36);
}
