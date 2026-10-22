// 공부 기록(src/utils/studyState.js) 시험 — localStorage·시계·타이머·서버를 흉내 내어 함수만 부른다.
// 서버 흉내(fakeServer)는 supabase/migrations/20261023000600_qm_study.sql 의 qm_put_study 규칙과 같게 합친다
// (내용은 client_at 이 같거나 늦으면 새것, days 합집합, at 늦은 쪽, 미래 시각은 서버 시각으로).
// 실행: npm run test:app
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.m = new Map(); this.full = false; }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { if (this.full) throw new Error('QuotaExceededError'); this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
globalThis.localStorage = new MemoryStorage();
const {
  loadStudy, saveStudy, clearStudy, lastStudiedMap, studyDaysMap, studyDay, normDays, mergeRecords, remoteRecord,
  exportStudy, configureStudySync, pullStudy, flushStudy, syncStudy, freshStudyBeforeOpen, WEAK_CT,
} = await import('../../src/utils/studyState.js');
const { initialSolveState, studySnapshot } = await import('../../src/utils/solveStudy.js');

const settle = () => new Promise((r) => setImmediate(r));
const T0 = Date.parse('2026-10-22T01:00:00.000Z'); // 서울 10/22 10시
const iso = (ms) => new Date(ms).toISOString();

// 손으로 돌리는 시계·타이머
function fakeClock(start = T0) {
  let now = start;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimer: (f, ms) => { const id = ++seq; timers.set(id, { at: now + Math.max(0, ms), f }); return id; },
    clearTimer: (id) => { timers.delete(id); },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].f();
        await settle();
      }
      now = end;
      await settle();
    },
  };
}

// 서버 흉내(qm_put_study·qm_list_study 와 같은 규칙)
function fakeServer(clock) {
  const rows = new Map();
  const calls = [];
  let tick = 0;
  const laterAt = (a, b) => (!a ? b ?? null : !b ? a : (b > a ? b : a));
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const s = {
    rows, calls, failWith: null, listDelay: 0,
    api: {
      async list(since) {
        calls.push({ fn: 'list', since });
        if (s.failWith) throw s.failWith;
        const out = [...rows.values()].filter((r) => !since || r.updatedAt > since).map(clone); // 요청이 닿은 때의 서버
        if (s.listDelay) await new Promise((r) => clock.setTimer(r, s.listDelay)); // 느린 연결: 응답이 늦게 옴
        return out;
      },
      async put(setId, data, clientAt, opts = {}) {
        calls.push({ fn: 'put', setId, data: clone(data), clientAt, keepalive: !!opts.keepalive });
        if (s.failWith) throw s.failWith;
        const at = Math.min(Date.parse(clientAt), clock.now());
        const cur = rows.get(setId);
        const wins = !cur || at >= Date.parse(cur.clientAt);
        const row = {
          setId,
          data: { ...(wins ? data : cur.data), days: normDays([...(cur?.data.days || []), ...(data.days || [])]), at: laterAt(cur?.data.at, data.at) },
          clientAt: iso(cur ? Math.max(Date.parse(cur.clientAt), at) : at),
          updatedAt: iso(clock.now() + ++tick),
        };
        rows.set(setId, row);
        return clone(row);
      },
    },
  };
  return s;
}

const puts = (srv) => srv.calls.filter((c) => c.fn === 'put');

// 기기 하나 = 저장소 하나 + 시계(나누어 씀) + 서버(나누어 씀). 이 기기에서 하는 일은 on() 안에서(저장소를 바꿔 끼움)
function device(clock, srv, { username = 'magicwonds' } = {}) {
  const storage = new MemoryStorage();
  storage.setItem('username', username);
  const d = {
    storage, username, hidden: false,
    async on(fn) {
      globalThis.localStorage = storage;
      configureStudySync({
        api: srv.api, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
        hidden: () => d.hidden, signedIn: (u) => storage.getItem('username') === u,
      });
      const r = await fn();
      await settle();
      return r;
    },
  };
  return d;
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
  configureStudySync({ api: null });
});

// ── 저장·읽기(기기 안) ──

test('저장한 기록을 그대로 읽고, v·at·ct·days 를 붙인다', () => {
  saveStudy('magicwonds', 11, { qid: 101, revealed: [0, 3] });
  const s = loadStudy('magicwonds', 11);
  assert.deepEqual(s.revealed, [0, 3]);
  assert.equal(s.qid, 101);
  assert.equal(s.v, 1);
  assert.ok(!Number.isNaN(Date.parse(s.at)));
  assert.equal(s.ct, s.at);
  assert.deepEqual(s.days, [studyDay(Date.parse(s.at))]);
  assert.equal(s.dirty, 1);
});

test('계정·문제집마다 따로. 처음부터(clearStudy)는 내용만 비우고 마지막 본 때·공부한 날은 남긴다', () => {
  saveStudy('a', 1, { x: 1 });
  saveStudy('b', 1, { x: 2 });
  saveStudy('a', 2, { x: 3 });
  assert.equal(loadStudy('a', 1).x, 1);
  assert.equal(loadStudy('b', 1).x, 2);
  assert.deepEqual(Object.keys(lastStudiedMap('a')).sort(), ['1', '2']);
  const before = loadStudy('a', 1);
  clearStudy('a', 1);
  const after = loadStudy('a', 1);
  assert.equal(after.x, undefined);
  assert.deepEqual([after.at, after.days], [before.at, before.days]);
  assert.equal(after.dirty, 1);
  assert.deepEqual(Object.keys(lastStudiedMap('a')).sort(), ['1', '2']);
  clearStudy('a', 99); // 없는 기록은 만들지 않음
  assert.equal(loadStudy('a', 99), null);
});

