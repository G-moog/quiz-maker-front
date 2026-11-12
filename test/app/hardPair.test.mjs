// 풀기 화면의 '하드로/보통으로' 짝 찾기·같은 절 찾기·대시보드 하드모드 기억 시험: utils/hardMode.js
// 실행: npm run test:app
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupHardSets, hasSet, loadHardModeIds, matchHeading, pairOf, rememberHardMode } from '../../src/utils/hardMode.js';
import { textModel } from '../../src/utils/textBlocks.js';
import { clearDashCache, readDashCache, writeDashCache } from '../../src/utils/dashboard.js';
import { cardsOfPlace, groupCardsByFolder } from '../../src/utils/folders.js';

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

// 폴더(subject)는 짝 규칙에 끼지 않는다 — 짝은 제목으로만(보통·하드의 폴더가 달라도, 보관함이어도 짝)
test('pairOf: 폴더가 달라도 짝 — 보통은 보관함, 하드는 옛 폴더·빈 값이어도 같은 카드', () => {
  const sets = [
    { id: 61, title: '[하드] [Notion] 착과부하', subject: '생육·착과' },
    { id: 60, title: '[Notion] 착과부하', subject: '[보관] 생육·착과' },
    { id: 71, title: '[하드] [통합본] 습도와 증산', subject: null },
    { id: 70, title: '[통합본] 습도와 증산', subject: '증산·습도' },
  ];
  assert.deepEqual(pairOf(sets, 60), { set: sets[0], toHard: true, baseId: 60 });
  assert.deepEqual(pairOf(sets, 71), { set: sets[3], toHard: false, baseId: 70 });
  // 대시보드 카드도 같은 짝: 카드는 보통의 폴더(하드의 폴더는 보지 않음)
  const g = groupCardsByFolder(groupHardSets(sets));
  assert.deepEqual(g.archive.map((c) => [c.set.id, c.hard.id]), [[60, 61]]);
  assert.deepEqual(g.folders.get('증산·습도').map((c) => [c.set.id, c.hard.id]), [[70, 71]]);
  assert.equal(g.folders.has('생육·착과'), false);
});

test('pairOf: 대시보드 기억(서버 목록 전체 — 보관함·다른 폴더 포함)에서 짝을 찾는다(풀기 화면이 여는 길)', () => {
  clearDashCache();
  const sets = [
    { id: 81, title: '[하드] [Notion] 줄 돌리기', subject: '' },
    { id: 80, title: '[Notion] 줄 돌리기', subject: '현장 노하우' },
    { id: 90, title: '[Notion] 옛 쪽', subject: '[보관] 현장 노하우' },
    { id: 91, title: '[하드] [Notion] 옛 쪽', subject: '[보관] 현장 노하우' },
  ];
  writeDashCache('kim', { sets, place: { kind: 'folder', name: '현장 노하우' } });
  try {
    const list = readDashCache('kim')?.sets;
    // 폴더 보기에 보이는 카드(현장 노하우)만이 아니라 전체 목록이 기억에 있어야 보관함 카드의 짝도 찾는다
    assert.deepEqual(cardsOfPlace(groupHardSets(list), { kind: 'folder', name: '현장 노하우' }).map((c) => c.set.id), [80]);
    assert.equal(hasSet(list, 90), true);
    assert.deepEqual(pairOf(list, 90), { set: sets[3], toHard: true, baseId: 90 });
    assert.deepEqual(pairOf(list, '81'), { set: sets[1], toHard: false, baseId: 80 });
  } finally {
    clearDashCache();
  }
});
