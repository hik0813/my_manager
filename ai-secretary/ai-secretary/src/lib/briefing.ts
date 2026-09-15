import { askClaude } from "./claude";
import { addDays, kstDate, kstDayRange } from "./dates";
import { db } from "./db";
import { getSchoolDay } from "./neis";
import { APP_URL } from "./env";
import { escapeHtml, sendTelegram } from "./telegram";
import type { Item, Project, Task } from "./types";

export type BriefingContext = {
  date: string;
  school: Awaited<ReturnType<typeof getSchoolDay>>;
  dueTasks: Task[];
  stalledProjects: Project[];
  highlights: Item[];
  yesterdayMeals: { name: string; kcal: number | null }[];
  yesterdayLog: string | null;
};

export async function gatherMorningContext(): Promise<BriefingContext> {
  const sb = db();
  const today = kstDate();
  const yesterday = addDays(today, -1);
  const { from, to } = kstDayRange(yesterday);
  const in3days = new Date(Date.now() + 3 * 86_400_000).toISOString();

  const [school, tasks, projects, items, meals, log] = await Promise.all([
    getSchoolDay(today),
    sb.from("tasks").select("*").is("done_at", null).not("due_at", "is", null).lte("due_at", in3days).order("due_at"),
    sb.from("projects_with_stall").select("*").gte("stall_days", 5).neq("status", "done").order("stall_days", { ascending: false }),
    sb.from("items").select("*").is("seen_at", null).order("score", { ascending: false }).limit(3),
    sb.from("meals").select("name, kcal").gte("eaten_at", from).lt("eaten_at", to),
    sb.from("daily_logs").select("one_liner").eq("date", yesterday).maybeSingle(),
  ]);

  return {
    date: today,
    school,
    dueTasks: (tasks.data ?? []) as Task[],
    stalledProjects: (projects.data ?? []) as Project[],
    highlights: (items.data ?? []) as Item[],
    yesterdayMeals: (meals.data ?? []) as { name: string; kcal: number | null }[],
    yesterdayLog: (log.data as { one_liner: string } | null)?.one_liner ?? null,
  };
}

function contextToText(c: BriefingContext): string {
  const lines: string[] = [];
  lines.push(`날짜: ${c.date}`);

  if (c.school.meal?.length) {
    lines.push(`급식: ${c.school.meal.map((m) => `${m.type} — ${m.dishes.join(", ")}`).join(" / ")}`);
  }
  if (c.school.timetable?.length) {
    lines.push(`시간표: ${c.school.timetable.map((t) => `${t.period}교시 ${t.subject}`).join(", ")}`);
  }
  if (c.school.schedule?.length) {
    lines.push(`학사일정: ${c.school.schedule.map((s) => s.name).join(", ")}`);
  }
  lines.push(
    `마감 임박 할일: ${
      c.dueTasks.length ? c.dueTasks.map((t) => `${t.title}(${t.due_at?.slice(0, 10)})`).join(", ") : "없음"
    }`,
  );
  lines.push(
    `정체된 프로젝트: ${
      c.stalledProjects.length
        ? c.stalledProjects.map((p) => `${p.name} ${p.stall_days ?? p.stalled_days}일째, 다음 할 일: ${p.next_action ?? "미정"}`).join(" / ")
        : "없음"
    }`,
  );
  lines.push(
    `핵심 소식: ${c.highlights.length ? c.highlights.map((i) => `${i.title}${i.summary ? ` — ${i.summary.slice(0, 120)}` : ""}`).join(" / ") : "없음"}`,
  );
  const kcal = c.yesterdayMeals.reduce((s, m) => s + (Number(m.kcal) || 0), 0);
  lines.push(
    `어제 식단: ${c.yesterdayMeals.length ? `${c.yesterdayMeals.map((m) => m.name).join(", ")} (약 ${Math.round(kcal)}kcal)` : "기록 없음"}`,
  );
  if (c.yesterdayLog) lines.push(`어제 한 줄: ${c.yesterdayLog}`);

  return lines.join("\n");
}