test('깨진 값·다른 판·setId 없음은 null, 저장 실패는 조용히 넘어감', () => {
  localStorage.setItem('qm:study:a:5', '{oops');
  localStorage.setItem('qm:study:a:6', JSON.stringify({ v: 99, at: '2026-10-22T00:00:00Z' }));
  assert.equal(loadStudy('a', 5), null);
  assert.equal(loadStudy('a', 6), null);
  assert.equal(loadStudy('a', null), null);
  assert.deepEqual(lastStudiedMap('a'), {});
  localStorage.full = true;
  assert.doesNotThrow(() => saveStudy('a', 7, { x: 1 }));
  assert.equal(loadStudy('a', 7), null);
});

test('기록이 너무 많으면 오래 안 본 것부터 지운다(300개 유지)', () => {
  for (let i = 0; i < 305; i++) {
    localStorage.setItem(`qm:study:a:${i}`, JSON.stringify({ v: 1, at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString() }));
  }
  saveStudy('a', 'new', { x: 1 });
  const ids = Object.keys(lastStudiedMap('a'));
  assert.equal(ids.length, 300);
  assert.ok(ids.includes('new'));
  assert.ok(!ids.includes('0') && !ids.includes('5'));
  assert.ok(ids.includes('6'));
});

test('studyDay: 서울 날짜(기기 시간대와 무관), 자정 언저리', () => {
  assert.equal(studyDay(Date.parse('2026-10-22T14:59:59Z')), '2026-10-22');
  assert.equal(studyDay(Date.parse('2026-10-22T15:00:00Z')), '2026-10-23'); // 서울 자정
  assert.equal(studyDay(new Date('2026-12-31T16:00:00Z')), '2027-01-01');
});

