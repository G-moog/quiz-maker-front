// 대시보드 도우미(src/utils/dashboard.js) 시험: 마지막 공부 표시·찾기·최근 공부 순·메모 수·목록 기억
// 실행: npm run test:app
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SORT_DEFAULT, SORT_RECENT, cardNoteCount, clearDashCache, countNotesBySet, filterCards, lastStudiedOf,
  readDashCache, relativeDay, sortCards, writeDashCache,
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
