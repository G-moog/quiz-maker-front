// 필기 저장 기록 시험: 예전 필기 보관·정리 규칙, 백업 파일 모양 검사·가져오기 계획(덮어쓰지 않기·아이디 바꿔 넣기),
// 지속 저장소 부탁(navigator.storage.persist).
// 실행: npm run test:app
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ARCHIVE_KEEP, ARCHIVE_MAX_AGE_MS, BACKUP_APP, BACKUP_VERSION,
  archiveKeyOf, archiveValue, archivesToPrune, buildBackup, isArchiveKey, needsArchive, planImport,
  rawHasStrokes, recordUpdatedAt, validateBackup,
} from '../../src/ink/inkRecord.js';
import { packPoints } from '../../src/ink/geometry.js';
import { askPersist } from '../../src/ink/inkDb.js';

const DAY = 24 * 60 * 60 * 1000;
// 저장 값(판 2) 하나 만들기
const stored = (hash, layouts) => ({
  textHash: hash,
  layouts: Object.fromEntries(Object.entries(layouts).map(([w, [n, at]]) => [w, {
    height: 1000, updatedAt: at,
    strokes: Array.from({ length: n }, (_, i) => ({ tool: 'pen', color: '#ff4d4f', w: 2.5, q: packPoints([[i, i, 0.5], [i + 5, i + 5, 0.6]]) })),
  }])),
});

test('보관 열쇠: 같은 기록은 같은 열쇠(두 번 보관해도 하나)', () => {
  const a = stored('old', { 590: [2, 100], 800: [1, 250] });
  assert.equal(recordUpdatedAt(a), 250);
  const k = archiveKeyOf('me:12:345', a);
  assert.equal(k, 'me:12:345#old:old:250');
  assert.equal(archiveKeyOf('me:12:345', structuredClone(a)), k);
  assert.equal(isArchiveKey(k), true);
  assert.equal(isArchiveKey('me:12:345'), false);
  assert.ok(k.startsWith('me:'), '아이디 앞부분이 그대로라 백업에 함께 들어간다');
});

test('보관할 때: 예전 필기가 있고 지문이 다를 때만(지우기는 보관 안 함)', () => {
  const old = stored('A', { 590: [1, 1] });
  const next = stored('B', { 590: [1, 2] });
  assert.equal(needsArchive(old, next), true);
  assert.equal(needsArchive(old, stored('A', { 590: [3, 9] })), false, '같은 문항 글에 더 쓰기');
  assert.equal(needsArchive(null, next), false, '처음 쓰기');
  assert.equal(needsArchive(stored('A', {}), next), false, '선이 없던 기록');
  assert.equal(needsArchive(old, null), false, '확인받은 지우기');
  const v = archiveValue(old, 'me:1:2', 5000);
  assert.equal(v.archivedAt, 5000);
  assert.equal(v.sourceKey, 'me:1:2');
  assert.equal(rawHasStrokes(v), true);
});

test('보관 정리: 문항마다 최근 3개는 늘 남기고, 그 밖에서 90일 넘은 것만 지운다', () => {
  const now = 1000 * DAY;
  const list = [
    { key: 'a', archivedAt: now - 1 * DAY },
    { key: 'b', archivedAt: now - 200 * DAY },
    { key: 'c', archivedAt: now - 300 * DAY },
    { key: 'd', archivedAt: now - 400 * DAY },
    { key: 'e', archivedAt: now - 10 * DAY },
  ];
  assert.deepEqual(archivesToPrune(list, now).sort(), ['c', 'd'], '최근 3개(a·e·b)는 오래돼도 남김');
  assert.deepEqual(archivesToPrune(list.slice(0, ARCHIVE_KEEP), now), [], '3개 이하면 아무것도 안 지움');
  const young = Array.from({ length: 10 }, (_, i) => ({ key: `y${i}`, archivedAt: now - i * DAY }));
  assert.deepEqual(archivesToPrune(young, now), [], '많아도 90일 안이면 남김');
  assert.deepEqual(archivesToPrune([...young, { key: 'z', archivedAt: now - ARCHIVE_MAX_AGE_MS - 1 }], now), ['z']);
});

