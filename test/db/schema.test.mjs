// 1단계 시험 목록(설계서 9절) 17가지 + PGlite 확인 + 복원 틀 시험.
// 실행: npm run test:db  (PGlite 메모리 DB 만 씀. 운영 Supabase 에는 붙지 않음)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ROOT, LOCK_FILE, REOPEN_TEMPLATE, OWNER, ANON,
  createDb, runMigrations, migrationFiles, readMigration, lockHash, catalogSnapshot,
  sql, rpc, authed, addAuthUser, addUser, bootstrapAdmin, expectError, sleep,
} from './harness.mjs';

const DESIGN_FILES = [
  '20261023000100_qm_tables.sql',
  '20261023000200_qm_api.sql',
  '20261023000300_qm_import.sql',
  '20261023000400_qm_storage.sql',
  '20261023000500_qm_safeupdate.sql',   // 2026-10-22 Supabase safeupdate 맞춤(설계 뒤 더함)
  '20261023000600_qm_study.sql',        // 2026-10-23 공부 기록 기기 사이 나누기(시나리오 시험은 study.test.mjs)
];
// 마지막 마이그레이션이 올리는 판
const LATEST_SCHEMA = 6;
const TABLES = ['qm_settings', 'profiles', 'question_sets', 'questions', 'question_notes', 'study_states'];

// 앱 QuestionNoteSheet.jsx 의 TARGET_GONE 정규식을 그대로 읽는다(문구를 바꾸면 앱 판정이 깨지는지 여기서 잡힘)
function appTargetGone() {
  const src = readFileSync(path.join(ROOT, 'src', 'components', 'QuestionNoteSheet.jsx'), 'utf8');
  const m = src.match(/const TARGET_GONE = \/(.+)\/;/);
  assert.ok(m, 'QuestionNoteSheet.jsx 에서 TARGET_GONE 정규식을 찾지 못했습니다');
  return new RegExp(m[1]);
}

// 옛 서버 응답 꼴의 문제집 하나(옮기기 함수에 그대로 넣는 모양)
function legacySet(id, questionIds, extra = {}) {
  return {
    id, title: `문제집 ${id}`, subject: null, createdAt: '2026-08-01T00:00:00.123456Z',
    questions: questionIds.map((qid, i) => ({
      id: qid, type: 'fill', text: `본문 ${qid}`, options: null, answerIndex: null, answer: null,
      answers: ['정답'], explanation: null, questionImageUrl: null, answerImageUrl: null, orderIndex: i,
    })),
    ...extra,
  };
}

function legacyNote(id, setId, questionId, extra = {}) {
  return {
    id, setId, questionId, setTitle: setId == null ? null : `문제집 ${setId}`, blankNo: 1, context: '앞뒤',
    content: `메모 ${id}`, resolved: false, resolvedAt: null,
    createdAt: '2026-10-20T03:00:00.123Z', updatedAt: '2026-10-20T03:00:00.123Z', ...extra,
  };
}

// anon(공개 키, 로그인 없음)에 열린 것 전부 — 이름과 상관없이 public·qm_private 의 모든 함수와 표·뷰·시퀀스
async function anonExposure(db) {
  const functions = await sql(db, OWNER, `
    select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'qm_private') and has_function_privilege('anon', p.oid, 'EXECUTE')
     order by 1`);
  const relations = await sql(db, OWNER, `
    select n.nspname || '.' || c.relname as rel
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('public', 'qm_private') and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
       and case when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, 'USAGE,SELECT,UPDATE')
                else has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
                     or has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES') end
     order by 1`);
  return { functions: functions.map((r) => r.sig), relations: relations.map((r) => r.rel) };
}

test('1. 마이그레이션을 두 번 돌려도 오류 없음·결과 같음, migrations.lock.json 해시 일치', async () => {
  assert.deepEqual(migrationFiles(), DESIGN_FILES, '마이그레이션 파일 이름이 설계서 2.2절과 다릅니다');

  const db = await createDb({ migrate: false });
  await runMigrations(db);
  const first = await catalogSnapshot(db);
  await runMigrations(db);
  const second = await catalogSnapshot(db);
  assert.deepEqual(second, first, '두 번째 적용 뒤 스키마 상태가 달라졌습니다(멱등 아님)');
  assert.equal(first.settings[0].schema_version, LATEST_SCHEMA);
  assert.equal(first.settings[0].live, false);
  await db.close();

  const lock = JSON.parse(readFileSync(LOCK_FILE, 'utf8'));
  assert.deepEqual(Object.keys(lock.files).sort(), migrationFiles(),
    'lock 과 migrations 폴더의 파일 목록이 다릅니다: 새 파일은 node test/db/lock.mjs --add, 적용된 파일은 지우거나 이름을 바꾸지 않는다');
  for (const f of migrationFiles()) {
    assert.equal(lockHash(readMigration(f)), lock.files[f],
      `${f} 의 내용이 lock 과 다릅니다. 적용된 마이그레이션은 고치지 않고 새 파일로 냅니다(supabase/README.md)`);
  }
  // 줄바꿈만 다른 작업본(CRLF)과 저장소(LF)가 같은 해시인지
  assert.equal(lockHash('a\r\nb\r\n'), lockHash('a\nb\n'));
});

test('2. id 지정 넣기 → finish: 다음 번호 = 최댓값 + 1001, 리허설이면 1,000,000 이상', async () => {
  const db = await createDb();
  const admin = await bootstrapAdmin(db);

  await rpc(db, admin, 'qm_import_set', { p_set: legacySet(8, [100, 150]) });
  await rpc(db, admin, 'qm_import_set', { p_set: legacySet(54, [120]) });
  await rpc(db, admin, 'qm_import_notes', { p_notes: [legacyNote(12, 8, 100), legacyNote(7, null, null)] });

  // 번호가 그대로 들어감
  const sets = await rpc(db, admin, 'qm_list_sets');
  assert.deepEqual(sets.map((s) => s.id).sort((a, b) => a - b), [8, 54]);
  const qs = await rpc(db, admin, 'qm_list_questions', { p_set_id: 8 });
  assert.deepEqual(qs.map((q) => q.id), [100, 150]);
  const notes = await rpc(db, admin, 'qm_list_notes');
  assert.deepEqual(notes.map((n) => n.id).sort((a, b) => a - b), [7, 12]);

  // 바닥값(도구 기록이 본 가장 큰 id)이 표의 최댓값보다 크면 바닥값 기준
  const fin = await rpc(db, admin, 'qm_import_finish', { p_floor: { sets: 60, questions: 0, notes: 0 } });
  assert.equal(fin.nextSetId, 60 + 1001);
  assert.equal(fin.nextQuestionId, 150 + 1001);
  assert.equal(fin.nextNoteId, 12 + 1001);
  assert.deepEqual([fin.sets, fin.questions, fin.notes, fin.rehearsal], [2, 3, 2, false]);

  // 새로 만드는 것이 그 번호를 받음
  const s = await rpc(db, admin, 'qm_create_set', { p_title: '새 문제집' });
  assert.equal(s.id, 1061);
  const q = await rpc(db, admin, 'qm_add_question', { p_set_id: s.id, p_question: { type: 'fill', text: '새 문항' } });
  assert.equal(q.id, 1151);
  const n = await rpc(db, admin, 'qm_create_note', { p_note: { content: '새 메모' } });
  assert.equal(n.id, 1013);

  // 리허설: 다음 번호를 1,000,000 이상으로
  await rpc(db, admin, 'qm_import_reset', { p_discard_changes: true });
  await rpc(db, admin, 'qm_import_set', { p_set: legacySet(8, [100, 150]) });
  const reh = await rpc(db, admin, 'qm_import_finish', { p_floor: { sets: 60 }, p_rehearsal: true });
  assert.deepEqual([reh.nextSetId, reh.nextQuestionId, reh.nextNoteId, reh.rehearsal], [1000000, 1000000, 1000000, true]);
  const rs = await rpc(db, admin, 'qm_create_set', { p_title: '[시험] 리허설' });
  assert.equal(rs.id, 1000000);

  // 실제 전환: 리허설 행을 비우고 다시 넣으면 '최댓값 + 1001' 로 내려옴
  await rpc(db, admin, 'qm_import_reset', { p_discard_changes: true });
  await rpc(db, admin, 'qm_import_set', { p_set: legacySet(8, [100, 150]) });
  const real = await rpc(db, admin, 'qm_import_finish', { p_floor: { sets: 60, questions: 0, notes: 0 } });
  assert.deepEqual([real.nextSetId, real.nextQuestionId, real.nextNoteId], [1061, 1151, 1001]);
  await db.close();
});

test('3. 문제집 삭제 → 문항 사라짐, 메모 set_id·question_id NULL, set_title·updated_at 그대로', async () => {
  const db = await createDb();
  const u = await bootstrapAdmin(db);
  const s = await rpc(db, u, 'qm_create_set', { p_title: '지울 문제집' });
  const q1 = await rpc(db, u, 'qm_add_question', { p_set_id: s.id, p_question: { type: 'fill', text: '1' } });
  await rpc(db, u, 'qm_add_question', { p_set_id: s.id, p_question: { type: 'fill', text: '2' } });
  const n1 = await rpc(db, u, 'qm_create_note', { p_note: { questionId: q1.id, blankNo: 2, context: '앞뒤 글', content: '문항 메모' } });
  const n2 = await rpc(db, u, 'qm_create_note', { p_note: { setId: s.id, content: '문제집 메모' } });
  assert.equal(n1.setId, s.id);
  await sleep(5);

  assert.deepEqual(await rpc(db, u, 'qm_delete_set', { p_set_id: s.id }), { deleted: s.id });
  const [{ c }] = await sql(db, OWNER, 'select count(*)::int as c from public.questions where set_id = $1', [s.id]);
  assert.equal(c, 0);
  await expectError(rpc(db, u, 'qm_list_questions', { p_set_id: s.id }), 'QM404', '존재하지 않는 세트입니다.');

  const after = await rpc(db, u, 'qm_list_notes');
  const a1 = after.find((n) => n.id === n1.id);
  const a2 = after.find((n) => n.id === n2.id);
  assert.deepEqual([a1.setId, a1.questionId, a1.setTitle, a1.blankNo, a1.context], [null, null, '지울 문제집', 2, '앞뒤 글']);
  assert.equal(a1.updatedAt, n1.updatedAt, '외래키 떼기가 updated_at 을 바꿨습니다');
  assert.deepEqual([a2.setId, a2.questionId, a2.setTitle, a2.updatedAt], [null, null, '지울 문제집', n2.updatedAt]);

  // 없는 문제집 지우기
  await expectError(rpc(db, u, 'qm_delete_set', { p_set_id: s.id }), 'QM404', '존재하지 않는 세트입니다.');
  await db.close();
});

