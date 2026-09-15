import { handle } from "@/lib/api";
import { generateMorningBriefing, generateWeeklyReport } from "@/lib/briefing";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get("kind") ?? "morning";
  return handle(async () => {
    const res = await db()
      .from("briefings")
      .select("*")
      .eq("kind", kind)
      .order("date", { ascending: false })
      .limit(5);
    if (res.error) throw new Error(res.error.message);
    return { briefings: res.data };
  });
}

/** 수동 재생성 (크론을 기다리지 않고 지금 보고 싶을 때) */
export async function POST(req: Request) {
  const kind = new URL(req.url).searchParams.get("kind") ?? "morning";
  return handle(async () => (kind === "weekly" ? generateWeeklyReport() : generateMorningBriefing()));
}
