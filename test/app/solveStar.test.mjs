// ★(헷갈림 표시)·★만 가리기·지나온 문항 수 기록 시험: utils/solveStudy.js
// 실행: npm run test:app  (화면·서버 없이 함수만 부름)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanIndices, countIn, flagsOf, indicesOf, initialSolveState, keepResume, openedIndices, questionHash, savedStars,
  starOnlyRevealed, studySnapshot, toggleIndex,
} from '../../src/utils/solveStudy.js';

const PAGE = [
  '《pH》',
  '■ 먼저 ___ 과 ___',
  '| 말 | 뜻 |',
  '| pH | ___ 이 중성 |',
  '□ 기초: ___배',
  '본문 ___ 끝 ___.',
].join('\n');
const Q = { id: 101, type: 'fill', text: PAGE, answers: JSON.stringify(['a', 'b', '7', '10', '끝', '점']) };
const MULTI = [
  { id: 81, type: 'fill', text: '첫 ___ 과 ___ 그리고 ___', answers: ['가', '나', '다'] },
  { id: 82, type: 'OX', text: '끈끈이', answer: 'O' },
  { id: 83, type: 'fill', text: '생장점이 ___ 현상, ___', answers: ['멈추는', '끝'] },
];
// 저장소를 거친 것처럼(JSON) + studyState 가 붙이는 v·at
const stored = (snap) => JSON.parse(JSON.stringify({ ...snap, v: 1, at: '2026-10-22T00:00:00Z' }));

test('번호 목록 도우미: 달기/떼기·정리·[참/거짓] 바꾸기·범위 세기', () => {
  assert.deepEqual(toggleIndex([3, 1], 2), [1, 2, 3]);
  assert.deepEqual(toggleIndex([1, 2, 3], 2), [1, 3]);
  assert.deepEqual(toggleIndex(undefined, 0), [0]);
  assert.deepEqual(cleanIndices([5, 1, 1, -1, 'x', 2.5, 9], 6), [1, 5]);
  assert.deepEqual(cleanIndices('x', 6), []);
  assert.deepEqual(indicesOf([false, true, true]), [1, 2]);
  assert.deepEqual(flagsOf(4, [0, 3, 7]), [true, false, false, true]);
  assert.equal(countIn([true, false, true, true], 1, 4), 2);
  assert.equal(countIn(null, 0, 3), 0);
  // ★만 가리기: ★ 아닌 칸은 열고 ★ 칸만 가림
  assert.deepEqual(starOnlyRevealed(5, [1, 3]), [true, false, true, false, true]);
});

test('★ 는 저장 → 다시 열기에서 되살아난다(이어 보기와 함께)', () => {
  const snap = studySnapshot({
    base: [Q], questions: [Q], mode: 'ordered', index: 0, results: {},
    revealed: [true, false, false, false, false, false], anchor: { k: 'b', i: 2, d: 30, f: 0.4 },
    stars: { 101: [1, 4] },
  });
  assert.deepEqual(snap.q['101'].s, [1, 4]);
  assert.deepEqual(snap.q['101'].r, [0]);
  const st = initialSolveState(stored(snap), [Q]);
  assert.equal(st.resumed, true);
  assert.deepEqual(st.stars, { 101: [1, 4] });
  assert.equal(st.filterPre, null);
});

test('★ 만 있고 연 빈칸·자리가 없으면 이어 보기 안내 없이 열되 ★ 는 그대로', () => {
  const snap = studySnapshot({
    base: [Q], questions: [Q], mode: 'ordered', index: 0, results: {}, revealed: Array(6).fill(false), anchor: null,
    stars: { 101: [0] },
  });
  const st = initialSolveState(stored(snap), [Q]);
  assert.equal(st.resumed, false);
  assert.deepEqual(st.stars, { 101: [0] });
});

test('끝낸 뒤(결과 화면)·고르기 화면 기록에도 ★ 는 남는다 — 연 빈칸·자리는 버림', () => {
  const doneSnap = studySnapshot({
    base: [Q], questions: [Q], mode: 'ordered', index: 0, results: {}, revealed: [true], anchor: { f: 0.9 }, done: true,
    stars: { 101: [2, 5] }, counts: { 101: 4 },
  });
  assert.deepEqual(doneSnap, { ids: ['101'], q: { 101: { h: questionHash(Q), s: [2, 5] } } });
  const st = initialSolveState(stored(doneSnap), [Q]);
  assert.equal(st.resumed, false);
  assert.deepEqual(st.stars, { 101: [2, 5] });
  assert.ok(st.revealed.every((v) => !v));
  // ★ 가 없으면 예전과 똑같이 { ids } 만
  assert.deepEqual(studySnapshot({ base: MULTI, questions: MULTI, mode: null, index: 0, stars: {} }), { ids: ['81', '82', '83'] });
});

