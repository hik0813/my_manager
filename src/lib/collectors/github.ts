import { env } from "../env";
import { fetchJson } from "../http";
import { render } from "./path";
import { clean, stableId, toIso, type CollectResult, type NormalizedItem } from "./kinds";
import type { SourceDef } from "../types";

function ghHeaders(): Record<string, string> {
  const token = env("GITHUB_TOKEN");
  return {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

/** 내 최근 활동 (GraphQL contributionsCollection + 최근 커밋) */
async function activity(def: SourceDef): Promise<CollectResult> {
  const login = env("GITHUB_LOGIN");
  if (!login) throw new Error(`${def.key}: GITHUB_LOGIN 미설정`);
  const token = env("GITHUB_TOKEN");
  if (!token) throw new Error(`${def.key}: GITHUB_TOKEN 미설정`);

  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const query = `
    query($login:String!, $from:DateTime!) {
      user(login:$login) {
        contributionsCollection(from:$from) {
          totalCommitContributions
          totalPullRequestContributions
          totalIssueContributions
          commitContributionsByRepository(maxRepositories: 10) {
            repository { nameWithOwner url }
            contributions { totalCount }
          }
        }
      }
    }`;

  const res = await fetchJson<{
    data?: {
      user?: {
        contributionsCollection: {
          totalCommitContributions: number;
          totalPullRequestContributions: number;
          totalIssueContributions: number;
          commitContributionsByRepository: {
            repository: { nameWithOwner: string; url: string };
            contributions: { totalCount: number };
          }[];
        };
      };
    };
    errors?: { message: string }[];
  }>(
    "https://api.github.com/graphql",
    {
      method: "POST",
      headers: { ...ghHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ query, variables: { login, from: since } }),
    },
    { timeoutMs: 15_000, retries: 1 },
  );

  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join("; "));
  const c = res.data?.user?.contributionsCollection;
  if (!c) throw new Error(`${def.key}: GraphQL 응답에 user가 없습니다.`);

  const day = new Date().toISOString().slice(0, 10);
  const items: NormalizedItem[] = [
    {
      external_id: `activity-${day}`,
      title: `최근 7일 커밋 ${c.totalCommitContributions} · PR ${c.totalPullRequestContributions} · 이슈 ${c.totalIssueContributions}`,
      url: `https://github.com/${login}`,
      summary:
        c.commitContributionsByRepository
          .map((r) => `${r.repository.nameWithOwner} ${r.contributions.totalCount}`)
          .join(" · ") || "커밋 기록 없음",
      published_at: new Date().toISOString(),
      payload: { ...c },
    },
  ];

  return {
    items,
    snapshots: [
      { metric_key: "github:commits7d", value: c.totalCommitContributions, label: "최근 7일 커밋" },
    ],
  };
}

