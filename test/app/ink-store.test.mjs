// 필기 보관소(inkStore) 시험 — 저장소는 가짜(Map)로 바꿔 끼운다: 다시 하기, 다른 폭에서의 되돌리기 막기,
// 폭 ±3px 맞추기, 저장 미루기(펜이 닿아 있는 동안), 본문이 바뀐 예전 필기 보관, 도구 기억, 자판 단축키.
// 실행: npm run test:app
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVE_BUSY_MAX_MS, SAVE_DELAY, canRedo, canUndo, createInkStore, heightDrift, inkWidth, visibleStrokes,
} from '../../src/ink/inkStore.js';
import { DEFAULT_TOOL, parseInkTool, shortcutOf } from '../../src/ink/inkMode.js';
import { archiveKeyOf, archiveValue, needsArchive } from '../../src/ink/inkRecord.js';
import { packPoints } from '../../src/ink/geometry.js';

const settle = () => new Promise((r) => setImmediate(r));

// 가짜 저장소: inkDb.saveInk 와 같은 보관 규칙(같은 함수)을 쓴다
function fakeDb(initial = {}) {
  const map = new Map(Object.entries(initial));
  const saves = [];
  return {
    map, saves,
    loadInk: async (key) => map.get(key) ?? null,
    saveInk: async (key, value, opts = {}) => {
      saves.push({ key, value, opts });
      let archived = false;
      const existing = map.get(key);
      if (opts.archiveStale && needsArchive(existing, value)) {
        map.set(archiveKeyOf(key, existing), archiveValue(existing, key, 1));
        archived = true;
      }
      if (value) map.set(key, value);
      else map.delete(key);
      return { archived };
    },
  };
}

function fakePrefs(start = DEFAULT_TOOL) {
  const saved = [];
  return { saved, load: () => ({ ...start }), save: (v) => saved.push({ ...v }) };
}

const line = (x0, y0, n = 4) => ({ tool: 'pen', color: '#ff4d4f', w: 2.5, pts: Array.from({ length: n }, (_, i) => [x0 + i * 5, y0, 0.5]) });
const raw = (hash, w, n, at = 1, height = 1000) => ({
  textHash: hash,
  layouts: { [w]: { height, updatedAt: at, strokes: Array.from({ length: n }, (_, i) => ({ tool: 'pen', color: '#4da3ff', w: 2.5, q: packPoints([[i, i, 0.5], [i + 9, i, 0.5]]) })) } },
});

async function ready(store, key = 'me:1:1', hash = 'H', w = 600, h = 1000) {
  store.setSize(w, h);
  store.setKey(key, hash);
  await settle();
  assert.equal(store.getSnapshot().loaded, true);
}

test('도구 기억: 처음 값은 이 기기에 기억한 것, 고르면 기억한다', async () => {
  const prefs = fakePrefs({ tool: 'hl', color: '#3ddc84' });
  const store = createInkStore({ db: fakeDb(), prefs });
  assert.equal(store.getSnapshot().tool, 'hl');
  assert.equal(store.getSnapshot().color, '#3ddc84');
  store.setPen('#4da3ff');
  store.setTool('eraser');
  store.setTool('eraser');
  assert.deepEqual(prefs.saved, [{ tool: 'pen', color: '#4da3ff' }, { tool: 'eraser', color: '#4da3ff' }]);
});

test('도구 기억: 저장된 글이 틀리면 기본(빨간 펜)', () => {
  assert.deepEqual(parseInkTool(null), DEFAULT_TOOL);
  assert.deepEqual(parseInkTool('{oops'), DEFAULT_TOOL);
  assert.deepEqual(parseInkTool('{"tool":"laser","color":"#000"}'), DEFAULT_TOOL);
  assert.deepEqual(parseInkTool('{"tool":"eraser","color":"#3ddc84"}'), { tool: 'eraser', color: '#3ddc84' });
  assert.deepEqual(parseInkTool('{"tool":"hl","color":"#123456"}'), { tool: 'hl', color: DEFAULT_TOOL.color });
});

