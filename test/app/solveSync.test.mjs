// 공부 기록 나누기에 쓰는 풀기 화면 쪽 순수 함수 시험: utils/solveStudy.js progressOf·rebaseStudy·refreshView
// (사용자가 진도를 바꿨는지 견주기, 화면이 보여 주지 못한 다른 기기 기록 위에 이 화면에서 한 일을 얹기, 받은 기록을 화면에 얹기)
// 실행: npm run test:app  (화면·서버 없이 함수만 부름)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialSolveState, progressOf, rebaseStudy, refreshView, studySnapshot } from '../../src/utils/solveStudy.js';

const PAGE = Array.from({ length: 30 }, (_, i) => `■ 절 ${i}\n문장 ___ 입니다.`).join('\n');
const Q = { id: 101, type: 'fill', text: PAGE, answers: Array.from({ length: 30 }, (_, i) => `답${i}`) };
const MULTI = [
  { id: 81, type: 'fill', text: '첫 ___ 과 ___ 그리고 ___', answers: ['가', '나', '다'] },
  { id: 82, type: 'OX', text: '끈끈이', answer: 'O' },
  { id: 83, type: 'fill', text: '생장점이 ___ 현상, ___', answers: ['멈추는', '끝'] },
];
// 서버를 거친 것처럼(jsonb 는 칸 순서를 바꾼다)
const viaServer = (v) => JSON.parse(JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.entries(x).reverse()) : x)));
const flags = (n, on) => Array.from({ length: n }, (_, i) => on.includes(i));
const page = ({ r = [], a = null, s = null, f = null } = {}) => studySnapshot({
  base: [Q], questions: [Q], mode: 'ordered', index: 0, results: {}, revealed: flags(30, r), anchor: a,
  stars: s ? { 101: s } : {}, filterPre: f,
});
const key = (v) => JSON.stringify(progressOf(v), (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => (p < q ? -1 : 1))) : x));

test('progressOf: 읽던 자리·진도 없는 꼴의 차이는 같게, ★·연 빈칸·보던 문항·채점은 다르게', () => {
  // 끝낸 기록({ ids } + ★) ↔ 문항 하나짜리를 연 '순번대로' 첫 문항(같은 ★, 아무것도 안 함): 같은 진도
  const finished = studySnapshot({ base: [Q], questions: [Q], mode: 'ordered', index: 0, done: true, stars: { 101: [3] } });
  assert.deepEqual(Object.keys(finished).sort(), ['ids', 'q']);
  assert.equal(key(finished), key(page({ s: [3] })));
  assert.equal(key(finished), key(page({ s: [3], a: { k: 'h', i: 4, d: 10, f: 0.2 } })), '읽던 자리만 다름');
  assert.equal(key(viaServer(page({ r: [1, 2], s: [3], a: { f: 0.1 } }))), key(page({ r: [1, 2], s: [3], a: { f: 0.9 } })), '칸 순서 상관없음');
  assert.equal(key({ ids: ['101'] }), key(page({})), '고르기 화면·맨 위 아무것도 안 함');
  assert.notEqual(key(page({ s: [3] })), key(page({ s: [3, 4] })), '★ 달기');
  assert.notEqual(key(page({ s: [3] })), key(page({})), '마지막 ★ 떼기');
  assert.notEqual(key(page({ r: [1] })), key(page({})), '빈칸 열기');
  assert.notEqual(key(page({ r: [1] })), key(page({ r: [1], f: [1] })), '★만 가리기');
  const multi = (over) => studySnapshot({ base: MULTI, questions: MULTI, mode: 'ordered', index: 0, results: {}, revealed: [false, false, false], anchor: null, ...over });
  assert.notEqual(key(multi({})), key(multi({ index: 1, revealed: [] })), '다음 문항으로');
  assert.notEqual(key(multi({ index: 1, revealed: [] })), key(multi({ index: 1, revealed: [], results: { 1: { correct: true, userAnswer: 'O' } } })), '채점');
  // ★ 만 있던 문항의 ★ 를 떼어도 자리 진도는 그대로(★ 만 바뀜)
  const a = multi({ revealed: [true, false, false], stars: { 83: [1] } });
  const b = multi({ revealed: [true, false, false] });
  assert.deepEqual(progressOf(a).p, progressOf(b).p);
  assert.equal(progressOf(null), null);
  assert.deepEqual(progressOf({ x: 1 }), { x: 1 }, '풀기 화면 꼴이 아닌 값은 그대로');
});

