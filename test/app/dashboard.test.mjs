// 대시보드 도우미(src/utils/dashboard.js) 시험: 마지막 공부 표시·찾기·최근 공부 순·복습 차례·공부 요약·메모 수·목록 기억
// 실행: npm run test:app
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SORT_DEFAULT, SORT_RECENT, SORT_REVIEW, cardNoteCount, clearDashCache, countNotesBySet, filterCards, lastStudiedOf,
  loadSortMode, readDashCache, relativeDay, saveSortMode, sortCards, studySummary, summaryText, writeDashCache,
} from '../../src/utils/dashboard.js';

// 이 기기 시각 기준(시험 PC 의 시간대와 무관하게): 같은 날 자정 언저리도 달력 날짜로
const at = (y, m, d, h = 12, mi = 0) => new Date(y, m - 1, d, h, mi);

test('relativeDay: 오늘·어제·N일 전·N주 전·N개월 전·N년 전', () => {
  const now = at(2026, 10, 22, 9, 0);
  assert.equal(relativeDay(at(2026, 10, 22, 0, 5).toISOString(), now), '오늘');
  assert.equal(relativeDay(at(2026, 10, 21, 23, 59).toISOString(), now), '어제'); // 10시간 전이어도 날짜로 어제
  assert.equal(relativeDay(at(2026, 10, 19).toISOString(), now), '3일 전');
  assert.equal(relativeDay(at(2026, 10, 9).toISOString(), now), '13일 전');
  assert.equal(relativeDay(at(2026, 10, 8).toISOString(), now), '2주 전');
  assert.equal(relativeDay(at(2026, 8, 20).toISOString(), now), '2개월 전');
  assert.equal(relativeDay(at(2025, 9, 1).toISOString(), now), '1년 전');
  assert.equal(relativeDay(at(2026, 10, 23).toISOString(), now), '오늘'); // 시계가 어긋난 앞날
  assert.equal(relativeDay('', now), '');
  assert.equal(relativeDay('엉터리', now), '');
  assert.equal(relativeDay(null, now), '');
});

const base = { id: 11, title: '[Notion] 습도: 낮을 때와 높을 때', subject: '' };
const hard = { id: 26, title: '[하드] [Notion] 습도: 낮을 때와 높을 때', subject: '' };
const garu = { id: 8, title: '[시험] 가루이', subject: '병해충·방제' };
const sun = { id: 9, title: '[Notion] 순멎이', subject: null };
const cards = [{ set: base, hard }, { set: sun, hard: null }, { set: garu, hard: null }];

test('lastStudiedOf: 하드 짝은 둘 중 늦은 것, 없으면 null', () => {
  const map = { 11: '2026-10-20T01:00:00.000Z', 26: '2026-10-21T01:00:00.000Z' };
  assert.equal(lastStudiedOf(cards[0], map), '2026-10-21T01:00:00.000Z');
  assert.equal(lastStudiedOf(cards[0], { 11: '2026-10-20T01:00:00.000Z' }), '2026-10-20T01:00:00.000Z');
  assert.equal(lastStudiedOf(cards[0], { 26: '2026-10-19T01:00:00.000Z' }), '2026-10-19T01:00:00.000Z');
  assert.equal(lastStudiedOf(cards[1], map), null);
  assert.equal(lastStudiedOf(cards[0], { 11: '엉터리', 26: '2026-10-19T01:00:00.000Z' }), '2026-10-19T01:00:00.000Z');
});

test('filterCards: 제목·과목·하드 제목, 대소문자 무시, 낱말 모두', () => {
  const titles = (q) => filterCards(cards, q).map((c) => c.set.id);
  assert.deepEqual(titles(''), [11, 9, 8]);
  assert.deepEqual(titles('   '), [11, 9, 8]);
  assert.deepEqual(titles('notion'), [11, 9]);
  assert.deepEqual(titles('NOTION 순멎'), [9]);
  assert.deepEqual(titles('방제'), [8]); // 과목
  assert.deepEqual(titles('하드'), [11]); // 짝인 하드 제목
  assert.deepEqual(titles('없는말'), []);
});

test('sortCards: 기본은 그대로, 최근 공부 순은 늦은 것부터 · 기록 없는 것은 뒤에 원래 순서', () => {
  const map = { 26: '2026-10-21T01:00:00.000Z', 8: '2026-10-21T05:00:00.000Z' };
  assert.equal(sortCards(cards, SORT_DEFAULT, map), cards);
  assert.deepEqual(sortCards(cards, SORT_RECENT, map).map((c) => c.set.id), [8, 11, 9]);
  assert.deepEqual(sortCards(cards, SORT_RECENT, {}).map((c) => c.set.id), [11, 9, 8]);
  assert.deepEqual(cards.map((c) => c.set.id), [11, 9, 8]); // 원래 배열은 그대로
});

test('countNotesBySet·cardNoteCount: 미해결 메모 수(하드 짝 더함, 문제집 없는 메모 빼기)', () => {
  const counts = countNotesBySet([{ setId: 11 }, { setId: 26 }, { setId: 26 }, { setId: null }, { setId: 8 }, null]);
  assert.deepEqual(counts, { 11: 1, 26: 2, 8: 1 });
  assert.equal(cardNoteCount(cards[0], counts), 3);
  assert.equal(cardNoteCount(cards[1], counts), 0);
  assert.equal(cardNoteCount(cards[2], counts), 1);
  assert.equal(cardNoteCount(cards[2], null), 0);
  assert.deepEqual(countNotesBySet(undefined), {});
});

