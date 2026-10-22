// 필기가 있는 문항 기억 시험(2차, B11): 필기 모드를 끈 채 필기가 있는 문항을 열 때 불러오기 전 첫 그림부터
// 필기 층(정답 폭 빈칸)으로 — 기억 모양·폭 맞추기·오래된 것 지우기, 보관소의 hasVisibleInk(불러오는 동안만 기억).
// 실행: npm run test:app
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HINT_MAX, hintHas, hintNote, hintWidth, parseHint, serializeHint } from '../../src/ink/inkHint.js';
import { createInkStore } from '../../src/ink/inkStore.js';
import { DEFAULT_TOOL } from '../../src/ink/inkMode.js';
import { packPoints } from '../../src/ink/geometry.js';

const settle = () => new Promise((r) => setImmediate(r));
const rec = (hash, widths) => ({
  textHash: hash,
  layouts: Object.fromEntries(widths.map((w) => [w, { height: 900, updatedAt: 1, strokes: [{ id: 1 }] }])),
});

test('기억 모양: 틀린 글은 빈 기억, 다시 읽으면 같은 값', () => {
  for (const bad of [null, '', '{', '[]', '{"v":2,"w":590}', 42]) {
    const h = parseHint(bad);
    assert.equal(h.w, 0);
    assert.equal(h.k.size, 0);
  }
  const h = parseHint('{"v":1,"w":590,"k":{"me:1:1":["H",[590,800]],"me:1:2":["X",[]],"me:1:3":"x","me:1:4":["Y",[0,"a",600]]}}');
  assert.equal(h.w, 590);
  assert.deepEqual([...h.k.keys()], ['me:1:1', 'me:1:4'], '폭이 없는 것·모양이 틀린 것은 버림');
  assert.deepEqual(h.k.get('me:1:4').w, [600]);
  assert.deepEqual(parseHint(serializeHint(h)), h);
});

test('있을 것 같은가: 같은 지문, 마지막으로 잰 폭 ±3px 에서 쓴 필기', () => {
  const h = parseHint(null);
  hintNote(h, 'me:1:1', rec('H', [590]));
  assert.equal(hintHas(h, 'me:1:1', 'H'), true, '폭을 아직 모르면 아무 폭이나');
  hintWidth(h, 592);
  assert.equal(hintHas(h, 'me:1:1', 'H'), true);
  assert.equal(hintHas(h, 'me:1:1', 'OTHER'), false, '본문이 바뀜(지문 다름)');
  assert.equal(hintHas(h, 'me:1:2', 'H'), false);
  assert.equal(hintHas(h, null, 'H'), false);
  hintWidth(h, 360);
  assert.equal(hintHas(h, 'me:1:1', 'H'), false, '다른 폭(휴대폰 돌림)에는 필기가 없음');
});

test('고치기: 바뀔 때만 true, 필기가 없어지면 지움, 넘치면 오래된 것부터', () => {
  const h = parseHint(null);
  assert.equal(hintNote(h, 'a', rec('H', [800, 590])), true);
  assert.deepEqual(h.k.get('a').w, [590, 800]);
  assert.equal(hintNote(h, 'a', rec('H', [590, 800])), false, '같으면 쓰지 않음');
  assert.equal(hintNote(h, 'a', rec('H2', [590, 800])), true);
  assert.equal(hintNote(h, 'a', null), true, '필기를 지움');
  assert.equal(h.k.has('a'), false);
  assert.equal(hintNote(h, 'a', null), false);
  assert.equal(hintNote(h, 'b', { textHash: 'H', layouts: { 590: { strokes: [] } } }), false, '선 없는 폭만 있으면 없는 것');
  for (let i = 0; i < HINT_MAX + 5; i++) hintNote(h, `k${i}`, rec('H', [590]));
  assert.equal(h.k.size, HINT_MAX);
  assert.equal(h.k.has('k0'), false);
  assert.equal(h.k.has(`k${HINT_MAX + 4}`), true);
  // 고친 문항은 뒤로(최근)
  hintNote(h, 'k5', rec('H3', [590]));
  assert.equal([...h.k.keys()].at(-1), 'k5');
  assert.equal(hintWidth(h, 590), true);
  assert.equal(hintWidth(h, 590), false);
  assert.equal(hintWidth(h, 0), false);
});

// 보관소: 기억은 불러오는 동안만, 불러오면 진짜 값. 불러온 필기·저장한 필기로 기억을 고친다
function fakeHints(has = false) {
  const notes = [];
  const widths = [];
  return { notes, widths, has: () => has, note: (key, r) => notes.push([key, r ? Object.keys(r.layouts) : null]), width: (w) => widths.push(w) };
}
const prefs = { load: () => ({ ...DEFAULT_TOOL }), save: () => {} };

test('보관소: 필기가 있는 문항은 불러오기 전부터 hasVisibleInk, 불러온 뒤에는 진짜 값', async () => {
  let release;
  const stored = { textHash: 'H', layouts: { 590: { height: 900, updatedAt: 1, strokes: [{ tool: 'pen', color: '#ff4d4f', w: 2.5, q: packPoints([[1, 1, 0.5], [9, 1, 0.5]]) }] } } };
  const db = { loadInk: () => new Promise((r) => { release = () => r(stored); }), saveInk: async () => ({ archived: false }) };
  const hints = fakeHints(true);
  const store = createInkStore({ db, prefs, hints });
  store.setSize(590, 900);
  assert.deepEqual(hints.widths, [590]);
  store.setKey('me:1:1', 'H');
  assert.equal(store.getSnapshot().loaded, false);
  assert.equal(store.hasVisibleInk(), true, '불러오는 동안 기억으로');
  release();
  await settle();
  assert.equal(store.getSnapshot().loaded, true);
  assert.equal(store.hasVisibleInk(), true);
  assert.deepEqual(hints.notes, [['me:1:1', ['590']]]);
});

test('보관소: 기억이 틀렸으면 불러온 뒤 바로잡힌다, 저장하면 기억을 고친다', async () => {
  const saved = new Map();
  const db = { loadInk: async () => null, saveInk: async (k, v) => { saved.set(k, v); return { archived: false }; } };
  const hints = fakeHints(true);
  const store = createInkStore({ db, prefs, hints });
  store.setSize(590, 900);
  store.setKey('me:1:1', 'H');
  assert.equal(store.hasVisibleInk(), true);
  await settle();
  assert.equal(store.hasVisibleInk(), false, '필기가 없었다');
  assert.deepEqual(hints.notes, [['me:1:1', null]]);
  store.addStroke({ tool: 'pen', color: '#ff4d4f', w: 2.5, pts: [[1, 1, 0.5], [9, 1, 0.5]] });
  store.flush();
  await settle();
  assert.deepEqual(hints.notes.at(-1), ['me:1:1', ['590']]);
  // 기억이 없는 문항은 처음부터 false
  const h2 = fakeHints(false);
  const s2 = createInkStore({ db, prefs, hints: h2 });
  s2.setSize(590, 900);
  s2.setKey('me:1:9', 'H');
  assert.equal(s2.hasVisibleInk(), false);
});

test('보관소: 불러오지 못하면(저장소 오류) 기억을 고치지 않는다', async () => {
  const db = { loadInk: async () => { throw new Error('x'); }, saveInk: async () => ({ archived: false }) };
  const hints = fakeHints(true);
  const store = createInkStore({ db, prefs, hints });
  store.setSize(590, 900);
  store.setKey('me:1:1', 'H');
  await settle();
  assert.equal(store.getSnapshot().unsure, true);
  assert.deepEqual(hints.notes, []);
});
