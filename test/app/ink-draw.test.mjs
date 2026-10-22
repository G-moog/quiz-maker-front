// 필기 그리기 시험(2차): 선 그림(d) 0.1px 정수·상대 명령, 선 묶음(다시 그릴 범위).
// 실행: npm run test:app  (화면·브라우저 없이 함수만 부름)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAW_CHUNK, DRAW_SCALE, DRAW_TRANSFORM, centerlinePath, chunkStrokes, outlinePath, penRadius,
} from '../../src/ink/geometry.js';

// path 의 d → 명령마다 절대 좌표(0.1px 정수). M 은 절대, 나머지(l·q·a)는 앞 자리에서 얼마나 갔는지
function parse(d) {
  const out = [];
  const re = /([MlqazZ])([^MlqazZ]*)/g;
  let x = 0;
  let y = 0;
  let start = null;
  for (const [, c, args] of d.matchAll(re)) {
    const n = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : [];
    for (const v of n) assert.ok(Number.isInteger(v), `정수만: ${c}${args}`);
    if (c === 'M') {
      [x, y] = n;
      start = [x, y];
      out.push({ c, pts: [[x, y]] });
    } else if (c === 'l') {
      x += n[0];
      y += n[1];
      out.push({ c, pts: [[x, y]] });
    } else if (c === 'q') {
      const ctrl = [x + n[0], y + n[1]];
      x += n[2];
      y += n[3];
      out.push({ c, pts: [ctrl, [x, y]] });
    } else if (c === 'a') {
      x += n[5];
      y += n[6];
      out.push({ c, r: n[0], pts: [[x, y]] });
    } else {
      out.push({ c, pts: [] });
    }
  }
  return { cmds: out, end: [x, y], start };
}

const stroke = (n, f) => Array.from({ length: n }, (_, i) => f(i));

test('그림 단위: 0.1px 정수(층은 scale(0.1) 안)', () => {
  assert.equal(DRAW_SCALE, 10);
  assert.equal(DRAW_TRANSFORM, 'scale(0.1)');
});

test('펜 선 테두리: 정수·상대 명령, 제자리로 닫히고, 점마다 양옆 2차 곡선', () => {
  const pts = stroke(12, (i) => [100.3 + i * 3.1, 25800.2 + Math.sin(i) * 4, 0.3 + i * 0.05]);
  const d = outlinePath(pts, 2.5);
  const { cmds, end, start } = parse(d);
  assert.equal(cmds[0].c, 'M');
  assert.equal(cmds.at(-1).c, 'z');
  assert.deepEqual(end, start, '마지막 반원이 첫 점으로 돌아온다');
  assert.equal(cmds.filter((c) => c.c === 'q').length, 2 * (12 - 2), '양옆 테두리마다 점 사이 곡선');
  assert.equal(cmds.filter((c) => c.c === 'a').length, 2, '두 끝은 반원');
  // 모든 자리는 선 둘레(가장 굵은 반지름 + 0.1px) 안
  const reach = penRadius(2.5, 1) + 0.1;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  for (const c of cmds) {
    for (const [x, y] of c.pts) {
      assert.ok(x / 10 >= Math.min(...xs) - reach && x / 10 <= Math.max(...xs) + reach, `x ${x}`);
      assert.ok(y / 10 >= Math.min(...ys) - reach && y / 10 <= Math.max(...ys) + reach, `y ${y}`);
    }
  }
  // 첫 자리 = 첫 점에서 왼쪽(진행 방향의 수직)으로 반지름만큼
  const dx = pts[1][0] - pts[0][0];
  const dy = pts[1][1] - pts[0][1];
  const len = Math.hypot(dx, dy);
  const r0 = (penRadius(2.5, pts[0][2]) * 3 + penRadius(2.5, pts[1][2])) / 4;
  assert.deepEqual(start, [Math.round((pts[0][0] - (dy / len) * r0) * 10), Math.round((pts[0][1] + (dx / len) * r0) * 10)]);
});