test('목록 기억: 사용자별, 지우면 없음', () => {
  clearDashCache();
  assert.equal(readDashCache('a'), null);
  writeDashCache('a', { sets: [1], scrollY: 300 });
  assert.deepEqual(readDashCache('a'), { username: 'a', sets: [1], openNotes: null, scrollY: 300 });
  assert.equal(readDashCache('b'), null);
  writeDashCache('a', { scrollY: 10 });
  assert.equal(readDashCache('a').scrollY, 10);
  assert.deepEqual(readDashCache('a').sets, [1]);
  writeDashCache('b', { sets: [] }); // 다른 사용자가 쓰면 앞 사용자 것은 버림
  assert.equal(readDashCache('a'), null);
  clearDashCache();
  assert.equal(readDashCache('b'), null);
});

test('sortCards: 복습 차례는 공부한 지 오래된 것부터 · 공부한 적 없는 것은 뒤에 원래 순서(하드 짝은 늦은 쪽)', () => {
  const map = { 11: '2026-10-01T01:00:00.000Z', 26: '2026-10-21T01:00:00.000Z', 8: '2026-10-10T05:00:00.000Z' };
  // 11 카드는 하드 짝(26)이 10/21 이라 마지막 공부가 10/21 → 8(10/10) 다음
  assert.deepEqual(sortCards(cards, SORT_REVIEW, map).map((c) => c.set.id), [8, 11, 9]);
  assert.deepEqual(sortCards(cards, SORT_REVIEW, { 9: '2026-10-21T01:00:00.000Z' }).map((c) => c.set.id), [9, 11, 8]);
  assert.deepEqual(sortCards(cards, SORT_REVIEW, {}).map((c) => c.set.id), [11, 9, 8]);
});

test('정렬 기억: 세 가지 모두, 모르는 값·저장소 없음은 기본', () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  for (const m of [SORT_DEFAULT, SORT_RECENT, SORT_REVIEW]) {
    saveSortMode('u', m);
    assert.equal(loadSortMode('u'), m);
  }
  assert.equal(loadSortMode('other'), SORT_DEFAULT);
  saveSortMode('u', 'weird');
  assert.equal(loadSortMode('u'), SORT_DEFAULT);
  mem.set('qm:dash-sort:v1:u', 'weird');
  assert.equal(loadSortMode('u'), SORT_DEFAULT);
  globalThis.localStorage = { getItem() { throw new Error('막힘'); }, setItem() { throw new Error('막힘'); } };
  assert.equal(loadSortMode('u'), SORT_DEFAULT);
  assert.doesNotThrow(() => saveSortMode('u', SORT_REVIEW));
  delete globalThis.localStorage;
});

test('studySummary: 오늘·이번 주(월요일부터)·연속(오늘 아직이면 어제까지), 하드 짝은 하나로, 목록에 없는 문제집은 빼고', () => {
  // 2026-10-22 은 목요일 → 이번 주 = 10/19(월) ~ 10/22
  const days = {
    11: ['2026-10-18', '2026-10-20'], 26: ['2026-10-22'], // 같은 카드(하드 짝): 오늘 1개로
    9: ['2026-10-21', '2026-10-22'],
    8: ['2026-10-12'],
    999: ['2026-10-22'], // 지운 문제집
  };
  assert.deepEqual(studySummary(cards, days, '2026-10-22'), { today: 2, week: 2, streak: 3 }); // 10/20·21·22
  assert.equal(summaryText({ today: 2, week: 2, streak: 3 }), '오늘 2개 · 이번 주 2개 · 연속 3일');
  assert.equal(summaryText({ today: 2, week: 12, streak: 3 }, { short: true }), '오늘 2 · 이번 주 12 · 연속 3일');
  // 오늘 아직이면 어제까지의 연속, 오늘 0개
  const noToday = { 11: ['2026-10-20'], 9: ['2026-10-21'] };
  assert.deepEqual(studySummary(cards, noToday, '2026-10-22'), { today: 0, week: 2, streak: 2 });
  // 어제도 안 했으면 연속 0 → 글에서 뺌
  assert.deepEqual(studySummary(cards, { 8: ['2026-10-19'] }, '2026-10-22'), { today: 0, week: 1, streak: 0 });
  assert.equal(summaryText({ today: 0, week: 1, streak: 0 }), '오늘 0개 · 이번 주 1개');
  // 월요일에는 지난주(일요일)를 이번 주에 넣지 않음
  assert.deepEqual(studySummary(cards, { 9: ['2026-10-25', '2026-10-26'] }, '2026-10-26'), { today: 1, week: 1, streak: 2 });
  // 해가 바뀌는 주(2026-12-31 목 → 2027-01-01 금)
  assert.deepEqual(studySummary(cards, { 9: ['2026-12-28', '2026-12-31', '2027-01-01'] }, '2027-01-01'), { today: 1, week: 1, streak: 2 });
  // 기록이 없으면 null(줄을 그리지 않음)
  assert.equal(studySummary(cards, {}, '2026-10-22'), null);
  assert.equal(studySummary(cards, { 999: ['2026-10-22'] }, '2026-10-22'), null);
  assert.equal(studySummary(cards, null, '2026-10-22'), null);
  assert.equal(studySummary(cards, days, '엉터리'), null);
  assert.equal(summaryText(null), '');
});