test('되돌리기·다시 하기: 긋기·지우기·전체 지우기, 새로 그으면 다시 하기는 비운다', async () => {
  const store = createInkStore({ db: fakeDb(), prefs: fakePrefs() });
  await ready(store);
  store.addStroke(line(10, 10));
  store.addStroke(line(10, 50));
  const [a, b] = visibleStrokes(store.getSnapshot());
  store.undo();
  assert.deepEqual(visibleStrokes(store.getSnapshot()), [a]);
  assert.equal(canRedo(store.getSnapshot()), true);
  store.redo();
  assert.deepEqual(visibleStrokes(store.getSnapshot()), [a, b], '같은 선(같은 id)이 제자리로');
  assert.equal(canRedo(store.getSnapshot()), false);

  store.erase([a], 1);
  assert.deepEqual(visibleStrokes(store.getSnapshot()), [b]);
  store.undo();
  assert.deepEqual(visibleStrokes(store.getSnapshot()), [a, b]);
  store.redo();
  assert.deepEqual(visibleStrokes(store.getSnapshot()), [b], '다시 하기 = 다시 지움');
  store.undo();

  store.clear();
  assert.equal(visibleStrokes(store.getSnapshot()).length, 0);
  store.undo();
  assert.equal(visibleStrokes(store.getSnapshot()).length, 2);
  store.redo();
  assert.equal(visibleStrokes(store.getSnapshot()).length, 0);
  store.undo();
  store.undo();
  assert.equal(canRedo(store.getSnapshot()), true);
  store.addStroke(line(10, 90));
  assert.equal(canRedo(store.getSnapshot()), false, '새로 그으면 다시 하기 없음');
});

test('되돌리기: 화면 폭이 바뀌면(돌림) 앞 폭의 일은 막는다', async () => {
  const store = createInkStore({ db: fakeDb(), prefs: fakePrefs() });
  await ready(store, 'me:1:1', 'H', 600);
  store.addStroke(line(10, 10));
  assert.equal(canUndo(store.getSnapshot()), true);
  store.setSize(900, 700);
  assert.equal(canUndo(store.getSnapshot()), false);
  store.undo();
  store.setSize(600, 1000);
  assert.equal(visibleStrokes(store.getSnapshot()).length, 1, '보이지 않던 선은 그대로');
  assert.equal(canUndo(store.getSnapshot()), true);
});

test('폭 ±3px: 저장된 590 필기를 592 에서 보고, 이어 쓴 선도 590 에 들어간다', async () => {
  const db = fakeDb({ 'me:1:1': raw('H', 590, 2) });
  const store = createInkStore({ db, prefs: fakePrefs() });
  await ready(store, 'me:1:1', 'H', 592);
  const s = store.getSnapshot();
  assert.equal(inkWidth(s), 590);
  assert.equal(visibleStrokes(s).length, 2);
  store.addStroke(line(1, 1));
  store.undo();
  store.undo();
  store.undo();
  assert.equal(inkWidth(store.getSnapshot()), 590, '다 지워도 쓰던 폭 그대로(다시 하기가 되게)');
  assert.equal(canRedo(store.getSnapshot()), true);
  store.redo();
  store.flush();
  await settle();
  const saved = db.map.get('me:1:1');
  assert.deepEqual(Object.keys(saved.layouts), ['590']);
});

test('높이 어긋남 안내: 긴 문항에서 한 줄 밀리면', async () => {
  const db = fakeDb({ 'me:1:1': raw('H', 600, 1, 1, 25800) });
  const store = createInkStore({ db, prefs: fakePrefs() });
  await ready(store, 'me:1:1', 'H', 600, 25805);
  assert.equal(heightDrift(store.getSnapshot()), false);
  store.setSize(600, 25832);
  assert.equal(heightDrift(store.getSnapshot()), true);
});

test('저장 미루기: 펜이 닿아 있는 동안은 저장하지 않고, 뗀 뒤 SAVE_DELAY 에 한 번', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  const db = fakeDb();
  const store = createInkStore({ db, prefs: fakePrefs() });
  await ready(store);
  store.setBusy(true);
  store.addStroke(line(1, 1));
  store.setBusy(false);
  store.setBusy(true); // 바로 다음 글자를 쓰기 시작
  t.mock.timers.tick(SAVE_DELAY * 3);
  await settle();
  assert.equal(db.saves.length, 0, '닿아 있는 동안 저장 없음');
  store.addStroke(line(1, 30));
  store.setBusy(false);
  t.mock.timers.tick(SAVE_DELAY - 1);
  await settle();
  assert.equal(db.saves.length, 0);
  t.mock.timers.tick(1);
  await settle();
  assert.equal(db.saves.length, 1, '두 선을 한 번에');
  assert.equal(db.saves[0].value.layouts[600].strokes.length, 2);
  assert.ok(db.saves[0].value.layouts[600].strokes[0].q instanceof Int32Array);
});

