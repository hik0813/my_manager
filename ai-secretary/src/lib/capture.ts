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
      const res = await sb
        .from("notes")
        .insert({ type: "idea", title: c.title || rawText.slice(0, 60), body: c.body ?? rawText, tags: c.tags ?? [] })
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
          message: c.message ?? rawText,
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

/** 카테고리 재지정: 이전 물질화 결과를 지우고 새 타입으로 다시 만든다. */
export async function rematerialize(
  captureId: string,
  newType: CaptureType,
): Promise<{ table: string; id: string }> {
  const sb = db();
  const cur = await sb.from("captures").select("*").eq("id", captureId).single();
  if (cur.error) throw new Error(cur.error.message);
  const row = cur.data as { text: string; target_table: string | null; target_id: string | null; fields: Classification };

  if (row.target_table && row.target_id && row.target_table !== "daily_logs") {
    await sb.from(row.target_table).delete().eq("id", row.target_id);
  }

  const fields: Classification = { ...(row.fields ?? {}), type: newType, title: row.fields?.title || row.text };
  return materialize(fields, row.text);
}
