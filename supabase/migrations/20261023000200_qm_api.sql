-- quiz-maker 옛 API 와 짝인 함수 (설계서 2.4절·4절). schema_version 2.
-- 모든 함수는 security invoker(기본)이고 search_path = '' 이며 이름에 public. 을 붙인다.
-- 응답은 옛 DTO 와 같은 camelCase JSON, 오류는 옛 서버의 한국어 문구 + 코드 QM400·QM403·QM404(설계서 4.3절).
-- 검사 순서·문구는 옛 백엔드(QuizService·NoteService·NoteController)와 맞췄다.
-- 운영에 적용된 뒤에는 이 파일을 고치지 않는다. 함수 인자를 바꿀 때는 새 파일에 옛 서명 drop 을 함께 넣는다(supabase/README.md).

-- ── 도움 함수 ─────────────────────────────────────────────
create or replace function public.qm_iso(t timestamptz) returns text
language sql stable set search_path = '' as $$
  select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')   -- 옛 Instant 응답 꼴(밀리초, 자름)
$$;

-- 글자 수를 옛 Java String.length()·앱의 .length 와 같게 센다(UTF-16 단위: 이모지 같은 보충 평면 글자는 2).
create or replace function public.qm_jlen(v text) returns integer
language sql immutable set search_path = '' as $$
  select char_length(v) + char_length(regexp_replace(v, '[^\U00010000-\U0010FFFF]', '', 'g'))
$$;

create or replace function public.qm_require_user() returns uuid
language plpgsql stable set search_path = '' as $$
declare v uuid := auth.uid();
begin
  if v is null then
    raise exception using errcode = '42501', message = '로그인이 필요합니다.';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v) then
    raise exception using errcode = 'QM403', message = '계정 준비가 끝나지 않았습니다. 도구에서 login 을 한 번 해 주세요.';
  end if;
  return v;
end $$;

create or replace function public.qm_set_json(s public.question_sets, n bigint) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', s.id, 'title', s.title, 'subject', s.subject,
                            'createdAt', public.qm_iso(s.created_at), 'questionCount', n)
$$;

create or replace function public.qm_question_json(q public.questions) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', q.id, 'type', q.type, 'text', q.text, 'options', q.options,
    'answerIndex', q.answer_index, 'answer', q.answer, 'answers', q.answers,
    'explanation', q.explanation, 'questionImageUrl', q.question_image_url,
    'answerImageUrl', q.answer_image_url, 'orderIndex', q.order_index)
$$;

create or replace function public.qm_note_json(n public.question_notes) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', n.id, 'setId', n.set_id, 'questionId', n.question_id, 'setTitle', n.set_title,
    'blankNo', n.blank_no, 'context', n.context, 'content', n.content,
    'resolved', n.resolved_at is not null, 'resolvedAt', public.qm_iso(n.resolved_at),
    'createdAt', public.qm_iso(n.created_at), 'updatedAt', public.qm_iso(n.updated_at))
$$;