test('여러 문항: ★ 는 문항마다(지금 문항이 아니어도), 지나온 문항의 연 빈칸 수(n)도 남긴다', () => {
  const snap = studySnapshot({
    base: MULTI, questions: MULTI, mode: 'ordered', index: 2, results: { 1: { correct: true, userAnswer: 'O' } },
    revealed: [true, false], anchor: null, stars: { 81: [0, 2], 83: [1] }, counts: { 81: 2, 83: 9 },
  });
  assert.deepEqual(snap.q['81'], { h: questionHash(MULTI[0]), s: [0, 2], n: 2 });
  // 지금 문항은 n 대신 r(연 빈칸)
  assert.equal(snap.q['83'].n, undefined);
  assert.deepEqual(snap.q['83'].s, [1]);
  assert.deepEqual(snap.q['83'].r, [0]);
  const st = initialSolveState(stored(snap), MULTI);
  assert.equal(st.index, 2);
  assert.deepEqual(st.stars, { 81: [0, 2], 83: [1] });
  assert.deepEqual(st.counts, { 81: 2 });
});

test('★만 가리기 상태(f: 켜기 전 연 빈칸)도 이어 보기로 되살린다', () => {
  const snap = studySnapshot({
    base: [Q], questions: [Q], mode: 'ordered', index: 0, results: {},
    revealed: starOnlyRevealed(6, [1, 4]), anchor: null, stars: { 101: [1, 4] }, filterPre: [0, 3],
  });
  assert.deepEqual(snap.q['101'].f, [0, 3]);
  const st = initialSolveState(stored(snap), [Q]);
  assert.deepEqual(st.filterPre, [0, 3]);
  assert.deepEqual(st.revealed, [true, false, true, true, false, true]);
});

test('옛 기록(★·n·f 없음)도 그대로 읽힌다', () => {
  const old = {
    v: 1, at: '2026-10-21T00:00:00Z', mode: 'ordered', ids: ['101'], cur: '101',
    q: { 101: { h: questionHash(Q), r: [0, 2], a: { k: 'h', i: 1, d: 12, f: 0.2 } } },
  };
  const st = initialSolveState(old, [Q]);
  assert.equal(st.resumed, true);
  assert.deepEqual(st.revealed, [true, false, true, false, false, false]);
  assert.deepEqual(st.stars, {});
  assert.deepEqual(st.counts, {});
  assert.equal(st.filterPre, null);
  // 기록이 아예 없거나 망가져도
  assert.deepEqual(savedStars(null, [Q]), {});
  assert.deepEqual(savedStars({ q: 'x' }, [Q]), {});
  assert.deepEqual(initialSolveState({ q: { 101: { h: 'zz', s: 'bad' } } }, [Q]).stars, {});
});

test('본문이 바뀐 문항의 ★ 는 버리고, 다른 문항의 ★ 는 남긴다(문항 묶음이 바뀌어도)', () => {
  const snap = studySnapshot({ base: MULTI, questions: MULTI, mode: null, index: 0, stars: { 81: [1], 83: [0] } });
  const changed = [MULTI[0], MULTI[1], { ...MULTI[2], text: MULTI[2].text.replace('현상', '현상!') }, { id: 84, type: 'ox', text: 'x' }];
  assert.deepEqual(savedStars(stored(snap), changed), { 81: [1] });
  // 빈칸 수를 넘는 번호·이상한 값은 버림
  const bad = { q: { 81: { h: questionHash(MULTI[0]), s: [9, -1, 'x', 2, 2] } } };
  assert.deepEqual(savedStars(bad, MULTI), { 81: [2] });
});

test('스스로 연 빈칸(openedIndices): ★만 가리기가 대신 연 칸은 세지 않는다', () => {
  // 꺼져 있으면 화면 그대로
  assert.deepEqual(openedIndices([true, false, true], [false, true, false], null), [0, 2]);
  // 빈칸 6개, ★ 1·4, 켜기 전 연 칸 0·1 → 켜면 화면은 [열림, 가림, 열림, 열림, 가림, 열림]
  const stars = flagsOf(6, [1, 4]);
  const pre = [0, 1];
  const on = starOnlyRevealed(6, [1, 4]);
  // 켠 직후: 켜기 전에 연 0(★ 아님)·1(★ — 지금은 가려졌어도)만
  assert.deepEqual(openedIndices(on, stars, pre), [0, 1]);
  // 켠 동안 ★ 4 를 열고, 가리기가 연 ★ 아닌 2·3·5 는 그대로 → 0·1·4
  const opened4 = [...on]; opened4[4] = true;
  assert.deepEqual(openedIndices(opened4, stars, pre), [0, 1, 4]);
  // 켜기 전에 연 ★ 아닌 0 을 켠 동안 닫으면 빠진다
  const closed0 = [...opened4]; closed0[0] = false;
  assert.deepEqual(openedIndices(closed0, stars, pre), [1, 4]);
  // 리뷰 재현: 37칸·★ 2·9·20·켜기 전 0 하나만 열고 ★만 가리기 → '연 빈칸 1/37'(예전 34/37)
  const st37 = flagsOf(37, [2, 9, 20]);
  assert.equal(openedIndices(starOnlyRevealed(37, [2, 9, 20]), st37, [0]).length, 1);
  // 길이·값이 이상해도 멈추지 않음
  assert.deepEqual(openedIndices(null, null, [0]), []);
});

