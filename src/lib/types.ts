export type CaptureType = "task" | "idea" | "meal" | "error" | "log";

export type Project = {
  id: string;
  name: string;
  status: string;
  progress: number;
  next_action: string | null;
  last_active_at: string;
  stalled_days: number;
  created_at: string;
  stall_days?: number;
  open_tasks?: number;
};

export type Task = {
  id: string;
  title: string;
  note: string | null;
  due_at: string | null;
  done_at: string | null;
  project_id: string | null;
  priority: number;
  created_at: string;
};

export type Goal = {
  id: string;
  title: string;
  target_at: string | null;
  progress: number;
  metric: string | null;
  created_at: string;
};

export type DailyLog = {
  id: string;
  date: string;
  one_liner: string;
  mood: number | null;
  created_at: string;
};

export type Meal = {
  id: string;
  eaten_at: string;
  name: string;
  kcal: number | null;
  carb: number | null;
  protein: number | null;
  fat: number | null;
  source: string;
};

export type ErrorLog = {
  id: string;
  title: string;
  message: string | null;
  solution: string | null;
  tags: string[];
  created_at: string;
};

export type Note = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  tags: string[];
  source_url: string | null;
  created_at: string;
};

export type Item = {
  id: string;
  source_key: string;
  external_id: string;
  title: string;
  url: string | null;
  summary: string | null;
  published_at: string | null;
  payload: Record<string, unknown>;
  score: number;
  seen_at: string | null;
  created_at: string;
};

export type SourceRow = {
  id: string;
  key: string;
  category: string;
  kind: SourceKind;
  config: Record<string, unknown>;
  enabled: boolean;
  last_ok_at: string | null;
  fail_count: number;
  last_error: string | null;
  notified_at: string | null;
};

export type SourceKind = "rss" | "rest" | "github" | "llm";
export type Schedule = "morning" | "noon" | "night" | "daily" | "hourly";

/** config/sources.json 한 항목. 새 관심사 추가 = 여기에 객체 하나. */
export type SourceDef = {
  key: string;
  category: string;
  kind: SourceKind;
  title: string;
  enabled?: boolean;
  schedule?: Schedule;
  /** rss/rest 공통 */
  endpoint?: string;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: unknown;
  /** rest: 배열이 들어있는 경로. 예 "$.response.items" */
  root?: string;
  /** 항목 → item 컬럼 매핑. JSONPath 축약형($.a.b, $.a[0].b) */
  map?: {
    external_id?: string;
    title?: string;
    url?: string;
    summary?: string;
    published_at?: string;
    /** 썸네일. 경로("$.img") 또는 조립 템플릿("https://.../{{$.id}}/capsule.jpg") */
    image?: string;
  };
  /**
   * 값 하나를 snapshots에 적재할 때.
   * metric_key 규칙: `${source_key}|${식별자}` — 앞부분으로 소스 변화율을 되찾는다.
   * divisor를 주면 value/divisor*100 (백분율)로 저장한다.
   */
  snapshot?: { metric_key: string; value: string; divisor?: string; label?: string };
  /** github 어댑터 모드 */
  mode?: "activity" | "trending" | "releases" | "osv";
  repos?: string[];
  /** osv 모드: "npm:next@15.1.6" 형태. 비우면 watchlist(kind=package)를 쓴다. */
  packages?: string[];
  query?: string;
  /** llm 어댑터 */
  prompt?: string;
  count?: number;
  /** 링크 카드(자동수집 불가 대상) */
  links?: { title: string; url: string }[];
  limit?: number;
  /**
   * 찜 목록을 돌면서 소스를 복제한다. {{ref}} / {{label}}이 치환된다.
   * 예: 게임 동접자 — watchlist(kind=steam_app)에 앱ID를 추가하면 소스가 늘어난다.
   */
  foreach?: { watch_kind: string };
  /** 이 소스가 요구하는 환경변수. 없으면 실행을 건너뛴다(실패로 세지 않음). */
  requires?: string[];
};

export type Alert = {
  id: string;
  kind: string;
  dedupe_key: string;
  title: string;
  body: string | null;
  level: "info" | "warn" | "critical";
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
};

export type Review = {
  id: string;
  item_id: string | null;
  topic: string;
  question: string;
  choices: string[];
  answer_index: number;
  explanation: string | null;
  due_at: string;
  done_at: string | null;
  correct: boolean | null;
  stage: number;
};

export type TimelineEvent = {
  id: string;
  title: string;
  kind: string;
  happened_at: string;
  body: string | null;
};

export type WatchItem = {
  id: string;
  kind: string;
  ref: string;
  label: string;
  threshold_pct: number;
};
