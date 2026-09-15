import { handle, readJson } from "@/lib/api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "open"; // open | done | all
  const projectId = url.searchParams.get("project_id");

  return handle(async () => {
    let q = db().from("tasks").select("*").order("due_at", { ascending: true, nullsFirst: false }).limit(200);
    if (scope === "open") q = q.is("done_at", null);
    if (scope === "done") q = q.not("done_at", "is", null).order("done_at", { ascending: false });
    if (projectId) q = q.eq("project_id", projectId);
    const res = await q;
    if (res.error) throw new Error(res.error.message);
    return { tasks: res.data };
  });
}

export async function POST(req: Request) {
  const body = await readJson<{ title?: string; due_at?: string | null; priority?: number; project_id?: string | null; note?: string | null }>(req);
  return handle(async () => {
    if (!body.title?.trim()) throw new Error("제목이 없습니다.");
    const res = await db()
      .from("tasks")
      .insert({
        title: body.title.trim(),
        due_at: body.due_at ?? null,
        priority: body.priority ?? 2,
        project_id: body.project_id ?? null,
        note: body.note ?? null,
      })
      .select("*")
      .single();
    if (res.error) throw new Error(res.error.message);
    if (body.project_id) {
      await db().from("projects").update({ last_active_at: new Date().toISOString() }).eq("id", body.project_id);
    }
    return { task: res.data };
  });
}
