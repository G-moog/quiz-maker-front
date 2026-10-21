-- '옮기기 다시 열기' 틀 — 복원할 때만 쓴다(설계서 6.5절). 이 파일 자체는 마이그레이션이 아니다.
--
-- 쓰는 법(에이전트)
--   1. 이 파일을 supabase/migrations/<지금 시각 14자리>_qm_reopen_<이름>.sql 로 복사한다.
--      <이름>: 영문 소문자·숫자·밑줄·빼기 3~60자(예: 20261105_restore). 복원마다 새 이름.
--   2. 복사한 파일에서 아래 v_name 의 값(따옴표 안의 REOPEN_NAME_HERE)을 그 <이름> 으로 바꾼다(한 군데).
--   3. 그 파일만 담은 커밋을 사용자가 master 에 push → 적용 확인(qm_import_status 의 live:false).
--   4. (사용자) import-supabase --snapshot <백업 폴더> --reset --discard-changes
--   5. (에이전트) verify-migration --snapshot <백업 폴더>
--   6. (사용자) import-supabase --go-live
--
-- 한 번만 동작한다: 이름표 표(qm_reopen_log)에 그 이름을 처음 넣을 때만 live = false 로 바꾼다.
-- 같은 파일이 다시 적용되어도(이력 재생 등) 이미 있는 이름이라 또 열지 않는다.
-- 이름을 바꾸지 않은 채 적용하면 오류로 멈춘다(엉뚱하게 열리지 않게).

create table if not exists public.qm_reopen_log (
  name        text primary key,
  reopened_at timestamptz not null default now()
);
alter table public.qm_reopen_log enable row level security;
revoke all on public.qm_reopen_log from anon, authenticated;   -- 아무도 API 로 보거나 쓰지 못함

do $$
declare
  v_name constant text := 'REOPEN_NAME_HERE';   -- ← 복사한 파일 이름의 <이름> 으로 바꾼다
  v_new  int;
begin
  if v_name = 'REOPEN_' || 'NAME_HERE' or v_name !~ '^[a-z0-9_-]{3,60}$' then
    raise exception '다시 열기 이름이 정해지지 않았습니다(%). 파일 안의 REOPEN_NAME_HERE 를 파일 이름의 <이름> 으로 바꾸세요.', v_name;
  end if;
  insert into public.qm_reopen_log (name) values (v_name) on conflict (name) do nothing;
  get diagnostics v_new = row_count;
  if v_new = 1 then
    update public.qm_settings set live = false;
    raise notice '옮기기를 다시 열었습니다(%). 복원이 끝나면 import-supabase --go-live 로 닫으세요.', v_name;
  else
    raise notice '이미 적용된 다시 열기(%)라 아무것도 바꾸지 않습니다.', v_name;
  end if;
end $$;
