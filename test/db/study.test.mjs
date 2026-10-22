// ⑥ 공부 기록 나누기(supabase/migrations/20261023000600_qm_study.sql) 시험.
// 실행: npm run test:db  (PGlite 메모리 DB 만 씀. 운영 Supabase 에는 붙지 않음)
// 멱등(두 번 돌리기)·lock·anon 전체 노출·safeupdate 훑기는 schema.test.mjs 의 시험 1·9·20 이 이 파일까지 함께 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OWNER, ANON, createDb, sql, rpc, authed, addAuthUser, addUser, bootstrapAdmin, expectError, sleep } from './harness.mjs';

const T1 = '2026-10-20T01:00:00.000Z';
const T2 = '2026-10-21T01:00:00.000Z';
const T3 = '2026-10-22T01:00:00.000Z';

// 앱이 올리는 꼴과 같은 기록(내용 + at + days)
const rec = (extra = {}) => ({ v: 1, at: T1, days: ['2026-10-20'], mode: 'ordered', ids: ['101'], cur: '101', ...extra });

async function setup() {
  const db = await createDb();
  const alice = await addUser(db, 'alice');
  const bob = await addUser(db, 'bob');
  const a1 = await rpc(db, alice, 'qm_create_set', { p_title: '앨리스 1' });
  const a2 = await rpc(db, alice, 'qm_create_set', { p_title: '앨리스 2' });
  const b1 = await rpc(db, bob, 'qm_create_set', { p_title: '밥 1' });
  return { db, alice, bob, a1, a2, b1 };
}

test('공부 기록: anon 은 함수·표 모두 거절, 함수는 STABLE(목록)·VOLATILE(올리기)', async () => {
  const db = await createDb();
  await expectError(rpc(db, ANON, 'qm_list_study'), '42501', /permission denied for function/);
  await expectError(rpc(db, ANON, 'qm_put_study', { p_set_id: 1, p_data: {}, p_client_at: T1 }), '42501', /permission denied for function/);
  await expectError(sql(db, ANON, 'select * from public.study_states'), '42501', /permission denied for table/);
  await expectError(sql(db, ANON, "insert into public.study_states (set_id, data, client_at) values (1, '{}', now())"), '42501', /permission denied for table/);
  const [ax] = await sql(db, OWNER, `
    select has_function_privilege('anon', 'qm_private.study_merge(jsonb, jsonb, boolean)', 'EXECUTE') as merge,
           has_function_privilege('anon', 'qm_private.study_touch()', 'EXECUTE') as touch`);
  assert.deepEqual(ax, { merge: false, touch: false });
  const vol = await sql(db, OWNER, `
    select p.proname::text as fn, p.provolatile::text as v from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname in ('qm_list_study', 'qm_put_study') order by 1`);
  // 목록은 운영에서 읽기 전용 트랜잭션으로 돈다(harness rpc 도 그렇게 부름) — 올리기는 쓰므로 VOLATILE 이어야 한다
  assert.deepEqual(vol, [{ fn: 'qm_list_study', v: 's' }, { fn: 'qm_put_study', v: 'v' }]);
  await db.close();
});

// (STABLE 함수 본문에 바로 쓴 UPDATE 는 Postgres 가 0A000 으로 막는다. 빠지는 길은 VOLATILE 함수를 거친 쓰기 — 예: touch 를 부르기)
test('시험 틀: STABLE 함수는 읽기 전용 트랜잭션으로 불려, VOLATILE 함수를 거친 쓰기가 25006 으로 드러남(운영 PostgREST 와 같게)', async () => {
  const db = await createDb();
  const u = await bootstrapAdmin(db);
  await db.exec(`
    create function public.qm_bad_stable() returns int language plpgsql stable set search_path = '' as $$
    begin perform qm_private.touch_user_write(); return 1; end $$;
    grant execute on function public.qm_bad_stable() to authenticated;`);
  await expectError(rpc(db, u, 'qm_bad_stable'), '25006', /read-only transaction/);
  // 같은 호출을 읽기 전용 없이 부르면 지나간다(= 예전 시험 틀이 못 잡던 것)
  assert.deepEqual(await sql(db, u, 'select public.qm_bad_stable() as r'), [{ r: 1 }]);
  await db.close();
});

