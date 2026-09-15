import { askClaudeJson } from "./claude";
import { kstDate } from "./dates";
import { db } from "./db";
import { searchFood } from "./mfds";
import type { CaptureType } from "./types";

export type Classification = {
  type: CaptureType;
  title: string;
  /** task */
  due_at?: string | null;
  priority?: number;
  project?: string | null;
  /** meal */
  food?: string | null;
  /** error */
  message?: string | null;
  solution?: string | null;
  tags?: string[];
  /** idea / log */
  body?: string | null;
  mood?: number | null;
};

export async function classifyText(text: string, projectNames: string[]): Promise<Classification> {
  return askClaudeJson<Classification>({
    system:
      "너는 한 사람의 개인 비서다. 사용자가 던진 한 줄을 다섯 종류 중 하나로 분류하고 필드를 뽑는다. " +
      "추측으로 필드를 채우지 말고, 없으면 null로 둔다. JSON 객체 하나만 출력한다.",
    prompt:
      `입력: ${JSON.stringify(text)}\n` +
      `오늘(KST): ${kstDate()}\n` +
      `등록된 프로젝트: ${projectNames.join(", ") || "(없음)"}\n\n` +
      `분류 기준\n` +
      `- task: 해야 할 일. "~하기", "~해야", 마감이 있는 것\n` +
      `- idea: 만들고 싶은 것, 떠오른 생각, 기획 메모\n` +
      `- meal: 먹은 것 / 먹을 것\n` +
      `- error: 에러 메시지, 안 되는 현상, 그 해결법\n` +
      `- log: 오늘 있었던 일 · 기분 · 회고 한 줄\n\n` +
      `출력 스키마\n` +
      `{"type":"task|idea|meal|error|log","title":"짧은 제목",` +
      `"due_at":"ISO8601 또는 null","priority":1|2|3,"project":"등록된 프로젝트 이름 또는 null",` +
      `"food":"음식명 또는 null","message":"에러 본문 또는 null","solution":"해결법 또는 null",` +
      `"tags":["소문자 태그"],"body":"본문 또는 null","mood":1~5 또는 null}`,
    maxTokens: 700,
    temperature: 0,
  });
}

/** 분류 결과를 실제 테이블로 물질화하고 (table, id)를 돌려준다. */
export async function materialize(
  c: Classification,
  rawText: string,
): Promise<{ table: string; id: string }> {
  const sb = db();

  switch (c.type) {
    case "task": {
      let projectId: string | null = null;
      if (c.project) {
        const p = await sb.from("projects").select("id").eq("name", c.project).maybeSingle();
        projectId = (p.data as { id: string } | null)?.id ?? null;
        if (projectId) {
          await sb.from("projects").update({ last_active_at: new Date().toISOString() }).eq("id", projectId);
        }
      }
      const res = await sb
        .from("tasks")
        .insert({
          title: c.title || rawText,
          note: c.body ?? null,
          due_at: c.due_at ?? null,
          priority: c.priority ?? 2,
          project_id: projectId,
        })
        .select("id")
        .single();
      if (res.error) throw new Error(res.error.message);
      return { table: "tasks", id: res.data.id };
    }

    case "idea": {
      const title = c.title || rawText.slice(0, 60);
      // 제목과 본문이 같은 문장이면 본문을 비운다 (화면에 같은 줄이 두 번 뜨는 걸 막는다)
      const body = c.body && c.body.trim() !== title.trim() ? c.body : null;
      const res = await sb
        .from("notes")
        .insert({ type: "idea", title, body, tags: c.tags ?? [] })
        .select("id")
        .single();
      if (res.error) throw new Error(res.error.message);
      return { table: "notes", id: res.data.id };
    }

    case "meal": {
      const name = c.food || c.title || rawText;
      let nutrition = null;
      try {
        nutrition = (await searchFood(name, 1))[0] ?? null;
      } catch {
        // 식약처 조회 실패는 치명적이지 않다. 수동 입력 폴백.
      }
      const res = await sb
        .from("meals")
        .insert({
          name,
          kcal: nutrition?.kcal ?? null,
          carb: nutrition?.carb ?? null,
          protein: nutrition?.protein ?? null,
          fat: nutrition?.fat ?? null,
          source: nutrition ? "mfds" : "manual",
        })
        .select("id")
        .single();
      if (res.error) throw new Error(res.error.message);
      return { table: "meals", id: res.data.id };
    }

    case "error": {
      const res = await sb
        .from("error_logs")
        .insert({
          title: c.title || rawText.slice(0, 80),
          message: c.message && c.message.trim() !== (c.title || "").trim() ? c.message : null,
          solution: c.solution ?? null,
          tags: c.tags ?? [],
        })
        .select("id")
        .single();
      if (res.error) throw new Error(res.error.message);
      return { table: "error_logs", id: res.data.id };
    }

    case "log":
    default: {
      const date = kstDate();
      const res = await sb
        .from("daily_logs")
        .upsert({ date, one_liner: c.body || c.title || rawText, mood: c.mood ?? null }, { onConflict: "date" })
        .select("id")
        .single();
      if (res.error) throw new Error(res.error.message);
      return { table: "daily_logs", id: res.data.id };
    }
  }
}

type Created = { table: string; id: string };

/**
 * 카테고리 재지정: 이 캡처가 지금까지 만든 행을 전부 지우고 새 타입으로 다시 만든다.
 *
 * 하나만 기억하면, 칩을 빠르게 연타했을 때 먼저 만들어진 행이 고아로 남는다
 * (실제로 같은 메모가 식단·문서고·한 줄에 동시에 남는 사고가 있었다).
 * 그래서 만든 행을 fields._created에 전부 쌓아두고 매번 통째로 정리한다.
 */
export async function rematerialize(
  captureId: string,
  newType: CaptureType,
): Promise<{ table: string; id: string; created: Created[] }> {
  const sb = db();
  const cur = await sb.from("captures").select("*").eq("id", captureId).single();
  if (cur.error) throw new Error(cur.error.message);
  const row = cur.data as {
    text: string;
    target_table: string | null;
    target_id: string | null;
    fields: Classification & { _created?: Created[] };
  };

  // 지금까지 만든 것 + 현재 target을 합쳐 중복 제거
  const history: Created[] = [...(row.fields?._created ?? [])];
  if (row.target_table && row.target_id) history.push({ table: row.target_table, id: row.target_id });
  const unique = history.filter(
    (h, i) => history.findIndex((x) => x.table === h.table && x.id === h.id) === i,
  );

  for (const h of unique) {
    // daily_logs는 날짜당 하나라 다른 날 기록을 지울 위험이 있다 — 건드리지 않는다
    if (h.table === "daily_logs") continue;
    const del = await sb.from(h.table).delete().eq("id", h.id);
    if (del.error) console.error(`[capture] ${h.table}/${h.id} 정리 실패:`, del.error.message);
  }

  const fields: Classification = { ...(row.fields ?? {}), type: newType, title: row.fields?.title || row.text };
  const next = await materialize(fields, row.text);
  return { ...next, created: [...unique.filter((h) => h.table === "daily_logs"), next] };
}
