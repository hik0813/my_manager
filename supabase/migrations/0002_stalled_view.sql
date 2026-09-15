-- 정체 일수는 조회 시점 기준이 정확하다. 컬럼(stalled_days)은 크론이 채우고,
-- 화면에서는 이 뷰를 써서 항상 오늘 기준으로 계산한다.
create or replace view projects_with_stall as
select
  p.*,
  greatest(0, (current_date - p.last_active_at::date))::int as stall_days,
  (select count(*) from tasks t where t.project_id = p.id and t.done_at is null) as open_tasks
from projects p;