test('공부 기록: 올리고 받기 — 꼴·시각·days 정리(합집합·날짜 꼴만·오름차순)', async () => {
  const { db, alice, a1 } = await setup();
  assert.deepEqual(await rpc(db, alice, 'qm_list_study'), []);
  const r = await rpc(db, alice, 'qm_put_study', {
    p_set_id: a1.id, p_data: rec({ days: ['2026-10-21', '2026-10-20', '2026-10-21', 'x', 3, null] }), p_client_at: T1,
  });
  assert.equal(r.setId, a1.id);
  assert.equal(r.clientAt, T1);
  assert.deepEqual(r.data.days, ['2026-10-20', '2026-10-21']);
  assert.equal(r.data.at, T1);
  assert.equal(r.data.mode, 'ordered');
  assert.match(r.updatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  const list = await rpc(db, alice, 'qm_list_study');
  assert.deepEqual(list, [r]);
  // 시간대 붙은 다른 꼴의 시각도 같은 순간으로(밀리초까지)
  const r2 = await rpc(db, alice, 'qm_put_study', { p_set_id: a1.id, p_data: rec({ cur: '102' }), p_client_at: '2026-10-21T10:00:00.123+09:00' });
  assert.equal(r2.clientAt, '2026-10-21T01:00:00.123Z');
  assert.equal(r2.data.cur, '102');
  await db.close();
});

test('공부 기록: 나중에 고친 쪽이 이김(client_at) — 옛 기록은 내용을 못 덮고 days 는 합쳐지고 at 은 늦은 쪽', async () => {
  const { db, alice, a1 } = await setup();
  // 태블릿(T2): 빈칸 3개 연 상태
  await rpc(db, alice, 'qm_put_study', {
    p_set_id: a1.id, p_data: rec({ at: T2, days: ['2026-10-21'], q: { 101: { r: [0, 1, 2] } } }), p_client_at: T2,
  });
  // 휴대폰(T1, 늦게 도착한 옛 내용) — 내용은 지고, 그 기기의 공부한 날·늦게 본 때(at)는 남는다
  const late = await rpc(db, alice, 'qm_put_study', {
    p_set_id: a1.id, p_data: rec({ at: T3, days: ['2026-10-19', '2026-10-22'], q: { 101: { r: [0] } } }), p_client_at: T1,
  });
  assert.deepEqual(late.data.q, { 101: { r: [0, 1, 2] } }, '옛 기록이 새 내용을 덮었습니다');
  assert.equal(late.clientAt, T2);
  assert.deepEqual(late.data.days, ['2026-10-19', '2026-10-21', '2026-10-22']);
  assert.equal(late.data.at, T3);
  // 같은 시각(같은 판의 되올리기)은 받아들임 — 합친 days 를 다시 올리는 길
  const same = await rpc(db, alice, 'qm_put_study', {
    p_set_id: a1.id, p_data: rec({ at: T2, days: ['2026-10-18'], q: { 101: { r: [0, 1, 2] } } }), p_client_at: T2,
  });
  assert.deepEqual(same.data.days, ['2026-10-18', '2026-10-19', '2026-10-21', '2026-10-22']);
  assert.equal(same.data.at, T3, '늦은 at 이 되돌아갔습니다');
  // 더 새 내용은 이김
  const newer = await rpc(db, alice, 'qm_put_study', {
    p_set_id: a1.id, p_data: rec({ at: T3, days: [], q: { 101: { r: [5] } } }), p_client_at: T3,
  });
  assert.deepEqual(newer.data.q, { 101: { r: [5] } });
  assert.equal(newer.clientAt, T3);
  assert.equal(newer.data.days.length, 4);
  // 꼴이 틀린 at 은 버리고 맞는 쪽을 남긴다
  const badAt = await rpc(db, alice, 'qm_put_study', { p_set_id: a1.id, p_data: rec({ at: '어제', days: [] }), p_client_at: T3 });
  assert.equal(badAt.data.at, T3);
  await db.close();
});

test('공부 기록: 기기 시계가 앞서도(미래 시각) 서버 시각으로 줄여 언제까지나 이기지 못함', async () => {
  const { db, alice, a1 } = await setup();
  const before = Date.now();
  const r = await rpc(db, alice, 'qm_put_study', { p_set_id: a1.id, p_data: rec({ cur: 'future' }), p_client_at: '2099-01-01T00:00:00.000Z' });
  const t = Date.parse(r.clientAt);
  assert.ok(t >= before - 1000 && t <= Date.now() + 1000, `미래 시각이 그대로 남았습니다: ${r.clientAt}`);
  await sleep(5);
  // 그 뒤 다른 기기가 지금 시각으로 고친 내용이 이긴다
  const now = new Date().toISOString();
  const r2 = await rpc(db, alice, 'qm_put_study', { p_set_id: a1.id, p_data: rec({ cur: 'later' }), p_client_at: now });
  assert.equal(r2.data.cur, 'later');
  await db.close();
});

test('공부 기록: 남의 기록은 안 보이고, 남의 문제집으로는 함수·직접 쓰기 모두 못 씀', async () => {
  const { db, alice, bob, a1, b1 } = await setup();
  await rpc(db, alice, 'qm_put_study', { p_set_id: a1.id, p_data: rec(), p_client_at: T1 });
  await rpc(db, bob, 'qm_put_study', { p_set_id: b1.id, p_data: rec({ cur: 'bob' }), p_client_at: T1 });
  assert.deepEqual((await rpc(db, bob, 'qm_list_study')).map((x) => x.setId), [b1.id]);
  assert.deepEqual((await sql(db, bob, 'select set_id from public.study_states')).map((x) => Number(x.set_id)), [b1.id]);
  // 함수: 남의 문제집은 '없음'(QM404, 있는지 알리지 않음)
  await expectError(rpc(db, bob, 'qm_put_study', { p_set_id: a1.id, p_data: rec(), p_client_at: T3 }), 'QM404', '존재하지 않는 세트입니다.');
  await expectError(rpc(db, bob, 'qm_put_study', { p_set_id: 999999, p_data: rec(), p_client_at: T3 }), 'QM404');
  // 직접 넣기: 남의 문제집이면 RLS 가 막음
  await expectError(sql(db, bob, `insert into public.study_states (set_id, data, client_at) values ($1, '{}', now())`, [a1.id]),
    '42501', /row-level security/);
  // 직접 고치기·지우기: 남의 줄은 안 보여 0행, 지우기는 권한 자체가 없음
  assert.deepEqual(await sql(db, bob, `update public.study_states set data = '{"x":1}' where set_id = $1 returning set_id`, [a1.id]), []);
  await expectError(sql(db, bob, 'delete from public.study_states where set_id = $1', [b1.id]), '42501', /permission denied for table/);
  // user_id·set_id·updated_at 은 직접 고칠 수 없다(칸 권한)
  await expectError(sql(db, bob, 'update public.study_states set user_id = $1 where set_id = $2', [alice.sub, b1.id]), '42501', /permission denied/);
  await expectError(sql(db, bob, 'update public.study_states set set_id = $1 where set_id = $2', [a1.id, b1.id]), '42501', /permission denied/);
  await expectError(sql(db, bob, "update public.study_states set updated_at = now() where set_id = $1", [b1.id]), '42501', /permission denied/);
  await expectError(sql(db, bob, `insert into public.study_states (user_id, set_id, data, client_at) values ($1, $2, '{}', now())`, [alice.sub, b1.id]),
    '42501', /permission denied/);
  // 앨리스 기록은 그대로
  const [a] = await rpc(db, alice, 'qm_list_study');
  assert.equal(a.data.cur, '101');
  await db.close();
});

test('공부 기록: 계정 준비 안 된 로그인은 QM403, 로그인 없는 authenticated 는 42501', async () => {
  const { db, a1 } = await setup();
  const stranger = authed(await addAuthUser(db));
  await expectError(rpc(db, stranger, 'qm_list_study'), 'QM403');
  await expectError(rpc(db, stranger, 'qm_put_study', { p_set_id: a1.id, p_data: rec(), p_client_at: T1 }), 'QM403');
  await expectError(rpc(db, authed(null), 'qm_list_study'), '42501', '로그인이 필요합니다.');
  await db.close();
});

test('공부 기록: 크기·꼴 검사(함수 60,000바이트, 표 64KB), days 는 최근 120일만', async () => {
  const { db, alice, a1 } = await setup();
  const big = rec({ pad: 'x'.repeat(60001) });
  await expectError(rpc(db, alice, 'qm_put_study', { p_set_id: a1.id, p_data: big, p_client_at: T1 }), 'QM400', /너무 큽니다/);
  await expectError(rpc(db, alice, 'qm_put_study', { p_set_id: a1.id, p_data: [1, 2], p_client_at: T1 }), 'QM400', /객체여야/);
  await expectError(rpc(db, alice, 'qm_put_study', { p_set_id: a1.id, p_data: rec(), p_client_at: null }), 'QM400', /시각/);
  // 직접 쓰기도 표 제약에 걸림
  await expectError(sql(db, alice, 'insert into public.study_states (set_id, data, client_at) values ($1, $2, now())',
    [a1.id, JSON.stringify({ pad: 'x'.repeat(65600) })]), '23514', /study_states_data_bytes/);
  await expectError(sql(db, alice, "insert into public.study_states (set_id, data, client_at) values ($1, '[1]', now())", [a1.id]),
    '23514', /study_states_data_object/);
  assert.deepEqual(await rpc(db, alice, 'qm_list_study'), [], '거절된 쓰기가 남았습니다');
  // 200일을 보내면 늦은 120일만(오름차순)
  const days = Array.from({ length: 200 }, (_, i) => new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10));
  const r = await rpc(db, alice, 'qm_put_study', { p_set_id: a1.id, p_data: rec({ days }), p_client_at: T1 });
  assert.equal(r.data.days.length, 120);
  assert.deepEqual(r.data.days, days.slice(80));
  await db.close();
});

