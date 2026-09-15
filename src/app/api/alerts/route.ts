import { handle, readJson } from "@/lib/api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const res = await db().from("alerts").select("*").order("created_at", { ascending: false }).limit(50);
    if (res.error) throw new Error(res.error.message);
    return { alerts: res.data };
  });
}

/** 읽음 처리 */
export async function PATCH(req: Request) {
  const { ids } = await readJson<{ ids?: string[] }>(req);
  return handle(async () => {
    const q = db().from("alerts").update({ read_at: new Date().toISOString() });
    const res = ids?.length ? await q.in("id", ids) : await q.is("read_at", null);
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });
}
