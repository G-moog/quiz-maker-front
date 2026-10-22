// 공부 기록(src/utils/studyState.js) 시험 — localStorage 를 흉내 내어 함수만 부른다.
// 실행: npm run test:app
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.m = new Map(); this.full = false; }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { if (this.full) throw new Error('QuotaExceededError'); this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
globalThis.localStorage = new MemoryStorage();
const { loadStudy, saveStudy, clearStudy, lastStudiedMap } = await import('../../src/utils/studyState.js');

beforeEach(() => { globalThis.localStorage = new MemoryStorage(); });

test('저장한 기록을 그대로 읽고, at·v 를 붙인다', () => {
  saveStudy('magicwonds', 11, { qid: 101, revealed: [0, 3] });
  const s = loadStudy('magicwonds', 11);
  assert.deepEqual(s.revealed, [0, 3]);
  assert.equal(s.qid, 101);
  assert.equal(s.v, 1);
  assert.ok(!Number.isNaN(Date.parse(s.at)));
});

test('계정·문제집마다 따로, 지우면 없음', () => {
  saveStudy('a', 1, { x: 1 });
  saveStudy('b', 1, { x: 2 });
  saveStudy('a', 2, { x: 3 });
  assert.equal(loadStudy('a', 1).x, 1);
  assert.equal(loadStudy('b', 1).x, 2);
  assert.deepEqual(Object.keys(lastStudiedMap('a')).sort(), ['1', '2']);
  clearStudy('a', 1);
  assert.equal(loadStudy('a', 1), null);
  assert.deepEqual(Object.keys(lastStudiedMap('a')), ['2']);
});

test('깨진 값·다른 판·setId 없음은 null, 저장 실패는 조용히 넘어감', () => {
  localStorage.setItem('qm:study:a:5', '{oops');
  localStorage.setItem('qm:study:a:6', JSON.stringify({ v: 99, at: '2026-10-22T00:00:00Z' }));
  assert.equal(loadStudy('a', 5), null);
  assert.equal(loadStudy('a', 6), null);
  assert.equal(loadStudy('a', null), null);
  assert.deepEqual(lastStudiedMap('a'), {});
  localStorage.full = true;
  assert.doesNotThrow(() => saveStudy('a', 7, { x: 1 }));
  assert.equal(loadStudy('a', 7), null);
});

test('기록이 너무 많으면 오래 안 본 것부터 지운다(300개 유지)', () => {
  for (let i = 0; i < 305; i++) {
    localStorage.setItem(`qm:study:a:${i}`, JSON.stringify({ v: 1, at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString() }));
  }
  saveStudy('a', 'new', { x: 1 });
  const ids = Object.keys(lastStudiedMap('a'));
  assert.equal(ids.length, 300);
  assert.ok(ids.includes('new'));
  assert.ok(!ids.includes('0') && !ids.includes('5'));
  assert.ok(ids.includes('6'));
});