test('메모 엿보기(keepResume): 같은 문항이면 연 빈칸·★ 은 지금 것, 읽던 자리는 지난 것', () => {
  const before = stored(studySnapshot({
    base: [Q], questions: [Q], mode: 'ordered', index: 0, results: {}, revealed: [true, false, false, false, false, false],
    anchor: { k: 'b', i: 5, d: 40, f: 0.9 },
  }));
  const now = studySnapshot({
    base: [Q], questions: [Q], mode: 'ordered', index: 0, results: {}, revealed: [true, true, false, false, false, false],
    anchor: { k: 'b', i: 1, d: 120, f: 0.1 }, stars: { 101: [1] },
  });
  const kept = keepResume(now, before);
  assert.deepEqual(kept.q['101'].a, { k: 'b', i: 5, d: 40, f: 0.9 });
  assert.deepEqual(kept.q['101'].r, [0, 1]);
  assert.deepEqual(kept.q['101'].s, [1]);
  // 다시 열면 읽던 곳(빈칸 6)에서
  const st = initialSolveState(stored(kept), [Q]);
  assert.deepEqual(st.anchor, { k: 'b', i: 5, d: 40, f: 0.9 });
});

test('메모 엿보기: 다른 문항을 봤으면 지난 기록 그대로 + ★ 만 지금 것, 기록이 없었으면 지금 상태 그대로', () => {
  const before = stored(studySnapshot({
    base: MULTI, questions: MULTI, mode: 'ordered', index: 0, results: {}, revealed: [true, false, false],
    anchor: { f: 0.5 }, stars: { 81: [2] },
  }));
  const now = studySnapshot({
    base: MULTI, questions: MULTI, mode: 'ordered', index: 2, results: {}, revealed: [true, true],
    anchor: null, stars: { 81: [2], 83: [0] },
  });
  const kept = keepResume(now, before);
  assert.equal(kept.cur, '81');
  assert.equal(kept.v, undefined);
  assert.deepEqual(kept.q['81'].r, [0]);
  assert.deepEqual(kept.q['81'].a, { f: 0.5 });
  assert.deepEqual(kept.q['81'].s, [2]);
  assert.deepEqual(kept.q['83'], { h: questionHash(MULTI[2]), s: [0] });
  const st = initialSolveState(stored(kept), MULTI);
  assert.equal(st.index, 0);
  assert.deepEqual(st.stars, { 81: [2], 83: [0] });
  // ★ 를 뗐으면 지난 기록의 ★ 도 사라진다
  const unstar = keepResume({ ...now, q: { 83: { h: questionHash(MULTI[2]), r: [0] } } }, before);
  assert.equal(unstar.q['81'].s, undefined);
  // 이어 볼 기록이 없었으면(처음 엶·끝낸 기록) 지킬 자리가 없다 — 지금 상태를 그대로 저장해 메모에서 와 공부한 것이 남는다
  assert.equal(keepResume(now, null), now);
  const finished = stored({ ids: ['81', '82', '83'], q: { 81: { h: questionHash(MULTI[0]), s: [2] } } });
  const afterDone = keepResume(now, finished);
  assert.equal(afterDone, now);
  const st2 = initialSolveState(stored(afterDone), MULTI);
  assert.equal(st2.resumed, true);
  assert.equal(st2.index, 2);
  assert.deepEqual(st2.revealed, [true, true]);
  assert.deepEqual(st2.stars, { 81: [2], 83: [0] });
});

test('메모 엿보기: 기록이 없던 페이지 문제집 — 메모의 빈칸에서 연 빈칸·읽던 자리가 다음 열 때 이어진다', () => {
  const now = studySnapshot({
    base: [Q], questions: [Q], mode: 'ordered', index: 0, results: {},
    revealed: [false, false, true, true, false, false], anchor: { k: 'b', i: 3, d: 60, f: 0.7 },
  });
  const kept = keepResume(now, stored({ ids: ['101'] }));
  const st = initialSolveState(stored(kept), [Q]);
  assert.equal(st.resumed, true);
  assert.deepEqual(st.revealed, [false, false, true, true, false, false]);
  assert.deepEqual(st.anchor, { k: 'b', i: 3, d: 60, f: 0.7 });
});
