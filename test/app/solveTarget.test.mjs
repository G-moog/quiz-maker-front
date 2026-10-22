// 질문 메모 → 빈칸 바로 가기, 보통 ↔ 하드 바꾸기의 '처음 열 자리' 시험: utils/solveStudy.js noteTarget·applyTarget
// 실행: npm run test:app
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTarget, initialSolveState, noteTarget, studySnapshot } from '../../src/utils/solveStudy.js';

const PAGE = ['《제목》', '■ 하나 ___', '본문 ___ ___', '■ 둘', '□ 둘의 ___ 소제목', '끝 ___'].join('\n');
const Q = { id: 101, type: 'fill', text: PAGE, answers: ['a', 'b', 'c', 'd', 'e'] };
// 하드: 같은 페이지에서 낱말을 더 가림(제목 줄 '■ 둘' → '■ ___')
const HARD = ['《제목》', '■ 하나 ___', '___ ___ ___', '■ ___', '□ ___의 ___ 소제목', '___ ___'].join('\n');
const QH = { id: 201, type: 'fill', text: HARD, answers: ['a', '본문', 'b', 'c', '둘', '둘', 'd', '끝', 'e'] };
const MULTI = [
  { id: 81, type: 'fill', text: '첫 ___ 과 ___', answers: ['가', '나'] },
  { id: 82, type: 'OX', text: '끈끈이', answer: 'O' },
  { id: 83, type: 'fill', text: '생장점이 ___ 현상', answers: ['멈추는'] },
];

test('noteTarget: 문제집이 있는 메모만, 빈칸 번호는 문항이 있을 때만', () => {
  const live = new Map([['11', { id: 11, title: '[Notion] 습도', subject: '' }], ['12', { id: 12, title: '[하드] [Notion] 습도' }]]);
  assert.deepEqual(noteTarget({ setId: 11, questionId: 101, blankNo: 5, setTitle: '옛 제목' }, live),
    { set: { id: 11, title: '[Notion] 습도', subject: '' }, questionId: 101, blankNo: 5 });
  // 하드 문제집 메모는 하드로
  assert.equal(noteTarget({ setId: 12, questionId: 7, blankNo: 1 }, live).set.title, '[하드] [Notion] 습도');
  // 지운 문제집(목록에 없음)·문제집 없는 메모는 없음
  assert.equal(noteTarget({ setId: 99, questionId: 1, blankNo: 1 }, live), null);
  assert.equal(noteTarget({ setId: null, setTitle: '지움' }, live), null);
  assert.equal(noteTarget(null, live), null);
  // 목록을 못 받았으면(null) 메모의 id·제목으로(대시보드를 거치지 않은 문제집도)
  assert.deepEqual(noteTarget({ setId: 99, questionId: 3, blankNo: '2', setTitle: '쓸 때 제목' }, null),
    { set: { id: 99, title: '쓸 때 제목' }, questionId: 3, blankNo: 2 });
  // 빈칸 번호: 1 이상 정수만, 문항 id 가 없으면 버림
  assert.equal(noteTarget({ setId: 11, questionId: 101, blankNo: 0 }, live).blankNo, null);
  assert.equal(noteTarget({ setId: 11, questionId: 101, blankNo: 'x' }, live).blankNo, null);
  assert.equal(noteTarget({ setId: 11, questionId: 101, blankNo: null }, live).blankNo, null);
  assert.deepEqual(noteTarget({ setId: 11, blankNo: 3 }, live), { set: live.get('11'), questionId: null, blankNo: null });
});

test('applyTarget(메모): 문항 하나짜리 — 그 빈칸에 초점, 이어 보던 연 빈칸은 그대로', () => {
  const saved = JSON.parse(JSON.stringify(studySnapshot({
    base: [Q], questions: [Q], mode: 'ordered', index: 0, results: {}, revealed: [true, false, false, true, false],
    anchor: { f: 0.8 }, stars: { 101: [2] },
  })));
  const init = initialSolveState(saved, [Q]);
  const t = applyTarget(init, [Q], { questionId: 101, blankNo: 4 });
  assert.equal(t.found, true);
  assert.equal(t.focusBlank, 3);
  assert.equal(t.missing, null);
  assert.equal(t.resumed, false);
  assert.deepEqual(t.revealed, [true, false, false, true, false]);
  assert.deepEqual(t.stars, { 101: [2] });
  assert.equal(t.anchor, null);
});

