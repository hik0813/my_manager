import { handle } from "@/lib/api";
import { searchFood } from "@/lib/mfds";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return handle(async () => {
    if (!q.trim()) return { results: [] };
    try {
      return { results: await searchFood(q, 5) };
    } catch (e) {
      // 검색 실패는 화면에서 수동 입력으로 폴백된다
      return { results: [], error: e instanceof Error ? e.message : String(e) };
    }
  });
}
