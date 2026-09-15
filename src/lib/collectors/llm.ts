import { askClaudeJson } from "../claude";
import { kstDate } from "../dates";
import { render } from "./path";
import { clean, stableId, type CollectResult, type NormalizedItem } from "./kinds";
import type { SourceDef } from "../types";

type Generated = { title: string; summary: string; url?: string };

/**
 * 외부 API가 없는 항목(코딩 꿀팁, 오늘 배울 기술, 게임 추천)을 Claude가 만든다.
 * 하루 한 번만 돌게 schedule을 daily로 두고, external_id에 날짜를 넣어 중복을 막는다.
 */
export async function collectLlm(def: SourceDef, ctx: { context?: string } = {}): Promise<CollectResult> {
  if (!def.prompt) throw new Error(`${def.key}: prompt가 없습니다.`);
  const day = kstDate();
  const count = def.count ?? 1;

  const generated = await askClaudeJson<Generated[]>({
    system:
      "너는 한 사람의 개인 비서다. 한국어로, 구체적이고 실행 가능한 내용만 쓴다. " +
      "일반론·덕담·군더더기 금지. 반드시 JSON 배열만 출력한다.",
    prompt:
      `${render(def.prompt)}\n\n` +
      (ctx.context ? `참고 맥락:\n${ctx.context}\n\n` : "") +
      `오늘 날짜: ${day}\n` +
      `정확히 ${count}개를 만들어라.\n` +
      `출력 형식: [{"title": "40자 이내 제목", "summary": "2~4문장 본문", "url": "참고 링크 또는 생략"}]`,
    maxTokens: 1500,
    temperature: 0.7,
  });

  const items: NormalizedItem[] = generated.slice(0, count).map((g, i) => ({
    external_id: stableId(`${day}#${i}`),
    title: clean(g.title, 120) ?? `${def.title} ${day}`,
    url: g.url ?? null,
    summary: clean(g.summary, 600),
    published_at: new Date().toISOString(),
    payload: { generated: true, date: day },
  }));

  if (items.length === 0) throw new Error(`${def.key}: 생성 결과가 비었습니다.`);
  return { items };
}