test('applyTarget(메모): 여러 문항 — 기록이 없으면 순번대로 그 문항, 있으면 그 순서(랜덤)로', () => {
  const fresh = applyTarget(initialSolveState(null, MULTI), MULTI, { questionId: 83, blankNo: 1 });
  assert.equal(fresh.mode, 'ordered');
  assert.equal(fresh.index, 2);
  assert.equal(fresh.focusBlank, 0);
  assert.deepEqual(fresh.revealed, [false]);
  const order = [MULTI[2], MULTI[0], MULTI[1]];
  const saved = JSON.parse(JSON.stringify(studySnapshot({
    base: MULTI, questions: order, mode: 'random', index: 1, results: { 0: { correct: true, userAnswer: '' } },
    revealed: [true, false], anchor: null,
  })));
  const t = applyTarget(initialSolveState(saved, MULTI), MULTI, { questionId: 83, blankNo: 1 });
  assert.equal(t.mode, 'random');
  assert.deepEqual(t.questions.map((q) => q.id), [83, 81, 82]);
  assert.equal(t.index, 0);
  // 보던 문항(81)이 아니므로 모두 가린 채
  assert.deepEqual(t.revealed, [false]);
  assert.ok(t.results[0]);
});

test('applyTarget(메모): 문항·빈칸을 못 찾으면 알린다', () => {
  const init = initialSolveState(null, [Q]);
  const noQ = applyTarget(init, [Q], { questionId: 999, blankNo: 1 });
  assert.equal(noQ.found, false);
  assert.equal(noQ.missing, 'question');
  const noBlank = applyTarget(init, [Q], { questionId: 101, blankNo: 6 });
  assert.equal(noBlank.found, true);
  assert.equal(noBlank.missing, 'blank');
  assert.equal(noBlank.focusBlank, null);
  assert.equal(applyTarget(init, [], { questionId: 1 }).found, false);
  assert.equal(applyTarget(init, [Q], null).found, false);
});

test('applyTarget(바꾸기): 하드 쪽에서 같은 제목(빈칸이 된 제목도)을 찾아 절 안 비율로', () => {
  const init = initialSolveState(null, [QH]);
  // 보통 쪽 '■ 둘'(hid 2, 제목 4개)을 읽던 중 → 하드 쪽 '■ ___'(hid 2)
  const t = applyTarget(init, [QH], { qIndex: 0, heading: { kind: 'h1', label: '둘', hid: 2, total: 4 }, p: 0.4, f: 0.6 });
  assert.equal(t.found, true);
  assert.deepEqual(t.anchor, { k: 'h', i: 2, d: 0, p: 0.4 });
  // '□ 둘의 (  ) 소제목' → '□ (  )의 (  ) 소제목'(hid 3)
  const t2 = applyTarget(init, [QH], { qIndex: 0, heading: { kind: 'h2', label: '둘의 (  ) 소제목', hid: 3, total: 4 }, p: 2 });
  assert.deepEqual(t2.anchor, { k: 'h', i: 3, d: 0, p: 1 });
  // 제목이 없으면(맨 위 근처) 본문 비율
  const t3 = applyTarget(init, [QH], { qIndex: 0, heading: null, p: 0, f: 0.25 });
  assert.deepEqual(t3.anchor, { f: 0.25 });
  // 아무것도 없으면 맨 위
  assert.equal(applyTarget(init, [QH], { qIndex: 0, heading: null, f: null }).anchor, null);
  // 순번(qIndex)이 넘치면 마지막 문항
  assert.equal(applyTarget(initialSolveState(null, MULTI), MULTI, { qIndex: 9 }).index, 2);
});