test('rebaseStudy(같은 자리): 다른 기기에서 연 빈칸·★ 은 남기고, 이 화면에서 열고 닫은 것·단 ★·옮긴 자리를 얹는다', () => {
  const base = page({ r: [0, 1, 2], s: [5], a: { f: 0.1 } });
  const theirs = viaServer(page({ r: [0, 1, 2, 10, 11], s: [5, 12, 13], a: { k: 'h', i: 9, d: 40, f: 0.5 } }));
  // 이 화면: 빈칸 20 을 열고 1 을 닫음, ★ 5 를 떼고 21 을 담, 자리는 그대로
  const mine = page({ r: [0, 2, 20], s: [21], a: { f: 0.1 } });
  const out = rebaseStudy(base, mine, theirs);
  assert.deepEqual(out.q[101].r, [0, 2, 10, 11, 20]);
  assert.deepEqual(out.q[101].s, [12, 13, 21]);
  assert.deepEqual(out.q[101].a, { k: 'h', i: 9, d: 40, f: 0.5 }, '이 화면에서 옮기지 않은 자리는 다른 기기 것');
  // 이 화면에서 자리를 옮겼으면 이 화면 것
  const moved = rebaseStudy(base, page({ r: [0, 1, 2], s: [5], a: { f: 0.3 } }), theirs);
  assert.deepEqual(moved.q[101].a, { f: 0.3 });
  assert.deepEqual(moved.q[101].r, [0, 1, 2, 10, 11]);
  // 이 화면에서 한 일이 없으면 theirs 그대로(내용으로)
  assert.equal(key(rebaseStudy(base, base, theirs)), key(theirs));
  assert.deepEqual(rebaseStudy(base, base, theirs).q[101].r, theirs.q[101].r);
  // 결과는 다시 열 수 있는 꼴(이어 보기)
  const init = initialSolveState(out, [Q]);
  assert.equal(init.resumed, true);
  assert.deepEqual(init.stars, { 101: [12, 13, 21] });
});

