// 필기(S펜) 순수 계산 시험: 콕·두 번 콕 판정, 손바닥(접촉 크기·긋는 중), 스크롤을 멈춘 터치, 폭 맞추기, 높이 어긋남, 저장 형식.
// 실행: npm run test:app  (화면·브라우저 없이 함수만 부름)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOUBLE_TAP_MS, DRIFT_PX, PALM_CONTACT_PX, PALM_MS, PEN_BLANK_TAP_SLOP, PEN_HELD_MAX_MS, PEN_STUCK_MS,
  SCROLL_MOVING_MS, SCROLL_TAP_GUARD_MS, TAP_MS, TAP_SLOP, WIDTH_TOLERANCE_PX,
  driftExceeds, isDoubleTap, isLargeContact, isTap, matchWidth, packPoints, packRecord, packStroke, palmBlocked,
  portableRecord, tapBlockedByScroll, tapSlop, textHash, unpackPoints, unpackRecord,
} from '../../src/ink/geometry.js';

let id = 0;
const newId = () => ++id;

test('문턱값: 보수적인 범위(실기기 확인 전)', () => {
  assert.equal(TAP_SLOP, 6);
  assert.ok(PEN_BLANK_TAP_SLOP >= 10 && PEN_BLANK_TAP_SLOP <= 14);
  assert.equal(TAP_MS, 300);
  assert.ok(PALM_CONTACT_PX >= 30 && PALM_CONTACT_PX <= 45);
  assert.ok(SCROLL_TAP_GUARD_MS >= 200 && SCROLL_TAP_GUARD_MS <= 400);
  assert.ok(DRIFT_PX >= 6 && DRIFT_PX <= 8);
});

test('펜 콕: 빈칸 위는 12px 미만·300ms 미만이면 콕, 빈칸 밖은 6px 그대로', () => {
  const onBlank = tapSlop('pen', true);
  const offBlank = tapSlop('pen', false);
  assert.equal(onBlank, PEN_BLANK_TAP_SLOP);
  assert.equal(offBlank, TAP_SLOP);
  assert.equal(isTap(10, 120, 'pen', onBlank), true, 'S펜 촉이 10px 미끄러진 콕');
  assert.equal(isTap(11.9, 290, 'pen', onBlank), true);
  assert.equal(isTap(12, 120, 'pen', onBlank), false, '12px 이상은 선');
  assert.equal(isTap(10, 120, 'pen', offBlank), false, '빈칸 밖의 짧은 선은 선(점 찍기)');
  assert.equal(isTap(5, 120, 'pen', offBlank), true);
  assert.equal(isTap(3, TAP_MS, 'pen', onBlank), false, '시간 한도는 늘 본다 — 오래 누른 것은 점');
  assert.equal(isTap(3, 2000, 'mouse'), true, '마우스는 시간 상관없음');
  assert.equal(tapSlop('mouse', true), TAP_SLOP, '마우스·손은 넓히지 않음');
  assert.equal(tapSlop('touch', true), TAP_SLOP);
});

test('두 번 콕: 같은 빈칸, 400ms 안', () => {
  const a = { blank: 3, downAt: 0, upAt: 80 };
  assert.equal(isDoubleTap(a, { blank: 3, downAt: 80 + DOUBLE_TAP_MS, upAt: 600 }), true);
  assert.equal(isDoubleTap(a, { blank: 3, downAt: 81 + DOUBLE_TAP_MS, upAt: 600 }), false);
  assert.equal(isDoubleTap(a, { blank: 4, downAt: 200, upAt: 260 }), false);
  assert.equal(isDoubleTap(null, { blank: 3, downAt: 200, upAt: 260 }), false);
  assert.equal(isDoubleTap({ blank: null, downAt: 0, upAt: 50 }, { blank: null, downAt: 100, upAt: 150 }), false);
});

