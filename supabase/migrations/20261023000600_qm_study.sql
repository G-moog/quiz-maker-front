-- ⑥ 공부 기록 나누기(2026-10-23): 휴대폰과 태블릿이 '이어 보기'·'마지막 공부'·공부한 날을 함께 본다. schema_version 6.
-- 앱(utils/studyState.js)은 지금처럼 이 기기 localStorage 에 문제집마다 한 줄을 두고, 그 줄을 이 표에 올리고 받는다.
-- 줄의 내용(data)은 앱이 정한다: { v, at: 마지막으로 본 때, days: [공부한 날 YYYY-MM-DD(서울)], …풀기 화면의 이어 보기 값 }.
-- DB 는 내용을 거의 모른 채 두 가지만 맞춘다:
--   · 이어 보기 값은 '나중에 고친 쪽이 이김'(client_at = 그 기기에서 내용이 바뀐 때). 늦게 도착한 옛 기록은 내용을 덮지 못한다.
--   · 공부한 날(days)은 합치고(최근 120일), 마지막으로 본 때(at)는 늦은 쪽 — 어느 기기가 이기든 잃지 않는다.
-- 운영에 적용된 뒤에는 이 파일을 고치지 않는다. 바꿀 것은 새 파일로(supabase/README.md).

create table if not exists public.study_states (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  set_id     bigint not null references public.question_sets (id) on delete cascade,   -- 문제집을 지우면 기록도 지움
  data       jsonb not null,
  client_at  timestamptz not null,   -- 기기에서 내용이 바뀐 때(서버 시각보다 늦으면 서버 시각으로 줄임)
  updated_at timestamptz not null default now(),   -- 이 줄이 서버에서 마지막으로 바뀐 때(받기 커서, 트리거가 채움)
  primary key (user_id, set_id),
  constraint study_states_data_object check (jsonb_typeof(data) = 'object'),
  constraint study_states_data_bytes  check (octet_length(data::text) <= 65536)   -- 64KB(함수는 60,000바이트에서 먼저 거절)
);
create index if not exists study_states_set_idx on public.study_states (set_id);   -- 문제집 지우기(cascade)

-- 사용자 쓰기 기록(qm_after_user_write)은 걸지 않는다: 그 기록은 옮겨 넣기 전 '비우기' 안전장치용(세 표)이고,
-- 공부 기록은 화면을 넘길 때마다 올라오므로 쓸 때마다 설정 줄을 고칠 까닭이 없다. 비우기는 문제집과 함께 cascade 로 지운다.

-- 받기 커서: 서버가 줄을 바꾼 시각(밀리초). 누가 쓰든(함수·직접 쓰기) 서버 시각으로
create or replace function qm_private.study_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := date_trunc('milliseconds', now());
  return new;
end $$;
drop trigger if exists qm_study_touch on public.study_states;
create trigger qm_study_touch before insert or update on public.study_states
  for each row execute function qm_private.study_touch();

-- 두 기록 합치기: 내용은 p_new_wins 에 따라 한쪽, days 는 합집합(꼴이 맞는 날짜만, 최근 120개, 오름차순), at 은 늦은 쪽.
-- at 은 앱이 toISOString() 으로 쓰는 꼴(UTC, 밀리초, Z)이라 글자 비교가 곧 시각 비교다. 꼴이 다른 값은 버린다
create or replace function qm_private.study_merge(p_old jsonb, p_new jsonb, p_new_wins boolean) returns jsonb
language sql immutable set search_path = '' as $$
  select (case when p_new_wins or p_old is null then p_new else p_old end)
         || jsonb_build_object(
              'days', (select coalesce(jsonb_agg(to_jsonb(k.d) order by k.d), '[]'::jsonb)
                         from (select distinct u.d
                                 from (select jsonb_array_elements_text(
                                                case when jsonb_typeof(x.j -> 'days') = 'array' then x.j -> 'days' else '[]'::jsonb end) as d
                                         from (values (p_old), (p_new)) as x(j)) u
                                where u.d ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                                order by u.d desc
                                limit 120) k),
              'at', (select max(a.t)
                       from (values (p_old ->> 'at'), (p_new ->> 'at')) as a(t)
                      where a.t ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?Z$'))
$$;

-- ── 권한·RLS ─────────────────────────────────────────────
-- 함수는 security invoker(부른 사람 권한)라 표 권한이 있어야 한다. 읽기와, 넣기·고치기에 필요한 칸만 준다.
-- user_id 는 쓸 수 없다(기본값 auth.uid()), 지우기는 주지 않는다(문제집을 지우면 cascade 로 지워짐).
revoke all on public.study_states from anon, authenticated;
grant select                       on public.study_states to authenticated;
grant insert (set_id, data, client_at),
      update (data, client_at)     on public.study_states to authenticated;
alter table public.study_states enable row level security;

drop policy if exists study_select_own on public.study_states;
create policy study_select_own on public.study_states for select to authenticated
  using (user_id = (select auth.uid()));
-- 넣기: 내 줄이고, 그 문제집도 내 것이어야 한다(남의 문제집 id 로 기록을 만들지 못하게)
drop policy if exists study_insert_own on public.study_states;
create policy study_insert_own on public.study_states for insert to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.question_sets s
                          where s.id = set_id and s.user_id = (select auth.uid())));
