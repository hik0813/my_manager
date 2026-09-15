-- Quick Capture 인박스.
-- 한 줄 입력을 먼저 여기에 꽂고(즉시), 분류는 백그라운드에서 채운다.
-- 분류 결과는 실제 테이블(tasks/meals/...)로 물질화되고 그 참조를 여기에 남긴다.
create table if not exists captures (
  id           uuid primary key default gen_random_uuid(),
  text         text not null,
  type         text not null default 'pending',   -- pending | task | idea | meal | error | log | failed
  target_table text,
  target_id    uuid,
  fields       jsonb not null default '{}'::jsonb,
  error        text,
  created_at   timestamptz not null default now()
);
create index if not exists captures_recent_idx on captures (created_at desc);

alter table captures enable row level security;
