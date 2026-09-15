import { XMLParser } from "fast-xml-parser";
import { fetchText } from "../http";
import { render } from "./path";
import { clean, stableId, toIso, type CollectResult, type NormalizedItem } from "./kinds";
import type { SourceDef } from "../types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

type Loose = Record<string, unknown>;

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function text(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    const o = v as Loose;
    if (typeof o["#text"] === "string") return o["#text"];
    if (typeof o["@_href"] === "string") return o["@_href"];
  }
  return undefined;
}

/**
 * 썸네일 뽑기. 피드마다 넣는 자리가 제각각이라 순서대로 뒤진다.
 * 못 찾으면 null — 화면은 이미지 없는 줄로 그린다.
 */
function imageOf(e: Loose): string | null {
  const attr = (v: unknown, key: string): string | undefined => {
    for (const cand of asArray(v as Loose | Loose[] | undefined)) {
      const val = (cand as Loose | undefined)?.[key];
      if (typeof val === "string" && /^https?:\/\//.test(val)) return val;
    }
    return undefined;
  };

  const fromMedia =
    attr(e["media:content"], "@_url") ??
    attr(e["media:thumbnail"], "@_url") ??
    attr(e.thumbnail, "@_url");
  if (fromMedia) return fromMedia;

  // enclosure는 오디오·영상도 들어오므로 이미지 타입만
  for (const enc of asArray(e.enclosure as Loose | Loose[] | undefined)) {
    const o = enc as Loose | undefined;
    const url = o?.["@_url"];
    const type = o?.["@_type"];
    if (typeof url === "string" && (typeof type !== "string" || type.startsWith("image/"))) return url;
  }

  // 본문 HTML 안의 첫 <img>
  const html = [text(e["content:encoded"]), text(e.content), text(e.description), text(e.summary)]
    .filter(Boolean)
    .join(" ");
  const img = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (img && /^https?:\/\//.test(img[1])) return img[1];

  return null;
}

/** RSS 2.0 / Atom 둘 다 받는다. 뉴스 계열은 전부 이 어댑터 하나로 처리한다. */
export async function collectRss(def: SourceDef): Promise<CollectResult> {
  const url = render(def.endpoint ?? "");
  if (!url) throw new Error(`${def.key}: endpoint가 비어 있습니다.`);

  const xml = await fetchText(url, { headers: { accept: "application/rss+xml, application/xml, text/xml, */*" } }, { timeoutMs: 15_000, retries: 1 });
  const doc = parser.parse(xml) as Loose;

  const channel = (doc.rss as Loose | undefined)?.channel as Loose | undefined;
  const feed = doc.feed as Loose | undefined;
  const rawEntries: Loose[] = channel
    ? (asArray(channel.item) as Loose[])
    : feed
      ? (asArray(feed.entry) as Loose[])
      : (asArray((doc["rdf:RDF"] as Loose | undefined)?.item) as Loose[]);

  if (rawEntries.length === 0) throw new Error(`${def.key}: 피드에서 항목을 찾지 못했습니다.`);

  const limit = def.limit ?? 20;
  const items: NormalizedItem[] = rawEntries.slice(0, limit).map((e) => {
    const link =
      text(e.link) ??
      text(asArray(e.link as unknown)[0]) ??
      text(e["feedburner:origLink"]) ??
      undefined;
    const title = clean(text(e.title) ?? "(제목 없음)", 200) ?? "(제목 없음)";
    const summary = clean(
      text(e.description) ?? text(e.summary) ?? text(e["content:encoded"]) ?? text(e.content),
      400,
    );
    const published =
      toIso(text(e.pubDate)) ?? toIso(text(e.published)) ?? toIso(text(e.updated)) ?? toIso(text(e["dc:date"]));

    return {
      external_id: stableId(text(e.guid) ?? text(e.id) ?? link ?? title),
      title,
      url: link ?? null,
      summary,
      published_at: published,
      payload: {
        author: text(e.author) ?? text(e["dc:creator"]) ?? null,
        image: imageOf(e),
      },
    };
  });

  return { items };
}