test('공부 기록: 문제집을 지우면 기록도 지워짐(cascade), 다른 문제집 기록은 그대로', async () => {
  const { db, alice, a1, a2 } = await setup();
  await rpc(db, alice, 'qm_put_study', { p_set_id: a1.id, p_data: rec(), p_client_at: T1 });
  await rpc(db, alice, 'qm_put_study', { p_set_id: a2.id, p_data: rec(), p_client_at: T1 });
  await rpc(db, alice, 'qm_delete_set', { p_set_id: a1.id });
  assert.deepEqual((await rpc(db, alice, 'qm_list_study')).map((x) => x.setId), [a2.id]);
  const [{ c }] = await sql(db, OWNER, 'select count(*)::int as c from public.study_states where set_id = $1', [a1.id]);
  assert.equal(c, 0);
  await db.close();
});

test('공부 기록: p_since 뒤에 서버에서 바뀐 줄만(받기 커서), 진 올리기도 줄을 바꾼 것으로 셈', async () => {
  const { db, alice, a1, a2 } = await setup();
  const r1 = await rpc(db, alice, 'qm_put_study', { p_set_id: a1.id, p_data: rec(), p_client_at: T2 });
  await sleep(5);
  const r2 = await rpc(db, alice, 'qm_put_study', { p_set_id: a2.id, p_data: rec(), p_client_at: T1 });
  assert.ok(r2.updatedAt > r1.updatedAt);
  assert.deepEqual((await rpc(db, alice, 'qm_list_study', { p_since: r1.updatedAt })).map((x) => x.setId), [a2.id]);
  assert.deepEqual((await rpc(db, alice, 'qm_list_study', { p_since: r2.updatedAt })), []);
  assert.equal((await rpc(db, alice, 'qm_list_study', { p_since: null })).length, 2);
  // 옛 시각 올리기(내용은 짐)여도 days·at 이 바뀌었을 수 있으니 updated_at 이 오른다
  await sleep(5);
  const r3 = await rpc(db, alice, 'qm_put_study', { p_set_id: a1.id, p_data: rec({ days: ['2026-10-01'] }), p_client_at: T1 });
  assert.equal(r3.clientAt, T2);
  assert.ok(r3.updatedAt > r2.updatedAt);
  assert.deepEqual((await rpc(db, alice, 'qm_list_study', { p_since: r2.updatedAt })).map((x) => x.setId), [a1.id]);
  await db.close();
});