test('days: 저장할 때마다 오늘을 더하고(겹침 없이), 나누기 전 기록은 마지막 본 날을 이어받고, 최근 120일만', async () => {
  const clock = fakeClock(Date.parse('2026-10-20T03:00:00Z'));
  configureStudySync({ api: null, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  // 나누기 전(1차) 기록: ct·days 없음
  localStorage.setItem('qm:study:u:11', JSON.stringify({ v: 1, at: '2026-10-18T03:00:00.000Z', mode: 'ordered', ids: ['1'] }));
  assert.deepEqual(studyDaysMap('u'), { 11: ['2026-10-18'] });
  saveStudy('u', 11, { mode: 'ordered', ids: ['1'] });
  await clock.advance(86400000);
  saveStudy('u', 11, { mode: 'ordered', ids: ['1'] });
  saveStudy('u', 11, { mode: 'ordered', ids: ['1'] });
  assert.deepEqual(loadStudy('u', 11).days, ['2026-10-18', '2026-10-20', '2026-10-21']);
  // 120일 한도
  const many = Array.from({ length: 130 }, (_, i) => iso(Date.UTC(2026, 0, 1) + i * 86400000).slice(0, 10));
  assert.equal(normDays([...many, 'x', 3, '2026-1-1']).length, 120);
  assert.equal(normDays(many)[0], many[10]);
});

test('ct: 내용이 그대로인 저장은 ct 를 두고 at 만 올리고, 내용이 바뀌면 ct 도 지금', async () => {
  const clock = fakeClock();
  configureStudySync({ api: null, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  saveStudy('u', 11, { mode: 'ordered', ids: ['1'], cur: '1', q: { 1: { r: [0] } } });
  const first = loadStudy('u', 11);
  await clock.advance(60000);
  // 풀기 화면은 이어 볼 때 loadStudy 값을 그대로 다시 저장한다(at·ct·days 등이 섞여 있음 — 내용만 견줌)
  saveStudy('u', 11, loadStudy('u', 11));
  const same = loadStudy('u', 11);
  assert.equal(same.ct, first.ct);
  assert.equal(same.at, iso(T0 + 60000));
  await clock.advance(60000);
  saveStudy('u', 11, { q: { 1: { r: [0, 1] } }, cur: '1', ids: ['1'], mode: 'ordered' }); // 칸 순서는 상관없음
  assert.equal(loadStudy('u', 11).ct, iso(T0 + 120000));
});

// ── 합치기(순수) ──

const blob = (r, extra = {}) => ({ mode: 'ordered', ids: ['101'], cur: '101', q: { 101: { h: 'h', r, a: null } }, ...extra });
// 같은 진도에서 읽던 자리만 다른 값(스크롤)
const place = (r, f) => ({ mode: 'ordered', ids: ['101'], cur: '101', q: { 101: { h: 'h', r, a: { f } } } });
const rec = (r, { at, ct = at, days = [], ...rest } = {}) => ({ ...blob(r), v: 1, at, ct, days, ...rest });

test('mergeRecords: 늦게 고친 쪽 내용·days 합집합·at 늦은 쪽·dirty(서버에 없는 것이 남았는지)', () => {
  const t1 = iso(T0), t2 = iso(T0 + 1000), t3 = iso(T0 + 2000);
  // 서버가 새것: 서버 내용, 이 기기만 아는 날이 있으니 dirty
  let m = mergeRecords(rec([0], { at: t1, days: ['2026-10-20'], bh: 'x' }), rec([0, 1], { at: t2, days: ['2026-10-21'] }));
  assert.deepEqual(m.q[101].r, [0, 1]);
  assert.deepEqual(m.days, ['2026-10-20', '2026-10-21']);
  assert.equal(m.at, t2);
  assert.equal(m.ct, t2);
  assert.equal(m.dirty, 1);
  assert.equal(m.bh, 'x', '이 기기 풀기 화면의 지문은 그대로');
  // 이 기기가 새것: 이 기기 내용, dirty
  m = mergeRecords(rec([0, 1, 2], { at: t3 }), rec([0], { at: t1 }));
  assert.deepEqual([m.q[101].r, m.ct, m.at, m.dirty], [[0, 1, 2], t3, t3, 1]);
  // 같은 시각이면 서버
  m = mergeRecords(rec([9], { at: t2 }), rec([0], { at: t2 }));
  assert.deepEqual(m.q[101].r, [0]);
  // 내용이 같으면 서버 ct 를 따르고(서버가 줄인 시각), 다를 것이 없으면 dirty 0
  m = mergeRecords(rec([1], { at: t2, ct: t3, days: ['2026-10-22'] }), rec([1], { at: t2, ct: t1, days: ['2026-10-22'] }));
  assert.deepEqual([m.ct, m.dirty], [t1, 0]);
  // 이 기기에 늦은 at 만 있어도 다시 올림
  m = mergeRecords(rec([1], { at: t3, ct: t1 }), rec([1], { at: t2, ct: t1 }));
  assert.deepEqual([m.at, m.dirty], [t3, 1]);
  // 이 기기 기록이 없으면 서버 그대로(dirty 0), 서버가 없으면 이 기기 그대로
  m = mergeRecords(null, rec([4], { at: t1, days: ['2026-10-01'] }));
  assert.deepEqual([m.q[101].r, m.dirty, m.days], [[4], 0, ['2026-10-01']]);
  const local = rec([5], { at: t1 });
  assert.equal(mergeRecords(local, null), local);
});

test('remoteRecord: 서버 줄 → 기록 꼴, 망가진 줄은 null', () => {
  const r = remoteRecord({ setId: 11, data: { ...blob([1]), v: 1, at: 'x', days: ['2026-10-01', 'bad'] }, clientAt: iso(T0) });
  assert.deepEqual([r.at, r.ct, r.days, r.q[101].r], [null, iso(T0), ['2026-10-01'], [1]]);
  assert.equal(remoteRecord(null), null);
  assert.equal(remoteRecord({ setId: 1, data: [1] }), null);
  assert.equal(remoteRecord({ setId: 1 }), null);
});

// ── 나누기(시계·서버 흉내) ──

test('로그인하지 않았으면(이 기기 username 이 다름) 올리기·받기 요청을 하나도 보내지 않는다', async () => {
  const clock = fakeClock();
  const srv = fakeServer(clock);
  const a = device(clock, srv);
  await a.on(async () => {
    localStorage.removeItem('username'); // 로그아웃(App 의 clearSession)
    saveStudy('magicwonds', 11, blob([0]));
    await flushStudy('magicwonds');
    await pullStudy('magicwonds', { force: true });
    await syncStudy('magicwonds');
    await freshStudyBeforeOpen('magicwonds');
    clearStudy('magicwonds', 11);
    await clock.advance(120000);
  });
  assert.deepEqual(srv.calls, []);
  // 다시 로그인하면 모아 둔 것을 올린다
  await a.on(async () => {
    localStorage.setItem('username', 'magicwonds');
    await flushStudy('magicwonds');
  });
  assert.equal(puts(srv).length, 1);
});

test('올리기: 첫 저장은 바로, 읽던 자리만 바뀐 저장(스크롤)은 문제집마다 15초에 한 번(모아서), 서버 줄을 받아 깨끗해짐', async () => {
  const clock = fakeClock();
  const srv = fakeServer(clock);
  const a = device(clock, srv);
  await a.on(async () => {
    saveStudy('magicwonds', 11, blob([0]));
    await clock.advance(0);
    assert.equal(puts(srv).length, 1);
    assert.equal(loadStudy('magicwonds', 11).dirty, 0);
    for (let i = 1; i <= 5; i++) { await clock.advance(1000); saveStudy('magicwonds', 11, place([0], i / 10)); }
    assert.equal(puts(srv).length, 1, '15초 안에 또 올렸습니다');
    await clock.advance(9000);
    assert.equal(puts(srv).length, 1);
    await clock.advance(1000);
    assert.equal(puts(srv).length, 2);
    assert.deepEqual(puts(srv)[1].data.q[101].a, { f: 0.5 }, '마지막 상태를 올려야 합니다');
    // 다른 문제집은 따로 센다
    saveStudy('magicwonds', 12, blob([7]));
    await clock.advance(0);
    assert.equal(puts(srv).length, 3);
    // 숫자가 아닌 열쇠(서버 문제집이 아님)는 올리지 않는다
    saveStudy('magicwonds', 'local-x', blob([1]));
    await clock.advance(60000);
    assert.ok(puts(srv).every((c) => typeof c.setId === 'number'));
  });
  // 서버 줄 꼴: 내용 + v·at·days, client_at 은 ct
  const last = puts(srv).at(-1);
  assert.deepEqual(Object.keys(last.data).sort(), ['at', 'cur', 'days', 'ids', 'mode', 'q', 'v']);
});

test('앱이 가려지면(풀기 화면의 마지막 저장) 간격을 기다리지 않고 keepalive 로 바로 올린다', async () => {
  const clock = fakeClock();
  const srv = fakeServer(clock);
  const a = device(clock, srv);
  await a.on(async () => {
    saveStudy('magicwonds', 11, blob([0]));
    await clock.advance(1000);
    saveStudy('magicwonds', 11, blob([0, 1]));
    a.hidden = true;
    saveStudy('magicwonds', 11, blob([0, 1, 2]));
    await clock.advance(0);
  });
  const p = puts(srv);
  assert.equal(p.length, 2);
  assert.deepEqual([p[1].keepalive, p[1].data.q[101].r], [true, [0, 1, 2]]);
});

test('올리는 동안 또 저장하면 끝난 뒤 간격을 지켜 한 번 더(빠뜨리지 않음)', async () => {
  const clock = fakeClock();
  const srv = fakeServer(clock);
  let release;
  const slowPut = srv.api.put;
  srv.api.put = (...args) => { const p = slowPut(...args); return new Promise((r) => { release = () => r(p); }); };
  const a = device(clock, srv);
  await a.on(async () => {
    saveStudy('magicwonds', 11, blob([0]));
    await clock.advance(0);
    saveStudy('magicwonds', 11, blob([0, 1])); // 올리는 중
    release();
    await settle();
    srv.api.put = slowPut;
    await clock.advance(15000);
  });
  assert.deepEqual(puts(srv).map((c) => c.data.q[101].r), [[0], [0, 1]]);
  assert.deepEqual(srv.rows.get(11).data.q[101].r, [0, 1]);
});

test('실패: 연결 끊김은 60초 쉬었다 모아서 다시, 없는 문제집(400)은 그 기록만 그만, 함수 없음은 이 페이지에서 그만', async () => {
  const clock = fakeClock();
  const srv = fakeServer(clock);
  const a = device(clock, srv);
  await a.on(async () => {
    srv.failWith = Object.assign(new Error('서버에 연결하지 못했습니다.'), { offline: true, status: 0 });
    saveStudy('magicwonds', 11, blob([0]));
    await clock.advance(0);
    assert.equal(puts(srv).length, 1);
    saveStudy('magicwonds', 11, blob([0, 1]));
    await clock.advance(30000);
    assert.equal(puts(srv).length, 1, '쉬는 동안 또 보냈습니다');
    srv.failWith = null;
    await clock.advance(30000);
    assert.equal(puts(srv).length, 2);
    assert.equal(loadStudy('magicwonds', 11).dirty, 0);

    srv.failWith = Object.assign(new Error('존재하지 않는 세트입니다.'), { status: 400, code: 'QM404' });
    saveStudy('magicwonds', 12, blob([1]));
    await clock.advance(0);
    assert.equal(loadStudy('magicwonds', 12).dirty, 0, '다시 해도 소용없는 기록을 계속 올리려 합니다');
    const n = puts(srv).length;
    await clock.advance(120000);
    await flushStudy('magicwonds');
    assert.equal(puts(srv).length, n);

    srv.failWith = Object.assign(new Error('서버가 아직 준비되지 않았습니다.'), { status: 404, code: 'PGRST202', notReady: true });
    saveStudy('magicwonds', 13, blob([1]));
    await clock.advance(0);
    const m = srv.calls.length;
    srv.failWith = null;
    saveStudy('magicwonds', 13, blob([1, 2]));
    await flushStudy('magicwonds');
    await pullStudy('magicwonds', { force: true });
    await clock.advance(120000);
    assert.equal(srv.calls.length, m, '함수가 없는데 계속 부릅니다');
  });
});

test('연결이 돌아와 한 번 닿으면 쉬기를 끝낸다(다음 저장은 기다리지 않고 올림)', async () => {
  const clock = fakeClock();
  const srv = fakeServer(clock);
  const a = device(clock, srv);
  await a.on(async () => {
    srv.failWith = Object.assign(new Error('끊김'), { offline: true, status: 0 });
    saveStudy('magicwonds', 11, blob([0]));
    await clock.advance(0);
    srv.failWith = null;
    await pullStudy('magicwonds', { force: true }); // 닿음 → 쉬기 끝, 모아 둔 11 도 올림
    await settle();
    saveStudy('magicwonds', 12, blob([1]));
    await clock.advance(0);
  });
  assert.deepEqual(puts(srv).map((c) => c.setId), [11, 11, 12]);
});

test('받기: 합친 수를 알리고, 5초 간격(force 는 건너뜀), 다음 받기는 커서(마지막 updatedAt − 2분) 뒤만, 받은 뒤 이 기기 새것은 올림', async () => {
  const clock = fakeClock();
  const srv = fakeServer(clock);
  // 서버에 다른 기기가 올린 두 줄
  await srv.api.put(11, { ...blob([0, 1]), v: 1, at: iso(T0 - 5000), days: ['2026-10-21'] }, iso(T0 - 5000));
  await srv.api.put(12, { ...blob([3]), v: 1, at: iso(T0 - 4000), days: ['2026-10-22'] }, iso(T0 - 4000));
  const row12 = srv.rows.get(12);
  srv.calls.length = 0;
  const b = device(clock, srv);
  await b.on(async () => {
    // 이 기기: 나누기 전 기록 하나(서버에 없음)
    localStorage.setItem('qm:study:magicwonds:13', JSON.stringify({ v: 1, at: iso(T0 - 86400000), ...blob([2]) }));
    const r = await pullStudy('magicwonds');
    assert.equal(r.changed, 2);
    assert.deepEqual(loadStudy('magicwonds', 11).q[101].r, [0, 1]);
    assert.deepEqual(studyDaysMap('magicwonds'), { 11: ['2026-10-21'], 12: ['2026-10-22'], 13: ['2026-10-21'] });
    await settle();
    // 받은 뒤 나누기 전 기록을 올림(ct 는 그때의 at)
    assert.deepEqual(puts(srv).map((c) => [c.setId, c.clientAt]), [[13, iso(T0 - 86400000)]]);
    assert.equal(loadStudy('magicwonds', 13).dirty, 0);
    assert.equal((await pullStudy('magicwonds')).skipped, true);
    await clock.advance(5000);
    await pullStudy('magicwonds');
    await pullStudy('magicwonds', { force: true });
  });
  const lists = srv.calls.filter((c) => c.fn === 'list');
  assert.equal(lists.length, 3);
  assert.equal(lists[0].since, null);
  assert.equal(lists[1].since, iso(Date.parse(row12.updatedAt) - 120000));
  assert.ok(lists[2].since > lists[1].since, '커서가 나아가지 않았습니다');
});

test('freshStudyBeforeOpen: 받는 중이면 끝날 때까지(최대 waitMs), 오래된 받기면 새로 받고, 막 받았으면 기다리지 않음', async () => {
  const clock = fakeClock();
  const srv = fakeServer(clock);
  let release = null;
  const list = srv.api.list;
  srv.api.list = (...args) => { const p = list(...args); return new Promise((r) => { release = () => r(p); }); };
  const a = device(clock, srv);
  await a.on(async () => {
    let opened = false;
    const p1 = pullStudy('magicwonds');
    freshStudyBeforeOpen('magicwonds', { waitMs: 1500 }).then(() => { opened = true; });
    await clock.advance(1000);
    assert.equal(opened, false);
    release();
    await p1;
    await settle();
    assert.equal(opened, true);
    // 막 받았으면 요청 없이 바로
    const n = srv.calls.length;
    await freshStudyBeforeOpen('magicwonds', { maxAgeMs: 60000 });
    assert.equal(srv.calls.length, n);
    // 느린 받기는 waitMs 에서 놓아 준다
    await clock.advance(61000);
    opened = false;
    freshStudyBeforeOpen('magicwonds', { maxAgeMs: 60000, waitMs: 1500 }).then(() => { opened = true; });
    await settle();
    assert.equal(srv.calls.length, n + 1);
    await clock.advance(1500);
    assert.equal(opened, true);
    release();
  });
});

// ── 두 기기(휴대폰·태블릿) ──

test('두 기기: 태블릿에서 공부 → 휴대폰이 받아 같은 곳부터, 휴대폰의 옛 풀기 화면을 떠나는 저장은 새 기록을 덮지 않음', async () => {
  const clock = fakeClock();
  const srv = fakeServer(clock);
  const tab = device(clock, srv);
  const phone = device(clock, srv);
  // 어제 휴대폰에서 연 빈칸 1개(서버에도 올라감), 휴대폰 풀기 화면은 그 상태로 열려 있음
  await phone.on(async () => {
    saveStudy('magicwonds', 11, blob([0]));
    await clock.advance(0);
  });
  await clock.advance(3600000);
  // 오늘 태블릿: 받고 이어서 빈칸 3개까지
  await tab.on(async () => {
    await syncStudy('magicwonds');
    assert.deepEqual(loadStudy('magicwonds', 11).q[101].r, [0]);
    saveStudy('magicwonds', 11, loadStudy('magicwonds', 11)); // 열 때 그대로 다시 저장
    await clock.advance(20000);
    saveStudy('magicwonds', 11, blob([0, 1, 2]));
    tab.hidden = true;
    saveStudy('magicwonds', 11, blob([0, 1, 2], { cur: '101' })); // 가려질 때 마지막 저장
    await clock.advance(0);
  });
  assert.deepEqual(srv.rows.get(11).data.q[101].r, [0, 1, 2]);
  await clock.advance(60000);
  await phone.on(async () => {
    // 휴대폰: 옛 풀기 화면이 떠 있는 채로 가려짐 → 마지막 저장(옛 내용)이 올라가도 내용은 짐
    phone.hidden = true;
    saveStudy('magicwonds', 11, blob([0]));
    await clock.advance(0);
    assert.deepEqual(srv.rows.get(11).data.q[101].r, [0, 1, 2], '옛 풀기 화면의 저장이 태블릿 기록을 덮었습니다');
    assert.deepEqual(loadStudy('magicwonds', 11).q[101].r, [0, 1, 2], '휴대폰 사본이 서버 내용을 받지 않았습니다');
    // 다시 보이고 '← 목록으로'(떠날 때 저장 — 여전히 옛 화면 상태) → 덮지 않음
    phone.hidden = false;
    saveStudy('magicwonds', 11, blob([0]));
    assert.deepEqual(loadStudy('magicwonds', 11).q[101].r, [0, 1, 2]);
    await syncStudy('magicwonds');
    // 대시보드: 마지막 공부는 지금, 문제집을 다시 열면 태블릿에서 읽던 곳부터
    assert.equal(lastStudiedMap('magicwonds')[11], iso(clock.now()));
    const opened = loadStudy('magicwonds', 11);
    assert.deepEqual(opened.q[101].r, [0, 1, 2]);
    saveStudy('magicwonds', 11, opened);
    saveStudy('magicwonds', 11, blob([0, 1, 2, 3])); // 이제 휴대폰에서 이어 공부
    await clock.advance(20000);
  });
  assert.deepEqual(srv.rows.get(11).data.q[101].r, [0, 1, 2, 3]);
  // 두 기기의 공부한 날이 서버에 모두
  assert.ok(srv.rows.get(11).data.days.includes(studyDay(T0)));
});

test('두 기기: 둘 다 고치면 나중에 고친 쪽이 이기고(늦게 도착해도), 진 쪽은 이긴 내용을 받는다', async () => {
  const clock = fakeClock();
  const srv = fakeServer(clock);
  const a = device(clock, srv);
  const b = device(clock, srv);
  // 둘 다 연결이 끊긴 채 공부: a 가 먼저(10:00), b 가 나중(10:05)
  srv.failWith = Object.assign(new Error('끊김'), { offline: true, status: 0 });
  await a.on(async () => { saveStudy('magicwonds', 11, blob([0, 1])); await clock.advance(0); });
  await clock.advance(300000);
  await b.on(async () => { saveStudy('magicwonds', 11, blob([5])); await clock.advance(0); });
  srv.failWith = null;
  // b 가 먼저 다시 연결되어 올리고, a 는 늦게 올린다 — 그래도 b(나중에 고친 쪽)가 이김
  await b.on(() => flushStudy('magicwonds'));
  await a.on(() => flushStudy('magicwonds'));
  assert.deepEqual(srv.rows.get(11).data.q[101].r, [5]);
  await a.on(async () => {
    assert.deepEqual(loadStudy('magicwonds', 11).q[101].r, [5], '진 기기가 이긴 내용을 받지 않았습니다');
  });
});

test('두 기기: 시계가 앞선 기기의 기록도 서버 시각으로 줄어(되올리기 없이), 그 뒤 다른 기기에서 고친 것이 이긴다', async () => {
  const clock = fakeClock();
  const srv = fakeServer(clock);
  const fast = device(clock, srv);
  const ok = device(clock, srv);
  const skew = 3600000;
  await fast.on(async () => {
    configureStudySync({
      api: srv.api, now: () => clock.now() + skew, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
      hidden: () => false, signedIn: () => true,
    });
    saveStudy('magicwonds', 11, blob([9]));
    await clock.advance(0);
    assert.equal(loadStudy('magicwonds', 11).ct, iso(clock.now()), '서버가 줄인 시각을 받아들이지 않았습니다');
    assert.equal(loadStudy('magicwonds', 11).dirty, 0);
    await clock.advance(60000);
    assert.equal(puts(srv).length, 1, '줄인 시각 때문에 되올리기가 돕니다');
  });
  await ok.on(async () => { saveStudy('magicwonds', 11, blob([1])); await clock.advance(0); });
  assert.deepEqual(srv.rows.get(11).data.q[101].r, [1]);
});

test('exportStudy: 서버에 올리는 꼴 + ct(이 기기에만 쓰는 칸은 빼고)', () => {
  saveStudy('u', 11, blob([1]));
  const e = exportStudy('u');
  assert.equal(e.version, 1);
  assert.deepEqual(Object.keys(e.records[11]).sort(), ['at', 'ct', 'cur', 'days', 'ids', 'mode', 'q', 'v']);
  assert.deepEqual(exportStudy('nobody'), { version: 1, records: {} });
});

// ── 진도 없는 저장·늦은 받기·빠른 올리기(감사 뒤 고침) ──

// 노션 페이지 빈칸 문항(빈칸 40개)
const PAGE_Q = {
  id: 101, type: 'fill',
  text: Array.from({ length: 40 }, (_, i) => `■ 제목 ${i}\n문장 ___ 입니다.`).join('\n'),
  answers: Array.from({ length: 40 }, (_, i) => `답${i}`),
};
const QS = [PAGE_Q];
const range = (n, from = 0) => Array.from({ length: n }, (_, i) => from + i);
const revealedOf = (rec) => rec?.q?.[101]?.r ?? null;

// 풀기 화면(SolveView.jsx) 흉내 — 같은 순서: 문항 받기와 공부 기록 받기를 함께 기다림(받기는 최대 waitMs) →
// loadStudy → initialSolveState → 열 때 저장(open) → 0.5초 뒤 지금 상태 저장. persist() 는 그 화면의 저장(스크롤·빈칸 열기 뒤)
async function openSolve(clock, { questionsMs = 300, waitMs = 1500, setId = 11 } = {}) {
  let ready = false;
  const questions = new Promise((r) => clock.setTimer(r, questionsMs));
  Promise.all([questions, freshStudyBeforeOpen('magicwonds', { waitMs })]).then(() => { ready = true; });
  for (let i = 0; i < 200 && !ready; i++) await clock.advance(50);
  assert.ok(ready, '풀기 화면이 열리지 않았습니다');
  const saved = loadStudy('magicwonds', setId);
  const init = initialSolveState(saved, QS);
  saveStudy('magicwonds', setId, init.resumed ? saved : { ids: ['101'] }, { open: true });
  const view = { revealed: [...init.revealed], anchor: init.anchor };
  const persist = () => saveStudy('magicwonds', setId, studySnapshot({
    base: QS, questions: init.questions, mode: init.mode, index: init.index, results: init.results,
    revealed: view.revealed, anchor: view.anchor,
  }));
  await clock.advance(500);
  persist();
  return { init, view, persist, shown: () => view.revealed.flatMap((v, i) => (v ? [i] : [])) };
}

test('두 기기: 받기가 늦어(1.5초 넘김) 사본 없이 연 휴대폰은 열기만 해서는(조금 내려 보아도) 태블릿의 진도를 지우지 않고, 다시 열면 이어 본다', async () => {
  const clock = fakeClock();
  const srv = fakeServer(clock);
  const tab = device(clock, srv);
  const phone = device(clock, srv);
  await tab.on(async () => {
    const s = await openSolve(clock);
    range(10).forEach((i) => { s.view.revealed[i] = true; });
    s.view.anchor = { k: 'b', i: 9, d: 120, f: 0.3 };
    s.persist();
    await clock.advance(3000);
  });
  assert.deepEqual(revealedOf(srv.rows.get(11).data), range(10));
  const tabCt = srv.rows.get(11).clientAt;
  await clock.advance(60000);
  srv.listDelay = 3000; // 온실의 약한 LTE: 받기 응답이 3초
  await phone.on(async () => {
    const s = await openSolve(clock);
    assert.equal(s.init.resumed, false, '시험 전제: 받기가 늦어 사본 없이 열림');
    s.view.anchor = { f: 0.05 }; // 조금 내려 봄(빈칸은 열지 않음)
    s.persist();
    await clock.advance(20000); // 늦은 받기·올리기가 모두 끝나게
    srv.listDelay = 0;
    assert.deepEqual(revealedOf(loadStudy('magicwonds', 11)), range(10), '휴대폰 사본이 늦게 온 태블릿 진도를 받지 않았습니다');
    await clock.advance(2000);
    const again = await openSolve(clock);
    assert.equal(again.init.resumed, true, '다시 열어도 이어 보지 않습니다');
    assert.deepEqual(again.shown(), range(10));
    assert.deepEqual(again.init.anchor, { k: 'b', i: 9, d: 120, f: 0.3 });
  });
  const row = srv.rows.get(11);
  assert.deepEqual(revealedOf(row.data), range(10), '열기만 한 휴대폰이 서버의 태블릿 진도를 지웠습니다');
  assert.equal(row.clientAt, tabCt);
  assert.ok(row.data.at > iso(T0 + 60000), '휴대폰에서 본 때(마지막 공부)는 서버에 남아야 합니다');
  assert.ok(puts(srv).some((c) => c.clientAt === WEAK_CT), '사본 없이 연 기록은 WEAK_CT 로 올라가야 합니다');
  await tab.on(async () => {
    await pullStudy('magicwonds', { force: true });
    const s = await openSolve(clock);
    assert.equal(s.init.resumed, true);
    assert.deepEqual(s.shown(), range(10), '태블릿 사본의 진도가 지워졌습니다');
  });
});

test('두 기기: 대시보드가 보이자마자 받은 결과(그 뒤 태블릿이 가려지며 올림)로 2초 뒤 열어도, 열 때 다시 받아 이어 본다', async () => {
  const clock = fakeClock();
  const srv = fakeServer(clock);
  const phone = device(clock, srv);
  const tabletData = studySnapshot({ base: QS, questions: QS, mode: 'ordered', index: 0, results: {}, revealed: range(40).map(() => true), anchor: { f: 0.6 } });
  await phone.on(async () => {
    await pullStudy('magicwonds'); // 휴대폰 대시보드(서버는 아직 비어 있음)
    await clock.advance(400);
    await srv.api.put(11, { ...tabletData, v: 1, at: iso(clock.now()), days: [studyDay(clock.now())] }, iso(clock.now())); // 태블릿이 가려지며 올린 것이 이제 닿음
    await clock.advance(1600);
    const n = srv.calls.filter((c) => c.fn === 'list').length;
    const s = await openSolve(clock);
    assert.equal(srv.calls.filter((c) => c.fn === 'list').length, n + 1, '열 때 다시 받지 않았습니다(마지막 받기 2초 전)');
    assert.equal(s.init.resumed, true);
    assert.equal(s.shown().length, 40);
    await clock.advance(20000);
  });
  assert.equal(revealedOf(srv.rows.get(11).data).length, 40);
});

test('두 기기: 태블릿을 켜 둔 채(가려짐 없음) 빈칸을 더 열어도 2초 안에 올라가, 곧 휴대폰에서 열면 모두 이어 본다', async () => {
  const clock = fakeClock();
  const srv = fakeServer(clock);
  const tab = device(clock, srv);
  const phone = device(clock, srv);
  await tab.on(async () => {
    const s = await openSolve(clock);
    [0, 1, 2].forEach((i) => { s.view.revealed[i] = true; });
    s.persist(); // 첫 진도
    await clock.advance(3000);
    [3, 4, 5].forEach((i) => { s.view.revealed[i] = true; });
    s.persist(); // 화면은 켜진 채(wake lock) — 가려지지 않음
    await clock.advance(2100);
  });
  assert.deepEqual(revealedOf(srv.rows.get(11).data), range(6), '켜 둔 태블릿의 연 빈칸이 서버에 늦게 올라갑니다');
  await phone.on(async () => {
    const s = await openSolve(clock);
    assert.deepEqual(s.shown(), range(6));
  });
});

test('올리기: 진도가 바뀐 저장은 2초 간격(자리만 바뀐 저장의 15초 예약도 앞당김), 올리는 중에 바뀌면 끝난 뒤 2초, 자리만 바뀌면 다시 15초', async () => {
  const clock = fakeClock();
  const srv = fakeServer(clock);
  const a = device(clock, srv);
  let release = null;
  await a.on(async () => {
    saveStudy('magicwonds', 11, blob([0]));
    await clock.advance(0);
    assert.equal(puts(srv).length, 1);
    await clock.advance(1000);
    saveStudy('magicwonds', 11, place([0], 0.2)); // 자리만 → 15초 뒤로 예약
    await clock.advance(500);
    saveStudy('magicwonds', 11, place([0, 1], 0.2)); // 빈칸 열기 → 예약을 앞당김(첫 올리기 + 2초)
    await clock.advance(499);
    assert.equal(puts(srv).length, 1);
    // 다음 올리기는 늦게 끝나게
    const put = srv.api.put;
    srv.api.put = (...args) => { const p = put(...args); return new Promise((r) => { release = () => r(p); }); };
    await clock.advance(1);
    assert.equal(puts(srv).length, 2);
    assert.deepEqual(puts(srv)[1].data.q[101].r, [0, 1]);
    saveStudy('magicwonds', 11, place([0, 1, 2], 0.2)); // 올리는 중에 진도
    await clock.advance(1000);
    release();
    await settle();
    srv.api.put = put;
    await clock.advance(999);
    assert.equal(puts(srv).length, 2);
    await clock.advance(1);
    assert.equal(puts(srv).length, 3, '올리는 중에 바뀐 진도를 끝난 뒤 2초 간격으로 올리지 않았습니다');
    assert.deepEqual(puts(srv)[2].data.q[101].r, [0, 1, 2]);
    await clock.advance(1000);
    saveStudy('magicwonds', 11, place([0, 1, 2], 0.5)); // 자리만
    await clock.advance(13999);
    assert.equal(puts(srv).length, 3);
    await clock.advance(1);
    assert.equal(puts(srv).length, 4);
  });
});

test('saveStudy: 새 ct 는 진도를 바꿨을 때만 — 열 때 저장·모르는 진도 위의 진도 없는 저장은 내용을 두고, 진도 없는 기록끼리는 ct 를 그대로', async () => {
  const clock = fakeClock();
  configureStudySync({ api: null, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  const T = iso(T0 - 3600000);
  // 다른 기기에서 받은 진도(이 기기 풀기 화면은 본 적 없음 — bh 없음)
  localStorage.setItem('qm:study:u:11', JSON.stringify({ ...blob([0, 1]), v: 1, at: T, ct: T, days: ['2026-10-21'], dirty: 0 }));
  saveStudy('u', 11, { ids: ['101'] }, { open: true }); // 열 때(사본을 읽기 전에 화면이 정한 것)
  let r = loadStudy('u', 11);
  assert.deepEqual([r.q[101].r, r.ct, r.at, r.dirty], [[0, 1], T, iso(T0), 1]);
  assert.deepEqual(r.days, ['2026-10-21', '2026-10-22']);
  saveStudy('u', 11, place([], 0.3)); // 그 화면에서 조금 내려 봄
  r = loadStudy('u', 11);
  assert.deepEqual([r.q[101].r, r.q[101].a, r.ct], [[0, 1], null, T], '모르는 진도를 진도 없는 저장이 덮었습니다');
  // 처음 여는 문제집: 진도 없는 기록은 WEAK_CT, 진도 없는 저장끼리는 내용만 바뀌고 ct 그대로
  saveStudy('u', 12, { ids: ['101'] }, { open: true });
  assert.equal(loadStudy('u', 12).ct, WEAK_CT);
  await clock.advance(1000);
  saveStudy('u', 12, place([], 0.4));
  r = loadStudy('u', 12);
  assert.deepEqual([r.q[101].a, r.ct], [{ f: 0.4 }, WEAK_CT]);
  // 진도가 생기면 지금
  await clock.advance(1000);
  saveStudy('u', 12, place([3], 0.4));
  assert.equal(loadStudy('u', 12).ct, iso(T0 + 2000));
  // 이 화면이 보여 준 진도를 사용자가 비우면(끝냄·빈칸을 다 닫음) 새 내용 — 다른 기기도 처음부터
  await clock.advance(1000);
  saveStudy('u', 12, { ids: ['101'] });
  r = loadStudy('u', 12);
  assert.deepEqual([Object.keys(r).filter((k) => !['v', 'at', 'ct', 'days', 'dirty', 'bh'].includes(k)), r.ct], [['ids'], iso(T0 + 3000)]);
  // 이어 본 진도(열 때 그대로 저장 → 화면이 앎)를 비워도 새 내용
  saveStudy('u', 13, blob([5]));
  saveStudy('u', 13, loadStudy('u', 13), { open: true });
  await clock.advance(1000);
  saveStudy('u', 13, place([], 0.1));
  r = loadStudy('u', 13);
  assert.deepEqual([r.q[101].r, r.ct], [[], iso(T0 + 4000)]);
});

test('나누기 전(1차) 기록: 열기만 한 기록(진도 없음)은 WEAK_CT 로 올라가, 다른 기기에서 그 전에 공부한 진도를 덮지 않는다', async () => {
  const clock = fakeClock();
  const srv = fakeServer(clock);
  const tab = device(clock, srv);
  const phone = device(clock, srv);
  const am = iso(T0 - 86400000); // 어제 아침: 태블릿에서 공부
  const pm = iso(T0 - 40000000); // 어제 저녁: 휴대폰에서 열기만
  await tab.on(async () => { localStorage.setItem('qm:study:magicwonds:11', JSON.stringify({ v: 1, at: am, ...blob([0, 1, 2]) })); });
  await phone.on(async () => {
    localStorage.setItem('qm:study:magicwonds:11', JSON.stringify({ v: 1, at: pm, mode: 'ordered', ids: ['101'], cur: '101', q: { 101: { h: 'h', r: [], a: null } } }));
    await flushStudy('magicwonds'); // 휴대폰이 먼저 새 판으로 올림
  });
  assert.equal(puts(srv)[0].clientAt, WEAK_CT);
  await tab.on(() => flushStudy('magicwonds'));
  assert.equal(puts(srv)[1].clientAt, am);
  const row = srv.rows.get(11);
  assert.deepEqual(revealedOf(row.data), [0, 1, 2], '열기만 한 옛 기록이 공부한 옛 기록을 이겼습니다');
  assert.equal(row.data.at, pm, '마지막으로 본 때는 늦은 쪽');
  await phone.on(async () => {
    await pullStudy('magicwonds', { force: true });
    assert.deepEqual(revealedOf(loadStudy('magicwonds', 11)), [0, 1, 2]);
  });
});

test('mergeRecords: ct 가 같으면 서버 — 단 이 기기에 아직 올리지 않은(dirty) 것이면 이 기기(받기가 올리기보다 먼저 돌아도 방금 옮긴 자리를 지키게)', async () => {
  const local = { ...place([], 0.7), v: 1, at: iso(T0 + 5000), ct: WEAK_CT, days: [], dirty: 1 };
  const remote = { ...place([], 0.1), v: 1, at: iso(T0), ct: WEAK_CT, days: [] };
  assert.deepEqual(mergeRecords(local, remote).q[101].a, { f: 0.7 });
  assert.equal(mergeRecords(local, remote).dirty, 1);
  assert.deepEqual(mergeRecords({ ...local, dirty: 0 }, remote).q[101].a, { f: 0.1 });
  // 실제 흐름: 처음 연 문제집에서 내려 보다 목록으로 → 대시보드 받기(서버에는 열 때의 옛 기록)가 먼저 돌아도 자리를 지키고 올린다
  const clock = fakeClock();
  const srv = fakeServer(clock);
  const a = device(clock, srv);
  await a.on(async () => {
    const s = await openSolve(clock);
    await clock.advance(3000);
    s.view.anchor = { k: 'h', i: 7, d: 12, f: 0.4 };
    s.persist(); // 떠나며 저장(15초 예약)
    await syncStudy('magicwonds', { force: true }); // 대시보드: 받기 → 모아 둔 것 올리기
    await settle();
    assert.deepEqual(loadStudy('magicwonds', 11).q[101].a, { k: 'h', i: 7, d: 12, f: 0.4 }, '받기가 방금 옮긴 자리를 서버의 옛 자리로 되돌렸습니다');
  });
  assert.deepEqual(srv.rows.get(11).data.q[101].a, { k: 'h', i: 7, d: 12, f: 0.4 });
});

test('freshStudyBeforeOpen: 기본은 마지막 받기 시작 1초까지만 믿고, 연결이 끊겨 쉬는 중이면 요청 없이 바로 연다', async () => {
  const clock = fakeClock();
  const srv = fakeServer(clock);
  const a = device(clock, srv);
  await a.on(async () => {
    await pullStudy('magicwonds');
    await clock.advance(500);
    await freshStudyBeforeOpen('magicwonds');
    assert.equal(srv.calls.length, 1);
    await clock.advance(600);
    await freshStudyBeforeOpen('magicwonds');
    assert.equal(srv.calls.length, 2);
    // 연결 끊김 → 60초 쉼: 여는 동안 기다리지도 요청하지도 않음
    srv.failWith = Object.assign(new Error('끊김'), { offline: true, status: 0 });
    await clock.advance(2000);
    await freshStudyBeforeOpen('magicwonds');
    const n = srv.calls.length;
    await clock.advance(2000);
    let opened = false;
    freshStudyBeforeOpen('magicwonds').then(() => { opened = true; });
    await settle();
    assert.equal(opened, true, '쉬는 중인데 기다렸습니다');
    assert.equal(srv.calls.length, n, '쉬는 중인데 요청했습니다');
  });
});
