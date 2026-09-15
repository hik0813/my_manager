import { askClaudeJson } from "./claude";
import { db } from "./db";
import type { Item } from "./types";

/** 3일 → 7일 → 30일 */
export const STAGE_DAYS = [3, 7, 30];

type Quiz = { question: string; choices: string[]; answer_index: number; explanation: string };

/** '오늘 배울 기술'로 들어온 항목마다 3지선다 퀴즈를 만들어 3일 뒤로 예약한다. */
export async function ensureReviews(limit = 3): Promise<number> {
  const sb = db();

  const items = await sb
    .from("items")
    .select("*")
    .eq("source_key", "llm_learn_today")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (items.error) throw new Error(items.error.message);

  const rows = (items.data ?? []) as Item[];
  if (rows.length === 0) return 0;

  const existing = await sb.from("reviews").select("item_id").in("item_id", rows.map((r) => r.id));
  const done = new Set(((existing.data ?? []) as { item_id: string | null }[]).map((r) => r.item_id));

  let created = 0;
  for (const item of rows) {
    if (done.has(item.id)) continue;
    try {
      const quiz = await askClaudeJson<Quiz>({
        system: "너는 복습 퀴즈를 만드는 비서다. 한국어. JSON 객체 하나만 출력한다.",
        prompt:
          `다음 학습 내용으로 3지선다 문제 하나를 만들어라. 정답이 뻔하지 않게, 헷갈리는 오답을 넣어라.\n\n` +
          `제목: ${item.title}\n내용: ${item.summary ?? ""}\n\n` +
          `{"question":"질문","choices":["A","B","C"],"answer_index":0,"explanation":"왜 정답인지 한두 문장"}`,
        maxTokens: 700,
        temperature: 0.4,
      });

      if (!Array.isArray(quiz.choices) || quiz.choices.length < 2) continue;

      const due = new Date(Date.now() + STAGE_DAYS[0] * 86_400_000).toISOString();
      const res = await sb.from("reviews").insert({
        item_id: item.id,
        topic: item.title,
        question: quiz.question,
        choices: quiz.choices,
        answer_index: Math.max(0, Math.min(quiz.choices.length - 1, quiz.answer_index)),
        explanation: quiz.explanation ?? null,
        due_at: due,
        stage: 0,
      });
      if (res.error) throw new Error(res.error.message);
      created++;
    } catch (e) {
      console.error("[reviews] 퀴즈 생성 실패:", e instanceof Error ? e.message : e);
    }
  }
  return created;
}

/** 채점 후 다음 단계 예약. 틀리면 같은 단계를 3일 뒤에 다시. */
export async function gradeReview(id: string, choiceIndex: number) {
  const sb = db();
  const cur = await sb.from("reviews").select("*").eq("id", id).single();
  if (cur.error) throw new Error(cur.error.message);
  const row = cur.data as { id: string; answer_index: number; stage: number; topic: string; question: string; choices: string[]; explanation: string | null; item_id: string | null };

  const correct = choiceIndex === row.answer_index;
  const upd = await sb
    .from("reviews")
    .update({ done_at: new Date().toISOString(), correct })
    .eq("id", id)
    .select("*")
    .single();
  if (upd.error) throw new Error(upd.error.message);

  const nextStage = correct ? row.stage + 1 : row.stage;
  if (nextStage < STAGE_DAYS.length) {
    const due = new Date(Date.now() + STAGE_DAYS[nextStage] * 86_400_000).toISOString();
    await sb.from("reviews").insert({
      item_id: row.item_id,
      topic: row.topic,
      question: row.question,
      choices: row.choices,
      answer_index: row.answer_index,
      explanation: row.explanation,
      due_at: due,
      stage: nextStage,
    });
  }

  return { correct, answer_index: row.answer_index, explanation: row.explanation, next_in_days: nextStage < STAGE_DAYS.length ? STAGE_DAYS[nextStage] : null };
}
