-- quiz-maker 계정 준비·옮기기·상태 함수 (설계서 2.5절·3.2절·6.2절). schema_version 3.
-- 옮기기 함수는 security definer(소유자 권한)라서 id 지정 삽입·setval·옛 set_title 유지가 된다.
-- 넣기·비우기·닫기는 둘 다 맞아야 돈다: ① 부른 사람이 profiles ADMIN ② qm_settings.live = false.
-- live 는 qm_import_close() 로 한 번만 true 가 되고 RPC 로는 되돌릴 수 없다(복원 때만 docs/restore/reopen-import.sql).
-- 운영에 적용된 뒤에는 이 파일을 고치지 않는다. 함수 인자를 바꿀 때는 새 파일에 옛 서명 drop 을 함께 넣는다.

-- 시각 글자: 시간대(Z 또는 ±hh:mm)가 없으면 거절한다(세션 시간대로 조용히 읽히는 것을 막음)
create or replace function public.qm_ts(p text) returns timestamptz
language plpgsql stable set search_path = '' as $$
begin
  if p is null then return null; end if;
  if p !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then
    raise exception using errcode = 'QM400', message = format('시각에 시간대(Z 또는 +09:00)가 없습니다: %s', p);
  end if;
  return p::timestamptz;
end $$;

-- 처음 로그인한 사용자를 관리자 프로필로 만든다.
-- 아이디는 도구가 옛 세션·ledger 에서 읽어 넘긴다(저장소에 적지 않음).
-- Auth 사용자가 정확히 1명이고 그 사람이 부른 경우에만 된다. 관리자는 고유 색인으로 하나뿐이다.
create or replace function public.qm_bootstrap_admin(p_username text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := auth.uid(); p public.profiles;
begin
  if v is null then
    raise exception using errcode = '42501', message = '로그인이 필요합니다.';
  end if;
  -- 익명 여부는 토큰과 auth.users 둘 다 본다(토큰에 is_anonymous 가 빠져도 막히게)
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
     or exists (select 1 from auth.users u where u.id = v and coalesce(u.is_anonymous, false)) then
    raise exception using errcode = 'QM403', message = '익명 로그인으로는 계정을 준비할 수 없습니다.';
  end if;
  select * into p from public.profiles where id = v;
  if found then
    return jsonb_build_object('username', p.username, 'role', p.role, 'created', false);
  end if;
  if (select count(*) from auth.users) <> 1 or not exists (select 1 from auth.users u where u.id = v) then
    raise exception using errcode = 'QM403',
      message = '사용자가 정확히 한 명일 때만 계정을 준비할 수 있습니다. 대시보드 Authentication → Users 를 확인해 주세요.';
  end if;
  if exists (select 1 from public.profiles where role = 'ADMIN') then
    raise exception using errcode = 'QM403', message = '이미 관리자 계정이 있습니다.';
  end if;
  if p_username is null or char_length(btrim(p_username)) not between 1 and 50 then
    raise exception using errcode = 'QM400', message = '아이디가 비었거나 너무 깁니다.';
  end if;
  insert into public.profiles (id, username, nickname, role) values (v, btrim(p_username), btrim(p_username), 'ADMIN')
  returning * into p;                     -- 동시에 두 번 불러도 PK·profiles_one_admin 이 둘째를 막는다(23505)
  return jsonb_build_object('username', p.username, 'role', p.role, 'created', true);
end $$;

create or replace function public.qm_require_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := auth.uid();
begin
  if v is null or not exists (select 1 from public.profiles p where p.id = v and p.role = 'ADMIN') then
    raise exception using errcode = 'QM403', message = '관리자만 할 수 있습니다.';
  end if;
  return v;
end $$;

create or replace function public.qm_import_guard() returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid := public.qm_require_admin();
begin
  if (select s.live from public.qm_settings s) then
    raise exception using errcode = 'QM403', message = '전환이 끝나 옮겨 넣기가 닫혔습니다.';
  end if;
  return v;
end $$;

-- 사본 비우기(전환 전, 또는 '다시 열기' 뒤 복원 때만). 사용자가 터미널에서 실행한다.
-- 마지막으로 비운 뒤(처음이면 처음부터) 사용자 쓰기가 한 번이라도 있었으면 p_discard_changes 없이는 QM409 로 거절한다.
-- 넣기 끝(imported_at) 시각에 기대지 않는다: finish 를 다시 부르거나, finish 전(넣는 중)이거나,
-- discard 로 비운 직후여도 안전장치가 꺼지지 않게 하려는 것이다. 비운 뒤에는 기록을 지운다(잃을 것이 남지 않으므로).
-- 바뀐 행이 0인 쓰기 문장도 기록되므로 QM409 가 나와도 실제로 바뀐 행이 없을 수 있다(도구 해시가 같으면 discard 로 진행).
create or replace function public.qm_import_reset(p_discard_changes boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v  uuid := public.qm_import_guard();
  st public.qm_settings;
  n_notes int; n_sets int;
begin
  -- 설정 줄을 잠근다: 동시에 도는 사용자 쓰기의 기록·닫기(go-live)가 이 비우기와 엇갈리지 않게
  select * into st from public.qm_settings for update;
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
  update public.qm_settings set imported_at = null, import_max = null, last_user_write_at = null;
  return jsonb_build_object('deletedSets', n_sets, 'deletedNotes', n_notes);
end $$;

-- 문제집 하나 + 그 문항 전부를 옛 id 그대로(옛 응답 글자를 그대로, options 도 정리하지 않음)
-- answers 는 배열이나 null 만 받는다(배열이 아니면 조용히 버리지 않고 넣기 전체를 멈춤). 빈 배열은 NULL.
create or replace function public.qm_import_set(p_set jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := public.qm_import_guard(); n int; v_created timestamptz; v_bad bigint;
begin
  select (q->>'id')::bigint into v_bad
    from jsonb_array_elements(coalesce(p_set->'questions', '[]'::jsonb)) as t(q)
   where jsonb_typeof(q->'answers') not in ('array', 'null')
   limit 1;
  if found then
    raise exception using errcode = 'QM400', message = format('문항 %s: answers 는 배열이어야 합니다.', v_bad);
  end if;
  insert into public.question_sets (id, user_id, title, subject, created_at)
  values ((p_set->>'id')::bigint, v, p_set->>'title', p_set->>'subject', public.qm_ts(p_set->>'createdAt'))
  returning created_at into v_created;
  insert into public.questions (id, set_id, type, text, options, answer_index, answer, answers, explanation,
                                question_image_url, answer_image_url, order_index)
  select (q->>'id')::bigint, (p_set->>'id')::bigint, q->>'type', q->>'text', q->>'options',
         (q->>'answerIndex')::int, q->>'answer',
         case when jsonb_typeof(q->'answers') = 'array' and jsonb_array_length(q->'answers') > 0 then q->'answers' end,
         q->>'explanation', q->>'questionImageUrl', q->>'answerImageUrl',
         coalesce((q->>'orderIndex')::int, 0)
    from jsonb_array_elements(coalesce(p_set->'questions', '[]'::jsonb)) as t(q);
  get diagnostics n = row_count;
  return jsonb_build_object('setId', (p_set->>'id')::bigint, 'questions', n,
    'createdAtExact', to_char(v_created at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));  -- 도구가 마이크로초까지 견줌
end $$;

-- 메모 묶음(100개씩). 트리거는 current_user 가 authenticated 가 아니라서 옛 값을 그대로 둔다.
-- 문항이 붙은 메모는 setId 가 그 문항의 문제집이어야 한다(옛 서버의 불변식. 어긋나면 나중에 떼어지는 꼴이 달라짐).
create or replace function public.qm_import_notes(p_notes jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := public.qm_import_guard(); n int; v_bad bigint;
begin
  select (x->>'id')::bigint into v_bad
    from jsonb_array_elements(p_notes) as t(x)
    join public.questions q on q.id = (x->>'questionId')::bigint
   where (x->>'setId') is null or (x->>'setId')::bigint <> q.set_id
   limit 1;
  if found then
    raise exception using errcode = 'QM400', message = format('메모 %s: 고른 문항이 그 문제집의 문항이 아닙니다.', v_bad);
  end if;
  insert into public.question_notes (id, user_id, set_id, question_id, set_title, blank_no, context, content,
                                     resolved_at, created_at, updated_at)
  select (x->>'id')::bigint, v, (x->>'setId')::bigint, (x->>'questionId')::bigint, x->>'setTitle',
         (x->>'blankNo')::int, x->>'context', x->>'content',
         public.qm_ts(x->>'resolvedAt'), public.qm_ts(x->>'createdAt'), public.qm_ts(x->>'updatedAt')
    from jsonb_array_elements(p_notes) as t(x);
  get diagnostics n = row_count;
  return jsonb_build_object('notes', n);
end $$;

-- 시퀀스 맞추기: 다음 번호 = max(표의 최대 id, 도구 기록이 본 가장 큰 id) + 1000 + 1
-- p_rehearsal 이면 다음 번호를 1,000,000 이상으로 올려, 리허설 시험 회차가 옛 쪽 번호와 절대 겹치지 않게 한다.
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
         import_max = jsonb_build_object('sets', m_sets, 'questions', m_qs, 'notes', m_nts);
  return jsonb_build_object('nextSetId', a + 1, 'nextQuestionId', b + 1, 'nextNoteId', c + 1,
    'rehearsal', coalesce(p_rehearsal, false),
    'sets', (select count(*) from public.question_sets where user_id = v),
    'questions', (select count(*) from public.questions q join public.question_sets s on s.id = q.set_id where s.user_id = v),
    'notes', (select count(*) from public.question_notes where user_id = v));
end $$;

-- 상태 보기(읽기만, 관리자만, live 와 상관없이 언제나): verify 와 check 가 쓴다
create or replace function public.qm_import_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := public.qm_require_admin(); st public.qm_settings; ns bigint; nq bigint; nn bigint;
begin
  select * into st from public.qm_settings;
  execute format('select case when is_called then last_value + 1 else last_value end from %s',
                 pg_get_serial_sequence('public.question_sets', 'id')) into ns;
  execute format('select case when is_called then last_value + 1 else last_value end from %s',
                 pg_get_serial_sequence('public.questions', 'id')) into nq;
  execute format('select case when is_called then last_value + 1 else last_value end from %s',
                 pg_get_serial_sequence('public.question_notes', 'id')) into nn;
  return jsonb_build_object('live', st.live, 'schemaVersion', st.schema_version,
    'importedAt', public.qm_iso(st.imported_at), 'importMax', st.import_max,
    'lastUserWriteAt', public.qm_iso(st.last_user_write_at),
    'nextIds', jsonb_build_object('sets', ns, 'questions', nq, 'notes', nn),
    'counts', jsonb_build_object(
      'sets', (select count(*) from public.question_sets where user_id = v),
      'questions', (select count(*) from public.questions q join public.question_sets s on s.id = q.set_id where s.user_id = v),
      'notes', (select count(*) from public.question_notes where user_id = v)));
end $$;

-- 전환 끝: 옮기기를 닫는다(한 방향)
create or replace function public.qm_import_close() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.qm_import_guard();
  update public.qm_settings set live = true;
  return jsonb_build_object('live', true);
end $$;

-- 실행 권한: 이 파일의 함수 이름을 모두 적어 명시한다(200 파일의 do 블록은 이 함수들을 모른다)
revoke execute on function
  public.qm_ts(text), public.qm_bootstrap_admin(text), public.qm_require_admin(), public.qm_import_guard(),
  public.qm_import_reset(boolean), public.qm_import_set(jsonb), public.qm_import_notes(jsonb),
  public.qm_import_finish(jsonb, boolean), public.qm_import_status(), public.qm_import_close()
  from public, anon;
grant execute on function
  public.qm_ts(text), public.qm_bootstrap_admin(text), public.qm_require_admin(), public.qm_import_guard(),
  public.qm_import_reset(boolean), public.qm_import_set(jsonb), public.qm_import_notes(jsonb),
  public.qm_import_finish(jsonb, boolean), public.qm_import_status(), public.qm_import_close()
  to authenticated;

update public.qm_settings set schema_version = greatest(schema_version, 3);
