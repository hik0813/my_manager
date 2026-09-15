import { handle, readJson } from "@/lib/api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const res = await db()
      .from("projects_with_stall")
      .select("*")
      .order("stall_days", { ascending: false })
      .limit(50);
    if (res.error) throw new Error(res.error.message);
    return { projects: res.data };
  });
}

export async function POST(req: Request) {
  const body = await readJson<{ name?: string; next_action?: string | null }>(req);
  return handle(async () => {
    if (!body.name?.trim()) throw new Error("프로젝트 이름이 없습니다.");
    const res = await db()
      .from("projects")
      .insert({ name: body.name.trim(), next_action: body.next_action ?? null })
      .select("*")
      .single();
    if (res.error) throw new Error(res.error.message);
    return { project: res.data };
  });
}