test('손바닥 접촉 크기: 너비·높이 중 큰 값이 문턱을 넘으면', () => {
  assert.equal(isLargeContact(1, 1), false, '크기를 모르는 기기');
  assert.equal(isLargeContact(22, 28), false, '손가락');
  assert.equal(isLargeContact(PALM_CONTACT_PX, PALM_CONTACT_PX), false, '문턱과 같으면 아님');
  assert.equal(isLargeContact(PALM_CONTACT_PX + 1, 10), true);
  assert.equal(isLargeContact(12, 80), true, '손 옆날(길쭉함)');
  assert.equal(isLargeContact(NaN, undefined), false);
});

test('스크롤을 멈춘 터치: 관성 중·끝난 뒤 잠깐·페이지가 움직이는 중', () => {
  assert.equal(tapBlockedByScroll({ gliding: true, now: 10000 }), true);
  assert.equal(tapBlockedByScroll({ now: 1000, scrollEndAt: 1000 - SCROLL_TAP_GUARD_MS + 1 }), true);
  assert.equal(tapBlockedByScroll({ now: 1000, scrollEndAt: 1000 - SCROLL_TAP_GUARD_MS }), false);
  assert.equal(tapBlockedByScroll({ now: 1000, scrollEndAt: 1001 }), true, '이벤트 시각이 멈춘 때보다 앞서도');
  assert.equal(tapBlockedByScroll({ now: 1000, scrollAt: 1000 - SCROLL_MOVING_MS + 1 }), true);
  assert.equal(tapBlockedByScroll({ now: 1000, scrollAt: 1000 - SCROLL_MOVING_MS - 1 }), false);
  assert.equal(tapBlockedByScroll({ now: 1000 }), false, '스크롤한 적 없음');
});

test('손바닥 무시: 긋는 중인 펜은 가만히 대고 있어도(2초 넘어도) 막는다', () => {
  const base = { penDown: true, lastPenDown: 0, lastPenHover: 0, lastPenUp: -Infinity, penActiveAt: null };
  assert.equal(palmBlocked(base, PEN_STUCK_MS - 1), true);
  assert.equal(palmBlocked(base, PEN_STUCK_MS + 1), false, '예전: 2초 뒤에는 풀림(떼기를 놓친 펜 대비)');
  const held = { ...base, penActiveAt: 0 };
  assert.equal(palmBlocked(held, PEN_STUCK_MS + 1), true, '이제: 영역에서 긋는 중이면 계속');
  assert.equal(palmBlocked(held, PEN_HELD_MAX_MS - 1, true), true, '머리 줄(safe)도');
  assert.equal(palmBlocked(held, PEN_HELD_MAX_MS + 1), false, '안전 한도');
  const idle = { penDown: false, lastPenDown: 0, lastPenHover: 1000, lastPenUp: 1000, penActiveAt: null };
  assert.equal(palmBlocked(idle, 1000 + PALM_MS - 1), true);
  assert.equal(palmBlocked(idle, 1000 + PALM_MS + 1), false);
});

test('폭 맞추기: 같은 폭 > ±3px 안 가장 가까운 폭 > 지금 폭', () => {
  const L = (n, at = 0) => ({ strokes: Array(n).fill({}), updatedAt: at });
  assert.equal(matchWidth({ 590: L(1) }, 590), 590);
  assert.equal(matchWidth({ 590: L(1) }, 592), 590);
  assert.equal(matchWidth({ 590: L(1) }, 590 + WIDTH_TOLERANCE_PX + 1), 590 + WIDTH_TOLERANCE_PX + 1, '너무 멀면 지금 폭');
  assert.equal(matchWidth({ 589: L(1), 592: L(1) }, 591), 592, '더 가까운 쪽');
  assert.equal(matchWidth({ 589: L(1, 5), 593: L(1, 9) }, 591), 593, '거리가 같으면 최근에 쓴 쪽');
  assert.equal(matchWidth({ 591: L(0), 590: L(1) }, 591), 590, '선이 없는 폭은 건너뜀');
  assert.equal(matchWidth(null, 591), 591);
  assert.equal(matchWidth({ 590: L(1) }, 0), 0);
});

test('높이 어긋남: 긴 문항에서도 한 줄(31px)이면 알린다', () => {
  assert.equal(driftExceeds(25800, 25831), true, '예전 문턱(2% = 516px)이면 놓침');
  assert.equal(driftExceeds(25800, 25800 + DRIFT_PX), false);
  assert.equal(driftExceeds(25800, 25800 + DRIFT_PX + 1), true);
  assert.equal(driftExceeds(600, 597), false);
  assert.equal(driftExceeds(0, 500), false, '높이를 모르면 아님');
});

