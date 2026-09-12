import { handle, readJson } from "@/lib/api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const type = url.searchParams.get("type");

  return handle(async () => {
    let query = db().from("notes").select("*").order("created_at", { ascending: false }).limit(100);
    if (type) query = query.eq("type", type);
    if (q) {
      const like = `%${q}%`;
      query = query.or(`title.ilike.${like},body.ilike.${like}`);
    }
    const res = await query;
    if (res.error) throw new Error(res.error.message);
    return { notes: res.data, q };
  });
}

export async function POST(req: Request) {
  const body = await readJson<{ title?: string; body?: string; type?: string; tags?: string[]; source_url?: string }>(req);
  return handle(async () => {
    if (!body.title?.trim()) throw new Error("제목이 없습니다.");
    const res = await db()
      .from("notes")
      .insert({
        title: body.title.trim(),
        body: body.body ?? null,
        type: body.type ?? "doc",
        tags: body.tags ?? [],
        source_url: body.source_url ?? null,
      })
      .select("*")
      .single();
    if (res.error) throw new Error(res.error.message);
    return { note: res.data };
  });
}
