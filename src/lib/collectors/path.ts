/** sources.json에서 쓰는 축약 JSONPath: `$.a.b[0].c`, `a.b`, `$` */
export function pick(obj: unknown, path: string | undefined): unknown {
  if (!path) return undefined;
  if (path === "$" || path === "") return obj;
  const clean = path.startsWith("$.") ? path.slice(2) : path.startsWith("$") ? path.slice(1) : path;
  let cur: unknown = obj;
  for (const rawSeg of clean.split(".")) {
    if (cur == null || rawSeg === "") continue;
    const m = rawSeg.match(/^([^[\]]*)((?:\[\d+\])*)$/);
    if (!m) return undefined;
    const [, key, idxPart] = m;
    if (key) {
      if (typeof cur !== "object") return undefined;
      cur = (cur as Record<string, unknown>)[key];
    }
    if (idxPart) {
      for (const im of idxPart.matchAll(/\[(\d+)\]/g)) {
        if (!Array.isArray(cur)) return undefined;
        cur = cur[Number(im[1])];
      }
    }
  }
  return cur;
}

export function pickString(obj: unknown, path: string | undefined): string | undefined {
  const v = pick(obj, path);
  if (v == null) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return undefined;
}

export function pickNumber(obj: unknown, path: string | undefined): number | undefined {
  const v = pick(obj, path);
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** `{{env.KEY}}`, `{{ref}}`, `{{label}}`, `{{today}}`, `{{daysAgo:7}}` 치환 */
export function render(input: string, vars: Record<string, string> = {}): string {
  return input.replace(/\{\{([^}]+)\}\}/g, (_m, expr: string) => {
    const key = expr.trim();
    if (key.startsWith("env.")) return process.env[key.slice(4)] ?? "";
    if (key.startsWith("daysAgo:")) {
      const n = Number(key.slice(8)) || 0;
      const d = new Date(Date.now() - n * 86_400_000);
      return d.toISOString().slice(0, 10);
    }
    if (key === "today") return new Date().toISOString().slice(0, 10);
    return vars[key] ?? "";
  });
}

export function renderDeep<T>(value: T, vars: Record<string, string>): T {
  if (typeof value === "string") return render(value, vars) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => renderDeep(v, vars)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = renderDeep(v, vars);
    return out as T;
  }
  return value;
}
