// 이어 보기 기록 시험: utils/solveStudy.js(처음 열 때 상태·저장 값·지문)
// 실행: npm run test:app  (화면·서버 없이 함수만 부름)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blankCountOf, initialSolveState, normalizeType, questionHash, sameIdSet, studySnapshot,
} from '../../src/utils/solveStudy.js';
import { textHash } from '../../src/ink/geometry.js';

// 노션 페이지 빈칸 문항과 같은 꼴(빈칸 6개): 《제목》 · ■ 절 · □ 소제목 · 표
const PAGE = [
  '《pH가 작물에 미치는 영향》',
  '',
  '이 페이지에서 답하는 질문 ___ 과 ___',
  '■ 먼저 알아 둘 말',
  '',
  '| 말 | 뜻 |',
  '| pH | ___ 이 중성 |',
  '| ___ | 숫자 1 차이가 10배 |',
  '□ 1. 기초: pH 한 칸은 ___배',
  '본문 ___ 끝.',
  '■ 출처',
  '- 《책 이름》 같은 줄은 제목이 아님',
].join('\n');

const Q_PAGE = { id: 101, type: 'fill', text: PAGE, answers: JSON.stringify(['a', 'b', '7', '로그', '10', '끝']) };
const MULTI = [
  { id: 81, type: 'MULTIPLE', text: '가루이는?', options: '["앞","뒤"]', answerIndex: 1 },
  { id: 82, type: 'OX', text: '끈끈이', answer: 'O' },
  { id: 83, type: 'fill', text: '생장점이 ___ 현상', answers: ['멈추는'] },
];

test('지문은 필기(ink)가 쓰던 계산과 같다', () => {
  const inkSource = [Q_PAGE.type, Q_PAGE.text, ['a', 'b', '7', '로그', '10', '끝'].join('\u0001')].join('\u0000');
  assert.equal(questionHash(Q_PAGE), textHash(inkSource));
  assert.equal(normalizeType('MULTIPLE_CHOICE'), 'multiple');
  assert.equal(blankCountOf(Q_PAGE), 6);
  assert.equal(blankCountOf(MULTI[0]), 0);
});

test('처음 열기: 기록 없음 → 문항 하나면 바로 순번대로, 여럿이면 고르기 화면', () => {
  const one = initialSolveState(null, [Q_PAGE]);
  assert.equal(one.mode, 'ordered');
  assert.equal(one.resumed, false);
  assert.equal(one.revealed.length, 6);
  const many = initialSolveState(null, MULTI);
  assert.equal(many.mode, null);
  assert.equal(initialSolveState(null, []).mode, null);
});

test('이어 보기: 저장 → 다시 열기(연 빈칸·읽던 자리 되살림)', () => {
  const revealed = [true, false, true, false, false, false];
  const anchor = { k: 'b', i: 3, d: 40, f: 0.31 };
  const snap = studySnapshot({ base: [Q_PAGE], questions: [Q_PAGE], mode: 'ordered', index: 0, results: {}, revealed, anchor, done: false });
  assert.deepEqual(snap.q['101'].r, [0, 2]);
  const saved = JSON.parse(JSON.stringify({ ...snap, v: 1, at: '2026-10-22T00:00:00Z' }));
  const st = initialSolveState(saved, [Q_PAGE]);
  assert.equal(st.resumed, true);
  assert.deepEqual(st.revealed, revealed);
  assert.deepEqual(st.anchor, anchor);
});

test('이어 보기: 본문이 바뀌면(지문 다름) 연 빈칸·자리는 버리고 처음부터', () => {
  const snap = studySnapshot({ base: [Q_PAGE], questions: [Q_PAGE], mode: 'ordered', index: 0, results: {}, revealed: [true], anchor: { f: 0.5 } });
  const changed = { ...Q_PAGE, text: PAGE.replace('끝.', '끝!') };
  const st = initialSolveState(snap, [changed]);
  assert.equal(st.resumed, false);
  assert.equal(st.mode, 'ordered');
  assert.ok(st.revealed.every((v) => !v));
});

test('이어 보기: 문항 묶음이 다르면 버림, 랜덤 순서·채점·보던 문항은 되살림', () => {
  const order = [MULTI[2], MULTI[0], MULTI[1]];
  const snap = studySnapshot({
    base: MULTI, questions: order, mode: 'random', index: 2,
    results: { 1: { correct: true, userAnswer: '1' } }, revealed: [], anchor: null,
  });
  assert.deepEqual(snap.order, ['83', '81', '82']);
  const st = initialSolveState(snap, MULTI);
  assert.equal(st.mode, 'random');
  assert.deepEqual(st.questions.map((q) => q.id), [83, 81, 82]);
  assert.equal(st.index, 2);
  assert.deepEqual(st.results, { 1: { correct: true, userAnswer: '1' } });
  // 문항이 하나 늘면 버림
  const st2 = initialSolveState(snap, [...MULTI, { id: 84, type: 'ox', text: 'x', answer: 'X' }]);
  assert.equal(st2.resumed, false);
  assert.equal(st2.mode, null);
});

test('끝낸(결과 화면)·고르기 화면 기록은 문항 id 만 — 다시 열면 처음부터', () => {
  const doneSnap = studySnapshot({ base: [Q_PAGE], questions: [Q_PAGE], mode: 'ordered', index: 0, results: {}, revealed: [true], anchor: { f: 0.9 }, done: true });
  assert.deepEqual(doneSnap, { ids: ['101'] });
  assert.equal(initialSolveState(doneSnap, [Q_PAGE]).resumed, false);
  assert.deepEqual(studySnapshot({ base: MULTI, questions: MULTI, mode: null, index: 0 }), { ids: ['81', '82', '83'] });
});

test('맨 위에서 아무것도 안 했으면 이어 보기 안내 없이 그냥 연다', () => {
  const snap = studySnapshot({ base: [Q_PAGE], questions: [Q_PAGE], mode: 'ordered', index: 0, results: {}, revealed: Array(6).fill(false), anchor: null });
  assert.equal(initialSolveState(snap, [Q_PAGE]).resumed, false);
});

test('망가진 기록도 화면을 멈추지 않는다', () => {
  const bad = { mode: 'ordered', ids: ['101'], cur: 'zzz', q: { 101: { h: questionHash(Q_PAGE), r: [-1, 99, 'x', 1], a: { k: 'b', i: 'x' } } } };
  const st = initialSolveState(bad, [Q_PAGE]);
  assert.equal(st.index, 0);
  assert.deepEqual(st.revealed, [false, true, false, false, false, false]);
  assert.equal(st.anchor, null);
  assert.equal(sameIdSet(['1', '1'], ['1', '2']), false);
  assert.equal(sameIdSet([1, 2], ['2', '1']), true);
});