test('rebaseStudy(다른 자리): ★ 만 바꿨으면 다른 기기 자리 + ★ 합침, 진도를 바꿨으면 이 화면 자리 + ★ 합침', () => {
  const multi = (over) => studySnapshot({ base: MULTI, questions: MULTI, mode: 'ordered', index: 0, results: {}, revealed: [false, false, false], anchor: null, ...over });
  const base = multi({ revealed: [true, false, false], stars: { 81: [2] } });
  // 다른 기기: 둘째 문항까지 가서 채점, 셋째 문항 ★
  const theirs = viaServer(multi({ index: 1, revealed: [], results: { 0: { correct: true, userAnswer: '' } }, counts: { 81: 1 }, stars: { 81: [2], 83: [0] } }));
  // 이 화면: 첫 문항에서 ★ 만 하나 더
  const starOnly = rebaseStudy(base, multi({ revealed: [true, false, false], stars: { 81: [1, 2] } }), theirs);
  assert.equal(starOnly.cur, '82', '다른 기기 자리');
  assert.deepEqual(starOnly.res, theirs.res);
  assert.deepEqual([starOnly.q[81].s, starOnly.q[83].s], [[1, 2], [0]]);
  // 이 화면: 첫 문항 빈칸을 더 엶(진도) → 이 화면 자리, ★ 는 합침
  const opened = rebaseStudy(base, multi({ revealed: [true, true, false], stars: { 81: [2] } }), theirs);
  assert.equal(opened.cur, '81');
  assert.deepEqual(opened.q[81].r, [0, 1]);
  assert.deepEqual(opened.q[83].s, [0], '다른 기기에서 단 ★ 는 남김');
  // 끝낸 기록(다른 기기) 위에서 이 화면이 빈칸을 엶 → 이 화면 자리(이어 공부), ★ 합침
  const done = viaServer(studySnapshot({ base: [Q], questions: [Q], mode: 'ordered', index: 0, done: true, stars: { 101: [3, 7] } }));
  const cont = rebaseStudy(page({ r: [1], s: [3] }), page({ r: [1, 2], s: [3] }), done);
  assert.deepEqual([cont.mode, cont.q[101].r, cont.q[101].s], ['ordered', [1, 2], [3, 7]]);
  // 이 화면에서 끝냄(진도를 비움) → 끝낸 꼴 + ★ 합침
  const finished = rebaseStudy(page({ r: [1], s: [3] }), studySnapshot({ base: [Q], questions: [Q], mode: 'ordered', index: 0, done: true, stars: { 101: [3] } }), viaServer(page({ r: [1, 4], s: [3, 9] })));
  assert.deepEqual(Object.keys(finished).sort(), ['ids', 'q']);
  assert.deepEqual(finished.q[101].s, [3, 9]);
  // 마지막 ★ 를 떼어 문항 칸이 비면 칸째 뺀다
  const starred = studySnapshot({ base: [Q], questions: [Q], mode: null, index: 0, stars: { 101: [3] } });
  assert.deepEqual(rebaseStudy(starred, { ids: ['101'] }, viaServer(starred)), { ids: ['101'] });
});

test('rebaseStudy: 본문이 바뀐 문항(지문 h 가 다름)은 이 화면 것, 풀기 화면 꼴이 아닌 값은 이 화면 것 그대로', () => {
  const mine = page({ r: [1], s: [2] });
  const theirs = viaServer(page({ r: [1, 5], s: [2, 6] }));
  theirs.q[101].h = 'other';
  const out = rebaseStudy(page({ r: [1], s: [2] }), mine, theirs);
  assert.deepEqual([out.q[101].r, out.q[101].s], [[1], [2]]);
  assert.deepEqual(rebaseStudy(null, { x: 2 }, { x: 1 }), { x: 2 });
});

test('refreshView: 같은 문항이면 받은 연 빈칸·★·★만 가리기를 화면에, 다른 문항·끝낸 기록이면 ★ 만', () => {
  const view = { base: [Q], questions: [Q], mode: 'ordered', index: 0 };
  const rec = viaServer(page({ r: [0, 3], s: [4], f: [0] }));
  const v = refreshView(rec, view);
  assert.equal(v.same, true);
  assert.deepEqual(v.revealed.flatMap((x, i) => (x ? [i] : [])), [0, 3]);
  assert.deepEqual([v.stars, v.filterPre], [{ 101: [4] }, [0]]);
  const done = refreshView(viaServer(studySnapshot({ base: [Q], questions: [Q], mode: 'ordered', index: 0, done: true, stars: { 101: [8] } })), view);
  assert.deepEqual(done, { same: false, stars: { 101: [8] } }, '끝낸 기록은 화면의 연 빈칸을 닫지 않음');
  const mv = { base: MULTI, questions: MULTI, mode: 'ordered', index: 0 };
  const other = viaServer(studySnapshot({ base: MULTI, questions: MULTI, mode: 'ordered', index: 1, results: {}, revealed: [], anchor: null, stars: { 81: [1] } }));
  assert.deepEqual(refreshView(other, mv), { same: false, stars: { 81: [1] } }, '다른 문항으로 간 기록은 화면을 옮기지 않음');
  assert.equal(refreshView(other, { ...mv, index: 1 }).same, true);
  assert.equal(refreshView(other, { ...mv, mode: null }).same, false, '고르기 화면');
});