test('백업 만들기: 이 아이디 것만, 점은 JSON 으로 옮길 수 있는 모양으로', () => {
  const entries = [
    { key: 'me:1:10', value: stored('A', { 590: [2, 100] }) },
    { key: 'me:1:10#old:Z:50', value: { ...stored('Z', { 590: [1, 50] }), archivedAt: 77, sourceKey: 'me:1:10' } },
    { key: 'meme:1:10', value: stored('A', { 590: [1, 1] }) },
    { key: 'me:1:11', value: { textHash: 'A', layouts: {} } },
    { key: 'me:1:12', value: 'garbage' },
  ];
  const b = buildBackup('me', entries, new Date('2026-10-22T01:02:03Z'));
  assert.equal(b.app, BACKUP_APP);
  assert.equal(b.version, BACKUP_VERSION);
  assert.equal(b.exportedAt, '2026-10-22T01:02:03.000Z');
  assert.equal(b.username, 'me');
  assert.deepEqual(b.items.map((i) => i.key), ['me:1:10', 'me:1:10#old:Z:50']);
  const json = JSON.parse(JSON.stringify(b));
  assert.deepEqual(json.items[0].value.layouts[590].strokes[0].pts, [[0, 0, 0.5], [5, 5, 0.6]]);
  assert.equal(json.items[1].value.archivedAt, 77);
  const checked = validateBackup(json);
  assert.equal(checked.ok, true);
  assert.equal(checked.items.length, 2);
  assert.equal(checked.bad, 0);
  assert.ok(checked.items[0].value.layouts[590].strokes[0].q instanceof Int32Array, '들여올 때는 저장 모양(판 2)으로');
});