// 1차의 소수 절대 좌표 그림: M10,21.3Q12.8,21.2 14.2,21.7L15.6,22.2A1.3,1.3 0 0 0 16.4,19.8Q13.2,18.8 11.6,18.8L10,18.8A1.3,1.3 0 0 0 10,21.3Z
// (무작위 선 500개로 견주면 자리 차이는 많아야 0.1px — 중간점을 반올림한 값에서 잡는 차이뿐)
test('펜 선 테두리: 1차(소수 절대 좌표) 그림과 같은 자리 — 고정 값', () => {
  const d = outlinePath([[10, 20, 0.5], [13, 20, 0.5], [16, 21, 0.5]], 2.5);
  assert.equal(d, 'M100,213q28,-1 42,4l14,5a13,13 0 0 0 8,-24q-32,-10 -48,-10l-16,0a13,13 0 0 0 0,25z');
  const abs = parse(d).cmds.flatMap((c) => c.pts).map(([x, y]) => [x / 10, y / 10]);
  assert.deepEqual(abs, [[10, 21.3], [12.8, 21.2], [14.2, 21.7], [15.6, 22.2], [16.4, 19.8], [13.2, 18.8], [11.6, 18.8], [10, 18.8], [10, 21.3]]);
});

test('점 하나·아주 짧은 선은 동그라미, 형광펜은 가운데 선', () => {
  const dot = parse(outlinePath([[5, 5, 0.5]], 2.5));
  const r = Math.round(penRadius(2.5, 0.5) * 10);
  assert.deepEqual(dot.start, [50 - r, 50]);
  assert.deepEqual(dot.end, dot.start, '동그라미가 닫힌다');
  assert.equal(centerlinePath([[1.04, 2.06, 0.5]]), 'M10,21l1,0');
  assert.equal(centerlinePath([[1, 2, 0.5], [4, 2, 0.5]]), 'M10,20l30,0');
  const hl = parse(centerlinePath(stroke(6, (i) => [i * 5, 100, 0.5])));
  assert.deepEqual(hl.end, [250, 1000], '끝 점까지');
  assert.equal(outlinePath([], 2.5), '');
  assert.equal(centerlinePath([]), '');
});

test('긴 선도 빠르고 짧게: 점 40개 선 2,000개', () => {
  const strokes = stroke(2000, (k) => stroke(40, (i) => [10 + i * 2.8, k * 13 + Math.sin(i / 3 + k) * 5, 0.5]));
  const t0 = performance.now();
  let len = 0;
  for (const s of strokes) len += outlinePath(s, 2.5).length;
  const ms = performance.now() - t0;
  assert.ok(len / 2000 < 1300, `선 하나 평균 ${Math.round(len / 2000)}자`);
  assert.ok(ms < 400, `${Math.round(ms)}ms`);
});

test('선 묶음: id 묶음 번호가 같은 이웃끼리, 열쇠는 늘 서로 다름, 차례 그대로', () => {
  const s = (id) => ({ id });
  const ids = [1, 2, 63, 64, 65, 127, 128, 500];
  const c = chunkStrokes(ids.map(s));
  assert.deepEqual(c.map((x) => x.list.map((y) => y.id)), [[1, 2, 63], [64, 65, 127], [128], [500]]);
  assert.deepEqual(c.map((x) => x.key), ['0', '1', '2', '7'], '열쇠는 묶음 번호');
  assert.deepEqual(chunkStrokes([2, 63].map(s)).map((x) => x.key), ['0'], '묶음 첫 선을 지워도 열쇠 그대로(묶음을 새로 만들지 않음)');
  // 차례가 섞인 배열(예: 다시 읽어 합친 필기): 같은 묶음 번호가 떨어져 나와도 열쇠는 겹치지 않는다
  const mixed = chunkStrokes([900, 901, 3, 4, 902].map(s));
  assert.deepEqual(mixed.map((x) => x.list.map((y) => y.id)), [[900, 901], [3, 4], [902]]);
  assert.deepEqual(mixed.map((x) => x.key), ['14', '0', '14:1']);
  assert.deepEqual(mixed.flatMap((x) => x.list.map((y) => y.id)), [900, 901, 3, 4, 902], '그리는 차례 그대로');
  assert.deepEqual(chunkStrokes([]), []);
  assert.equal(DRAW_CHUNK, 64);
});

test('선 묶음: 끝에 하나 더하면 앞 묶음들은 그대로(같은 선들)', () => {
  const list = Array.from({ length: 2000 }, (_, i) => ({ id: 5000 + i }));
  const a = chunkStrokes(list);
  const b = chunkStrokes([...list, { id: 7000 }]);
  assert.equal(b.length, a.length + (Math.floor(7000 / 64) === Math.floor(6999 / 64) ? 0 : 1));
  for (let i = 0; i < a.length - 1; i++) {
    assert.equal(a[i].key, b[i].key);
    assert.deepEqual(a[i].list, b[i].list);
  }
});
