// 전체 백업(src/utils/backup.js) 시험 — 가짜 api 로(서버 없이)
// 실행: npm run test:app
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_APP, BACKUP_VERSION, backupFileName, backupSummary, buildBackup } from '../../src/utils/backup.js';

function fakeApi({ sets, questions, notes, failOnce = new Set(), failAlways = new Set() }) {
  const calls = { getQuestions: [], inFlight: 0, maxInFlight: 0, listNotes: [] };
  const failedOnce = new Set();
  return {
    calls,
    api: {
      async getSets() { return sets; },
      async getQuestions(id) {
        calls.getQuestions.push(id);
        calls.inFlight++;
        calls.maxInFlight = Math.max(calls.maxInFlight, calls.inFlight);
        await new Promise((r) => setTimeout(r, 2));
        calls.inFlight--;
        if (failAlways.has(id)) throw new Error('HTTP 500');
        if (failOnce.has(id) && !failedOnce.has(id)) { failedOnce.add(id); throw new Error('잠깐 끊김'); }
        return questions[id] ?? [];
      },
      async listNotes(opts) { calls.listNotes.push(opts); return notes; },
    },
  };
}

const SETS = Array.from({ length: 13 }, (_, i) => ({ id: 100 + i, title: `문제집 ${i + 1}`, subject: '', createdAt: '2026-10-01T00:00:00Z', questionCount: i % 3 }));
const QUESTIONS = Object.fromEntries(SETS.map((s) => [s.id, Array.from({ length: s.questionCount }, (_, k) => ({ id: s.id * 10 + k, type: 'fill', text: `${s.title} ___`, answers: ['x'] }))]));
const NOTES = [{ id: 1, setId: 100, content: '메모', resolved: false }, { id: 2, setId: null, content: '옛 메모', resolved: true }];

test('buildBackup: 문제집마다 문항을 붙이고 메모 전체(해결 포함)를 담는다', async () => {
  const { api, calls } = fakeApi({ sets: SETS, questions: QUESTIONS, notes: NOTES });
  const progress = [];
  const now = new Date('2026-10-22T06:30:00.000Z');
  const data = await buildBackup({ api, username: 'magicwonds', onProgress: (p) => progress.push(p), now });
  assert.equal(data.app, BACKUP_APP);
  assert.equal(data.version, BACKUP_VERSION);
  assert.equal(data.exportedAt, '2026-10-22T06:30:00.000Z');
  assert.equal(data.username, 'magicwonds');
  assert.deepEqual(data.sets.map((s) => s.id), SETS.map((s) => s.id)); // 순서 그대로
  for (const s of data.sets) {
    const orig = SETS.find((x) => x.id === s.id);
    assert.deepEqual({ ...s, questions: undefined }, { ...orig, questions: undefined });
    assert.deepEqual(s.questions, QUESTIONS[s.id]);
  }
  assert.deepEqual(data.notes, NOTES);
  assert.deepEqual(calls.listNotes, [{ status: 'all' }]);
  // 동시에 4개까지만
  assert.ok(calls.maxInFlight <= 4 && calls.maxInFlight >= 2, String(calls.maxInFlight));
  // 진행: 문제집 0/13 … 13/13, 메모
  const setsProgress = progress.filter((p) => p.phase === 'sets');
  assert.deepEqual(setsProgress[0], { phase: 'sets', done: 0, total: 13 });
  assert.deepEqual(setsProgress.at(-1), { phase: 'sets', done: 13, total: 13 });
  assert.ok(progress.some((p) => p.phase === 'notes'));
  assert.deepEqual(backupSummary(data), { sets: 13, questions: SETS.reduce((n, s) => n + s.questionCount, 0), notes: 2, study: 0 });
  // JSON 으로 그대로 오간다
  assert.deepEqual(JSON.parse(JSON.stringify(data)), data);
});

test('buildBackup: 잠깐 실패는 한 번 더 받고, 계속 실패하면 문제집 이름을 넣은 한국어 오류', async () => {
  const ok = fakeApi({ sets: SETS, questions: QUESTIONS, notes: [], failOnce: new Set([103]) });
  const data = await buildBackup({ api: ok.api });
  assert.equal(data.sets.find((s) => s.id === 103).questions.length, QUESTIONS[103].length);

  const bad = fakeApi({ sets: SETS, questions: QUESTIONS, notes: [], failAlways: new Set([105]) });
  await assert.rejects(buildBackup({ api: bad.api }), (e) => {
    assert.match(e.message, /^문제집 「문제집 6」의 문항을 받지 못했습니다\. HTTP 500$/);
    return true;
  });
  // 실패한 뒤에는 남은 문제집을 더 부르지 않는다(남은 것 13개를 다 돌지 않음)
  assert.ok(bad.calls.getQuestions.length < SETS.length + 2, String(bad.calls.getQuestions.length));
});

test('buildBackup: 로그인이 끊긴 오류는 다시 시도하지 않는다', async () => {
  let n = 0;
  const api = {
    getSets: async () => [{ id: 1, title: 'a' }],
    getQuestions: async () => { n++; const e = new Error('로그인이 만료되었습니다. 다시 로그인해 주세요.'); e.sessionExpired = true; throw e; },
    listNotes: async () => [],
  };
  await assert.rejects(buildBackup({ api }), /로그인이 만료/);
  assert.equal(n, 1);
});

test('buildBackup: 문제집이 없어도 되고, 목록이 배열이 아니면 오류', async () => {
  const empty = fakeApi({ sets: [], questions: {}, notes: [] });
  const data = await buildBackup({ api: empty.api });
  assert.deepEqual(data.sets, []);
  const broken = { getSets: async () => null, getQuestions: async () => [], listNotes: async () => [] };
  await assert.rejects(buildBackup({ api: broken }), /문제집 목록을 받지 못했습니다/);
});

test('buildBackup: extras(확장 자리)는 맨 위 칸으로 더하고, 기본 칸 이름은 막는다', async () => {
  const { api } = fakeApi({ sets: SETS.slice(0, 1), questions: QUESTIONS, notes: [] });
  const data = await buildBackup({ api, extras: { ink: { v: 1, strokes: 3 } } });
  assert.deepEqual(data.ink, { v: 1, strokes: 3 });
  await assert.rejects(buildBackup({ api, extras: { sets: [] } }), /기본 칸과 겹칩니다/);
  // 공부 기록(study 칸)은 문제집 수를 안내에 센다
  const withStudy = await buildBackup({ api, extras: { study: { version: 1, records: { 100: { v: 1, at: null, days: [] }, 101: { v: 1 } } } } });
  assert.equal(backupSummary(withStudy).study, 2);
});

test('backupFileName: quiz-maker-backup-YYYYMMDD-HHmm.json (이 기기 시각)', () => {
  assert.equal(backupFileName(new Date(2026, 9, 2, 7, 5)), 'quiz-maker-backup-20261002-0705.json');
  assert.equal(backupFileName(new Date(2026, 11, 31, 23, 59)), 'quiz-maker-backup-20261231-2359.json');
});
