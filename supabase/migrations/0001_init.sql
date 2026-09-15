-- ─────────────────────────────────────────────────────────────
-- 개인 AI 비서 — 초기 스키마
-- 1인 전용이므로 user_id 컬럼 없음. RLS는 켜고 정책은 두지 않는다
-- (service_role 키로만 접근 → anon 키가 유출돼도 데이터는 안 새어나감).
-- ─────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ── 할일 / 목표 / 프로젝트 ──────────────────────────────────
create table if not exists projects (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  status         text not null default 'active',      -- active | paused | done
  progress       int  not null default 0,             -- 0~100
  next_action    text,
  last_active_at timestamptz not null default now(),
  stalled_days   int  not null default 0,             -- 크론이 갱신
  created_at     timestamptz not null default now()
);

create table if not exists tasks (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  note       text,
  due_at     timestamptz,
  done_at    timestamptz,
  project_id uuid references projects(id) on delete set null,
  priority   int not null default 2,                  -- 1 높음 · 2 보통 · 3 낮음
  created_at timestamptz not null default now()
);
create index if not exists tasks_open_due_idx on tasks (due_at) where done_at is null;
create index if not exists tasks_project_idx  on tasks (project_id);

create table if not exists goals (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  target_at  date,
  progress   int not null default 0,
  metric     text,
  created_at timestamptz not null default now()
);

-- ── 기록 ────────────────────────────────────────────────────
create table if not exists daily_logs (
  id         uuid primary key default gen_random_uuid(),
  date       date not null unique,
  one_liner  text not null,
  mood       int,                                     -- 1~5
  created_at timestamptz not null default now()
);

create table if not exists meals (
  id       uuid primary key default gen_random_uuid(),
  eaten_at timestamptz not null default now(),
  name     text not null,
  kcal     numeric,
  carb     numeric,
  protein  numeric,
  fat      numeric,
  source   text not null default 'manual'             -- mfds | manual | llm
);
create index if not exists meals_eaten_idx on meals (eaten_at desc);

create table if not exists error_logs (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  message    text,
  solution   text,
  tags       text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists error_logs_trgm_idx
  on error_logs using gin ((coalesce(title,'') || ' ' || coalesce(message,'') || ' ' || coalesce(solution,'')) gin_trgm_ops);
create index if not exists error_logs_tags_idx on error_logs using gin (tags);

create table if not exists notes (
  id         uuid primary key default gen_random_uuid(),
  type       text not null default 'note',            -- note | doc | link | idea
  title      text not null,
  body       text,
  tags       text[] not null default '{}',
  source_url text,
  created_at timestamptz not null default now()
);
-- 한국어는 postgres에 전용 config가 없다. simple config + trigram 조합으로 검색한다.
create index if not exists notes_fts_idx
  on notes using gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(body,'')));
create index if not exists notes_trgm_idx
  on notes using gin ((coalesce(title,'') || ' ' || coalesce(body,'')) gin_trgm_ops);
create index if not exists notes_tags_idx on notes using gin (tags);

-- ── 관심사 수집 ─────────────────────────────────────────────
create table if not exists sources (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  category   text not null,
  kind       text not null,                           -- rss | rest | github | llm
  config     jsonb not null default '{}'::jsonb,
  enabled    boolean not null default true,
  last_ok_at timestamptz,
  fail_count int not null default 0,
  last_error text,
  notified_at timestamptz                             -- 헬스 알림 중복 방지
);

create table if not exists items (
  id           uuid primary key default gen_random_uuid(),
  source_key   text not null,
  external_id  text not null,
  title        text not null,
  url          text,
  summary      text,
  published_at timestamptz,
  payload      jsonb not null default '{}'::jsonb,
  score        int not null default 0,
  seen_at      timestamptz,
  created_at   timestamptz not null default now(),
  unique (source_key, external_id)
);
create index if not exists items_score_idx     on items (score desc, published_at desc nulls last);
create index if not exists items_source_idx    on items (source_key, created_at desc);
create index if not exists items_published_idx on items (published_at desc nulls last);