drop policy if exists study_update_own on public.study_states;
create policy study_update_own on public.study_states for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ── 함수 ─────────────────────────────────────────────────
-- 내 공부 기록 목록. p_since 를 주면 그 뒤에 서버에서 바뀐 줄만(앱의 받기 커서).
-- stable: PostgREST 는 읽기 전용 트랜잭션으로 부른다 — 이 함수에는 쓰기를 넣지 않는다
create or replace function public.qm_list_study(p_since timestamptz default null) returns jsonb
language plpgsql stable set search_path = '' as $$
declare v uuid := public.qm_require_user();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('setId', t.set_id, 'data', t.data,
                                        'clientAt', public.qm_iso(t.client_at), 'updatedAt', public.qm_iso(t.updated_at))
                     order by t.set_id)
      from public.study_states t
     where t.user_id = v
       and (p_since is null or t.updated_at > p_since)), '[]'::jsonb);
end $$;

-- 기록 올리기(있으면 합침). 내 문제집에만. 돌려주는 값은 합친 뒤 서버에 남은 줄 { setId, data, clientAt, updatedAt } —
-- 앱은 그것을 받아 자기 기록과 다시 합친다(진 쪽이면 서버 내용을 받아들임).
-- 이김 판정: 새 client_at 이 서버 것과 같거나 늦으면 새 내용(같으면 같은 판의 되올리기 — 합친 days·at 만 더해짐).
-- client_at 이 서버 시각보다 늦으면(기기 시계가 앞섬) 서버 시각으로 줄인다 — 시계가 틀린 기기가 언제까지나 이기지 않게
create or replace function public.qm_put_study(p_set_id bigint, p_data jsonb, p_client_at timestamptz) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v    uuid := public.qm_require_user();
  v_at timestamptz;
  r    public.study_states;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception using errcode = 'QM400', message = '공부 기록의 꼴이 올바르지 않습니다(객체여야 합니다).';
  end if;
  if octet_length(p_data::text) > 60000 then
    raise exception using errcode = 'QM400',
      message = format('공부 기록이 너무 큽니다(%s바이트, 60,000바이트까지).', octet_length(p_data::text));
  end if;
  if p_client_at is null then
    raise exception using errcode = 'QM400', message = '공부 기록의 시각(client_at)이 없습니다.';
  end if;
  if not exists (select 1 from public.question_sets s where s.id = p_set_id and s.user_id = v) then
    raise exception using errcode = 'QM404', message = '존재하지 않는 세트입니다.';
  end if;
  v_at := least(date_trunc('milliseconds', p_client_at), date_trunc('milliseconds', now()));
  insert into public.study_states as t (set_id, data, client_at)
  values (p_set_id, qm_private.study_merge(null, p_data, true), v_at)
  on conflict (user_id, set_id) do update
     set data      = qm_private.study_merge(t.data, excluded.data, excluded.client_at >= t.client_at),
         client_at = greatest(t.client_at, excluded.client_at)
   where t.user_id = v
  returning * into r;
  return jsonb_build_object('setId', r.set_id, 'data', r.data,
                            'clientAt', public.qm_iso(r.client_at), 'updatedAt', public.qm_iso(r.updated_at));
end $$;

-- ── 실행 권한: 이 파일의 함수 이름을 모두 적어 명시한다(200 파일의 do 블록은 이 함수들을 모른다) ──
revoke execute on function
  public.qm_list_study(timestamptz), public.qm_put_study(bigint, jsonb, timestamptz),
  qm_private.study_merge(jsonb, jsonb, boolean), qm_private.study_touch()
  from public, anon;
grant execute on function
  public.qm_list_study(timestamptz), public.qm_put_study(bigint, jsonb, timestamptz),
  qm_private.study_merge(jsonb, jsonb, boolean), qm_private.study_touch()
  to authenticated;

update public.qm_settings set schema_version = greatest(schema_version, 6) where id;