test('공부 기록: 관리자(계정 준비로 만든 사용자)도 같은 길, 비우기(qm_import_reset)는 문제집과 함께 지움', async () => {
  const db = await createDb();
  const admin = await bootstrapAdmin(db);
  const s = await rpc(db, admin, 'qm_create_set', { p_title: '관리자' });
  await rpc(db, admin, 'qm_put_study', { p_set_id: s.id, p_data: rec(), p_client_at: T1 });
  // 공부 기록 쓰기는 '사용자 쓰기 기록'을 남기지 않는다(비우기 안전장치는 세 표만 봄) — 문제집 만들기가 이미 남겼으므로 discard
  const [st] = await sql(db, OWNER, 'select last_user_write_at from public.qm_settings');
  assert.ok(st.last_user_write_at, '문제집 만들기가 쓰기 기록을 남겨야 합니다');
  await rpc(db, admin, 'qm_import_reset', { p_discard_changes: true });
  assert.equal((await sql(db, OWNER, 'select count(*)::int as c from public.study_states'))[0].c, 0);
  // 비운 뒤 공부 기록만 올려도(문제집이 없으니 올릴 수도 없지만) 쓰기 기록은 그대로 비어 있다
  const s2 = await sql(db, OWNER, "insert into public.question_sets (user_id, title) values ($1, 'x') returning id", [admin.sub]);
  await rpc(db, admin, 'qm_put_study', { p_set_id: Number(s2[0].id), p_data: rec(), p_client_at: T1 });
  assert.equal((await sql(db, OWNER, 'select last_user_write_at from public.qm_settings'))[0].last_user_write_at, null);
  await db.close();
});