test('4. 문항 삭제 → 메모 question_id 만 NULL', async () => {
  const db = await createDb();
  const u = await bootstrapAdmin(db);
  const s = await rpc(db, u, 'qm_create_set', { p_title: '문제집' });
  const q1 = await rpc(db, u, 'qm_add_question', { p_set_id: s.id, p_question: { type: 'fill', text: '1' } });
  const q2 = await rpc(db, u, 'qm_add_question', { p_set_id: s.id, p_question: { type: 'fill', text: '2' } });
  const n1 = await rpc(db, u, 'qm_create_note', { p_note: { questionId: q1.id, content: 'q1 메모' } });
  const n2 = await rpc(db, u, 'qm_create_note', { p_note: { questionId: q2.id, content: 'q2 메모' } });
  await sleep(5);

  assert.deepEqual(await rpc(db, u, 'qm_delete_question', { p_question_id: q1.id }), { deleted: q1.id });
  const notes = await rpc(db, u, 'qm_list_notes');
  const a1 = notes.find((n) => n.id === n1.id);
  const a2 = notes.find((n) => n.id === n2.id);
  assert.deepEqual([a1.setId, a1.questionId, a1.setTitle, a1.updatedAt], [s.id, null, '문제집', n1.updatedAt]);
  assert.deepEqual([a2.setId, a2.questionId], [s.id, q2.id]);
  assert.deepEqual((await rpc(db, u, 'qm_list_questions', { p_set_id: s.id })).map((q) => q.id), [q2.id]);
  assert.equal((await rpc(db, u, 'qm_list_sets'))[0].questionCount, 1);
  await expectError(rpc(db, u, 'qm_delete_question', { p_question_id: q1.id }), 'QM404', '존재하지 않는 문항입니다.');
  await db.close();
});

test('5. 사용자 둘: 남의 문제집·문항·메모가 안 보이고 못 고침(QM404, QM403 아님), RLS 로도 막힘', async () => {
  const db = await createDb();
  const alice = await addUser(db, 'alice');
  const bob = await addUser(db, 'bob');
  const s = await rpc(db, alice, 'qm_create_set', { p_title: '앨리스 문제집' });
  const q = await rpc(db, alice, 'qm_add_question', { p_set_id: s.id, p_question: { type: 'fill', text: '앨리스 문항' } });
  const n = await rpc(db, alice, 'qm_create_note', { p_note: { questionId: q.id, content: '앨리스 메모' } });
  const bobSet = await rpc(db, bob, 'qm_create_set', { p_title: '밥 문제집' });

  // 함수로: 목록에 안 보임
  assert.deepEqual((await rpc(db, bob, 'qm_list_sets')).map((x) => x.id), [bobSet.id]);
  assert.deepEqual(await rpc(db, bob, 'qm_list_notes'), []);
  assert.deepEqual(await rpc(db, bob, 'qm_list_notes', { p_set_id: s.id }), []);

  // 함수로: 남의 것은 '없음'(QM404). 프로필이 있으므로 QM403 이 아니다
  const NO_SET = '존재하지 않는 세트입니다.';
  const NO_Q = '존재하지 않는 문항입니다.';
  const NO_NOTE = '존재하지 않는 메모입니다.';
  await expectError(rpc(db, bob, 'qm_list_questions', { p_set_id: s.id }), 'QM404', NO_SET);
  await expectError(rpc(db, bob, 'qm_update_set', { p_set_id: s.id, p_title: '탈취' }), 'QM404', NO_SET);
  await expectError(rpc(db, bob, 'qm_delete_set', { p_set_id: s.id }), 'QM404', NO_SET);
  await expectError(rpc(db, bob, 'qm_add_question', { p_set_id: s.id, p_question: { text: 'x' } }), 'QM404', NO_SET);
  await expectError(rpc(db, bob, 'qm_update_question', { p_question_id: q.id, p_question: { text: 'x' } }), 'QM404', NO_Q);
  await expectError(rpc(db, bob, 'qm_delete_question', { p_question_id: q.id }), 'QM404', NO_Q);
  await expectError(rpc(db, bob, 'qm_update_note', { p_note_id: n.id, p_content: 'x' }), 'QM404', NO_NOTE);
  await expectError(rpc(db, bob, 'qm_update_note', { p_note_id: n.id, p_resolved: true }), 'QM404', NO_NOTE);
  await expectError(rpc(db, bob, 'qm_delete_note', { p_note_id: n.id }), 'QM404', NO_NOTE);
  // 남의 문제집·문항에 메모를 붙이지 못함(앱 TARGET_GONE 이 받는 문구)
  const gone = appTargetGone();
  const e1 = await expectError(rpc(db, bob, 'qm_create_note', { p_note: { setId: s.id, content: 'x' } }), 'QM404', '존재하지 않는 문제집입니다.');
  const e2 = await expectError(rpc(db, bob, 'qm_create_note', { p_note: { questionId: q.id, content: 'x' } }), 'QM404', NO_Q);
  const e3 = await expectError(rpc(db, bob, 'qm_create_note', { p_note: { setId: bobSet.id, questionId: q.id, content: 'x' } }), 'QM404', NO_Q);
  for (const e of [e1, e2, e3]) assert.match(e.message, gone);

  // RLS 로: 함수를 거치지 않는 직접 읽기·쓰기도 막힘
  assert.deepEqual(await sql(db, bob, 'select id from public.question_sets where id = $1', [s.id]), []);
  assert.deepEqual(await sql(db, bob, 'select id from public.questions where id = $1', [q.id]), []);
  assert.deepEqual(await sql(db, bob, 'select id from public.question_notes where id = $1', [n.id]), []);
  assert.deepEqual(await sql(db, bob, 'select id from public.profiles'), [{ id: bob.sub }]);
  assert.deepEqual(await sql(db, bob, "update public.question_sets set title = '탈취' where id = $1 returning id", [s.id]), []);
  assert.deepEqual(await sql(db, bob, "update public.questions set text = '탈취' where id = $1 returning id", [q.id]), []);
  assert.deepEqual(await sql(db, bob, "update public.question_notes set content = '탈취' where id = $1 returning id", [n.id]), []);
  assert.deepEqual(await sql(db, bob, 'delete from public.question_sets where id = $1 returning id', [s.id]), []);
  assert.deepEqual(await sql(db, bob, 'delete from public.question_notes where id = $1 returning id', [n.id]), []);
  await expectError(sql(db, bob, "insert into public.questions (set_id, text) values ($1, '끼워 넣기')", [s.id]), '42501', /row-level security/);
  // 자기 문항을 남의 문제집으로 옮기기(set_id 는 넣을 때만 정함: 칸 권한이 먼저 막음)
  const bq = await rpc(db, bob, 'qm_add_question', { p_set_id: bobSet.id, p_question: { text: '밥 문항' } });
  await expectError(sql(db, bob, 'update public.questions set set_id = $1 where id = $2', [s.id, bq.id]), '42501', /permission denied for table questions/);
  // 직접 메모 넣기: 트리거가 RLS 아래에서 남의 문제집을 못 봄
  await expectError(sql(db, bob, "insert into public.question_notes (set_id, content) values ($1, 'x')", [s.id]), 'QM404', '존재하지 않는 문제집입니다.');

  // 앨리스 쪽은 그대로
  const [check] = await sql(db, OWNER, 'select title, (select text from public.questions where id = $2) as qt, (select content from public.question_notes where id = $3) as nc from public.question_sets where id = $1', [s.id, q.id, n.id]);
  assert.deepEqual(check, { title: '앨리스 문제집', qt: '앨리스 문항', nc: '앨리스 메모' });
  await db.close();
});