test('백업 모양 검사: 틀린 파일은 한국어 오류', () => {
  assert.match(validateBackup(null).error, /백업 파일이 아닙니다/);
  assert.match(validateBackup({ app: 'other' }).error, /quiz-maker 필기 백업/);
  assert.match(validateBackup({ app: BACKUP_APP, version: 2 }).error, /지원하지 않는 백업 판/);
  assert.match(validateBackup({ app: BACKUP_APP, version: 1, items: [] }).error, /아이디/);
  assert.match(validateBackup({ app: BACKUP_APP, version: 1, username: 'me', items: {} }).error, /필기 목록/);
  const r = validateBackup({
    app: BACKUP_APP, version: 1, username: 'me', items: [
      { key: 'other:1:1', value: { textHash: 'A', layouts: { 590: { strokes: [{ tool: 'pen', color: '#f00', w: 2, pts: [[1, 1, 0.5]] }] } } } },
      { key: 'me:', value: {} },
      { key: 'me:1:2', value: { textHash: 'A', layouts: { 590: { strokes: [{ tool: 'pen', color: '#f00', w: 2, pts: 'x' }] } } } },
      { key: 'me:1:3', value: { textHash: 'A', layouts: { 590: { height: 5, updatedAt: 1, strokes: [{ tool: 'pen', color: '#f00', w: 2, pts: [[1, 1, 0.5]] }] } } } },
      7,
    ],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.items.map((i) => i.key), ['me:1:3']);
  assert.equal(r.bad, 4);
});

const checkedOf = (username, items) => validateBackup(JSON.parse(JSON.stringify(buildBackup(username, items))));

test('가져오기: 없는 것은 넣고, 이 기기의 더 새 것은 덮어쓰지 않는다', () => {
  const checked = checkedOf('me', [
    { key: 'me:1:1', value: stored('A', { 590: [1, 100] }) },
    { key: 'me:1:2', value: stored('A', { 590: [1, 100], 800: [2, 300] }) },
    { key: 'me:1:3', value: stored('A', { 590: [1, 100] }) },
    { key: 'me:1:4', value: stored('NEW', { 590: [1, 500] }) },
    { key: 'me:1:5', value: stored('OLDER', { 590: [1, 10] }) },
    { key: 'me:1:5#old:Q:3', value: { ...stored('Q', { 590: [1, 3] }), archivedAt: 9 } },
  ]);
  const existing = new Map([
    ['me:1:2', stored('A', { 590: [4, 200] })],
    ['me:1:3', stored('A', { 590: [4, 200] })],
    ['me:1:4', stored('CUR', { 590: [1, 400] })],
    ['me:1:5', stored('CUR', { 590: [1, 400] })],
    ['me:1:5#old:Q:3', { ...stored('Q', { 590: [1, 3] }), archivedAt: 9 }],
  ]);
  const plan = planImport(checked, 'me', existing, { now: 12345 });
  const byKey = Object.fromEntries(plan.writes.map((w) => [w.key, w.value]));
  assert.ok(byKey['me:1:1'], '이 기기에 없던 문항');
  assert.equal(byKey['me:1:2'].layouts[590].strokes.length, 4, '같은 폭은 이 기기 것이 더 새 것 — 그대로');
  assert.equal(byKey['me:1:2'].layouts[800].strokes.length, 2, '이 기기에 없던 폭만 더함');
  assert.equal(byKey['me:1:3'], undefined, '들여올 것이 없음');
  assert.equal(byKey['me:1:4'].textHash, 'NEW', '지문이 다르고 들어온 것이 더 새 것');
  assert.equal(byKey['me:1:4#old:CUR:400'].archivedAt, 12345, '이 기기 것은 먼저 보관');
  assert.equal(byKey['me:1:5'], undefined, '이 기기 것이 더 새 것');
  assert.equal(byKey['me:1:5#old:Q:3'], undefined, '이미 있는 보관');
  assert.equal(plan.imported, 3);
  assert.equal(plan.skipped, 3);
});

test('가져오기: overwrite 면 덮어쓰되 지문이 다르면 이 기기 것을 보관', () => {
  const checked = checkedOf('me', [{ key: 'me:1:5', value: stored('OLDER', { 590: [1, 10] }) }]);
  const plan = planImport(checked, 'me', new Map([['me:1:5', stored('CUR', { 590: [1, 400] })]]), { overwrite: true, now: 1 });
  assert.deepEqual(plan.writes.map((w) => w.key), ['me:1:5#old:CUR:400', 'me:1:5']);
  assert.equal(plan.imported, 1);
});

test('가져오기: 아이디가 바뀌었어도 지금 아이디 열쇠로 넣는다', () => {
  const checked = checkedOf('old-name', [
    { key: 'old-name:7:70', value: stored('A', { 590: [1, 1] }) },
    { key: 'old-name:7:70#old:B:2', value: { ...stored('B', { 590: [1, 2] }), archivedAt: 3 } },
  ]);
  const plan = planImport(checked, 'kim@example.com', new Map());
  assert.deepEqual(plan.writes.map((w) => w.key), ['kim@example.com:7:70', 'kim@example.com:7:70#old:B:2']);
  assert.equal(plan.imported, 2);
});

test('지속 저장소: 한 번 부탁하고, 이미 지속이거나 못 하는 브라우저는 넘어간다', async () => {
  let asked = 0;
  assert.equal(await askPersist({ storage: { persisted: async () => false, persist: async () => { asked += 1; return true; } } }), true);
  assert.equal(asked, 1);
  assert.equal(await askPersist({ storage: { persisted: async () => true, persist: async () => { asked += 1; return true; } } }), false);
  assert.equal(asked, 1, '이미 지속이면 부탁하지 않음');
  assert.equal(await askPersist({ storage: { persist: () => true } }), true, 'persisted 가 없는 브라우저');
  assert.equal(await askPersist({}), false);
  assert.equal(await askPersist(undefined), false);
  assert.equal(await askPersist({ storage: { persisted: () => Promise.reject(new Error('x')), persist: () => true } }), false);
  assert.equal(await askPersist({ get storage() { throw new Error('막힘'); } }), false);
});
