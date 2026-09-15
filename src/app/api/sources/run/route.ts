import { handle } from "@/lib/api";
import { runCollection } from "@/lib/collectors/run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 수동 수집 (더보기 화면의 "지금 수집" 버튼). */
export async function POST(req: Request) {
  const slot = new URL(req.url).searchParams.get("slot") ?? "all";
  return handle(async () => ({ report: await runCollection(slot) }));
}