test('6. PUT 통째 교체: 안 보낸 칸은 NULL(orderIndex 는 0), 정렬은 order_index·id', async () => {
  const db = await createDb();
  const u = await bootstrapAdmin(db);
  const s = await rpc(db, u, 'qm_create_set', { p_title: '제목', p_subject: '과목' });
  assert.deepEqual([s.title, s.subject, s.questionCount], ['제목', '과목', 0]);
  assert.match(s.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

  const full = {
    type: 'multiple', text: '본문', options: '["가","나"]', answerIndex: 1, answer: '나', answers: ['나'],
    explanation: '해설', questionImageUrl: 'https://res.cloudinary.com/x/q.png', answerImageUrl: 'https://res.cloudinary.com/x/a.png', orderIndex: 3,
  };
  const q = await rpc(db, u, 'qm_add_question', { p_set_id: s.id, p_question: full });
  assert.deepEqual({ ...q, id: undefined }, { ...full, options: '["가", "나"]', id: undefined });

  const s2 = await rpc(db, u, 'qm_update_set', { p_set_id: s.id, p_title: '새 제목' });
  assert.deepEqual([s2.id, s2.title, s2.subject, s2.questionCount, s2.createdAt], [s.id, '새 제목', null, 1, s.createdAt]);

  const q2 = await rpc(db, u, 'qm_update_question', { p_question_id: q.id, p_question: { text: '새 본문' } });
  assert.deepEqual(q2, {
    id: q.id, type: null, text: '새 본문', options: null, answerIndex: null, answer: null, answers: null,
    explanation: null, questionImageUrl: null, answerImageUrl: null, orderIndex: 0,
  });

  // 정렬: order_index 오름차순, 같은 번호끼리는 id 순
  const qa = await rpc(db, u, 'qm_add_question', { p_set_id: s.id, p_question: { text: 'a', orderIndex: 1 } });
  const qb = await rpc(db, u, 'qm_add_question', { p_set_id: s.id, p_question: { text: 'b', orderIndex: 0 } });
  const list = await rpc(db, u, 'qm_list_questions', { p_set_id: s.id });
  assert.deepEqual(list.map((x) => x.id), [q.id, qb.id, qa.id]);

  // 검사 문구(옛 순서: 찾기가 먼저)
  await expectError(rpc(db, u, 'qm_update_set', { p_set_id: 999, p_title: null }), 'QM404', '존재하지 않는 세트입니다.');
  await expectError(rpc(db, u, 'qm_update_set', { p_set_id: s.id, p_title: null }), 'QM400', '제목을 입력해 주세요.');
  await expectError(rpc(db, u, 'qm_create_set', { p_title: 'ㄱ'.repeat(101) }), 'QM400', '제목은 100자까지입니다.');
  await expectError(rpc(db, u, 'qm_create_set', { p_title: 't', p_subject: 'ㄱ'.repeat(51) }), 'QM400', '과목은 50자까지입니다.');
  await expectError(rpc(db, u, 'qm_add_question', { p_set_id: 999, p_question: { answer: 'x'.repeat(501) } }), 'QM404', '존재하지 않는 세트입니다.');
  await expectError(rpc(db, u, 'qm_add_question', { p_set_id: s.id, p_question: { answer: 'x'.repeat(501) } }), 'QM400', '정답은 500자까지입니다.');
  await expectError(rpc(db, u, 'qm_update_question', { p_question_id: 999, p_question: { type: 'x'.repeat(21) } }), 'QM404', '존재하지 않는 문항입니다.');
  await expectError(rpc(db, u, 'qm_update_question', { p_question_id: q.id, p_question: { type: 'x'.repeat(21) } }), 'QM400', '유형 이름이 너무 깁니다.');
  await expectError(rpc(db, u, 'qm_add_question', { p_set_id: s.id, p_question: { text: '가'.repeat(21846) } }), 'QM400', '문제 본문이 65,535바이트를 넘습니다.');
  // 정확히 65,535바이트는 들어감(한글 3바이트 × 21,845)
  const big = await rpc(db, u, 'qm_add_question', { p_set_id: s.id, p_question: { text: '가'.repeat(21845) } });
  assert.equal(big.text.length, 21845);
  // 해설도 같은 한도(옛 MySQL TEXT)
  await expectError(rpc(db, u, 'qm_add_question', { p_set_id: s.id, p_question: { explanation: '가'.repeat(21846) } }), 'QM400', '해설이 65,535바이트를 넘습니다.');
  await expectError(rpc(db, u, 'qm_update_question', { p_question_id: q.id, p_question: { explanation: '가'.repeat(21846) } }), 'QM400', '해설이 65,535바이트를 넘습니다.');
  const bigEx = await rpc(db, u, 'qm_add_question', { p_set_id: s.id, p_question: { explanation: '가'.repeat(21845) } });
  assert.equal(bigEx.explanation.length, 21845);
  await db.close();
});

test('7. 메모 규칙: 옛 문구·길이·공백 빼기·짝 확인·처음 해결 시각 유지·정렬', async () => {
  const db = await createDb();
  const u = await bootstrapAdmin(db);
  const s = await rpc(db, u, 'qm_create_set', { p_title: '메모 문제집' });
  const other = await rpc(db, u, 'qm_create_set', { p_title: '다른 문제집' });
  const q = await rpc(db, u, 'qm_add_question', { p_set_id: s.id, p_question: { text: '문항' } });
  const gone = appTargetGone();

  // 검사 문구(옛 NoteService·NoteController 와 같음)
  await expectError(rpc(db, u, 'qm_create_note', { p_note: {} }), 'QM400', '메모 내용을 입력해 주세요.');
  await expectError(rpc(db, u, 'qm_create_note', { p_note: { content: ' \n\t\u3000' } }), 'QM400', '메모 내용을 입력해 주세요.');
  await expectError(rpc(db, u, 'qm_create_note', { p_note: { content: 'ㄱ'.repeat(2001) } }), 'QM400', '메모는 2000자까지 쓸 수 있습니다. (지금 2001자)');
  // 글자 수는 옛 Java·앱 .length 와 같이 UTF-16 단위(이모지 하나 = 2)
  await expectError(rpc(db, u, 'qm_create_note', { p_note: { content: 'ㄱ'.repeat(1999) + '😀' } }), 'QM400', '메모는 2000자까지 쓸 수 있습니다. (지금 2001자)');
  await expectError(rpc(db, u, 'qm_create_note', { p_note: { content: 'x', context: 'ㄴ'.repeat(1001) } }), 'QM400', '앞뒤 글(context)은 1000자까지 보낼 수 있습니다. (지금 1001자)');
  await expectError(rpc(db, u, 'qm_create_note', { p_note: { content: 'x', blankNo: 0 } }), 'QM400', '빈칸 번호는 1 이상이어야 합니다.');
  await expectError(rpc(db, u, 'qm_create_note', { p_note: { content: 'x', blankNo: 'x' } }), 'QM400', /^요청 본문\(JSON\)의 형식이 올바르지 않습니다/);
  await expectError(rpc(db, u, 'qm_create_note', { p_note: { content: 'x', setId: '99999999999999999999' } }), 'QM400', /^요청 본문\(JSON\)의 형식이 올바르지 않습니다/);
  const e1 = await expectError(rpc(db, u, 'qm_create_note', { p_note: { content: 'x', setId: 999 } }), 'QM404', '존재하지 않는 문제집입니다.');
  const e2 = await expectError(rpc(db, u, 'qm_create_note', { p_note: { content: 'x', questionId: 999 } }), 'QM404', '존재하지 않는 문항입니다.');
  const e3 = await expectError(rpc(db, u, 'qm_create_note', { p_note: { content: 'x', setId: other.id, questionId: q.id } }), 'QM400', '고른 문항이 그 문제집의 문항이 아닙니다.');
  for (const e of [e1, e2, e3]) assert.match(e.message, gone);

  // 공백 빼기(Java strip: 전각 공백은 빼고 줄 바꿈 없는 공백은 남김), 빈 context 는 NULL, 2000자는 됨
  const n0 = await rpc(db, u, 'qm_create_note', { p_note: { content: '\u3000 메모\u00a0 \n', context: ' \t ', questionId: q.id, blankNo: 3 } });
  assert.deepEqual([n0.content, n0.context, n0.setId, n0.questionId, n0.setTitle, n0.blankNo, n0.resolved, n0.resolvedAt],
    ['메모\u00a0', null, s.id, q.id, '메모 문제집', 3, false, null]);
  assert.match(n0.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(n0.updatedAt, n0.createdAt);
  const n2000 = await rpc(db, u, 'qm_create_note', { p_note: { content: 'ㄱ'.repeat(2000), context: 'ㄴ'.repeat(1000) } });
  assert.deepEqual([n2000.setId, n2000.setTitle], [null, null]);

  // set_title 은 쓸 때의 제목(뒤에 제목을 바꿔도 그대로)
  await rpc(db, u, 'qm_update_set', { p_set_id: s.id, p_title: '바뀐 제목' });
  const nAfter = await rpc(db, u, 'qm_create_note', { p_note: { setId: s.id, content: '바뀐 뒤' } });
  const all0 = await rpc(db, u, 'qm_list_notes');
  assert.equal(all0.find((n) => n.id === n0.id).setTitle, '메모 문제집');
  assert.equal(nAfter.setTitle, '바뀐 제목');

  // 고치기: 옛 순서(찾기 → 고칠 것 없음 → 내용 검사)
  await expectError(rpc(db, u, 'qm_update_note', { p_note_id: 999 }), 'QM404', '존재하지 않는 메모입니다.');
  await expectError(rpc(db, u, 'qm_update_note', { p_note_id: n0.id }), 'QM400', '고칠 내용(content 또는 resolved)이 없습니다.');
  await expectError(rpc(db, u, 'qm_update_note', { p_note_id: n0.id, p_content: '  ' }), 'QM400', '메모 내용을 입력해 주세요.');
  await expectError(rpc(db, u, 'qm_update_note', { p_note_id: n0.id, p_content: 'ㄱ'.repeat(2001) }), 'QM400', '메모는 2000자까지 쓸 수 있습니다. (지금 2001자)');

  await sleep(5);
  const r1 = await rpc(db, u, 'qm_update_note', { p_note_id: n0.id, p_resolved: true });
  assert.equal(r1.resolved, true);
  assert.ok(r1.resolvedAt && r1.updatedAt > n0.updatedAt, 'updated_at 이 갱신되지 않았습니다');
  assert.equal(r1.content, '메모\u00a0');
  await sleep(5);
  const r2 = await rpc(db, u, 'qm_update_note', { p_note_id: n0.id, p_resolved: true, p_content: ' 고친 메모 ' });
  assert.equal(r2.resolvedAt, r1.resolvedAt, '이미 해결한 메모의 처음 해결 시각이 바뀌었습니다');
  assert.equal(r2.content, '고친 메모');
  assert.ok(r2.updatedAt > r1.updatedAt);
  const r3 = await rpc(db, u, 'qm_update_note', { p_note_id: n0.id, p_resolved: false });
  assert.deepEqual([r3.resolved, r3.resolvedAt, r3.content], [false, null, '고친 메모']);
  await rpc(db, u, 'qm_update_note', { p_note_id: n2000.id, p_resolved: true });

  // 목록: status·setId 거르기, 최신순(created_at desc, id desc), status 앞뒤 공백 허용
  const ids = (xs) => xs.map((n) => n.id);
  assert.deepEqual(ids(await rpc(db, u, 'qm_list_notes')), [nAfter.id, n2000.id, n0.id]);
  assert.deepEqual(ids(await rpc(db, u, 'qm_list_notes', { p_status: 'open' })), [nAfter.id, n0.id]);
  assert.deepEqual(ids(await rpc(db, u, 'qm_list_notes', { p_status: ' resolved ' })), [n2000.id]);
  assert.deepEqual(ids(await rpc(db, u, 'qm_list_notes', { p_status: '' })), [nAfter.id, n2000.id, n0.id]);
  assert.deepEqual(ids(await rpc(db, u, 'qm_list_notes', { p_status: 'all', p_set_id: s.id })), [nAfter.id, n0.id]);
  await expectError(rpc(db, u, 'qm_list_notes', { p_status: 'done' }), 'QM400', 'status 는 open, resolved, all 중 하나여야 합니다.');

  // 지우기
  assert.deepEqual(await rpc(db, u, 'qm_delete_note', { p_note_id: nAfter.id }), { deleted: nAfter.id });
  await expectError(rpc(db, u, 'qm_delete_note', { p_note_id: nAfter.id }), 'QM404', '존재하지 않는 메모입니다.');

  // 표 CHECK 는 마지막 방어선(함수를 거치지 않는 직접 넣기)
  await expectError(sql(db, u, "insert into public.question_notes (content) values ('   ')"), '23514');
  await db.close();
});

test('8. options 정규화 꼴 = MySQL JSON 꼴, answers 는 글자 배열·빈 배열은 NULL', async () => {
  const db = await createDb();
  const u = await bootstrapAdmin(db);
  const s = await rpc(db, u, 'qm_create_set', { p_title: '보기' });
  // 왼쪽: 앱·도구가 보내는 JSON 글자, 오른쪽: MySQL JSON 칸이 돌려주던 꼴
  const cases = [
    ['["가","나","다"]', '["가", "나", "다"]'],
    ['[ "a" ,"b" ]', '["a", "b"]'],
    ['["①  두 칸","  앞 공백"]', '["①  두 칸", "  앞 공백"]'],
    ['["줄\\n바꿈","탭\\t","따옴표\\"","역\\\\","/"]', '["줄\\n바꿈", "탭\\t", "따옴표\\"", "역\\\\", "/"]'],
    ['["\\u0041","\\uac00"]', '["A", "가"]'],
    ['{"b":1,"a":2,"ab":[true,false,null]}', '{"a": 2, "b": 1, "ab": [true, false, null]}'],
    ['[1,-2,30]', '[1, -2, 30]'],
    ['[]', '[]'],
  ];
  for (const [input, mysql] of cases) {
    const q = await rpc(db, u, 'qm_add_question', { p_set_id: s.id, p_question: { type: 'multiple', options: input } });
    assert.equal(q.options, mysql, `options ${input}`);
    const q2 = await rpc(db, u, 'qm_update_question', { p_question_id: q.id, p_question: { options: input } });
    assert.equal(q2.options, mysql);
  }
  // 배열을 그대로 보내도 같은 꼴
  const qa = await rpc(db, u, 'qm_add_question', { p_set_id: s.id, p_question: { options: ['가', '나'] } });
  assert.equal(qa.options, '["가", "나"]');
  // 비었으면 NULL, 깨진 JSON 은 거절(옛 MySQL JSON 칸처럼)
  for (const blank of [null, '', '   ']) {
    const qb = await rpc(db, u, 'qm_add_question', { p_set_id: s.id, p_question: { options: blank } });
    assert.equal(qb.options, null);
  }
  await expectError(rpc(db, u, 'qm_add_question', { p_set_id: s.id, p_question: { options: '["가",' } }), '22P02');

  // answers
  const a1 = await rpc(db, u, 'qm_add_question', { p_set_id: s.id, p_question: { type: 'fill', answers: [] } });
  assert.equal(a1.answers, null);
  const a2 = await rpc(db, u, 'qm_add_question', { p_set_id: s.id, p_question: { type: 'fill', answers: ['가', 1, true, null] } });
  assert.deepEqual(a2.answers, ['가', '1', 'true', null]);
  await expectError(rpc(db, u, 'qm_add_question', { p_set_id: s.id, p_question: { answers: '가' } }), 'QM400', 'answers 는 배열이어야 합니다.');
  // 직접 넣기도 배열만(표 CHECK)
  await expectError(sql(db, u, `insert into public.questions (set_id, answers) values ($1, '{"a":1}')`, [s.id]), '23514');
  await db.close();
});

test('9. anon: public·qm_private 의 모든 함수 중 qm_schema_version 만 실행됨, 모든 표·뷰·시퀀스 거절 (표 자동 노출 켬·끔 둘 다)', async () => {
  for (const autoExpose of [true, false]) {
    const db = await createDb({ autoExpose });
    // 이름과 상관없이 전부 본다(qm_ 가 아닌 함수·새 표도 잡히게)
    assert.deepEqual(await anonExposure(db), { functions: ['public.qm_schema_version()'], relations: [] }, `autoExpose=${autoExpose}`);
    const fns = await sql(db, OWNER, `
      select p.oid::regprocedure::text as sig,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_x
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname like 'qm\\_%' order by 1`);
    assert.ok(fns.length >= 30, `qm_ 함수가 너무 적습니다: ${fns.length}`);
    assert.deepEqual(fns.filter((f) => !f.auth_x).map((f) => f.sig), [], 'authenticated 가 못 부르는 qm_ 함수가 있습니다');

    // 실제로 불러 봄
    assert.equal(await rpc(db, ANON, 'qm_schema_version'), LATEST_SCHEMA);
    for (const fn of ['qm_me', 'qm_list_sets', 'qm_list_notes', 'qm_import_status', 'qm_import_close', 'qm_import_reset']) {
      await expectError(rpc(db, ANON, fn), '42501', /permission denied for function/);
    }
    await expectError(rpc(db, ANON, 'qm_bootstrap_admin', { p_username: 'x' }), '42501', /permission denied for function/);
    await expectError(rpc(db, ANON, 'qm_create_set', { p_title: 'x' }), '42501', /permission denied for function/);

    for (const t of TABLES) {
      const [p] = await sql(db, OWNER, `
        select has_table_privilege('anon', $1, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as tbl,
               has_any_column_privilege('anon', $1, 'SELECT,INSERT,UPDATE,REFERENCES') as col`, [`public.${t}`]);
      assert.deepEqual(p, { tbl: false, col: false }, `anon 이 ${t} 에 권한이 있습니다`);
      await expectError(sql(db, ANON, `select * from public.${t}`), '42501', /permission denied for table/);
      await expectError(sql(db, ANON, `delete from public.${t}`), '42501', /permission denied for table/);
    }
    for (const seq of ['question_sets_id_seq', 'questions_id_seq', 'question_notes_id_seq']) {
      const [p] = await sql(db, OWNER, "select has_sequence_privilege('anon', $1, 'USAGE,SELECT,UPDATE') as a", [`public.${seq}`]);
      assert.equal(p.a, false, `anon 이 ${seq} 에 권한이 있습니다`);
    }
    const [sch] = await sql(db, OWNER, `select has_schema_privilege('anon', 'qm_private', 'USAGE') as a,
      has_function_privilege('anon', 'qm_private.touch_user_write()', 'EXECUTE') as b`);
    assert.deepEqual(sch, { a: false, b: false });

    // 자동 노출이 꺼진 프로젝트에서도 명시 GRANT 만으로 사용자 흐름이 돔
    const u = await bootstrapAdmin(db);
    const s = await rpc(db, u, 'qm_create_set', { p_title: `노출 ${autoExpose}` });
    const q = await rpc(db, u, 'qm_add_question', { p_set_id: s.id, p_question: { text: '문항' } });
    const n = await rpc(db, u, 'qm_create_note', { p_note: { questionId: q.id, content: '메모' } });
    await rpc(db, u, 'qm_update_note', { p_note_id: n.id, p_resolved: true });
    assert.equal((await rpc(db, u, 'qm_list_sets'))[0].questionCount, 1);
    assert.equal((await rpc(db, u, 'qm_me')).ready, true);
    await rpc(db, u, 'qm_delete_set', { p_set_id: s.id });
    await db.close();
  }
});

test('10. live=true 뒤 넣기·비우기·끝내기·닫기 거절, 상태 보기는 됨', async () => {
  const db = await createDb();
  const admin = await bootstrapAdmin(db);
  await rpc(db, admin, 'qm_import_set', { p_set: legacySet(8, [100]) });
  await rpc(db, admin, 'qm_import_finish', { p_floor: {} });
  assert.deepEqual(await rpc(db, admin, 'qm_import_close'), { live: true });

  const CLOSED = '전환이 끝나 옮겨 넣기가 닫혔습니다.';
  await expectError(rpc(db, admin, 'qm_import_reset'), 'QM403', CLOSED);
  await expectError(rpc(db, admin, 'qm_import_reset', { p_discard_changes: true }), 'QM403', CLOSED);
  await expectError(rpc(db, admin, 'qm_import_set', { p_set: legacySet(9, [200]) }), 'QM403', CLOSED);
  await expectError(rpc(db, admin, 'qm_import_notes', { p_notes: [legacyNote(1, 8, 100)] }), 'QM403', CLOSED);
  await expectError(rpc(db, admin, 'qm_import_finish', { p_floor: {} }), 'QM403', CLOSED);
  await expectError(rpc(db, admin, 'qm_import_close'), 'QM403', CLOSED);

  const st = await rpc(db, admin, 'qm_import_status');
  assert.equal(st.live, true);
  assert.equal(st.counts.sets, 1);
  assert.equal((await rpc(db, admin, 'qm_me')).live, true);
  // 데이터는 그대로, 보통 API 는 그대로 동작
  assert.deepEqual((await rpc(db, admin, 'qm_list_questions', { p_set_id: 8 })).map((q) => q.id), [100]);
  await rpc(db, admin, 'qm_create_set', { p_title: '전환 뒤' });

  // 관리자 아닌 사람은 live 와 상관없이 상태·옮기기 못 함
  const db2 = await createDb();
  const a2 = await bootstrapAdmin(db2);
  const user = await addUser(db2, 'someone');
  await expectError(rpc(db2, user, 'qm_import_status'), 'QM403', '관리자만 할 수 있습니다.');
  await expectError(rpc(db2, user, 'qm_import_reset'), 'QM403', '관리자만 할 수 있습니다.');
  await expectError(rpc(db2, user, 'qm_import_set', { p_set: legacySet(1, []) }), 'QM403', '관리자만 할 수 있습니다.');
  await expectError(rpc(db2, user, 'qm_import_close'), 'QM403', '관리자만 할 수 있습니다.');
  assert.equal((await rpc(db2, a2, 'qm_import_status')).live, false);
  await db.close();
  await db2.close();
});

test('11. auth.users 의 관리자 사용자를 지우려 하면 실패하고 데이터가 그대로 남음(restrict), 프로필 없는 사용자는 지워짐', async () => {
  const db = await createDb();
  const admin = await bootstrapAdmin(db);
  const s = await rpc(db, admin, 'qm_create_set', { p_title: '지키는 문제집' });
  await rpc(db, admin, 'qm_add_question', { p_set_id: s.id, p_question: { text: '문항' } });
  await rpc(db, admin, 'qm_create_note', { p_note: { setId: s.id, content: '메모' } });

  // 대시보드 Users 화면에서 지우기(= auth.users 행 삭제). on delete restrict 는 23001(restrict_violation)
  await expectError(sql(db, OWNER, 'delete from auth.users where id = $1', [admin.sub]), '23001', /RESTRICT .*profiles_id_fkey/);
  // 프로필을 직접 지우려 해도 데이터가 막음
  await expectError(sql(db, OWNER, 'delete from public.profiles where id = $1', [admin.sub]), '23001', /question_sets_user_id_fkey|question_notes_user_id_fkey/);
  const [c] = await sql(db, OWNER, `select (select count(*) from auth.users)::int as users, (select count(*) from public.profiles)::int as profiles,
    (select count(*) from public.question_sets)::int as sets, (select count(*) from public.questions)::int as qs, (select count(*) from public.question_notes)::int as notes`);
  assert.deepEqual(c, { users: 1, profiles: 1, sets: 1, qs: 1, notes: 1 });
  assert.equal((await rpc(db, admin, 'qm_me')).ready, true);

  // 데이터·프로필 없는 사용자(가입 틈에 생긴 낯선 사용자 등)는 지워짐
  const stranger = await addAuthUser(db);
  assert.deepEqual(await sql(db, OWNER, 'delete from auth.users where id = $1 returning id', [stranger]), [{ id: stranger }]);
  // 프로필만 있고 데이터 없는 사용자도 프로필이 막음(지우려면 프로필부터)
  const empty = await addUser(db, 'empty');
  await expectError(sql(db, OWNER, 'delete from auth.users where id = $1', [empty.sub]), '23001');
  // 데이터를 다 지운 뒤에야 프로필 → Auth 사용자 순으로 지울 수 있음(사고로는 못 지우는 구조)
  await sql(db, OWNER, 'delete from public.profiles where id = $1', [empty.sub]);
  assert.deepEqual(await sql(db, OWNER, 'delete from auth.users where id = $1 returning id', [empty.sub]), [{ id: empty.sub }]);
  await db.close();
});

test('12. 칸 권한: 직접 쓰기로 id·user_id 를 정하거나 바꾸지 못함, 메모 user_id 는 기본값·트리거가 채움', async () => {
  const db = await createDb();
  const u = await bootstrapAdmin(db);
  const other = await addUser(db, 'other');
  const s = await rpc(db, u, 'qm_create_set', { p_title: '내 문제집' });
  const q = await rpc(db, u, 'qm_add_question', { p_set_id: s.id, p_question: { text: '문항' } });
  const DENIED = /permission denied for table/;

  // id 지정 INSERT
  await expectError(sql(db, u, "insert into public.question_sets (id, title) values (5000, 'x')"), '42501', DENIED);
  await expectError(sql(db, u, "insert into public.questions (id, set_id, text) values (5000, $1, 'x')", [s.id]), '42501', DENIED);
  await expectError(sql(db, u, "insert into public.question_notes (id, content) values (5000, 'x')"), '42501', DENIED);
  // PATCH 로 id 바꾸기
  await expectError(sql(db, u, 'update public.questions set id = 5000 where id = $1', [q.id]), '42501', DENIED);
  await expectError(sql(db, u, 'update public.question_sets set id = 5000 where id = $1', [s.id]), '42501', DENIED);
  await expectError(sql(db, u, 'update public.question_notes set id = 5000'), '42501', DENIED);
  // user_id 지정·변경
  await expectError(sql(db, u, "insert into public.question_sets (user_id, title) values ($1, 'x')", [other.sub]), '42501', DENIED);
  await expectError(sql(db, u, 'update public.question_sets set user_id = $1 where id = $2', [other.sub, s.id]), '42501', DENIED);
  await expectError(sql(db, u, "insert into public.question_notes (user_id, content) values ($1, 'x')", [other.sub]), '42501', DENIED);
  await expectError(sql(db, u, 'update public.question_notes set user_id = $1', [other.sub]), '42501', DENIED);
  // 메모의 시각·set_title·문제집 번호는 직접 고치지 못함(content·resolved_at 만)
  await expectError(sql(db, u, "update public.question_notes set set_title = 'x'"), '42501', DENIED);
  await expectError(sql(db, u, 'update public.question_notes set created_at = now()'), '42501', DENIED);
  await expectError(sql(db, u, 'update public.question_notes set set_id = null'), '42501', DENIED);
  // 프로필·설정은 읽기만
  await expectError(sql(db, u, "update public.profiles set role = 'ADMIN'"), '42501', DENIED);
  await expectError(sql(db, u, 'update public.qm_settings set live = false'), '42501', DENIED);
  await expectError(sql(db, u, "insert into public.profiles (id, username) values ($1, 'x')", [other.sub]), '42501', DENIED);

  // 허용된 칸만 쓰면 됨: returning *·기본값(user_id)·트리거가 고친 칸이 막히지 않음
  const [ds] = await sql(db, u, "insert into public.question_sets (title) values ('직접') returning *");
  assert.equal(ds.user_id, u.sub);
  const [dq] = await sql(db, u, "insert into public.questions (set_id, text, order_index) values ($1, '직접 문항', 2) returning *", [ds.id]);
  assert.equal(dq.set_id, ds.id);
  const [dn] = await sql(db, u, "insert into public.question_notes (question_id, content) values ($1, ' 직접 메모 ') returning *", [dq.id]);
  assert.deepEqual([dn.user_id, dn.set_id, dn.set_title, dn.content], [u.sub, ds.id, '직접', '직접 메모']);
  const [un] = await sql(db, u, "update public.question_notes set content = '고침', resolved_at = now() where id = $1 returning *", [dn.id]);
  assert.ok(un.updated_at >= dn.updated_at);
  const [uq] = await sql(db, u, "update public.questions set text = '고친 문항' where id = $1 returning id, text", [dq.id]);
  assert.deepEqual(uq, { id: dq.id, text: '고친 문항' });
  await db.close();
});

test('13. bootstrap: 사용자 2명·익명·관리자 있음은 거절, 같은 사람 두 번은 created:false, 관리자 둘은 고유 색인이 막음', async () => {
  const db = await createDb();
  // 로그인 없이
  const id = await addAuthUser(db);
  await expectError(rpc(db, authed(null), 'qm_bootstrap_admin', { p_username: 'admin-user' }), '42501', '로그인이 필요합니다.');
  // 아이디 검사
  await expectError(rpc(db, authed(id), 'qm_bootstrap_admin', { p_username: '  ' }), 'QM400', '아이디가 비었거나 너무 깁니다.');
  await expectError(rpc(db, authed(id), 'qm_bootstrap_admin', { p_username: 'x'.repeat(51) }), 'QM400', '아이디가 비었거나 너무 깁니다.');
  // 성공 → 같은 사람 두 번은 created:false
  const r1 = await rpc(db, authed(id), 'qm_bootstrap_admin', { p_username: ' admin-user ' });
  assert.deepEqual(r1, { username: 'admin-user', role: 'ADMIN', created: true });
  const r2 = await rpc(db, authed(id), 'qm_bootstrap_admin', { p_username: 'someone-else' });
  assert.deepEqual(r2, { username: 'admin-user', role: 'ADMIN', created: false });
  assert.deepEqual(await rpc(db, authed(id), 'qm_me'), { ready: true, username: 'admin-user', role: 'ADMIN', schemaVersion: LATEST_SCHEMA, live: false });

  // 관리자가 있는데 두 번째 사용자가 생김 → 거절(가입 틈에 생긴 사용자가 관리자를 빼앗지 못함)
  const second = await addAuthUser(db);
  await expectError(rpc(db, authed(second), 'qm_bootstrap_admin', { p_username: 'thief' }), 'QM403', /^사용자가 정확히 한 명일 때만/);
  // 계정 준비 전: 판 번호는 보이고(시작 화면 판정), 설정 줄(live 등)은 보이지 않음
  assert.deepEqual(await rpc(db, authed(second), 'qm_me'), { ready: false, username: null, role: null, schemaVersion: LATEST_SCHEMA, live: null });
  await expectError(rpc(db, authed(second), 'qm_list_sets'), 'QM403', /^계정 준비가 끝나지 않았습니다/);
  // 관리자 둘은 고유 색인이 막음(대시보드에서 손으로 넣어도)
  await expectError(sql(db, OWNER, "insert into public.profiles (id, username, role) values ($1, 'admin2', 'ADMIN')", [second]), '23505', /profiles_one_admin/);
  // 아이디 대소문자 무시 고유
  await expectError(sql(db, OWNER, "insert into public.profiles (id, username) values ($1, 'Admin-User')", [second]), '23505', /profiles_username_lower_key/);

  // 사용자가 처음부터 2명이면 누구도 준비 못 함
  const db2 = await createDb();
  const a = await addAuthUser(db2);
  await addAuthUser(db2);
  await expectError(rpc(db2, authed(a), 'qm_bootstrap_admin', { p_username: 'admin-user' }), 'QM403', /^사용자가 정확히 한 명일 때만/);

  // 익명 로그인(사용자 1명이어도) 거절
  const db3 = await createDb();
  const anonUser = await addAuthUser(db3, { isAnonymous: true });
  await expectError(rpc(db3, authed(anonUser, { isAnonymous: true }), 'qm_bootstrap_admin', { p_username: 'admin-user' }), 'QM403', '익명 로그인으로는 계정을 준비할 수 없습니다.');

  // auth.users 에 없는 사람(토큰만 있음) 거절
  const db4 = await createDb();
  await addAuthUser(db4);
  await expectError(rpc(db4, authed('00000000-0000-0000-0000-000000000001'), 'qm_bootstrap_admin', { p_username: 'm' }), 'QM403', /^사용자가 정확히 한 명일 때만/);
  for (const d of [db, db2, db3, db4]) await d.close();
});

test('14. 비우기 안전장치: 넣은 뒤(마지막 비우기 뒤) 사용자 쓰기 → reset QM409, p_discard_changes 면 진행, 옮기기 함수는 쓰기 시각을 안 남김', async () => {
  const db = await createDb();
  const admin = await bootstrapAdmin(db);
  const settings = async () => (await sql(db, OWNER, 'select imported_at, last_user_write_at from public.qm_settings'))[0];

  // 넣기 전에는 그냥 비워짐
  assert.deepEqual(await rpc(db, admin, 'qm_import_reset'), { deletedSets: 0, deletedNotes: 0 });
  await rpc(db, admin, 'qm_import_set', { p_set: legacySet(8, [100, 101]) });
  await rpc(db, admin, 'qm_import_notes', { p_notes: [legacyNote(1, 8, 100)] });
  await rpc(db, admin, 'qm_import_finish', { p_floor: {} });
  const s0 = await settings();
  assert.equal(s0.last_user_write_at, null, '옮기기 함수가 사용자 쓰기 시각을 남겼습니다');
  assert.ok(s0.imported_at);

  // 넣은 뒤 쓰기가 없으면 그냥 비우고 다시 넣을 수 있음
  assert.deepEqual(await rpc(db, admin, 'qm_import_reset'), { deletedSets: 1, deletedNotes: 1 });
  await rpc(db, admin, 'qm_import_set', { p_set: legacySet(8, [100, 101]) });
  await rpc(db, admin, 'qm_import_notes', { p_notes: [legacyNote(1, 8, 100)] });
  await rpc(db, admin, 'qm_import_finish', { p_floor: {} });
  assert.equal((await settings()).last_user_write_at, null);

  // 사용자 쓰기(앱에서 메모 하나)
  await sleep(5);
  await rpc(db, admin, 'qm_create_note', { p_note: { setId: 8, content: '넣은 뒤 쓴 메모' } });
  const s1 = await settings();
  assert.ok(s1.last_user_write_at > s1.imported_at);
  await expectError(rpc(db, admin, 'qm_import_reset'), 'QM409', /^마지막 비우기 뒤 이 DB 에 사용자가 쓴 기록이 있습니다\(마지막 쓰기 .+Z\)\. 백업한 뒤 버려도 될 때만 --discard-changes 로 다시 하세요\.$/);
  await expectError(rpc(db, admin, 'qm_import_reset', { p_discard_changes: false }), 'QM409');
  // 그대로 남아 있음
  assert.equal((await rpc(db, admin, 'qm_list_notes')).length, 2);
  assert.deepEqual(await rpc(db, admin, 'qm_import_reset', { p_discard_changes: true }), { deletedSets: 1, deletedNotes: 2 });
  // 비우면 넣기 기록과 쓰기 기록이 함께 지워짐(잃을 것이 남지 않음)
  assert.deepEqual(await settings(), { imported_at: null, last_user_write_at: null });

  // 문항·문제집 쓰기·지우기도 각각 남김(문장 단위 트리거)
  for (const write of [
    () => rpc(db, admin, 'qm_create_set', { p_title: '새' }),
    () => sql(db, admin, "update public.questions set text = 'x' where id = 100"),
    () => rpc(db, admin, 'qm_delete_question', { p_question_id: 101 }),
  ]) {
    await rpc(db, admin, 'qm_import_reset', { p_discard_changes: true });
    await rpc(db, admin, 'qm_import_set', { p_set: legacySet(8, [100, 101]) });
    await rpc(db, admin, 'qm_import_finish', { p_floor: {} });
    await sleep(5);
    await write();
    await expectError(rpc(db, admin, 'qm_import_reset'), 'QM409');
  }
  await db.close();
});

test('15. qm_ts: 시간대 없는 시각 거절, Z·+09:00 통과, createdAtExact 가 마이크로초를 보존', async () => {
  const db = await createDb();
  const admin = await bootstrapAdmin(db);
  await expectError(rpc(db, admin, 'qm_ts', { p: '2026-10-20T12:50:01.123456' }), 'QM400', '시각에 시간대(Z 또는 +09:00)가 없습니다: 2026-10-20T12:50:01.123456');
  await expectError(rpc(db, admin, 'qm_ts', { p: '2026-10-20 12:50:01' }), 'QM400');
  await expectError(rpc(db, admin, 'qm_ts', { p: '2026-10-20T12:50:01+0900' }), 'QM400');
  assert.equal(await rpc(db, admin, 'qm_ts', { p: null }), null);
  const [z] = await sql(db, admin, "select public.qm_iso(public.qm_ts('2026-10-20T12:50:01.123456Z')) as a, public.qm_iso(public.qm_ts('2026-10-20T21:50:01.123+09:00')) as b");
  assert.deepEqual(z, { a: '2026-10-20T12:50:01.123Z', b: '2026-10-20T12:50:01.123Z' });

  const r1 = await rpc(db, admin, 'qm_import_set', { p_set: legacySet(8, [], { createdAt: '2026-10-20T12:50:01.123456Z' }) });
  assert.deepEqual(r1, { setId: 8, questions: 0, createdAtExact: '2026-10-20T12:50:01.123456Z' });
  const r2 = await rpc(db, admin, 'qm_import_set', { p_set: legacySet(9, [], { createdAt: '2026-10-20T21:50:01.000007+09:00' }) });
  assert.equal(r2.createdAtExact, '2026-10-20T12:50:01.000007Z');
  // 목록 응답은 밀리초로 자른 Z 꼴
  const sets = await rpc(db, admin, 'qm_list_sets');
  assert.deepEqual(sets.map((s) => [s.id, s.createdAt]), [[8, '2026-10-20T12:50:01.123Z'], [9, '2026-10-20T12:50:01.000Z']]);
  // 시간대 없는 문제집·메모 시각은 넣기 전체가 실패(아무것도 안 들어감)
  await expectError(rpc(db, admin, 'qm_import_set', { p_set: legacySet(10, [1], { createdAt: '2026-10-20T12:50:01.123456' }) }), 'QM400');
  await expectError(rpc(db, admin, 'qm_import_notes', { p_notes: [legacyNote(1, 8, null), legacyNote(2, 8, null, { updatedAt: '2026-10-20T03:00:00' })] }), 'QM400');
  const [c] = await sql(db, OWNER, 'select (select count(*) from public.question_sets)::int as s, (select count(*) from public.question_notes)::int as n');
  assert.deepEqual(c, { s: 2, n: 0 });
  // 메모는 옛 값 그대로(set_title·시각·해결 시각), 트리거가 바꾸지 않음
  await rpc(db, admin, 'qm_import_notes', { p_notes: [legacyNote(5, 8, null, {
    setTitle: '옛 제목', resolved: true, resolvedAt: '2026-10-21T01:02:03.456Z', createdAt: '2026-10-20T03:00:00.001Z', updatedAt: '2026-10-21T01:02:03.456Z',
  })] });
  const [n] = await rpc(db, admin, 'qm_list_notes');
  assert.deepEqual([n.id, n.setTitle, n.resolved, n.resolvedAt, n.createdAt, n.updatedAt],
    [5, '옛 제목', true, '2026-10-21T01:02:03.456Z', '2026-10-20T03:00:00.001Z', '2026-10-21T01:02:03.456Z']);
  await db.close();
});

test('16. Storage 흉내: 프로필 없는 사용자·남의 uid 폴더·익명은 올리기 거절, 내 폴더만 됨', async () => {
  const db = await createDb();
  const [b] = await sql(db, OWNER, "select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'question-images'");
  assert.deepEqual(b, { public: true, file_size_limit: 10485760, allowed_mime_types: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] });

  const admin = await bootstrapAdmin(db);
  const noProfile = authed(await addAuthUser(db));
  const anonymous = await addUser(db, 'anonymous-user', { isAnonymous: true });
  await sql(db, OWNER, "insert into storage.buckets (id, name, public) values ('other', 'other', true)");
  const put = (who, bucket, name) => sql(db, who, 'insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)', [bucket, name, who.sub ?? null]);
  const RLS = /row-level security/;

  await put(admin, 'question-images', `${admin.sub}/20261022-0b1c.png`);
  await expectError(put(admin, 'question-images', `${noProfile.sub}/20261022-x.png`), '42501', RLS);
  await expectError(put(admin, 'question-images', '20261022-root.png'), '42501', RLS);
  await expectError(put(admin, 'other', `${admin.sub}/x.png`), '42501', RLS);
  await expectError(put(noProfile, 'question-images', `${noProfile.sub}/20261022-x.png`), '42501', RLS);
  await expectError(put(anonymous, 'question-images', `${anonymous.sub}/20261022-x.png`), '42501', RLS);
  await expectError(put({ ...ANON, sub: null }, 'question-images', 'x/y.png'), '42501', RLS);
  // 덮어쓰기·지우기 정책은 없음
  assert.deepEqual(await sql(db, admin, "update storage.objects set name = name || '2' returning id"), []);
  assert.deepEqual(await sql(db, admin, 'delete from storage.objects returning id'), []);
  const [c] = await sql(db, OWNER, 'select count(*)::int as c from storage.objects');
  assert.equal(c.c, 1);
  await db.close();
});

test('17. qm_import_status 의 다음 번호가 setval 과 맞음', async () => {
  const db = await createDb();
  const admin = await bootstrapAdmin(db);
  const st0 = await rpc(db, admin, 'qm_import_status');
  assert.deepEqual(st0.nextIds, { sets: 1, questions: 1, notes: 1 });
  assert.deepEqual([st0.live, st0.schemaVersion, st0.importedAt, st0.importMax, st0.lastUserWriteAt], [false, LATEST_SCHEMA, null, null, null]);

  await rpc(db, admin, 'qm_import_set', { p_set: legacySet(30, [300, 310]) });
  await rpc(db, admin, 'qm_import_notes', { p_notes: [legacyNote(40, 30, 300)] });
  const fin = await rpc(db, admin, 'qm_import_finish', { p_floor: { sets: 31, questions: 305, notes: 99 } });
  const st1 = await rpc(db, admin, 'qm_import_status');
  assert.deepEqual(st1.nextIds, { sets: fin.nextSetId, questions: fin.nextQuestionId, notes: fin.nextNoteId });
  assert.deepEqual(st1.nextIds, { sets: 1032, questions: 1311, notes: 1100 });
  assert.deepEqual(st1.importMax, { sets: 30, questions: 310, notes: 40 });
  assert.deepEqual(st1.counts, { sets: 1, questions: 2, notes: 1 });
  assert.match(st1.importedAt, /Z$/);

  // 실제로 다음에 매겨지는 번호와 같음
  const s = await rpc(db, admin, 'qm_create_set', { p_title: '다음' });
  const q = await rpc(db, admin, 'qm_add_question', { p_set_id: s.id, p_question: { text: '다음' } });
  const n = await rpc(db, admin, 'qm_create_note', { p_note: { content: '다음' } });
  assert.deepEqual([s.id, q.id, n.id], [1032, 1311, 1100]);
  const st2 = await rpc(db, admin, 'qm_import_status');
  assert.deepEqual(st2.nextIds, { sets: 1033, questions: 1312, notes: 1101 });
  assert.match(st2.lastUserWriteAt, /Z$/);
  await db.close();
});

test('PGlite 확인: SET ROLE·current_user·RLS·외래키 동작 주체·identity 시퀀스 권한(설계 미확인 1·2·3·13·14)', async () => {
  const db = await createDb();
  const u = await bootstrapAdmin(db);
  const other = await addUser(db, 'other');
  // [미확인 1] SET LOCAL ROLE 이 먹고 current_user 가 바뀜
  assert.deepEqual(await sql(db, u, 'select current_user::text as r'), [{ r: 'authenticated' }]);
  assert.deepEqual(await sql(db, ANON, 'select current_user::text as r'), [{ r: 'anon' }]);
  assert.deepEqual(await sql(db, OWNER, 'select current_user::text as r'), [{ r: 'postgres' }]);
  // RLS: 주인(postgres)은 다 보고, authenticated 는 자기 것만
  await rpc(db, u, 'qm_create_set', { p_title: 'u' });
  await rpc(db, other, 'qm_create_set', { p_title: 'o' });
  assert.equal((await sql(db, OWNER, 'select count(*)::int as c from public.question_sets'))[0].c, 2);
  assert.equal((await sql(db, u, 'select count(*)::int as c from public.question_sets'))[0].c, 1);
  // [미확인 2] 외래키 set null 은 표 주인 권한으로 돎 → 트리거가 본 current_user 는 authenticated 가 아님
  await db.exec(`create table public.qm_probe_log (who text);
    create function public.qm_probe_note_update() returns trigger language plpgsql as $$
    begin insert into public.qm_probe_log values (current_user::text); return new; end $$;
    create trigger qm_probe before update on public.question_notes for each row execute function public.qm_probe_note_update();`);
  const s = await rpc(db, u, 'qm_create_set', { p_title: 'fk' });
  await rpc(db, u, 'qm_create_note', { p_note: { setId: s.id, content: 'fk' } });
  await rpc(db, u, 'qm_delete_set', { p_set_id: s.id });
  assert.deepEqual(await sql(db, OWNER, 'select who from public.qm_probe_log'), [{ who: 'postgres' }]);
  // [미확인 3] identity 칸은 시퀀스 USAGE 없이 번호를 매김(마이그레이션이 시퀀스 권한을 모두 거뒀는데도 넣기가 됨)
  const [p] = await sql(db, OWNER, "select has_sequence_privilege('authenticated', 'public.question_sets_id_seq', 'USAGE') as a");
  assert.equal(p.a, false);
  assert.ok((await rpc(db, u, 'qm_create_set', { p_title: '번호' })).id > 0);
  // [미확인 14] revoke all on table 이 칸 권한까지 거둠: 손으로 더한 칸 권한이 100 파일을 다시 돌리면 사라짐
  await sql(db, OWNER, 'grant update (id) on public.questions to authenticated');
  const has = async () => (await sql(db, OWNER, "select has_column_privilege('authenticated', 'public.questions', 'id', 'UPDATE') as a"))[0].a;
  assert.equal(await has(), true);
  await db.exec(readMigration('20261023000100_qm_tables.sql'));
  assert.equal(await has(), false);
  await db.close();
});

test('복원 틀 docs/restore/reopen-import.sql: 이름을 넣으면 한 번만 다시 열고, 이름을 안 바꾸면 멈춤', async () => {
  const template = readFileSync(REOPEN_TEMPLATE, 'utf8');
  assert.ok(!migrationFiles().some((f) => f.includes('reopen')), '다시 열기 틀이 migrations 폴더에 들어 있습니다');
  // 바꿀 자리(따옴표 붙은 자리 표시)는 정확히 한 군데
  assert.equal(template.split("'REOPEN_NAME_HERE'").length - 1, 1);
  const db = await createDb();
  const admin = await bootstrapAdmin(db);
  await rpc(db, admin, 'qm_import_set', { p_set: legacySet(8, [100]) });
  await rpc(db, admin, 'qm_import_finish', { p_floor: {} });
  await rpc(db, admin, 'qm_import_close');

  // 이름을 바꾸지 않은 틀은 오류로 멈추고 아무것도 바꾸지 않음
  await expectError(db.exec(template), 'P0001', /다시 열기 이름이 정해지지 않았습니다/);
  assert.equal((await rpc(db, admin, 'qm_me')).live, true);

  const filled = template.replace("'REOPEN_NAME_HERE'", "'20261105_restore'");
  await db.exec(filled);
  assert.equal((await rpc(db, admin, 'qm_me')).live, false);
  // 다시 열렸으니 복원 넣기가 됨(넣은 뒤 쓰기가 있으면 --discard-changes 필요)
  await rpc(db, admin, 'qm_create_note', { p_note: { content: '전환 뒤 메모' } });
  await expectError(rpc(db, admin, 'qm_import_reset'), 'QM409');
  await rpc(db, admin, 'qm_import_reset', { p_discard_changes: true });
  await rpc(db, admin, 'qm_import_set', { p_set: legacySet(8, [100]) });
  await rpc(db, admin, 'qm_import_finish', { p_floor: {} });
  await rpc(db, admin, 'qm_import_close');
  // 같은 파일이 다시 적용되어도 또 열지 않음
  await db.exec(filled);
  assert.equal((await rpc(db, admin, 'qm_me')).live, true);
  // 이름표 표는 API 로 보이지 않음
  await expectError(sql(db, ANON, 'select * from public.qm_reopen_log'), '42501');
  await expectError(sql(db, admin, 'select * from public.qm_reopen_log'), '42501');
  // 다음 복원은 새 이름으로 다시 열림
  await db.exec(template.replace("'REOPEN_NAME_HERE'", "'20261201_restore'"));
  assert.equal((await rpc(db, admin, 'qm_me')).live, false);
  await db.close();
});

// ── 반박 검토(10/22) 재현 시험 ─────────────────────────────────────────
// 고친 것은 고친 동작을, 받아들인 것은 받아들인 동작(안전한 쪽)을 확인한다. 번호는 검토 문제 번호.

test('재현 검토1·9: 비우기 안전장치는 finish 를 다시 불러도, finish 전에도, discard 비우기 직후에도 꺼지지 않음', async () => {
  const db = await createDb();
  const admin = await bootstrapAdmin(db);
  const lastWrite = async () => (await sql(db, OWNER, 'select last_user_write_at from public.qm_settings'))[0].last_user_write_at;

  // (검토1) 넣기 → finish → 사용자 쓰기 → finish 다시 → reset 은 여전히 QM409, 데이터 그대로
  await rpc(db, admin, 'qm_import_set', { p_set: legacySet(8, [100]) });
  await rpc(db, admin, 'qm_import_finish', { p_floor: {} });
  await sleep(5);
  const kept = await rpc(db, admin, 'qm_create_set', { p_title: '넣은 뒤 앱에서 만든 문제집' });
  await rpc(db, admin, 'qm_create_note', { p_note: { setId: kept.id, content: '넣은 뒤 쓴 메모' } });
  await expectError(rpc(db, admin, 'qm_import_reset'), 'QM409');
  await sleep(5);
  await rpc(db, admin, 'qm_import_finish', { p_floor: {} });
  await expectError(rpc(db, admin, 'qm_import_reset'), 'QM409');
  assert.deepEqual((await rpc(db, admin, 'qm_list_sets')).map((s) => s.id).sort((a, b) => a - b), [8, kept.id]);

  // discard 로 비우면 기록도 지워짐 → 그 직후(넣기 전) 앱에서 쓰면 다음 reset 은 QM409
  assert.deepEqual(await rpc(db, admin, 'qm_import_reset', { p_discard_changes: true }), { deletedSets: 2, deletedNotes: 1 });
  assert.equal(await lastWrite(), null);
  await rpc(db, admin, 'qm_create_set', { p_title: 'reset 뒤 앱에서 만든 문제집' });
  await expectError(rpc(db, admin, 'qm_import_reset'), 'QM409');
  await rpc(db, admin, 'qm_import_reset', { p_discard_changes: true });

  // (검토1·9) 넣는 중(finish 전)에 쓴 메모 → reset 은 QM409. null 은 false 와 같음
  await rpc(db, admin, 'qm_import_set', { p_set: legacySet(8, [100]) });
  await rpc(db, admin, 'qm_create_note', { p_note: { setId: 8, content: '넣는 도중 앱에서 쓴 메모' } });
  await expectError(rpc(db, admin, 'qm_import_reset'), 'QM409');
  await expectError(rpc(db, admin, 'qm_import_reset', { p_discard_changes: null }), 'QM409');
  assert.equal((await rpc(db, admin, 'qm_list_notes')).length, 1);
  await db.close();

  // (검토9, 받아들임) finish 전에는 시퀀스가 아직 처음 값이라 새로 쓰면 옮긴 번호와 부딪혀 실패(23505) — 데이터는 그대로
  const db2 = await createDb();
  const admin2 = await bootstrapAdmin(db2);
  await rpc(db2, admin2, 'qm_import_set', { p_set: legacySet(1, [1]) });
  await expectError(rpc(db2, admin2, 'qm_create_set', { p_title: '새' }), '23505', /question_sets_pkey/);
  assert.equal((await sql(db2, OWNER, 'select last_user_write_at from public.qm_settings'))[0].last_user_write_at, null, '실패한 쓰기가 기록을 남겼습니다');
  assert.deepEqual(await rpc(db2, admin2, 'qm_import_reset'), { deletedSets: 1, deletedNotes: 0 });
  await db2.close();
});

test('재현 검토2: 다음 마이그레이션이 권한 명시를 빠뜨려도 새 함수·표·뷰·시퀀스가 anon 에 열리지 않음, 넓은 질의는 이름과 상관없이 잡음', async () => {
  for (const autoExpose of [true, false]) {
    const db = await createDb({ autoExpose });
    // 권한을 적지 않은 '다음 마이그레이션' 흉내(마이그레이션과 같은 역할로)
    await db.exec(`
      create function public.keepalive() returns int language sql security definer set search_path = '' as $$ select 1 $$;
      create function public.qm_new_helper() returns int language sql set search_path = '' as $$ select 2 $$;
      create function qm_private.new_private() returns int language sql set search_path = '' as $$ select 3 $$;
      create table public.qm_extra (id int generated by default as identity primary key, secret text);
      insert into public.qm_extra (secret) values ('s');
      create view public.qm_extra_view as select * from public.qm_extra;`);
    assert.deepEqual(await anonExposure(db), { functions: ['public.qm_schema_version()'], relations: [] }, `autoExpose=${autoExpose}`);
    await expectError(sql(db, ANON, 'select public.keepalive()'), '42501', /permission denied for function/);
    await expectError(sql(db, ANON, 'select * from public.qm_extra'), '42501', /permission denied for table/);
    await expectError(sql(db, ANON, 'select * from public.qm_extra_view'), '42501', /permission denied/);
    // 기본 권한으로 authenticated 에도 저절로 열리지 않는 경우가 있으므로(자동 노출 끔) 새 함수는 늘 명시해 준다
    const [ax] = await sql(db, OWNER, "select has_function_privilege('authenticated', 'public.keepalive()', 'EXECUTE') as a");
    assert.equal(ax.a, autoExpose);

    // 누가 잘못 열어 주면(qm_ 가 아닌 이름이어도) 넓은 질의가 잡음
    await db.exec(`grant execute on function public.keepalive() to public;
      grant select on public.qm_extra to anon;
      grant usage on sequence public.qm_extra_id_seq to anon;`);
    assert.deepEqual(await anonExposure(db), {
      functions: ['public.keepalive()', 'public.qm_schema_version()'],
      relations: ['public.qm_extra', 'public.qm_extra_id_seq'],
    });
    await db.close();
  }
});

test('재현 검토4·10: 프로필 없는 로그인은 설정 줄을 못 읽음. 바뀐 행이 0인 쓰기 문장의 기록은 받아들임(비우기를 막는 쪽)', async () => {
  const db = await createDb();
  const admin = await bootstrapAdmin(db);
  await rpc(db, admin, 'qm_import_set', { p_set: legacySet(8, [100]) });
  await rpc(db, admin, 'qm_import_finish', { p_floor: {} });
  const stranger = authed(await addAuthUser(db));
  assert.deepEqual(await sql(db, stranger, 'select * from public.qm_settings'), []);
  assert.equal((await rpc(db, stranger, 'qm_me')).schemaVersion, LATEST_SCHEMA);
  // 프로필이 있는 사용자는 읽음
  assert.equal((await sql(db, admin, 'select live from public.qm_settings')).length, 1);
  // 낯선 사용자는 표에 넣지 못함(외래키), 남의 행은 보이지 않음
  await expectError(sql(db, stranger, "insert into public.question_sets (title) values ('x')"), '23503');
  assert.deepEqual(await sql(db, stranger, 'select id from public.question_sets'), []);

  // 받아들임: 0행 문장(직접 REST 의 빈 DELETE)도 기록 → reset 은 QM409. 도구 해시가 같으면 discard 로 진행
  assert.deepEqual(await sql(db, stranger, 'delete from public.question_notes where id = -1 returning id'), []);
  await expectError(rpc(db, admin, 'qm_import_reset'), 'QM409');
  await rpc(db, admin, 'qm_import_reset', { p_discard_changes: true });
  assert.deepEqual(await sql(db, admin, 'delete from public.question_sets where id = 999 returning id'), []);
  await expectError(rpc(db, admin, 'qm_import_reset'), 'QM409');
  // 실패한 함수 호출·읽기는 기록하지 않음
  await rpc(db, admin, 'qm_import_reset', { p_discard_changes: true });
  await expectError(rpc(db, admin, 'qm_delete_set', { p_set_id: 999 }), 'QM404');
  await rpc(db, admin, 'qm_list_sets');
  await rpc(db, admin, 'qm_list_notes');
  assert.deepEqual(await rpc(db, admin, 'qm_import_reset'), { deletedSets: 0, deletedNotes: 0 });
  await db.close();
});

test('재현 검토5: auth.users 가 익명인데 토큰에 is_anonymous 가 빠져도 계정 준비 거절', async () => {
  const db = await createDb();
  const anonRow = await addAuthUser(db, { isAnonymous: true });
  const noClaim = { role: 'authenticated', sub: anonRow, claims: { role: 'authenticated', sub: anonRow } };
  await expectError(rpc(db, noClaim, 'qm_bootstrap_admin', { p_username: 'admin-user' }), 'QM403', '익명 로그인으로는 계정을 준비할 수 없습니다.');
  assert.equal((await sql(db, OWNER, 'select count(*)::int as c from public.profiles'))[0].c, 0);
  await db.close();
});

test('재현 검토6·7(알려진 제약): 그림 정책은 INSERT 하나뿐 — RETURNING 을 붙인 넣기는 막힘(운영 적용 때 실제 올리기로 확인)', async () => {
  const db = await createDb();
  const admin = await bootstrapAdmin(db);
  const put = (name, returning = '') => sql(db, admin, `insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3) ${returning}`, ['question-images', `${admin.sub}/${name}`, admin.sub]);
  assert.deepEqual(await put('a.png'), []);
  await expectError(put('b.png', 'returning id'), '42501', /row-level security/);
  // 내 것이라도 목록·덮어쓰기·지우기는 안 됨(SELECT·UPDATE·DELETE 정책 없음)
  assert.deepEqual(await sql(db, admin, 'select name from storage.objects'), []);
  await db.close();
});

test('재현 검토8: 해설도 옛 MySQL TEXT 처럼 65,535바이트까지(함수·직접 쓰기·옮기기 모두)', async () => {
  const db = await createDb();
  const admin = await bootstrapAdmin(db);
  const tooBig = '가'.repeat(21846);   // 65,538바이트
  await expectError(rpc(db, admin, 'qm_import_set', { p_set: legacySet(8, [100], { questions: [{ id: 100, text: 'x', explanation: tooBig }] }) }),
    '23514', /questions_explanation_bytes/);
  assert.equal((await sql(db, OWNER, 'select count(*)::int as c from public.question_sets'))[0].c, 0, '넣기 전체가 멈추지 않았습니다');
  const s = await rpc(db, admin, 'qm_create_set', { p_title: '해설' });
  await expectError(rpc(db, admin, 'qm_add_question', { p_set_id: s.id, p_question: { explanation: tooBig } }), 'QM400', '해설이 65,535바이트를 넘습니다.');
  await expectError(sql(db, admin, 'insert into public.questions (set_id, explanation) values ($1, $2)', [s.id, tooBig]), '23514', /questions_explanation_bytes/);
  const q = await rpc(db, admin, 'qm_add_question', { p_set_id: s.id, p_question: { explanation: 'x' } });
  await expectError(sql(db, admin, 'update public.questions set explanation = $1 where id = $2', [tooBig, q.id]), '23514');
  await db.close();
});

test('재현 검토11: 옮기기는 배열 아닌 answers·짝 안 맞는 메모를 조용히 받지 않음(그 묶음 전체가 멈춤)', async () => {
  const db = await createDb();
  const admin = await bootstrapAdmin(db);
  const count = async (t) => (await sql(db, OWNER, `select count(*)::int as c from public.${t}`))[0].c;

  const bad = legacySet(8, [100, 101]);
  bad.questions[1].answers = '정답';
  await expectError(rpc(db, admin, 'qm_import_set', { p_set: bad }), 'QM400', '문항 101: answers 는 배열이어야 합니다.');
  const obj = legacySet(8, [100]);
  obj.questions[0].answers = { a: 1 };
  await expectError(rpc(db, admin, 'qm_import_set', { p_set: obj }), 'QM400', '문항 100: answers 는 배열이어야 합니다.');
  assert.deepEqual([await count('question_sets'), await count('questions')], [0, 0]);
  // null·없음·빈 배열은 NULL 로 들어감
  const ok = legacySet(8, [100, 101, 102]);
  ok.questions[0].answers = null;
  delete ok.questions[1].answers;
  ok.questions[2].answers = [];
  await rpc(db, admin, 'qm_import_set', { p_set: ok });
  assert.deepEqual((await rpc(db, admin, 'qm_list_questions', { p_set_id: 8 })).map((q) => q.answers), [null, null, null]);
  await rpc(db, admin, 'qm_import_set', { p_set: legacySet(9, [200]) });

  // 메모: 문항이 붙었으면 setId 는 그 문항의 문제집이어야 함(옛 서버의 불변식)
  const MISMATCH = /^메모 \d+: 고른 문항이 그 문제집의 문항이 아닙니다\.$/;
  await expectError(rpc(db, admin, 'qm_import_notes', { p_notes: [legacyNote(1, 8, 200)] }), 'QM400', '메모 1: 고른 문항이 그 문제집의 문항이 아닙니다.');
  await expectError(rpc(db, admin, 'qm_import_notes', { p_notes: [legacyNote(2, null, 200)] }), 'QM400', MISMATCH);
  await expectError(rpc(db, admin, 'qm_import_notes', { p_notes: [legacyNote(3, 9, 200), legacyNote(4, 9, 100)] }), 'QM400', '메모 4: 고른 문항이 그 문제집의 문항이 아닙니다.');
  assert.equal(await count('question_notes'), 0);
  // 맞는 꼴(문항+그 문제집, 문제집만, 둘 다 없음)은 들어감
  assert.deepEqual(await rpc(db, admin, 'qm_import_notes', { p_notes: [legacyNote(3, 9, 200), legacyNote(5, 8, null), legacyNote(6, null, null)] }), { notes: 3 });
  await db.close();
});

test('재현 검토12: 문항을 직접 PATCH 로 내 다른 문제집에 옮기지 못함(set_id 는 넣을 때만), 고치기는 그대로', async () => {
  const db = await createDb();
  const u = await bootstrapAdmin(db);
  const a = await rpc(db, u, 'qm_create_set', { p_title: 'A' });
  const b = await rpc(db, u, 'qm_create_set', { p_title: 'B' });
  const q = await rpc(db, u, 'qm_add_question', { p_set_id: a.id, p_question: { text: 'q' } });
  await rpc(db, u, 'qm_create_note', { p_note: { questionId: q.id, content: 'm' } });
  await expectError(sql(db, u, 'update public.questions set set_id = $1 where id = $2', [b.id, q.id]), '42501', /permission denied for table questions/);
  // 직접 넣기는 set_id 를 정할 수 있고, 함수·직접 고치기는 됨
  const [dq] = await sql(db, u, "insert into public.questions (set_id, text) values ($1, '직접') returning id, set_id", [b.id]);
  assert.equal(dq.set_id, b.id);
  assert.equal((await rpc(db, u, 'qm_update_question', { p_question_id: q.id, p_question: { text: '고침' } })).text, '고침');
  assert.deepEqual(await sql(db, u, "update public.questions set order_index = 5 where id = $1 returning set_id", [q.id]), [{ set_id: a.id }]);
  const [n] = await rpc(db, u, 'qm_list_notes');
  assert.deepEqual([n.setId, n.questionId, n.setTitle], [a.id, q.id, 'A']);
  await db.close();
});

test('재현 검토13(받아들임): options 의 소수·지수·-0 꼴은 MySQL 과 다름, 빈 글자는 NULL, 숫자 칸의 빈 글자는 22P02', async () => {
  const db = await createDb();
  const u = await bootstrapAdmin(db);
  const s = await rpc(db, u, 'qm_create_set', { p_title: '꼴' });
  const q = await rpc(db, u, 'qm_add_question', { p_set_id: s.id, p_question: { options: '[2.50, 1e2, 1.0, -0, 12345678901234567890]' } });
  assert.equal(q.options, '[2.50, 100, 1.0, 0, 12345678901234567890]');   // MySQL 이면 [2.5, 100.0, 1.0, -0.0, 1.2345678901234567e19]
  assert.equal((await rpc(db, u, 'qm_add_question', { p_set_id: s.id, p_question: { options: '' } })).options, null);
  await expectError(rpc(db, u, 'qm_add_question', { p_set_id: s.id, p_question: { answerIndex: '' } }), '22P02');
  await db.close();
});

// Supabase 는 Data API 요청에 pg-safeupdate 를 켜 둔다: API 로 부른 함수 안이라도 WHERE 없는 UPDATE·DELETE 는
// "UPDATE requires a WHERE clause" 로 거절된다. PGlite 에는 이 장치가 없어 2026-10-22 리허설 넣기에서야 드러났다.
// 마지막 판의 함수 정의(pg_proc)를 훑어 같은 실수가 다시 들어오지 않게 막는다(INSERT … ON CONFLICT DO UPDATE·SELECT … FOR UPDATE 는 제외).
function unsafeWrites(rows) {
  const bad = [];
  for (const r of rows) {
    const src = String(r.prosrc).replace(/--[^\n]*/g, '');
    for (const m of src.matchAll(/\b(update|delete\s+from)\s+[\w."]+[\s\S]*?(?:;|$)/gi)) {
      const before = src.slice(Math.max(0, m.index - 5), m.index).toLowerCase();
      if (/\b(do|for)\s+$/.test(before)) continue;
      if (/^update\s+(or|of)\b/i.test(m[0])) continue;
      if (!/\bwhere\b/i.test(m[0])) bad.push(`${r.fn}: ${m[0].replace(/\s+/g, ' ').slice(0, 90)}`);
    }
  }
  return bad;
}

test('20. Supabase safeupdate 흉내: public·qm_private 함수 안에 WHERE 없는 UPDATE·DELETE 가 없다', async () => {
  const db = await createDb();
  const rows = await sql(db, OWNER, `
    select n.nspname || '.' || p.proname as fn, p.prosrc
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'qm_private') and p.prokind = 'f'`);
  assert.ok(rows.length > 20, `함수를 너무 적게 읽었습니다(${rows.length})`);
  assert.deepEqual(unsafeWrites(rows), [], 'Supabase 에서 거절될 WHERE 없는 쓰기가 있습니다');
  // 검사가 실제로 잡는지: 옛 판(⑤ 적용 전)의 정의는 걸려야 한다
  const old = readMigration('20261023000300_qm_import.sql');
  const oldBad = unsafeWrites([{ fn: 'old300', prosrc: old.slice(old.indexOf('qm_import_reset'), old.indexOf('qm_import_set')) }]);
  assert.equal(oldBad.length, 1, `옛 qm_import_reset 의 WHERE 없는 UPDATE 를 잡지 못했습니다: ${JSON.stringify(oldBad)}`);
  await db.close();
});
