// 풀기 화면의 '하드로/보통으로' 짝 찾기·같은 절 찾기·대시보드 하드모드 기억 시험: utils/hardMode.js
// 실행: npm run test:app
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasSet, loadHardModeIds, matchHeading, pairOf, rememberHardMode } from '../../src/utils/hardMode.js';
import { textModel } from '../../src/utils/textBlocks.js';

const SETS = [
  { id: 30, title: '[하드] [Notion] 습도' },
  { id: 11, title: '[Notion] 습도' },
  { id: 12, title: '[Notion] 양액' },
  { id: 40, title: '[하드] [Notion] 지운 원래' },
  // 같은 원래 제목이 둘이면 id 큰 것, 하드가 둘이면 id 큰 하드만 짝(대시보드 카드와 같은 규칙)
  { id: 50, title: '[Notion] 겹침' },
  { id: 51, title: '[Notion] 겹침' },
  { id: 52, title: '[하드] [Notion] 겹침' },
  { id: 53, title: '[하드] [Notion] 겹침' },
];

test('pairOf: 보통 → 하드, 하드 → 보통, 짝 없음', () => {
  assert.deepEqual(pairOf(SETS, 11), { set: SETS[0], toHard: true, baseId: 11 });
  assert.deepEqual(pairOf(SETS, '30'), { set: SETS[1], toHard: false, baseId: 11 });
  assert.equal(pairOf(SETS, 12), null); // 하드 없음
  assert.equal(pairOf(SETS, 40), null); // 원래가 없는 하드
  assert.equal(pairOf(SETS, 999), null);
  assert.equal(pairOf(null, 11), null);
  assert.deepEqual(pairOf(SETS, 51), { set: SETS[7], toHard: true, baseId: 51 });
  assert.equal(pairOf(SETS, 50), null); // 짝이 아닌 원래
  assert.deepEqual(pairOf(SETS, 53).set, SETS[5]);
  assert.equal(pairOf(SETS, 52), null); // 짝이 아닌 하드
  assert.equal(hasSet(SETS, '12'), true);
  assert.equal(hasSet(SETS, 13), false);
  assert.equal(hasSet(undefined, 12), false);
});

test('matchHeading: 같은 글 → 낱말이 빠진 글 → 같은 번호 → 없음', () => {
  const normal = textModel(['《pH 이야기》', '■ 1. 먼저 알아 둘 말', '글 ___', '□ pH 한 칸은 10배', '■ 2. 흙의 pH', '■ 출처'].join('\n')).headings;
  const hard = textModel(['《pH 이야기》', '■ 1. 먼저 ___ 둘 말', '글 ___', '□ pH 한 칸은 ___배', '■ 2. ___의 pH', '■ 출처'].join('\n')).headings;
  const src = (h) => ({ kind: h.kind, label: h.label, hid: h.hid, total: normal.length });
  // 보통 → 하드: 제목마다 같은 번호
  for (const h of normal) assert.equal(matchHeading(src(h), hard), h.hid, h.label);
  // 하드 → 보통
  for (const h of hard) assert.equal(matchHeading({ kind: h.kind, label: h.label, hid: h.hid, total: hard.length }, normal), h.hid, h.label);
  // 같은 글이 여럿이면 번호가 가까운 것
  const twice = textModel(['■ 정리', '글', '■ 정리', '글', '■ 정리'].join('\n')).headings;
  assert.equal(matchHeading({ kind: 'h1', label: '정리', hid: 2, total: 3 }, twice), 2);
  // 글이 전혀 달라도 제목 수가 같으면 같은 번호, 다르면 null
  assert.equal(matchHeading({ kind: 'h1', label: '전혀 다른 제목', hid: 1, total: normal.length }, normal), 1);
  assert.equal(matchHeading({ kind: 'h1', label: '전혀 다른 제목', hid: 1, total: 99 }, normal), null);
  assert.equal(matchHeading(null, normal), null);
  assert.equal(matchHeading({ kind: 'h1', label: 'x', hid: 0 }, []), null);
});

test('rememberHardMode: 대시보드 카드의 하드모드 켬/끔을 바꾼 쪽으로', () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  try {
    rememberHardMode('kim', 11, true);
    rememberHardMode('kim', 12, true);
    assert.deepEqual(loadHardModeIds('kim').sort(), ['11', '12']);
    rememberHardMode('kim', '11', false);
    assert.deepEqual(loadHardModeIds('kim'), ['12']);
    assert.deepEqual(loadHardModeIds('lee'), []);
  } finally {
    delete globalThis.localStorage;
  }
});