test('저장 미루기: 떼기를 놓쳐 닿아 있음이 풀리지 않아도 SAVE_BUSY_MAX_MS 뒤에는 저장', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 2_000_000 });
  const db = fakeDb();
  const store = createInkStore({ db, prefs: fakePrefs() });
  await ready(store);
  store.setBusy(true);
  store.addStroke(line(1, 1));
  for (let i = 0; i < Math.ceil(SAVE_BUSY_MAX_MS / SAVE_DELAY) + 1; i++) t.mock.timers.tick(SAVE_DELAY);
  await settle();
  assert.equal(db.saves.length, 1);
});

test('문항을 옮기면 앞 문항은 바로 저장', async () => {
  const db = fakeDb();
  const store = createInkStore({ db, prefs: fakePrefs() });
  await ready(store, 'me:1:1');
  store.setBusy(true);
  store.addStroke(line(1, 1));
  store.setKey('me:1:2', 'H2');
  await settle();
  assert.deepEqual(db.saves.map((x) => x.key), ['me:1:1']);
  assert.equal(store.getSnapshot().history.length, 0);
  assert.equal(store.getSnapshot().future.length, 0);
  store.setBusy(false);
});

test('본문이 바뀐 문항: 새로 쓰면 예전 필기는 보관되고 안내가 뜬다(지우지 않음)', async () => {
  const db = fakeDb({ 'me:1:1': raw('OLD', 600, 3, 50) });
  const store = createInkStore({ db, prefs: fakePrefs() });
  await ready(store, 'me:1:1', 'NEW');
  let s = store.getSnapshot();
  assert.equal(visibleStrokes(s).length, 0, '예전 필기는 숨김');
  store.addStroke(line(1, 1));
  s = store.getSnapshot();
  assert.equal(visibleStrokes(s).length, 1);
  store.flush();
  await settle();
  assert.equal(db.saves[0].opts.archiveStale, true);
  const archived = db.map.get('me:1:1#old:OLD:50');
  assert.ok(archived, '예전 필기 보관');
  assert.equal(archived.layouts[600].strokes.length, 3);
  assert.equal(db.map.get('me:1:1').textHash, 'NEW');
  assert.equal(store.getSnapshot().archivedKey, 'me:1:1');
  // 되돌리기로 예전 필기를 다시 꺼내 저장해도(예전 지문) 그것을 또 보관하지 않는다
  store.undo();
  store.undo();
  store.flush();
  await settle();
  assert.equal(db.saves.at(-1).opts.archiveStale, false);
  assert.equal(db.map.get('me:1:1').textHash, 'OLD');
});

test('본문이 바뀐 문항: 그래도 보기는 보관하지 않고 지문만 바꾼다', async () => {
  const db = fakeDb({ 'me:1:1': raw('OLD', 600, 2) });
  const store = createInkStore({ db, prefs: fakePrefs() });
  await ready(store, 'me:1:1', 'NEW');
  store.acceptStale();
  assert.equal(visibleStrokes(store.getSnapshot()).length, 2);
  store.flush();
  await settle();
  assert.equal(db.saves[0].opts.archiveStale, false);
  assert.equal([...db.map.keys()].length, 1);
});

test('자판 단축키: Ctrl+Z 되돌리기, Ctrl+Y·Ctrl+Shift+Z 다시 하기(한글 자판도)', () => {
  assert.equal(shortcutOf({ ctrlKey: true, key: 'z', code: 'KeyZ' }), 'undo');
  assert.equal(shortcutOf({ ctrlKey: true, shiftKey: true, key: 'Z', code: 'KeyZ' }), 'redo');
  assert.equal(shortcutOf({ ctrlKey: true, key: 'y', code: 'KeyY' }), 'redo');
  assert.equal(shortcutOf({ ctrlKey: true, key: 'ㅋ', code: 'KeyZ' }), 'undo');
  assert.equal(shortcutOf({ metaKey: true, key: 'z' }), 'undo');
  assert.equal(shortcutOf({ key: 'z', code: 'KeyZ' }), null);
  assert.equal(shortcutOf({ ctrlKey: true, altKey: true, key: 'z', code: 'KeyZ' }), null);
  assert.equal(shortcutOf({ ctrlKey: true, key: 'c', code: 'KeyC' }), null);
});

// mock 을 쓰는 시험이 끝나면 되돌린다(다른 파일에 영향 없게)
test.after(() => mock.reset());