/** 공식 Trending API가 없으므로 Search API로 근사한다. */
async function trending(def: SourceDef): Promise<CollectResult> {
  const q = render(def.query ?? "created:>{{daysAgo:7}} stars:>50");
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${def.limit ?? 10}`;
  const res = await fetchJson<{
    items: { id: number; full_name: string; html_url: string; description: string | null; stargazers_count: number; created_at: string; language: string | null }[];
  }>(url, { headers: ghHeaders() }, { timeoutMs: 15_000, retries: 1 });

  return {
    items: res.items.map((r) => ({
      external_id: String(r.id),
      title: `${r.full_name} ★${r.stargazers_count}`,
      url: r.html_url,
      summary: clean(r.description, 300),
      published_at: toIso(r.created_at),
      payload: { language: r.language, stars: r.stargazers_count },
    })),
  };
}

/** 프레임워크 · VS Code 릴리즈 노트 */
async function releases(def: SourceDef): Promise<CollectResult> {
  const repos = def.repos ?? [];
  if (repos.length === 0) throw new Error(`${def.key}: repos가 비어 있습니다.`);
  const items: NormalizedItem[] = [];
  const errors: string[] = [];

  for (const repo of repos) {
    try {
      const list = await fetchJson<
        { id: number; name: string | null; tag_name: string; html_url: string; body: string | null; published_at: string; prerelease: boolean; draft: boolean }[]
      >(`https://api.github.com/repos/${repo}/releases?per_page=3`, { headers: ghHeaders() }, { timeoutMs: 12_000, retries: 1 });

      for (const r of list) {
        if (r.draft || r.prerelease) continue;
        items.push({
          external_id: `${repo}#${r.id}`,
          title: `${repo} ${r.tag_name}`,
          url: r.html_url,
          summary: clean(r.body, 400),
          published_at: toIso(r.published_at),
          payload: { repo, tag: r.tag_name },
        });
      }
    } catch (e) {
      errors.push(`${repo}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (items.length === 0) throw new Error(errors.join(" | ") || `${def.key}: 릴리즈를 못 가져왔습니다.`);
  return { items };
}

/** OSV — 내가 쓰는 라이브러리 취약점. purl 문자열: "npm:next@15.1.6" */
async function osv(def: SourceDef, extraPackages: string[]): Promise<CollectResult> {
  const specs = [...(def.packages ?? []), ...extraPackages];
  if (specs.length === 0) throw new Error(`${def.key}: 검사할 패키지가 없습니다 (watchlist kind=package 에 추가하세요).`);

  const items: NormalizedItem[] = [];
  const errors: string[] = [];

  for (const spec of specs.slice(0, 30)) {
    const [eco, rest] = spec.includes(":") ? [spec.slice(0, spec.indexOf(":")), spec.slice(spec.indexOf(":") + 1)] : ["npm", spec];
    const at = rest.lastIndexOf("@");
    const name = at > 0 ? rest.slice(0, at) : rest;
    let version = at > 0 ? rest.slice(at + 1) : "";

    try {
      if (!version && eco === "npm") {
        const meta = await fetchJson<{ "dist-tags": { latest: string } }>(
          `https://registry.npmjs.org/${encodeURIComponent(name)}`,
          {},
          { timeoutMs: 12_000, retries: 1 },
        );
        version = meta["dist-tags"].latest;
      }
      const ecosystem = eco === "npm" ? "npm" : eco === "pypi" ? "PyPI" : eco;
      const res = await fetchJson<{ vulns?: { id: string; summary?: string; details?: string; modified: string; severity?: { type: string; score: string }[] }[] }>(
        "https://api.osv.dev/v1/query",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ package: { name, ecosystem }, ...(version ? { version } : {}) }),
        },
        { timeoutMs: 12_000, retries: 1 },
      );

      for (const v of res.vulns ?? []) {
        items.push({
          external_id: `${name}#${v.id}`,
          title: `${name}${version ? `@${version}` : ""} — ${v.id}`,
          url: `https://osv.dev/vulnerability/${v.id}`,
          summary: clean(v.summary ?? v.details, 400),
          published_at: toIso(v.modified),
          payload: { package: name, version, severity: v.severity ?? null, vuln: true },
        });
      }
    } catch (e) {
      errors.push(`${spec}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 취약점이 0건인 것은 정상이다. 전 패키지가 실패했을 때만 에러.
  if (items.length === 0 && errors.length === specs.length) throw new Error(errors.join(" | "));
  return { items };
}

export async function collectGithub(
  def: SourceDef,
  ctx: { packages?: string[] } = {},
): Promise<CollectResult> {
  switch (def.mode) {
    case "activity":
      return activity(def);
    case "trending":
      return trending(def);
    case "releases":
      return releases(def);
    case "osv":
      return osv(def, ctx.packages ?? []);
    default:
      throw new Error(`${def.key}: github 어댑터에 알 수 없는 mode "${def.mode}"`);
  }
}

export { stableId };
