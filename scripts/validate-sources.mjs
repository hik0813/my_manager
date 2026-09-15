#!/usr/bin/env node
/**
 * config/sources.json 검증.
 * 새 관심사를 추가한 뒤 `npm run sources:check` 로 돌린다.
 * 코드를 고치지 않고도 추가가 맞는지 여기서 걸러진다.
 */
import { readFileSync } from "node:fs";

const KINDS = new Set(["rss", "rest", "github", "llm"]);
const SCHEDULES = new Set(["morning", "noon", "night", "daily", "hourly"]);
const MODES = new Set(["activity", "trending", "releases", "osv"]);

const defs = JSON.parse(readFileSync(new URL("../config/sources.json", import.meta.url), "utf8"));
const errors = [];
const warnings = [];
const seen = new Set();

if (!Array.isArray(defs)) {
  console.error("sources.json 최상위는 배열이어야 합니다.");
  process.exit(1);
}

for (const [i, d] of defs.entries()) {
  const at = `#${i} ${d.key ?? "(key 없음)"}`;
  if (!d.key) errors.push(`${at}: key가 없습니다.`);
  else if (seen.has(d.key)) errors.push(`${at}: key가 중복입니다.`);
  else if (!/^[a-z0-9_]+$/.test(d.key)) errors.push(`${at}: key는 소문자·숫자·밑줄만 씁니다.`);
  seen.add(d.key);

  if (!d.category) errors.push(`${at}: category가 없습니다.`);
  if (!d.title) errors.push(`${at}: title이 없습니다.`);
  if (!KINDS.has(d.kind)) errors.push(`${at}: kind는 ${[...KINDS].join(" | ")} 중 하나여야 합니다.`);
  if (d.schedule && !SCHEDULES.has(d.schedule)) errors.push(`${at}: schedule "${d.schedule}"은 없는 값입니다.`);

  const isStatic = Array.isArray(d.links) && d.links.length > 0;

  if (d.kind === "rss" && !isStatic && !d.endpoint) errors.push(`${at}: rss는 endpoint가 필요합니다.`);
  if (d.kind === "rest" && !isStatic) {
    if (!d.endpoint) errors.push(`${at}: rest는 endpoint가 필요합니다.`);
    if (!d.map?.title && !d.snapshot) errors.push(`${at}: rest는 map.title 또는 snapshot 중 하나는 있어야 합니다.`);
  }
  if (d.kind === "github" && !MODES.has(d.mode)) errors.push(`${at}: github mode는 ${[...MODES].join(" | ")} 중 하나여야 합니다.`);
  if (d.kind === "github" && d.mode === "releases" && !d.repos?.length) errors.push(`${at}: releases 모드는 repos가 필요합니다.`);
  if (d.kind === "llm" && !d.prompt) errors.push(`${at}: llm은 prompt가 필요합니다.`);

  if (d.snapshot) {
    if (!d.snapshot.metric_key || !d.snapshot.value) errors.push(`${at}: snapshot에는 metric_key와 value가 필요합니다.`);
    else if (!d.snapshot.metric_key.startsWith(d.key.split(":")[0])) {
      warnings.push(`${at}: metric_key는 "${d.key}|..." 로 시작해야 변화율 추적이 소스와 연결됩니다.`);
    }
  }

  const text = JSON.stringify(d);
  for (const m of text.matchAll(/\{\{env\.([A-Z0-9_]+)\}\}/g)) {
    if (!d.requires?.includes(m[1])) warnings.push(`${at}: {{env.${m[1]}}}를 쓰는데 requires에 없습니다. 키가 없을 때 실패로 집계됩니다.`);
  }
  if (text.includes("{{ref}}") && !d.foreach) {
    warnings.push(`${at}: {{ref}}를 쓰는데 foreach가 없습니다. 치환할 값이 없어 빈 문자열이 됩니다.`);
  }
}

for (const w of warnings) console.log(`경고  ${w}`);
for (const e of errors) console.error(`오류  ${e}`);
console.log(`\n소스 ${defs.length}개 · 오류 ${errors.length} · 경고 ${warnings.length}`);
process.exit(errors.length ? 1 : 0);