create table if not exists snapshots (
  id          uuid primary key default gen_random_uuid(),
  metric_key  text not null,                          -- 예: itad:price:1091500
  value       numeric not null,
  label       text,
  captured_at timestamptz not null default now(),
  meta        jsonb not null default '{}'::jsonb
);
create index if not exists snapshots_metric_idx on snapshots (metric_key, captured_at desc);

create table if not exists alerts (
  id      uuid primary key default gen_random_uuid(),
  kind    text not null,                              -- price | vuln | stalled | due | source
  dedupe_key text not null,                           -- 7일 재발송 금지 키
  title   text not null,
  body    text,
  level   text not null default 'info',               -- info | warn | critical
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists alerts_dedupe_idx on alerts (dedupe_key, created_at desc);
create index if not exists alerts_sent_idx   on alerts (sent_at desc);

-- ── 확장 (스펙의 기본 구조 위에 얹은 것) ────────────────────
-- 찜/구독: 스코어링 가중치와 가격 알림의 기준
create table if not exists watchlist (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null,                        -- steam_app | part | repo | keyword | pokemon
  ref           text not null,                        -- appid / 검색어 / owner/repo
  label         text not null,
  threshold_pct numeric not null default 5,           -- 변화 알림 임계치(%)
  created_at    timestamptz not null default now(),
  unique (kind, ref)
);

-- 간격 반복 복습 (오늘 배울 기술 → 3·7·30일)
create table if not exists reviews (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid references items(id) on delete cascade,
  topic        text not null,
  question     text not null,
  choices      text[] not null,
  answer_index int not null,
  explanation  text,
  due_at       timestamptz not null,
  done_at      timestamptz,
  correct      boolean,
  stage        int not null default 0,                -- 0:3일 1:7일 2:30일
  created_at   timestamptz not null default now()
);
create index if not exists reviews_due_idx on reviews (due_at) where done_at is null;

-- 아침 브리핑 / 주간 리포트 보관
create table if not exists briefings (
  id         uuid primary key default gen_random_uuid(),
  date       date not null,
  kind       text not null default 'morning',         -- morning | weekly
  body       text not null,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (date, kind)
);

-- 활동 기록 타임라인 (대회·행사·프로젝트 완료)
create table if not exists timeline_events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  kind        text not null default 'event',          -- contest | project | event | award
  happened_at date not null,
  body        text,
  created_at  timestamptz not null default now()
);
create index if not exists timeline_idx on timeline_events (happened_at desc);

-- 카테고리 열람 학습용 로그 (스코어링의 "최근 7일 자주 본 카테고리")
create table if not exists views (
  id         uuid primary key default gen_random_uuid(),
  category   text not null,
  viewed_at  timestamptz not null default now()
);
create index if not exists views_recent_idx on views (viewed_at desc);

-- ── RLS: 켜두고 정책 없음 = anon/authenticated 전면 차단 ────
do $$
declare t text;
begin
  foreach t in array array[
    'projects','tasks','goals','daily_logs','meals','error_logs','notes',
    'sources','items','snapshots','alerts','watchlist','reviews','briefings',
    'timeline_events','views'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ── 프로젝트 시드 (페이즈 2 요구) ───────────────────────────
insert into projects (name, next_action) values
  ('학급 웹앱',        '시간표 화면 레이아웃 잡기'),
  ('해커톤 프로젝트',  '신호 시뮬레이터 데모 시나리오 확정'),
  ('복지 추천 사이트', '상황 입력 폼 문항 정리'),
  ('카드 로그라이크 게임', '실시간 전투 프로토타입 1분 플레이'),
  ('세계관 설정집',    '5개 세력 연표 정리'),
  ('Unity 학습',       '40일 계획 1주차 과제')
on conflict (name) do nothing;
