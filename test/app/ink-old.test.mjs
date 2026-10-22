// 예전 필기 흐리게 보기 시험(2차): 보관한 예전 필기 고르기(가장 최근), 보관소의 old·oldOn(읽기만 — 지금 필기·되돌리기·
// 저장과 섞이지 않음), 다른 폭이면 가장 가까운 폭(approx), 안내를 저절로 띄우는 기간.
// 실행: npm run test:app
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OLD_NOTICE_MS, createInkStore, hasOld, oldNoticeDue, oldRecord, oldStrokes, visibleStrokes,
} from '../../src/ink/inkStore.js';
import { archiveKeyOf, archiveValue, latestArchive, needsArchive } from '../../src/ink/inkRecord.js';
import { DEFAULT_TOOL } from '../../src/ink/inkMode.js';
import { packPoints } from '../../src/ink/geometry.js';

const settle = () => new Promise((r) => setImmediate(r));
const DAY = 24 * 60 * 60 * 1000;

// 가짜 저장소: inkDb 와 같은 보관 규칙(같은 함수), loadArchive 는 latestArchive 로 고른다
function fakeDb(initial = {}) {
  const map = new Map(Object.entries(initial));
  const saves = [];
  let archives = 0;
  return {
    map, saves,
    get archiveReads() { return archives; },
    loadInk: async (key) => map.get(key) ?? null,
    loadArchive: async (key) => {
      archives += 1;
      return latestArchive([...map.entries()].filter(([k]) => k.startsWith(`${key}#old:`)).map(([k, value]) => ({ key: k, value })));
    },
    saveInk: async (key, value, opts = {}) => {
      saves.push({ key, value, opts });
      let archived = false;
      const existing = map.get(key);
      if (opts.archiveStale && needsArchive(existing, value)) {
        map.set(archiveKeyOf(key, existing), archiveValue(existing, key, Date.now()));
        archived = true;
      }
      if (value) map.set(key, value);
      else map.delete(key);
      return { archived };
    },
  };
}
const prefs = { load: () => ({ ...DEFAULT_TOOL }), save: () => {} };
const raw = (hash, w, n, at = 1, extra = {}) => ({
  textHash: hash,
  layouts: { [w]: { height: 1000, updatedAt: at, strokes: Array.from({ length: n }, (_, i) => ({ tool: 'pen', color: '#4da3ff', w: 2.5, q: packPoints([[i, i, 0.5], [i + 9, i, 0.5]]) })) } },
  ...extra,
});
const line = (x0, y0) => ({ tool: 'pen', color: '#ff4d4f', w: 2.5, pts: [[x0, y0, 0.5], [x0 + 9, y0, 0.5]] });

async function ready(store, key, hash, w = 600) {
  store.setSize(w, 1000);
  store.setKey(key, hash);
  await settle();
  await settle();
}

test('가장 최근에 보관한 예전 필기: 보관한 때, 같으면 마지막으로 쓴 때. 보관 열쇠가 아니거나 선이 없으면 건너뜀', () => {
  const a = { key: 'me:1:1#old:A:10', value: raw('A', 600, 2, 10, { archivedAt: 100 }) };
  const b = { key: 'me:1:1#old:B:20', value: raw('B', 600, 1, 20, { archivedAt: 300 }) };
  const c = { key: 'me:1:1#old:C:30', value: raw('C', 600, 1, 30, { archivedAt: 300 }) };
  const empty = { key: 'me:1:1#old:D:40', value: { textHash: 'D', layouts: {}, archivedAt: 999 } };
  const notArchive = { key: 'me:1:1', value: raw('E', 600, 1, 50, { archivedAt: 1000 }) };
  assert.equal(latestArchive([a, b, empty, notArchive]), b);
  assert.equal(latestArchive([a, c, b]), c, '같은 때면 더 나중에 쓴 것');
  assert.equal(latestArchive([]), null);
  assert.equal(latestArchive([empty, null, notArchive]), null);
});

test('불러온 뒤 보관한 예전 필기를 따로 읽어 둔다 — 흐리게 보기는 읽기만, 지금 필기와 섞이지 않음', async () => {
  const now = Date.now();
  const db = fakeDb({
    'me:1:1': raw('NEW', 600, 1, 5),
    'me:1:1#old:OLD:3': raw('OLD', 600, 4, 3, { archivedAt: now - DAY }),
  });
  const store = createInkStore({ db, prefs });
  await ready(store, 'me:1:1', 'NEW');
  let s = store.getSnapshot();
  assert.equal(db.archiveReads, 1);
  assert.equal(hasOld(s), true);
  assert.equal(s.oldOn, false);
  assert.equal(oldStrokes(s).strokes.length, 4);
  assert.equal(visibleStrokes(s).length, 1, '지금 필기는 그대로');
  store.toggleOld();
  s = store.getSnapshot();
  assert.equal(s.oldOn, true);
  // 지금 필기에 쓰고 지우고 되돌려도 예전 필기는 그대로, 저장 값에도 들어가지 않는다
  store.addStroke(line(50, 50));
  store.erase(visibleStrokes(store.getSnapshot()), 1);
  store.undo();
  store.flush();
  await settle();
  s = store.getSnapshot();
  assert.equal(oldStrokes(s).strokes.length, 4);
  assert.equal(visibleStrokes(s).length, 2);
  const saved = db.map.get('me:1:1');
  assert.equal(saved.textHash, 'NEW');
  assert.equal(saved.layouts[600].strokes.length, 2, '저장된 것은 지금 필기 2개뿐');
  assert.equal(db.map.get('me:1:1#old:OLD:3').layouts[600].strokes.length, 4, '보관 기록도 그대로');
  store.toggleOld();
  assert.equal(store.getSnapshot().oldOn, false);
  // 다른 문항으로 옮기면 비운다
  store.setKey('me:1:2', 'X');
  s = store.getSnapshot();
  assert.equal(s.old, null);
  assert.equal(s.oldOn, false);
});

