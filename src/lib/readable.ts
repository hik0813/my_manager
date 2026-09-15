import * as cheerio from "cheerio";
import { fetchText } from "./http";

/** URL → 제목 + 본문 텍스트. 광고·네비게이션은 최대한 걷어낸다. */
export async function readArticle(url: string): Promise<{ title: string; text: string }> {
  const html = await fetchText(url, { headers: { accept: "text/html,*/*" } }, { timeoutMs: 15_000, retries: 1 });
  const $ = cheerio.load(html);

  $("script, style, nav, header, footer, aside, noscript, iframe, form").remove();

  const title =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("title").first().text().trim() ||
    url;

  const candidates = ["article", "main", '[role="main"]', "#content", ".content", ".post", "body"];
  let text = "";
  for (const sel of candidates) {
    const t = $(sel).first().text().replace(/\s+/g, " ").trim();
    if (t.length > text.length) text = t;
    if (text.length > 4000) break;
  }

  return { title, text: text.slice(0, 12_000) };
}
