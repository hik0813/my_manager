import { handle, readJson } from "@/lib/api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** 키워드 검색: 제목·본문·해결법·태그를 한 번에 훑는다. */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  return handle(async () => {
    let query = db().from("error_logs").select("*").order("created_at", { ascending: false }).limit(100);
    if (q) {
      const like = `%${q}%`;
      query = query.or(`title.ilike.${like},message.ilike.${like},solution.ilike.${like}`);
    }
    const res = await query;
    if (res.error) throw new Error(res.error.message);
    return { errors: res.data, q };
  });
}

export async function POST(req: Request) {
  const body = await readJson<{ title?: string; message?: string; solution?: string; tags?: string[] }>(req);
  return handle(async () => {
    if (!body.title?.trim()) throw new Error("에러 제목이 없습니다.");
    const sb = db();

    // 저장 전에 비슷한 과거 에러를 찾아 같이 돌려준다
    const words = body.title.split(/\s+/).filter((w) => w.length >= 3).slice(0, 3);
    let similar: unknown[] = [];
    if (words.length) {
      const or = words.map((w) => `title.ilike.%${w}%,message.ilike.%${w}%`).join(",");
      const sim = await sb.from("error_logs").select("*").or(or).limit(3);
      similar = sim.data ?? [];
    }

    const res = await sb
      .from("error_logs")
      .insert({
        title: body.title.trim(),
        message: body.message ?? null,
        solution: body.solution ?? null,
        tags: body.tags ?? [],
      })
      .select("*")
      .single();
    if (res.error) throw new Error(res.error.message);
    return { error_log: res.data, similar };
  });
}