test('보관이 없으면 흐리게 보기는 켜지지 않는다', async () => {
  const db = fakeDb({ 'me:1:1': raw('NEW', 600, 1) });
  const store = createInkStore({ db, prefs });
  await ready(store, 'me:1:1', 'NEW');
  assert.equal(hasOld(store.getSnapshot()), false);
  store.toggleOld();
  assert.equal(store.getSnapshot().oldOn, false);
});

test('본문이 바뀐 문항: 숨긴 예전 필기를 흐리게 보다가 새로 써도(보관됨) 이어서 보인다', async () => {
  const db = fakeDb({ 'me:1:1': raw('OLD', 600, 3, 7) });
  const store = createInkStore({ db, prefs });
  await ready(store, 'me:1:1', 'NEW');
  let s = store.getSnapshot();
  assert.equal(oldRecord(s), s.record, '숨긴 지금 기록이 예전 필기');
  store.toggleOld();
  assert.equal(oldStrokes(store.getSnapshot()).strokes.length, 3);
  store.addStroke(line(1, 1));
  s = store.getSnapshot();
  assert.equal(s.oldOn, true);
  assert.equal(oldStrokes(s).strokes.length, 3, '새로 쓴 뒤에도 같은 예전 필기');
  assert.equal(visibleStrokes(s).length, 1);
  store.flush();
  await settle();
  await settle();
  assert.ok(db.map.get('me:1:1#old:OLD:7'), '저장할 때 보관');
  assert.equal(db.archiveReads, 1, '이미 들고 있으므로 다시 읽지 않음(불러올 때 한 번)');
  assert.equal(oldStrokes(store.getSnapshot()).strokes.length, 3);
});

test('그래도 보기·지우기는 흐리게 보던 것을 끈다', async () => {
  const db = fakeDb({ 'me:1:1': raw('OLD', 600, 2), 'me:1:2': raw('OLD', 600, 2) });
  const store = createInkStore({ db, prefs });
  await ready(store, 'me:1:1', 'NEW');
  store.toggleOld();
  store.acceptStale();
  assert.equal(store.getSnapshot().oldOn, false);
  assert.equal(visibleStrokes(store.getSnapshot()).length, 2);
  await ready(store, 'me:1:2', 'NEW');
  store.toggleOld();
  store.dropRecord();
  assert.equal(store.getSnapshot().oldOn, false);
  assert.equal(hasOld(store.getSnapshot()), false);
});

test('다른 폭에서 쓴 예전 필기: ±3px 안이면 그대로, 아니면 가장 가까운 폭의 것(자리 어긋남 표시)', async () => {
  const old = { textHash: 'OLD', layouts: { ...raw('OLD', 592, 2).layouts, ...raw('OLD', 800, 5).layouts } };
  const db = fakeDb({ 'me:1:1': old });
  const store = createInkStore({ db, prefs });
  await ready(store, 'me:1:1', 'NEW', 590);
  let o = oldStrokes(store.getSnapshot());
  assert.deepEqual([o.strokes.length, o.approx], [2, false]);
  store.setSize(700, 1000);
  o = oldStrokes(store.getSnapshot());
  assert.deepEqual([o.strokes.length, o.approx], [5, true], '700 에서는 800 이 더 가깝다');
  store.setSize(360, 1000);
  o = oldStrokes(store.getSnapshot());
  assert.deepEqual([o.strokes.length, o.approx], [2, true]);
});

test('보관한 예전 필기 안내를 저절로 띄우는 기간: 보관한 뒤 30일', () => {
  const now = Date.now();
  const s = { record: null, textHash: 'N', old: { record: {}, at: now - 10 * DAY } };
  assert.equal(OLD_NOTICE_MS, 30 * DAY);
  assert.equal(oldNoticeDue(s, now), true);
  assert.equal(oldNoticeDue({ ...s, old: { record: {}, at: now - 31 * DAY } }, now), false);
  assert.equal(oldNoticeDue({ ...s, old: null }, now), false);
});