-- 보기: JSON 글자(앱·도구) 또는 배열 → 정규화 꼴 글자.
-- 글자·정수·참거짓·null 로 된 배열·객체는 MySQL JSON 꼴과 같다. 소수·지수·-0 은 다르게 나온다(2.50 그대로, 1e2 → 100).
-- 앱·도구는 늘 글자 배열을 보내므로 영향이 없다. 빈 글자·공백뿐이면 NULL(옛 MySQL 은 거절).
create or replace function public.qm_norm_options(v jsonb) returns text
language plpgsql immutable set search_path = '' as $$
begin
  if v is null or v = 'null'::jsonb then return null; end if;
  if jsonb_typeof(v) = 'string' then
    if btrim(v #>> '{}') = '' then return null; end if;
    return ((v #>> '{}')::jsonb)::text;        -- 깨진 JSON 이면 22P02 → 400 (옛 MySQL JSON 칸과 같은 성질)
  end if;
  return v::text;
end $$;

-- 빈칸 정답: 배열만, 빈 배열은 NULL, 원소는 글자로(옛 List<String> 대응)
create or replace function public.qm_norm_answers(v jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
begin
  if v is null or v = 'null'::jsonb then return null; end if;
  if jsonb_typeof(v) <> 'array' then
    raise exception using errcode = 'QM400', message = 'answers 는 배열이어야 합니다.';
  end if;
  if jsonb_array_length(v) = 0 then return null; end if;
  return (select jsonb_agg(case when jsonb_typeof(e) in ('string', 'null') then e
                                else to_jsonb(e #>> '{}') end order by i)
          from jsonb_array_elements(v) with ordinality as t(e, i));
end $$;

create or replace function public.qm_check_question(p jsonb) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if octet_length(coalesce(p->>'text', '')) > 65535 then
    raise exception using errcode = 'QM400', message = '문제 본문이 65,535바이트를 넘습니다.';
  end if;
  if octet_length(coalesce(p->>'explanation', '')) > 65535 then
    raise exception using errcode = 'QM400', message = '해설이 65,535바이트를 넘습니다.';
  end if;
  if char_length(coalesce(p->>'answer', '')) > 500 then
    raise exception using errcode = 'QM400', message = '정답은 500자까지입니다.';
  end if;
  if char_length(coalesce(p->>'type', '')) > 20 then
    raise exception using errcode = 'QM400', message = '유형 이름이 너무 깁니다.';
  end if;
end $$;

-- ── 계정 ─────────────────────────────────────────────────
-- anon 도 부를 수 있음(상태 확인·정지 막기). 소유자 권한으로 숫자 하나만 돌려준다.
create or replace function public.qm_schema_version() returns integer
language sql stable security definer set search_path = '' as $$
  select s.schema_version from public.qm_settings s
$$;

create or replace function public.qm_me() returns jsonb
language plpgsql stable set search_path = '' as $$
declare p public.profiles; st public.qm_settings;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = '로그인이 필요합니다.';
  end if;
  select * into p from public.profiles where id = auth.uid();
  select * into st from public.qm_settings;   -- 프로필이 없으면 RLS 로 안 보임(live 는 null)
  return jsonb_build_object('ready', p.id is not null, 'username', p.username, 'role', p.role,
                            'schemaVersion', public.qm_schema_version(), 'live', st.live);
end $$;

-- ── 문제집 ───────────────────────────────────────────────
-- 계정 준비가 안 된 사용자에게 빈 목록 대신 QM403 을 준다('문제집이 안 보임' 사고를 막으려고).
create or replace function public.qm_list_sets() returns jsonb
language plpgsql stable set search_path = '' as $$
declare v uuid := public.qm_require_user();
begin
  return coalesce((
    select jsonb_agg(
             public.qm_set_json(s, (select count(*) from public.questions q where q.set_id = s.id))
             order by s.created_at desc, s.id desc)
      from public.question_sets s
     where s.user_id = v), '[]'::jsonb);
end $$;

create or replace function public.qm_check_set_fields(p_title text, p_subject text) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_title is null then
    raise exception using errcode = 'QM400', message = '제목을 입력해 주세요.';
  end if;
  if char_length(p_title) > 100 then
    raise exception using errcode = 'QM400', message = '제목은 100자까지입니다.';
  end if;
  if char_length(coalesce(p_subject, '')) > 50 then
    raise exception using errcode = 'QM400', message = '과목은 50자까지입니다.';
  end if;
end $$;

create or replace function public.qm_create_set(p_title text, p_subject text default null) returns jsonb
language plpgsql set search_path = '' as $$
declare s public.question_sets;
begin
  perform public.qm_require_user();
  perform public.qm_check_set_fields(p_title, p_subject);
  insert into public.question_sets (title, subject) values (p_title, p_subject)   -- user_id 는 기본값 auth.uid()
  returning * into s;
  return public.qm_set_json(s, 0);
end $$;

-- 옛 PUT 과 같이 통째로 바꾼다(p_subject 를 빼면 NULL)
create or replace function public.qm_update_set(p_set_id bigint, p_title text, p_subject text default null) returns jsonb
language plpgsql set search_path = '' as $$
declare s public.question_sets;
begin
  perform public.qm_require_user();
  if not exists (select 1 from public.question_sets x where x.id = p_set_id and x.user_id = auth.uid()) then
    raise exception using errcode = 'QM404', message = '존재하지 않는 세트입니다.';   -- 옛 순서: 찾기 → 고치기
  end if;
  perform public.qm_check_set_fields(p_title, p_subject);
  update public.question_sets set title = p_title, subject = p_subject
   where id = p_set_id and user_id = auth.uid()
  returning * into s;
  if not found then
    raise exception using errcode = 'QM404', message = '존재하지 않는 세트입니다.';
  end if;
  return public.qm_set_json(s, (select count(*) from public.questions q where q.set_id = s.id));
end $$;

-- 문항은 FK cascade 로, 메모는 set null 로 떼어진다(set_title·blank_no·context 는 남음)
create or replace function public.qm_delete_set(p_set_id bigint) returns jsonb
language plpgsql set search_path = '' as $$
begin
  perform public.qm_require_user();
  delete from public.question_sets where id = p_set_id and user_id = auth.uid();
  if not found then
    raise exception using errcode = 'QM404', message = '존재하지 않는 세트입니다.';
  end if;
  return jsonb_build_object('deleted', p_set_id);
end $$;

-- ── 문항 ─────────────────────────────────────────────────
create or replace function public.qm_list_questions(p_set_id bigint) returns jsonb
language plpgsql stable set search_path = '' as $$
begin
  perform public.qm_require_user();
  if not exists (select 1 from public.question_sets s where s.id = p_set_id and s.user_id = auth.uid()) then
    raise exception using errcode = 'QM404', message = '존재하지 않는 세트입니다.';
  end if;
  return coalesce((select jsonb_agg(public.qm_question_json(q) order by q.order_index, q.id)
                   from public.questions q where q.set_id = p_set_id), '[]'::jsonb);
end $$;

create or replace function public.qm_add_question(p_set_id bigint, p_question jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare v_q public.questions;
begin
  perform public.qm_require_user();
  if not exists (select 1 from public.question_sets s where s.id = p_set_id and s.user_id = auth.uid()) then
    raise exception using errcode = 'QM404', message = '존재하지 않는 세트입니다.';   -- 옛 순서: 문제집 찾기가 먼저
  end if;
  perform public.qm_check_question(p_question);
  insert into public.questions (set_id, type, text, options, answer_index, answer, answers, explanation,
                                question_image_url, answer_image_url, order_index)
  values (p_set_id, p_question->>'type', p_question->>'text',
          public.qm_norm_options(p_question->'options'),
          (p_question->>'answerIndex')::int, p_question->>'answer',
          public.qm_norm_answers(p_question->'answers'), p_question->>'explanation',
          p_question->>'questionImageUrl', p_question->>'answerImageUrl',
          coalesce((p_question->>'orderIndex')::int, 0))
  returning * into v_q;
  return public.qm_question_json(v_q);
end $$;

-- 옛 PUT /api/questions/{id} 와 같이 10칸을 통째로 바꾼다(안 보낸 칸은 NULL, orderIndex 는 0)
create or replace function public.qm_update_question(p_question_id bigint, p_question jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare v_q public.questions;
begin
  perform public.qm_require_user();
  if not exists (select 1 from public.questions q join public.question_sets s on s.id = q.set_id
                  where q.id = p_question_id and s.user_id = auth.uid()) then
    raise exception using errcode = 'QM404', message = '존재하지 않는 문항입니다.';   -- 옛 순서: 문항 찾기가 먼저
  end if;
  perform public.qm_check_question(p_question);
  update public.questions q set
         type = p_question->>'type', text = p_question->>'text',
         options = public.qm_norm_options(p_question->'options'),
         answer_index = (p_question->>'answerIndex')::int, answer = p_question->>'answer',
         answers = public.qm_norm_answers(p_question->'answers'),
         explanation = p_question->>'explanation',
         question_image_url = p_question->>'questionImageUrl',
         answer_image_url = p_question->>'answerImageUrl',
         order_index = coalesce((p_question->>'orderIndex')::int, 0)
   where q.id = p_question_id
     and exists (select 1 from public.question_sets s where s.id = q.set_id and s.user_id = auth.uid())
  returning * into v_q;
  if not found then
    raise exception using errcode = 'QM404', message = '존재하지 않는 문항입니다.';
  end if;
  return public.qm_question_json(v_q);
end $$;

-- 메모의 question_id 는 FK set null 로 비워진다(옛 detachQuestion 과 같음)
create or replace function public.qm_delete_question(p_question_id bigint) returns jsonb
language plpgsql set search_path = '' as $$
begin
  perform public.qm_require_user();
  delete from public.questions q
   where q.id = p_question_id
     and exists (select 1 from public.question_sets s where s.id = q.set_id and s.user_id = auth.uid());
  if not found then
    raise exception using errcode = 'QM404', message = '존재하지 않는 문항입니다.';
  end if;
  return jsonb_build_object('deleted', p_question_id);
end $$;

-- ── 질문 메모 ────────────────────────────────────────────
-- status 는 옛 서버처럼 앞뒤 공백을 빼고 보며, 비었으면 all 이다.
create or replace function public.qm_list_notes(p_status text default 'all', p_set_id bigint default null) returns jsonb
language plpgsql stable set search_path = '' as $$
declare v_status text := coalesce(nullif(public.qm_strip(p_status), ''), 'all');
begin
  perform public.qm_require_user();
  if v_status not in ('open', 'resolved', 'all') then
    raise exception using errcode = 'QM400', message = 'status 는 open, resolved, all 중 하나여야 합니다.';
  end if;
  return coalesce((
    select jsonb_agg(public.qm_note_json(n) order by n.created_at desc, n.id desc)
      from public.question_notes n
     where n.user_id = auth.uid()
       and (p_set_id is null or n.set_id = p_set_id)
       and (v_status = 'all'
            or (v_status = 'open' and n.resolved_at is null)
            or (v_status = 'resolved' and n.resolved_at is not null))), '[]'::jsonb);
end $$;

-- 옛 NoteService 문구를 그대로 쓴다(앱 QuestionNoteSheet 의 TARGET_GONE 정규식이 이 문장을 본다)
create or replace function public.qm_create_note(p_note jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_content text;
  v_context text;
  v_blank   int;
  v_set_id  bigint;
  v_q_id    bigint;
  n public.question_notes;
begin
  perform public.qm_require_user();
  begin
    v_blank  := (p_note->>'blankNo')::int;
    v_set_id := (p_note->>'setId')::bigint;
    v_q_id   := (p_note->>'questionId')::bigint;
  exception when invalid_text_representation or numeric_value_out_of_range then
    -- 옛 NoteController 의 '깨진 본문' 문구
    raise exception using errcode = 'QM400',
      message = '요청 본문(JSON)의 형식이 올바르지 않습니다. 칸 이름과 값의 종류(숫자·글자·참거짓)를 확인해 주세요.';
  end;
  v_content := public.qm_strip(p_note->>'content');
  v_context := nullif(public.qm_strip(p_note->>'context'), '');
  if v_content is null or v_content = '' then
    raise exception using errcode = 'QM400', message = '메모 내용을 입력해 주세요.';
  end if;
  if public.qm_jlen(v_content) > 2000 then
    raise exception using errcode = 'QM400',
      message = format('메모는 2000자까지 쓸 수 있습니다. (지금 %s자)', public.qm_jlen(v_content));
  end if;
  if coalesce(public.qm_jlen(v_context), 0) > 1000 then
    raise exception using errcode = 'QM400',
      message = format('앞뒤 글(context)은 1000자까지 보낼 수 있습니다. (지금 %s자)', public.qm_jlen(v_context));
  end if;
  if v_blank is not null and v_blank < 1 then
    raise exception using errcode = 'QM400', message = '빈칸 번호는 1 이상이어야 합니다.';
  end if;
  insert into public.question_notes (set_id, question_id, blank_no, context, content)
  values (v_set_id, v_q_id, v_blank, v_context, v_content)
  returning * into n;                     -- set_title 복사·짝 확인·시각은 트리거
  return public.qm_note_json(n);
end $$;

-- 옛 순서: 메모 찾기(없음·남의 것) → 고칠 내용 없음 → 내용 검사
create or replace function public.qm_update_note(p_note_id bigint, p_content text default null,
                                                 p_resolved boolean default null) returns jsonb
language plpgsql set search_path = '' as $$
declare n public.question_notes; v_content text;
begin
  perform public.qm_require_user();
  if not exists (select 1 from public.question_notes x where x.id = p_note_id and x.user_id = auth.uid()) then
    raise exception using errcode = 'QM404', message = '존재하지 않는 메모입니다.';
  end if;
  if p_content is null and p_resolved is null then
    raise exception using errcode = 'QM400', message = '고칠 내용(content 또는 resolved)이 없습니다.';
  end if;
  if p_content is not null then
    v_content := public.qm_strip(p_content);
    if v_content = '' then
      raise exception using errcode = 'QM400', message = '메모 내용을 입력해 주세요.';
    end if;
    if public.qm_jlen(v_content) > 2000 then
      raise exception using errcode = 'QM400',
        message = format('메모는 2000자까지 쓸 수 있습니다. (지금 %s자)', public.qm_jlen(v_content));
    end if;
  end if;
  update public.question_notes x set
         content     = coalesce(v_content, x.content),
         resolved_at = case when p_resolved is null then x.resolved_at
                            when p_resolved then coalesce(x.resolved_at, date_trunc('milliseconds', now()))  -- 처음 해결 시각 유지
                            else null end
   where x.id = p_note_id and x.user_id = auth.uid()
  returning * into n;                     -- updated_at 은 트리거
  if not found then
    raise exception using errcode = 'QM404', message = '존재하지 않는 메모입니다.';
  end if;
  return public.qm_note_json(n);
end $$;

create or replace function public.qm_delete_note(p_note_id bigint) returns jsonb
language plpgsql set search_path = '' as $$
begin
  perform public.qm_require_user();
  delete from public.question_notes where id = p_note_id and user_id = auth.uid();
  if not found then
    raise exception using errcode = 'QM404', message = '존재하지 않는 메모입니다.';
  end if;
  return jsonb_build_object('deleted', p_note_id);
end $$;

-- (엑셀 여러 문항 넣기 qm_add_questions·qm_create_set_with_questions 는 엑셀 결정 전이라 두지 않는다.
--  쓰기로 정하면 새 마이그레이션 파일로 더한다.)

-- ── 실행 권한: 기본은 PUBLIC(anon 포함)이 실행 가능하므로 모두 거두고 authenticated 에만 준다 ──
-- 이 블록은 이 파일이 돌 때 있는 함수에만 적용된다. 300 파일은 자기 함수 이름을 적어 따로 준다.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'qm\_%'
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
grant execute on function public.qm_schema_version() to anon;

update public.qm_settings set schema_version = greatest(schema_version, 2);