test('저장 형식(판 2): 점을 정수 배열 한 덩어리로, 다시 읽으면 같은 값', () => {
  const pts = [[10.1, 20.2, 0.5], [-12.3, 25800.7, 0.57], [33, 44, 1]];
  const q = packPoints(pts);
  assert.ok(q instanceof Int32Array);
  assert.deepEqual([...q], [101, 202, 50, -123, 258007, 57, 330, 440, 100]);
  assert.deepEqual(unpackPoints(q), pts);
  const st = { tool: 'pen', color: '#ff4d4f', w: 2.5, pts, id: 1 };
  assert.equal(packStroke(st), packStroke(st), '선마다 한 번만 만든다(다음 저장부터 그대로)');
  const rec = { textHash: 'h1', layouts: { 590: { height: 1200.4, strokes: [st], updatedAt: 7 }, 800: { height: 1, strokes: [], updatedAt: 1 } } };
  const raw = packRecord(rec);
  assert.deepEqual(Object.keys(raw.layouts), ['590'], '선 없는 폭은 뺌');
  assert.equal(raw.layouts[590].height, 1200);
  const back = unpackRecord(structuredClone(raw), newId);
  assert.deepEqual(back.layouts[590].strokes[0].pts, pts);
  assert.equal(back.layouts[590].updatedAt, 7);
  assert.equal(packRecord({ textHash: 'x', layouts: {} }), null, '선이 없으면 지움');
});

test('저장 형식: 판 1(pts 중첩 배열)도 읽고, 모양이 틀린 선은 버린다', () => {
  const raw = {
    textHash: 'h', layouts: {
      590: {
        height: 900, updatedAt: 3, strokes: [
          { tool: 'pen', color: '#ff4d4f', w: 2.5, pts: [[1, 2, 0.4], [3, 4]] },
          { tool: 'hl', color: '#facc15', w: 16, q: [10, 20, 50, 30, 40, 50] },
          { tool: 'laser', color: '#fff', w: 1, pts: [[1, 2, 3]] },
          { tool: 'pen', color: '#fff', w: 1, q: [1, 2] },
          { tool: 'pen', color: '#fff', w: 1, pts: [] },
          null,
        ],
      },
      600: { strokes: 'x' },
    },
  };
  const rec = unpackRecord(raw, newId);
  const s = rec.layouts[590].strokes;
  assert.equal(s.length, 2);
  assert.deepEqual(s[0].pts, [[1, 2, 0.4], [3, 4, 0.5]], '힘이 없으면 보통 힘');
  assert.deepEqual(s[1].pts, [[1, 2, 0.5], [3, 4, 0.5]]);
  assert.equal(rec.layouts[600], undefined);
  assert.equal(unpackRecord(null, newId), null);
  assert.equal(unpackRecord({ layouts: {} }, newId), null, '지문 없음');
});

test('백업용 모양(판 1): JSON 으로 옮겨도 그대로 읽힌다', () => {
  const st = { tool: 'pen', color: '#4da3ff', w: 2.5, pts: [[1.04, 2.06, 0.333], [5, 6, 0.9]], id: 9 };
  const p = portableRecord({ textHash: 'z', layouts: { 590: { height: 10, strokes: [st], updatedAt: 4 } } });
  const json = JSON.parse(JSON.stringify(p));
  assert.deepEqual(json.layouts[590].strokes[0].pts, [[1, 2.1, 0.33], [5, 6, 0.9]]);
  const back = unpackRecord(json, newId);
  assert.deepEqual(back.layouts[590].strokes[0].pts, [[1, 2.1, 0.33], [5, 6, 0.9]]);
});

test('본문 지문: 글이 한 글자만 달라도 다르다', () => {
  assert.equal(textHash('abc'), textHash('abc'));
  assert.notEqual(textHash('abc'), textHash('abd'));
  assert.match(textHash('가나다'), /^[0-9a-z]+-3$/);
});