/** 카드 나열이 아니라 읽히는 글이어야 한다. */
export async function generateMorningBriefing(): Promise<{ date: string; body: string }> {
  const ctx = await gatherMorningContext();
  const body = await askClaude({
    system:
      "너는 한 사람만 담당하는 개인 비서다. 아침에 건네는 브리핑을 쓴다. " +
      "규칙: 하나의 문단(3~6문장)으로 쓴다. 목록·불릿·제목·이모지 금지. " +
      "'좋은 아침입니다' 같은 인사와 덕담 금지. 오늘 실제로 신경 써야 할 것부터 말한다. " +
      "데이터에 없는 것은 지어내지 않는다. 없는 항목은 그냥 언급하지 않는다.",
    prompt: `아래 자료로 오늘 아침 브리핑을 써라.\n\n${contextToText(ctx)}`,
    maxTokens: 800,
    temperature: 0.5,
  });

  const sb = db();
  const res = await sb
    .from("briefings")
    .upsert({ date: ctx.date, kind: "morning", body, meta: { stalled: ctx.stalledProjects.length, due: ctx.dueTasks.length } }, { onConflict: "date,kind" })
    .select("*")
    .single();
  if (res.error) throw new Error(res.error.message);

  await sendTelegram(`☀️ <b>오늘의 브리핑</b>\n${escapeHtml(body)}`, { url: `${APP_URL}/today` });
  return { date: ctx.date, body };
}

/** 일요일 21시. 칭찬이 아니라 정체된 부분을 정확히 지적하게 만든다. */
export async function generateWeeklyReport(): Promise<{ date: string; body: string }> {
  const sb = db();
  const today = kstDate();
  const weekAgo = addDays(today, -7);
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [doneTasks, projects, logs, views, meals, github, openTasks] = await Promise.all([
    sb.from("tasks").select("title, done_at, project_id").gte("done_at", since),
    sb.from("projects_with_stall").select("*"),
    sb.from("daily_logs").select("date, one_liner, mood").gte("date", weekAgo),
    sb.from("views").select("category").gte("viewed_at", since),
    sb.from("meals").select("name, kcal").gte("eaten_at", since),
    sb.from("items").select("title, summary").eq("source_key", "github_activity").order("created_at", { ascending: false }).limit(1),
    sb.from("tasks").select("title, due_at").is("done_at", null),
  ]);

  const viewCount: Record<string, number> = {};
  for (const v of ((views.data ?? []) as { category: string }[])) viewCount[v.category] = (viewCount[v.category] ?? 0) + 1;

  const projectRows = (projects.data ?? []) as Project[];
  const mealRows = (meals.data ?? []) as { name: string; kcal: number | null }[];

  const material = [
    `기간: ${weekAgo} ~ ${today}`,
    `완료한 할일 ${(doneTasks.data ?? []).length}개: ${((doneTasks.data ?? []) as { title: string }[]).map((t) => t.title).join(", ") || "없음"}`,
    `남은 할일 ${(openTasks.data ?? []).length}개: ${((openTasks.data ?? []) as { title: string }[]).slice(0, 15).map((t) => t.title).join(", ") || "없음"}`,
    `프로젝트 상태: ${projectRows.map((p) => `${p.name} 진행 ${p.progress}% · 마지막 활동 ${p.stall_days ?? p.stalled_days}일 전`).join(" / ")}`,
    `GitHub: ${((github.data ?? []) as { title: string }[])[0]?.title ?? "기록 없음"}`,
    `하루 한 줄 ${(logs.data ?? []).length}일 기록: ${((logs.data ?? []) as { date: string; one_liner: string }[]).map((l) => `${l.date} ${l.one_liner}`).join(" / ") || "없음"}`,
    `열어본 카테고리: ${Object.entries(viewCount).map(([k, v]) => `${k} ${v}회`).join(", ") || "없음"}`,
    `식단 기록 ${mealRows.length}건, 총 ${Math.round(mealRows.reduce((s, m) => s + (Number(m.kcal) || 0), 0))}kcal`,
  ].join("\n");

  const body = await askClaude({
    system:
      "너는 한 사람의 주간 회고를 써주는 비서다. 듣기 좋은 말을 쓰지 마라. " +
      "규칙: (1) 이번 주에 실제로 한 일을 데이터에 있는 사실로만 적는다. " +
      "(2) 시간이 어디에 쏠렸는지 지적한다. (3) 방치된 것을 이름을 대서 지적한다. " +
      "(4) 다음 주에 집중할 것 딱 하나를 고르고 이유를 댄다. " +
      "칭찬은 근거가 있을 때만 한 문장. 기록이 없으면 '기록이 없다'고 그대로 쓴다. " +
      "네 개의 짧은 문단으로 쓴다. 불릿과 제목은 쓰지 않는다.",
    prompt: `아래는 이번 주 내 데이터다.\n\n${material}`,
    maxTokens: 1200,
    temperature: 0.4,
  });

  const res = await sb
    .from("briefings")
    .upsert({ date: today, kind: "weekly", body }, { onConflict: "date,kind" })
    .select("*")
    .single();
  if (res.error) throw new Error(res.error.message);

  await sendTelegram(`📄 <b>주간 방향성 리포트</b>\n${escapeHtml(body)}`, { url: `${APP_URL}/more` });
  return { date: today, body };
}
