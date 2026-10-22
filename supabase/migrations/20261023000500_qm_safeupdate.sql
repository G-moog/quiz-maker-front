-- ⑤ Supabase 의 safeupdate 에 맞추기(2026-10-22)
-- Supabase 는 Data API(PostgREST) 요청에 pg-safeupdate 를 켜 둔다. 그래서 API 로 부른 함수 안에서도
-- WHERE 없는 UPDATE·DELETE 는 "UPDATE requires a WHERE clause" 로 거절된다(로컬 PGlite 에는 이 장치가 없어 시험이 못 잡음).
-- 2026-10-22 리허설 넣기(qm_import_reset)가 이 오류로 멈췄다.
-- 설정 표 qm_settings 는 id = true 인 한 줄뿐이라(qm_settings_one_row) WHERE id 를 붙여도 뜻은 같다.
-- 이미 적용된 100·300 파일은 고치지 않고(설계서 7.2절), 같은 함수를 여기서 다시 정의한다. 권한(GRANT)은 그대로 남는다.

-- 사용자 쓰기 시각 남기기(트리거가 부름) — 이것이 막히면 앱의 모든 쓰기(문제집·문항·메모)가 막힌다
create or replace function qm_private.touch_user_write() returns void
language sql security definer set search_path = '' as $$
  update public.qm_settings set last_user_write_at = now() where id
$$;

create or replace function public.qm_import_reset(p_discard_changes boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v  uuid := public.qm_import_guard();
  st public.qm_settings;
  n_notes int; n_sets int;
begin
  -- 설정 줄을 잠근다: 동시에 도는 사용자 쓰기의 기록·닫기(go-live)가 이 비우기와 엇갈리지 않게
  select * into st from public.qm_settings where id for update;
  if st.live then
    raise exception using errcode = 'QM403', message = '전환이 끝나 옮겨 넣기가 닫혔습니다.';
  end if;
  if st.last_user_write_at is not null and not coalesce(p_discard_changes, false) then
    raise exception using errcode = 'QM409',
      message = format('마지막 비우기 뒤 이 DB 에 사용자가 쓴 기록이 있습니다(마지막 쓰기 %s). 백업한 뒤 버려도 될 때만 --discard-changes 로 다시 하세요.',
                       public.qm_iso(st.last_user_write_at));
  end if;
  delete from public.question_notes where user_id = v; get diagnostics n_notes = row_count;
  delete from public.question_sets  where user_id = v; get diagnostics n_sets  = row_count;   -- 문항은 cascade
  update public.qm_settings set imported_at = null, import_max = null, last_user_write_at = null where id;
  return jsonb_build_object('deletedSets', n_sets, 'deletedNotes', n_notes);
end $$;

create or replace function public.qm_import_finish(p_floor jsonb, p_rehearsal boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v      uuid := public.qm_import_guard();
  gap    constant bigint := 1000;
  m_sets bigint := (select coalesce(max(id), 0) from public.question_sets);
  m_qs   bigint := (select coalesce(max(id), 0) from public.questions);
  m_nts  bigint := (select coalesce(max(id), 0) from public.question_notes);
  a bigint; b bigint; c bigint;
begin
  a := greatest(m_sets, coalesce((p_floor->>'sets')::bigint, 0)) + gap;
  b := greatest(m_qs,   coalesce((p_floor->>'questions')::bigint, 0)) + gap;
  c := greatest(m_nts,  coalesce((p_floor->>'notes')::bigint, 0)) + gap;
  if coalesce(p_rehearsal, false) then
    a := greatest(a, 999999); b := greatest(b, 999999); c := greatest(c, 999999);
  end if;
  perform setval(pg_get_serial_sequence('public.question_sets', 'id'), a);    -- 다음 번호 = a + 1
  perform setval(pg_get_serial_sequence('public.questions', 'id'), b);
  perform setval(pg_get_serial_sequence('public.question_notes', 'id'), c);
  update public.qm_settings set imported_at = now(),
         import_max = jsonb_build_object('sets', m_sets, 'questions', m_qs, 'notes', m_nts)
   where id;
  return jsonb_build_object('nextSetId', a + 1, 'nextQuestionId', b + 1, 'nextNoteId', c + 1,
    'rehearsal', coalesce(p_rehearsal, false),
    'sets', (select count(*) from public.question_sets where user_id = v),
    'questions', (select count(*) from public.questions q join public.question_sets s on s.id = q.set_id where s.user_id = v),
    'notes', (select count(*) from public.question_notes where user_id = v));
end $$;

create or replace function public.qm_import_close() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.qm_import_guard();
  update public.qm_settings set live = true where id;
  return jsonb_build_object('live', true);
end $$;

update public.qm_settings set schema_version = greatest(schema_version, 5) where id;
