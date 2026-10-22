// 질문 메모 창의 '이전 메모' 도우미 시험: utils/notes.js 의 순서·자리 이름·짧은 시각·고치기 초안(메모마다 한 칸)
// 실행: npm run test:app  (화면·서버 없이 함수만 부름 — localStorage 는 흉내)
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.m = new Map(); this.blocked = false; }
  get length() { if (this.blocked) throw new Error('막힘'); return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { if (this.blocked) throw new Error('막힘'); return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { if (this.blocked) throw new Error('막힘'); this.m.set(k, String(v)); }
  removeItem(k) { if (this.blocked) throw new Error('막힘'); this.m.delete(k); }
}
globalThis.localStorage = new MemoryStorage();
const {
  orderSheetNotes, sheetNoteRank, sheetNoteLabel, relativeNoteTime,
  NOTE_DRAFT_KEY, saveNoteDraft, loadNoteDraft, clearNoteDraft,
  NOTE_EDIT_DRAFT_PREFIX, noteEditDraftKey, saveNoteEditDraft, loadNoteEditDraft, latestNoteEditDraft, clearNoteEditDraft,
} = await import('../../src/utils/notes.js');

beforeEach(() => { globalThis.localStorage = new MemoryStorage(); });

const note = (id, questionId, blankNo, createdAt, extra = {}) =>
  ({ id, setId: 11, questionId, blankNo, createdAt, content: `메모 ${id}`, resolved: false, ...extra });

// ── 순서 ──
test('같은 문항의 같은 빈칸 → 같은 문항 → 다른 문항, 묶음 안에서는 새것 먼저', () => {
  const info = { setId: 11, questionId: 101, blankNo: 8 };
  const notes = [
    note(1, 101, 3, '2026-10-20T01:00:00.000Z'),
    note(2, 102, 8, '2026-10-22T01:00:00.000Z'), // 다른 문항의 빈칸 8 — 같은 빈칸이 아님
    note(3, 101, 8, '2026-10-19T01:00:00.000Z'),
    note(4, 101, null, '2026-10-21T01:00:00.000Z'),
    note(5, 101, 8, '2026-10-21T05:00:00.000Z'),
    note(6, null, null, '2026-10-22T02:00:00.000Z'), // 문항을 지운 메모
  ];
  const before = notes.map((n) => n.id);
  assert.deepEqual(orderSheetNotes(notes, info).map((n) => n.id), [5, 3, 4, 1, 6, 2]);
  assert.deepEqual(notes.map((n) => n.id), before, '받은 배열은 그대로');
  assert.deepEqual(notes.map((n) => sheetNoteRank(n, info)), [1, 2, 0, 1, 0, 2]);
});

test('순서: 빈칸을 누르지 않았으면 같은 문항 메모가 모두 한 묶음, 같은 시각은 id 큰 것 먼저, id 는 글자·숫자 섞여도', () => {
  const info = { setId: 11, questionId: '101', blankNo: null };
  const t = '2026-10-20T01:00:00.000Z';
  const notes = [note(7, 101, 2, t), note(9, 101, null, t), note(8, 300, 1, t), note('10', 101, 5, '2026-10-20T00:59:00.000Z')];
  assert.deepEqual(orderSheetNotes(notes, info).map((n) => String(n.id)), ['9', '7', '10', '8']);
  assert.deepEqual(orderSheetNotes(null, info), []);
});

test('자리 이름: 빈칸 N · 이 문항 · 다른 문항(· 빈칸 N)', () => {
  const info = { questionId: 101, blankNo: 8 };
  assert.equal(sheetNoteLabel(note(1, 101, 8), info), '빈칸 8');
  assert.equal(sheetNoteLabel(note(1, 101, 3), info), '빈칸 3');
  assert.equal(sheetNoteLabel(note(1, 101, null), info), '이 문항');
  assert.equal(sheetNoteLabel(note(1, 102, 4), info), '다른 문항 · 빈칸 4');
  assert.equal(sheetNoteLabel(note(1, null, null), info), '다른 문항');
});

// ── 짧은 시각 ──
test('짧은 시각: 방금·분·시간·어제·N일 전·날짜(해가 다르면 연도까지)', () => {
  const now = new Date(2026, 9, 22, 10, 0, 0).getTime(); // 이 기기 시각 10/22 10:00
  const at = (...a) => new Date(...a).toISOString();
  assert.equal(relativeNoteTime(at(2026, 9, 22, 9, 59, 30), now), '방금');
  assert.equal(relativeNoteTime(at(2026, 9, 22, 10, 5, 0), now), '방금', '기기 시계가 늦어 미래로 보여도');
  assert.equal(relativeNoteTime(at(2026, 9, 22, 9, 15, 0), now), '45분 전');
  assert.equal(relativeNoteTime(at(2026, 9, 21, 12, 0, 0), now), '22시간 전');
  assert.equal(relativeNoteTime(at(2026, 9, 21, 8, 0, 0), now), '어제');
  assert.equal(relativeNoteTime(at(2026, 9, 19, 23, 0, 0), now), '3일 전');
  assert.equal(relativeNoteTime(at(2026, 9, 10, 8, 0, 0), now), '10/10');
  assert.equal(relativeNoteTime(at(2025, 11, 31, 8, 0, 0), now), '2025/12/31');
  // 시간대 없는 값·배열은 이 기기 시각으로
  assert.equal(relativeNoteTime('2026-10-22T09:30:00', now), '30분 전');
  assert.equal(relativeNoteTime([2026, 10, 20, 9, 0], now), '2일 전');
  assert.equal(relativeNoteTime(null, now), '');
  assert.equal(relativeNoteTime('엉터리', now), '');
});

// ── 고치기 초안(메모마다 한 칸) ──
test('고치기 초안 키는 메모마다 따로이고 새 메모 초안 키와 겹치지 않는다', () => {
  assert.equal(noteEditDraftKey(42), 'qm:note-edit-draft:v1:42');
  assert.ok(noteEditDraftKey(42).startsWith(NOTE_EDIT_DRAFT_PREFIX));
  assert.notEqual(noteEditDraftKey(42), noteEditDraftKey(43));
  assert.ok(!noteEditDraftKey(1).startsWith(NOTE_DRAFT_KEY) && !NOTE_DRAFT_KEY.startsWith(NOTE_EDIT_DRAFT_PREFIX));
});

test('고치기 초안 저장·읽기·지우기 — 새 메모 초안과 서로 건드리지 않음', () => {
  const n = note(42, 101, 8, '2026-10-20T01:00:00.000Z', { content: '원문' });
  saveNoteDraft({ user: 'kim', info: { setId: 11 }, withCtx: true, content: '새로 쓰던 글', failed: false });
  saveNoteEditDraft({ user: 'kim', note: n, content: '고친 글' });
  const d = loadNoteEditDraft('kim', 42);
  assert.equal(d.content, '고친 글');
  assert.equal(d.note.id, 42);
  assert.equal(d.note.content, '원문', '원문도 함께(고친 것이 있나 견주려고)');
  assert.equal(d.failed, false);
  assert.ok(d.at > 0);
  assert.equal(loadNoteEditDraft('lee', 42), null, '다른 사용자 것은 안 읽음');
  assert.equal(loadNoteEditDraft('kim', 43), null);
  clearNoteEditDraft(42);
  assert.equal(loadNoteEditDraft('kim', 42), null);
  assert.equal(loadNoteDraft('kim')?.content, '새로 쓰던 글', '새 메모 초안은 그대로');
  saveNoteEditDraft({ user: 'kim', note: n, content: '또 고침', failed: true });
  clearNoteDraft();
  assert.equal(loadNoteEditDraft('kim', 42)?.content, '또 고침', '새 메모 초안을 지워도 고치기 초안은 그대로');
  assert.equal(loadNoteEditDraft('kim', 42)?.failed, true);
});

test('잃을 글이 없는 고치기 초안(빈 글·원문과 같음)은 읽을 때 지운다, 깨진 값은 무시', () => {
  const n = note(5, 101, 1, '2026-10-20T01:00:00.000Z', { content: '원문 그대로' });
  saveNoteEditDraft({ user: 'kim', note: n, content: '  원문 그대로 \n' });
  assert.equal(loadNoteEditDraft('kim', 5), null);
  assert.equal(localStorage.getItem(noteEditDraftKey(5)), null);
  saveNoteEditDraft({ user: 'kim', note: n, content: '   ' });
  assert.equal(loadNoteEditDraft('kim', 5), null);
  assert.equal(localStorage.getItem(noteEditDraftKey(5)), null);
  localStorage.setItem(noteEditDraftKey(6), '{깨짐');
  assert.equal(loadNoteEditDraft('kim', 6), null);
  // 키와 안의 메모 id 가 다르면(손으로 옮긴 값 등) 쓰지 않는다
  localStorage.setItem(noteEditDraftKey(7), JSON.stringify({ user: 'kim', note: { ...n, id: 8 }, content: '딴 글', at: 1 }));
  assert.equal(loadNoteEditDraft('kim', 7), null);
  assert.equal(loadNoteEditDraft('kim', null), null);
});

test('창을 다시 열 때: 이 문제집 메모의 고치기 초안 중 가장 최근 것', async () => {
  const a = note(1, 101, 8, '2026-10-20T01:00:00.000Z', { content: 'A 원문' });
  const b = note(2, 101, 3, '2026-10-20T02:00:00.000Z', { content: 'B 원문' });
  const other = { ...note(3, 301, 1, '2026-10-20T03:00:00.000Z', { content: 'C 원문' }), setId: 30 };
  saveNoteEditDraft({ user: 'kim', note: a, content: 'A 고침' });
  await new Promise((r) => setTimeout(r, 5));
  saveNoteEditDraft({ user: 'kim', note: b, content: 'B 고침' });
  await new Promise((r) => setTimeout(r, 5));
  saveNoteEditDraft({ user: 'kim', note: other, content: 'C 고침' }); // 다른 문제집(가장 최근이어도 이 문제집 창에는 안 나옴)
  localStorage.setItem('qm:note-draft:v1', JSON.stringify({ user: 'kim', info: { setId: 11 }, content: '새 글' }));
  assert.equal(latestNoteEditDraft('kim', 11)?.note.id, 2);
  assert.equal(latestNoteEditDraft('kim', '11')?.note.id, 2, 'setId 가 글자여도');
  assert.equal(latestNoteEditDraft('kim', 30)?.note.id, 3);
  assert.equal(latestNoteEditDraft('lee', 11), null);
  assert.equal(latestNoteEditDraft('kim', 99), null);
  assert.equal(latestNoteEditDraft('kim', null), null);
  clearNoteEditDraft(2);
  assert.equal(latestNoteEditDraft('kim', 11)?.note.id, 1, '지우면 그다음 것');
});

test('저장소를 못 쓰면(사생활 보호 창 등) 오류 없이 초안 없음', () => {
  localStorage.blocked = true;
  const n = note(1, 101, 8, '2026-10-20T01:00:00.000Z');
  assert.doesNotThrow(() => saveNoteEditDraft({ user: 'kim', note: n, content: '글' }));
  assert.equal(loadNoteEditDraft('kim', 1), null);
  assert.equal(latestNoteEditDraft('kim', 11), null);
  assert.doesNotThrow(() => clearNoteEditDraft(1));
});
