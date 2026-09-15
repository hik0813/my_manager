import { handle, readJson } from "@/lib/api";
import { askClaude } from "@/lib/claude";
import { db } from "@/lib/db";
import { readArticle } from "@/lib/readable";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 링크 던지기: URL → 본문 → 3줄 요약 → notes 저장 */
export async function POST(req: Request) {
  const { url, text } = await readJson<{ url?: string; text?: string }>(req);
  const target = (url ?? text ?? "").match(/https?:\/\/\S+/)?.[0];

  return handle(async () => {
    if (!target) throw new Error("URL을 찾지 못했습니다. http로 시작하는 주소를 보내세요.");

    const article = await readArticle(target);
    if (article.text.length < 200) {
      // 본문을 못 긁어도 링크는 남긴다
      const res = await db()
        .from("notes")
        .insert({ type: "link", title: article.title, body: "본문을 읽지 못했습니다. 링크만 저장했습니다.", source_url: target })
        .select("*")
        .single();
      if (res.error) throw new Error(res.error.message);
      return { note: res.data, degraded: true };
    }

    const summary = await askClaude({
      system: "너는 한국어로 요약하는 비서다. 정확히 3줄, 각 줄은 한 문장. 군더더기·인사말 금지.",
      prompt: `다음 글을 3줄로 요약해라.\n\n제목: ${article.title}\n\n${article.text.slice(0, 8000)}`,
      maxTokens: 500,
      temperature: 0.2,
    });

    const res = await db()
      .from("notes")
      .insert({ type: "link", title: article.title, body: summary, source_url: target })
      .select("*")
      .single();
    if (res.error) throw new Error(res.error.message);
    return { note: res.data };
  });
}
