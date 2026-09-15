import { handle } from "@/lib/api";
import { kstDate, kstDayRange } from "@/lib/dates";
import { db } from "@/lib/db";
import { getSchoolDay } from "@/lib/neis";

export const dynamic = "force-dynamic";

/** '오늘' 화면이 필요한 것을 한 번에. 왕복을 줄여야 지하철에서 쓸 만하다. */
export async function GET() {
  return handle(async () => {
    const sb = db();
    const today = kstDate();
    const { from, to } = kstDayRange(today);
    const in3days = new Date(Date.now() + 3 * 86_400_000).toISOString();

    const [school, briefing, tasks, projects, log, meals, alerts, reviews] = await Promise.all([
      getSchoolDay(today).catch(() => null),
      sb.from("briefings").select("*").eq("kind", "morning").order("date", { ascending: false }).limit(1).maybeSingle(),
      sb.from("tasks").select("*").is("done_at", null).order("due_at", { ascending: true, nullsFirst: false }).limit(20),
      sb.from("projects_with_stall").select("*").gte("stall_days", 5).neq("status", "done").order("stall_days", { ascending: false }),
      sb.from("daily_logs").select("*").eq("date", today).maybeSingle(),
      sb.from("meals").select("*").gte("eaten_at", from).lt("eaten_at", to),
      sb.from("alerts").select("*").is("read_at", null).order("created_at", { ascending: false }).limit(10),
      sb.from("reviews").select("id").is("done_at", null).lte("due_at", new Date().toISOString()),
    ]);

    const mealRows = (meals.data ?? []) as { kcal: number | null }[];

    return {
      date: today,
      school,
      briefing: briefing.data ?? null,
      tasks: tasks.data ?? [],
      due_soon: ((tasks.data ?? []) as { due_at: string | null }[]).filter((t) => t.due_at && t.due_at <= in3days).length,
      stalled_projects: projects.data ?? [],
      log: log.data ?? null,
      meals: meals.data ?? [],
      total_kcal: Math.round(mealRows.reduce((s, m) => s + (Number(m.kcal) || 0), 0)),
      alerts: alerts.data ?? [],
      reviews_due: (reviews.data ?? []).length,
    };
  });
}
