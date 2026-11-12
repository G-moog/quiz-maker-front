// 문제집 폴더 도우미(src/utils/folders.js) 시험: subject 읽기·쓰기(도구 lib/folders.mjs 와 같은 예시), 이름 검사, 제목 앞표시 줄이기,
// 카드 묶기(하드 짝은 보통 따라감)·폴더 순서·폴더 줄 통계·정렬, 자리, 쓰기 계획(옮기기·보관함·꺼내기·이름 바꾸기·되돌리기),
// 쓰기 차례(runPlan — 일부 실패 뒤 '다시'·다른 기기와 겹침·쓰는 동안 바뀐 제목)와 그 안내 글
// 실행: npm run test:app
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ARCHIVE_LABEL, HOME, INBOX_LABEL, archiveTooLong, archivedLast, buildSubject, cardBatches, cardsOfPlace, chipFolderNames,
  compareFolderNames, displayTitle, folderJob, folderJobTexts, folderLabel, folderNameError, folderNames, folderOf, folderRows,
  folderStats, fromArchive, groupCardsByFolder, hasFolders, isReservedName, itemStep, jobCloseText, jobCounts, jobEndText, jobFailText,
  normalizeFolder, normalizePlace, parseSubject, pickerOptions, placeKey, planCardCount, planMove, planRename, planUndo, renameCardIds,
  ro, runPlan, similarFolder, sortFolderRows, toArchive, unmergedCount,
} from '../../src/utils/folders.js';
import { groupHardSets } from '../../src/utils/hardMode.js';

// ── 도구와 같은 예시(공통 시험 값) ──

test('normalizeFolder: NFC · 앞뒤 공백 · 이어진 공백 하나로 · 가운뎃점 앞뒤 공백 빼기', () => {
  assert.equal(normalizeFolder('  양액 · 배지 '), '양액·배지');
  assert.equal(normalizeFolder('증산  ·  습도'), '증산·습도');
  assert.equal(normalizeFolder('환경   제어'), '환경 제어');
  assert.equal(normalizeFolder('양액·배지'.normalize('NFD')), '양액·배지');
  assert.equal(normalizeFolder(null), '');
  assert.equal(normalizeFolder(''), '');
  assert.equal(normalizeFolder('   '), '');
  assert.equal(normalizeFolder(undefined), '');
  assert.equal(normalizeFolder(12), '');
});

test('parseSubject: 빈 값은 새로 들어옴, [보관] 은 보관함(원래 폴더), 그 밖은 폴더 이름', () => {
  assert.deepEqual(parseSubject(null), { kind: 'inbox' });
  assert.deepEqual(parseSubject(''), { kind: 'inbox' });
  assert.deepEqual(parseSubject('  '), { kind: 'inbox' });
  assert.deepEqual(parseSubject('기타'), { kind: 'folder', name: '기타' });
  assert.deepEqual(parseSubject(' 양액 · 배지 '), { kind: 'folder', name: '양액·배지' });
  assert.deepEqual(parseSubject('[보관]'), { kind: 'archive', origin: '' });
  assert.deepEqual(parseSubject('[보관] 양액 · 배지'), { kind: 'archive', origin: '양액·배지' });
  assert.deepEqual(parseSubject('[보관]양액·배지'), { kind: 'archive', origin: '양액·배지' });
  assert.deepEqual(parseSubject('[보관]'.normalize('NFD')), { kind: 'archive', origin: '' }); // 조합형으로 와도 보관함
});

test('buildSubject: 자리 → subject(새로 들어옴은 빈 글 — 지금 앱이 빈 과목을 보내는 값)', () => {
  assert.equal(buildSubject({ kind: 'folder', name: '양액 · 배지' }), '양액·배지');
  assert.equal(buildSubject({ kind: 'archive', origin: '양액·배지' }), '[보관] 양액·배지');
  assert.equal(buildSubject({ kind: 'archive', origin: '' }), '[보관]');
  assert.equal(buildSubject({ kind: 'inbox' }), '');
  assert.equal(buildSubject(null), '');
  // 읽고 다시 쓰면 같은 값
  for (const s of ['양액·배지', '[보관] 양액·배지', '[보관]', '']) assert.equal(buildSubject(parseSubject(s)), s);
  // 옛 과목처럼 긴 이름(46자 이상)은 보관 표시('[보관] ' 5자)와 합쳐 50자를 넘으므로 원래 폴더 없이 '[보관]'
  assert.equal(buildSubject({ kind: 'archive', origin: '가'.repeat(46) }), '[보관]');
  assert.equal(buildSubject({ kind: 'archive', origin: '가'.repeat(45) }), `[보관] ${'가'.repeat(45)}`);
});

test('folderNameError: 빈 이름 · 40자 넘음 · [ 로 시작 · 예약 이름, 문제없으면 빈 글', () => {
  assert.match(folderNameError(''), /적어/);
  assert.match(folderNameError('   '), /적어/);
  assert.equal(folderNameError('가'.repeat(40)), '');
  assert.match(folderNameError('가'.repeat(41)), /40자/);
  assert.match(folderNameError('[시험]'), /\[/);
  for (const n of ['보관함', '새로 들어옴', '복습 차례', '전체', ' 보관함 ']) assert.match(folderNameError(n), /쓸 수 없습니다/, n);
  assert.equal(folderNameError('보관함'), "'보관함'은 폴더 이름으로 쓸 수 없습니다.");
  assert.equal(folderNameError('복습 차례'), "'복습 차례'는 폴더 이름으로 쓸 수 없습니다.");
  for (const n of ['양액·배지', '환경 제어', '기타', '보관함 정리']) assert.equal(folderNameError(n), '', n);
  // 글자 수는 서버처럼 코드 포인트로(그림 글자 하나 = 1자)
  assert.equal(folderNameError('🍅'.repeat(40)), '');
  assert.equal(isReservedName('새로  들어옴'), true);
  assert.equal(isReservedName('기타'), false);
});

test('displayTitle: [Notion] 은 숨기고 [통합본] 은 작은 표로, 다른 앞표시는 그대로', () => {
  assert.deepEqual(displayTitle('[Notion] 습도: 낮을 때'), { badge: '', text: '습도: 낮을 때' });
  assert.deepEqual(displayTitle('[통합본] 습도와 증산'), { badge: '통합본', text: '습도와 증산' });
  assert.deepEqual(displayTitle('[시험] 가루이'), { badge: '', text: '[시험] 가루이' });
  assert.deepEqual(displayTitle('[하드] [Notion] 습도'), { badge: '', text: '[하드] [Notion] 습도' }); // 짝 없는 하드는 그대로
  assert.deepEqual(displayTitle('[Notion] '), { badge: '', text: '[Notion] ' }); // 떼면 빈 글이면 그대로
  assert.deepEqual(displayTitle(null), { badge: '', text: '' });
});

test('노션 공부 홈 분류 → 폴더 이름(11/12)과 순서: 가나다 → 기타 → (보관함은 줄 맨 끝)', () => {
  const home = ['증산 · 습도', '생리장해 · 병', '양액 · 배지', '환경 제어', '현장 노하우', '생육 · 착과'];
  const names = home.map(normalizeFolder);
  assert.deepEqual(names, ['증산·습도', '생리장해·병', '양액·배지', '환경 제어', '현장 노하우', '생육·착과']);
  assert.deepEqual([...names, '기타'].sort(compareFolderNames), ['생리장해·병', '생육·착과', '양액·배지', '증산·습도', '현장 노하우', '환경 제어', '기타']);
  assert.deepEqual(['기타', '가'].sort(compareFolderNames), ['가', '기타']);
});

// ── 카드 묶기 ──

const SETS = [
  { id: 30, title: '[하드] [통합본] 습도와 증산', subject: '', createdAt: '2026-10-24T01:00:00.000Z' }, // 짝인 하드: subject 는 안 봄
  { id: 21, title: '[통합본] 습도와 증산', subject: '증산 · 습도', createdAt: '2026-10-24T00:00:00.000Z' },
  { id: 20, title: '[Notion] 익는 속도', subject: '증산·습도', createdAt: '2026-10-10T00:00:00.000Z' },
  { id: 12, title: '[Notion] 양액 탱크', subject: '양액·배지', createdAt: '2026-10-09T00:00:00.000Z' },
  { id: 11, title: '[Notion] 습도', subject: '[보관] 증산·습도', createdAt: '2026-10-01T00:00:00.000Z' },
  { id: 9, title: '[하드] 지운 원래', subject: '기타', createdAt: '2026-09-30T00:00:00.000Z' }, // 짝 없는 하드: 자기 subject
  { id: 8, title: '[시험] 가루이', subject: '기타', createdAt: '2026-09-29T00:00:00.000Z' },
  { id: 7, title: '청년농 설명회', subject: null, createdAt: '2026-11-10T00:00:00.000Z' },
];
const CARDS = groupHardSets(SETS);

test('groupCardsByFolder: 카드 폴더 = 보통의 subject(짝인 하드는 무시), 짝 없는 하드는 자기 것, 순서는 그대로', () => {
  const g = groupCardsByFolder(CARDS);
  assert.deepEqual(g.inbox.map((c) => c.set.id), [7]);
  assert.deepEqual(g.archive.map((c) => c.set.id), [11]);
  assert.deepEqual([...g.folders.keys()], ['증산·습도', '양액·배지', '기타']);
  assert.deepEqual(g.folders.get('증산·습도').map((c) => c.set.id), [21, 20]); // '증산 · 습도' 와 '증산·습도' 는 같은 폴더
  assert.equal(g.folders.get('증산·습도')[0].hard.id, 30);
  assert.deepEqual(g.folders.get('기타').map((c) => c.set.id), [9, 8]);
  assert.deepEqual(folderOf(CARDS[0]), { kind: 'folder', name: '증산·습도' });
  assert.equal(hasFolders(g), true);
  assert.equal(hasFolders(groupCardsByFolder(groupHardSets([{ id: 1, title: 'a', subject: null }, { id: 2, title: 'b', subject: ' ' }]))), false);
  // 보관함만 있으면 폴더가 없는 것으로(평평한 목록 + 그 아래 '보관함' 한 줄 — ✕ → 보관함으로 한 번에 첫 화면이 폴더 목록으로 바뀌지 않게)
  assert.equal(hasFolders(groupCardsByFolder(groupHardSets([{ id: 1, title: 'a', subject: '[보관]' }, { id: 2, title: 'b', subject: '' }]))), false);
  assert.equal(hasFolders(null), false);
});

test('folderRows: 새로 들어옴(있으면) → 폴더 가나다 → 기타 → 보관함(있으면), 줄 열쇠 = placeKey', () => {
  const g = groupCardsByFolder(CARDS);
  const rows = folderRows(g);
  assert.deepEqual(rows.map((r) => r.key), ['inbox', 'folder:양액·배지', 'folder:증산·습도', 'folder:기타', 'archive']);
  assert.deepEqual(rows.map((r) => r.name), [INBOX_LABEL, '양액·배지', '증산·습도', '기타', ARCHIVE_LABEL]);
  assert.deepEqual(rows.map((r) => r.cards.length), [1, 1, 2, 2, 1]);
  assert.deepEqual(folderNames(g), ['양액·배지', '증산·습도', '기타']);
  for (const r of rows) assert.equal(placeKey(r.kind === 'folder' ? { kind: 'folder', name: r.name } : { kind: r.kind }), r.key);
  // 새로 들어옴·보관함이 비면 줄이 없다
  const only = folderRows(groupCardsByFolder(groupHardSets([{ id: 1, title: 'a', subject: '기타' }])));
  assert.deepEqual(only.map((r) => r.key), ['folder:기타']);
});

test('folderStats: 카드 수 · 미해결 메모(하드 더함) · 마지막 공부(하드 짝 중 늦은 것) · 이번 주 n · 새 n', () => {
  const g = groupCardsByFolder(CARDS);
  const now = new Date('2026-11-12T03:00:00.000Z'); // 서울 11/12(목) 정오 — 이번 주 11/9(월) ~ 11/12
  const ctx = {
    studied: { 21: '2026-11-01T00:00:00.000Z', 30: '2026-11-11T00:00:00.000Z', 20: '2026-10-20T00:00:00.000Z' },
    days: { 30: ['2026-11-11'], 21: ['2026-11-01'], 20: ['2026-10-20'] },
    noteCounts: { 21: 1, 30: 2, 7: 1 },
    today: '2026-11-12',
    now,
  };
  assert.deepEqual(folderStats(g.folders.get('증산·습도'), ctx), { count: 2, notes: 3, lastAt: '2026-11-11T00:00:00.000Z', week: 1, fresh: 0 });
  // 7번: 만든 지 2일 · 기록 없음 → 새 1
  assert.deepEqual(folderStats(g.inbox, ctx), { count: 1, notes: 1, lastAt: null, week: 0, fresh: 1 });
  // 메모를 못 받았으면 0, 날짜가 이상하면 이번 주 0
  assert.deepEqual(folderStats(g.folders.get('증산·습도'), { ...ctx, noteCounts: null, today: '엉터리' }).notes, 0);
  assert.equal(folderStats(g.folders.get('증산·습도'), { ...ctx, today: '엉터리' }).week, 0);
  assert.deepEqual(folderStats([], ctx), { count: 0, notes: 0, lastAt: null, week: 0, fresh: 0 });
});

test("folderStats '새': 만든 지 7일 안 + 보통·하드 모두 기록 없음(하드만 풀어도 새 아님)", () => {
  const now = new Date('2026-11-12T00:00:00.000Z');
  const sets = [
    { id: 1, title: 'a', subject: 'x', createdAt: '2026-11-05T00:00:01.000Z' }, // 7일이 안 됨
    { id: 2, title: 'b', subject: 'x', createdAt: '2026-11-05T00:00:00.000Z' }, // 꼭 7일 — 새 아님
    { id: 3, title: 'c', subject: 'x', createdAt: '2026-11-11T00:00:00.000Z' },
    { id: 4, title: '[하드] c', subject: '', createdAt: '2026-11-11T00:00:00.000Z' },
    { id: 5, title: 'd', subject: 'x', createdAt: '엉터리' },
  ];
  const cards = groupHardSets(sets);
  assert.equal(folderStats(cards, { now, today: '2026-11-12' }).fresh, 2); // 1 · 3
  assert.equal(folderStats(cards, { now, today: '2026-11-12', studied: { 4: '2026-11-11T09:00:00.000Z' } }).fresh, 1); // 3 은 하드를 풀었음
  assert.equal(folderStats(cards, { now, today: '2026-11-12', days: { 1: ['2026-11-12'] } }).fresh, 1); // 날짜 기록만 있어도 공부함
});

test('sortFolderRows: 기본은 그대로, 최근 공부·복습 차례는 폴더의 마지막 공부로 — 새로 들어옴은 맨 위·보관함은 맨 아래', () => {
  const rows = [
    { key: 'inbox', kind: 'inbox', stats: { lastAt: '2026-11-12T00:00:00.000Z' } },
    { key: 'folder:가', kind: 'folder', stats: { lastAt: '2026-11-01T00:00:00.000Z' } },
    { key: 'folder:나', kind: 'folder', stats: { lastAt: null } },
    { key: 'folder:다', kind: 'folder', stats: { lastAt: '2026-11-10T00:00:00.000Z' } },
    { key: 'archive', kind: 'archive', stats: { lastAt: '2026-11-11T00:00:00.000Z' } },
  ];
  assert.equal(sortFolderRows(rows, 'default'), rows);
  assert.deepEqual(sortFolderRows(rows, 'recent').map((r) => r.key), ['inbox', 'folder:다', 'folder:가', 'folder:나', 'archive']);
  assert.deepEqual(sortFolderRows(rows, 'review').map((r) => r.key), ['inbox', 'folder:가', 'folder:다', 'folder:나', 'archive']);
});

test("unmergedCount: [통합본] 이 하나라도 있는 폴더에서만 '[Notion]' 카드 수", () => {
  const card = (title) => ({ set: { id: title, title }, hard: null });
  assert.equal(unmergedCount([card('[통합본] 가'), card('[Notion] 나'), card('[Notion] 다'), card('[시험] 라')]), 2);
  assert.equal(unmergedCount([card('[Notion] 나'), card('[Notion] 다')]), 0); // 통합본이 없으면 0
  assert.equal(unmergedCount([card('[통합본] 가')]), 0);
  assert.equal(unmergedCount(null), 0);
});

test('folderLabel·archivedLast: 찾기 결과의 폴더 표(새로 들어옴은 없음)와 보관함 맨 뒤', () => {
  assert.deepEqual(CARDS.map(folderLabel), ['증산·습도', '증산·습도', '양액·배지', ARCHIVE_LABEL, '기타', '기타', '']);
  assert.deepEqual(archivedLast(CARDS).map((c) => c.set.id), [21, 20, 12, 9, 8, 7, 11]);
  assert.deepEqual(CARDS.map((c) => c.set.id), [21, 20, 12, 11, 9, 8, 7]); // 원래 배열은 그대로
});

// ── 자리 ──

test('normalizePlace·placeKey·cardsOfPlace: 이상한 자리는 첫 화면, 복습 차례는 보관함 밖 모든 카드', () => {
  assert.equal(normalizePlace(null), HOME);
  assert.equal(normalizePlace({ kind: 'folder', name: '  ' }), HOME);
  assert.equal(normalizePlace({ kind: '엉터리' }), HOME);
  assert.deepEqual(normalizePlace({ kind: 'folder', name: ' 양액 · 배지 ' }), { kind: 'folder', name: '양액·배지' });
  assert.deepEqual(normalizePlace({ kind: 'review', extra: 1 }), { kind: 'review' });
  assert.deepEqual(['home', 'folder:양액·배지', 'inbox', 'archive', 'review'],
    [HOME, { kind: 'folder', name: '양액·배지' }, { kind: 'inbox' }, { kind: 'archive' }, { kind: 'review' }].map(placeKey));
  const ids = (place) => cardsOfPlace(CARDS, place).map((c) => c.set.id);
  assert.deepEqual(ids(HOME), [21, 20, 12, 11, 9, 8, 7]);
  assert.deepEqual(ids({ kind: 'folder', name: '증산·습도' }), [21, 20]);
  assert.deepEqual(ids({ kind: 'folder', name: '없는 폴더' }), []);
  assert.deepEqual(ids({ kind: 'inbox' }), [7]);
  assert.deepEqual(ids({ kind: 'archive' }), [11]);
  assert.deepEqual(ids({ kind: 'review' }), [21, 20, 12, 9, 8, 7]);
});

// ── 폴더 고르기(새 문제집·✏ 창의 칩, 옮길 곳 창) ──

test('chipFolderNames: 창을 열 때 골라 둔 폴더가 목록에 없으면(카드를 모두 옮긴 빈 폴더 보기) 그 이름도 제자리에 — 골라진 칩이 보이게', () => {
  const names = folderNames(groupCardsByFolder(CARDS));
  assert.deepEqual(names, ['양액·배지', '증산·습도', '기타']);
  // 빈 폴더('생육·착과')에서 연 새 문제집 창: 가나다 자리에 끼움('기타'는 늘 맨 뒤)
  assert.deepEqual(chipFolderNames(names, { kind: 'folder', name: '생육·착과' }), ['생육·착과', '양액·배지', '증산·습도', '기타']);
  assert.deepEqual(chipFolderNames(['양액·배지'], { kind: 'folder', name: '기타' }), ['양액·배지', '기타']);
  // 다듬은 이름으로 견준다(있는 폴더면 받은 목록 그대로 — 칩이 둘로 갈리지 않게)
  assert.equal(chipFolderNames(names, { kind: 'folder', name: ' 양액 · 배지 ' }), names);
  assert.deepEqual(chipFolderNames(['기타'], { kind: 'folder', name: '증산 · 습도' }), ['증산·습도', '기타']);
  // 새로 들어옴·보관함·새 폴더 칩이나 빈 이름이면 그대로
  for (const chip of [{ kind: 'inbox' }, { kind: 'archive' }, { kind: 'new' }, { kind: 'folder', name: '  ' }, null]) {
    assert.equal(chipFolderNames(names, chip), names);
  }
  assert.deepEqual(chipFolderNames(null, { kind: 'folder', name: '기타' }), ['기타']);
});

test("pickerOptions: 옮길 곳 줄 열쇠는 자리 열쇠 — 폴더 이름이 'inbox'·'new' 여도 겹치지 않음, 지금 자리만 고를 수 없음", () => {
  const opts = pickerOptions(['환경 제어', 'inbox', 'new', '기타'], { kind: 'folder', name: '환경 제어' });
  assert.deepEqual(opts.map((o) => [o.key, o.label, o.disabled]), [
    ['inbox', INBOX_LABEL, false],
    ['folder:환경 제어', '환경 제어', true],
    ['folder:inbox', 'inbox', false],
    ['folder:new', 'new', false],
    ['folder:기타', '기타', false],
  ]);
  assert.equal(new Set(opts.map((o) => o.key)).size, opts.length); // React key 가 겹치지 않음
  assert.deepEqual(opts[0].place, { kind: 'inbox' });
  assert.deepEqual(opts[2].place, { kind: 'folder', name: 'inbox' });
  for (const o of opts) assert.equal(o.key, placeKey(o.place));
  // 새로 들어옴에서 열면 그 줄만 흐림 — 첫 고를 수 있는 줄은 폴더 'new' 줄('folder:new')
  assert.deepEqual(pickerOptions(['new'], { kind: 'inbox' }).map((o) => [o.key, o.disabled]), [['inbox', true], ['folder:new', false]]);
  // 복습 차례·보관함·첫 화면에서 열면 흐린 줄 없음
  for (const cur of [{ kind: 'review' }, { kind: 'archive' }, HOME, null]) {
    assert.ok(pickerOptions(['기타'], cur).every((o) => !o.disabled));
  }
});

// ── 쓰기 계획 ──

test('planMove: 카드마다 보통 → 하드, 받은 제목 그대로, 같은 값·목록에 없는 카드는 뺌', () => {
  const plan = planMove(CARDS, [21, 12, 999], '양액·배지');
  assert.deepEqual(plan, [
    { id: 21, title: '[통합본] 습도와 증산', from: '증산 · 습도', to: '양액·배지', card: 21 },
    { id: 30, title: '[하드] [통합본] 습도와 증산', from: '', to: '양액·배지', card: 21 },
  ]); // 12 는 이미 양액·배지, 999 는 목록에 없음
  assert.equal(planCardCount(plan), 1);
  // 하드만 다르면 하드만(보통에 맞춤)
  assert.deepEqual(planMove(CARDS, ['21'], '증산 · 습도').map((it) => it.id), [30]);
  // 새로 들어옴으로: 빈 글(null 과 같음 — 7 은 그대로)
  assert.deepEqual(planMove(CARDS, [7, 8], '').map((it) => [it.id, it.from, it.to]), [[8, '기타', '']]);
});

test('planMove: 쓰기 직전 받은 제목을 쓴다(고른 뒤 도구가 제목을 바꿨어도 옛 제목으로 덮지 않게)', () => {
  const fresh = groupHardSets([{ id: 8, title: '[시험] 가루이 (고침)', subject: '기타' }]);
  assert.deepEqual(planMove(fresh, [8], '양액·배지'), [{ id: 8, title: '[시험] 가루이 (고침)', from: '기타', to: '양액·배지', card: 8 }]);
});

test('toArchive·fromArchive: 보관함으로는 [보관] <지금 폴더>, 꺼내기는 원래 폴더로(없으면 새로 들어옴)', () => {
  const arch = planMove(CARDS, [21, 7, 11], toArchive);
  assert.deepEqual(arch.map((it) => [it.id, it.to]), [[21, '[보관] 증산·습도'], [30, '[보관] 증산·습도'], [7, '[보관]']]); // 11 은 이미 보관함
  const back = planMove(groupHardSets([
    { id: 1, title: 'a', subject: '[보관] 양액·배지' }, { id: 2, title: '[하드] a', subject: '[보관] 양액·배지' },
    { id: 3, title: 'b', subject: '[보관]' }, { id: 4, title: 'c', subject: '기타' },
  ]), [1, 3, 4], fromArchive);
  assert.deepEqual(back.map((it) => [it.id, it.to]), [[1, '양액·배지'], [2, '양액·배지'], [3, '']]); // 4 는 보관함이 아님
});

test('planRename: 그 폴더 카드 + 그 폴더에서 보관함으로 간 카드의 원래 폴더도, 있는 이름이면 합치기', () => {
  const sets = [
    { id: 1, title: 'a', subject: '증산·습도' }, { id: 2, title: '[하드] a', subject: null },
    { id: 3, title: 'b', subject: '증산 · 습도' },
    { id: 4, title: 'c', subject: '[보관] 증산·습도' },
    { id: 5, title: 'd', subject: '습도' }, // 합칠 폴더 — 그대로
    { id: 6, title: 'e', subject: '양액·배지' },
  ];
  const plan = planRename(groupHardSets(sets), '증산·습도', ' 습도 ');
  assert.deepEqual(plan.map((it) => [it.id, it.to]), [[1, '습도'], [2, '습도'], [3, '습도'], [4, '[보관] 습도']]);
  assert.equal(planCardCount(plan), 3);
  assert.deepEqual(planRename(groupHardSets(sets), '', '습도'), []);
});

test('planUndo: 옛 값으로, 우리가 쓴 값 그대로일 때만(그 뒤 바뀐 것·없는 것은 그대로), 제목은 새로 받은 것', () => {
  const done = [
    { id: 21, title: '옛 제목', from: '증산 · 습도', to: '양액·배지', card: 21 },
    { id: 30, title: '[하드] 옛 제목', from: '', to: '양액·배지', card: 21 },
    { id: 12, title: 'x', from: '기타', to: '양액·배지', card: 12 },
    { id: 999, title: 'gone', from: '', to: '양액·배지', card: 999 },
  ];
  const fresh = [
    { id: 30, title: '[하드] 새 제목', subject: '양액·배지' },
    { id: 21, title: '새 제목', subject: '양액·배지' },
    { id: 12, title: 'x', subject: '환경 제어' }, // 다른 기기에서 또 옮김 → 그대로
  ];
  assert.deepEqual(planUndo(fresh, done), [
    { id: 21, title: '새 제목', from: '양액·배지', to: '증산 · 습도', card: 21 },
    { id: 30, title: '[하드] 새 제목', from: '양액·배지', to: '', card: 21 },
  ]);
  // 되돌린 뒤 다시 되돌리기 계획을 세우면 할 일 없음(몇 번 눌러도 안전)
  const after = [{ id: 30, title: 'h', subject: '' }, { id: 21, title: 't', subject: '증산 · 습도' }];
  assert.deepEqual(planUndo(after, done), []);
});

test('similarFolder·ro: 띄어쓰기·가운뎃점만 다른 있는 폴더 알림, 조사(으)로', () => {
  assert.equal(similarFolder('환경제어', ['환경 제어', '양액·배지']), '환경 제어');
  assert.equal(similarFolder('양액 배지', ['환경 제어', '양액·배지']), '양액·배지');
  assert.equal(similarFolder('환경 제어', ['환경 제어']), ''); // 똑같으면 그 폴더(알릴 것 없음)
  assert.equal(similarFolder('새 이름', ['환경 제어']), '');
  assert.equal(similarFolder('', ['환경 제어']), '');
  assert.equal(ro('양액·배지'), '로');
  assert.equal(ro('생리장해·병'), '으로');
  assert.equal(ro('보관함'), '으로');
  assert.equal(ro('물'), '로'); // ㄹ 받침
  assert.equal(ro('Tomato'), '로');
});

// 계획대로 서버(목록)에 써 본다 — 앞 n 개만 쓰고 멈춘 것처럼(망이 끊김)
function applyPlan(sets, plan, n = plan.length) {
  const out = sets.map((s) => ({ ...s }));
  for (const it of plan.slice(0, n)) out.find((s) => s.id === it.id).subject = it.to;
  return out;
}

// ('남은 N개 다시'는 계획을 다시 세우지 않고 처음 계획의 남은 항목만 쓴다 — 아래 runPlan 시험. 이것은 planMove 자체의 성질)
test('planMove: 글 목적지는 중간에 멈춘 뒤 다시 세워도 남은 것만(이미 같은 값은 뺌)', () => {
  const ids = [21, 12, 8];
  const first = planMove(CARDS, ids, '환경 제어');
  assert.deepEqual(first.map((it) => it.id), [21, 30, 12, 8]);
  assert.equal(planCardCount(first), 3);
  // 보통(21)만 쓰고 끊김 → 그 카드는 이미 새 폴더로 보이지만(폴더 = 보통의 subject) 하드(30)가 남음
  const half = applyPlan(SETS, first, 1);
  assert.deepEqual(folderOf(groupHardSets(half).find((c) => c.set.id === 21)), { kind: 'folder', name: '환경 제어' });
  const again = planMove(groupHardSets(half), ids, '환경 제어');
  assert.deepEqual(again.map((it) => it.id), [30, 12, 8]);
  assert.equal(planCardCount(again), 3);
  // 다 쓴 뒤 다시 세우면 할 일 없음
  assert.deepEqual(planMove(groupHardSets(applyPlan(half, again)), ids, '환경 제어'), []);
});

test('toArchive: 짝인 하드의 subject 가 달라도 보통의 폴더로 함께 [보관] <폴더>, 짝 없는 하드는 자기 폴더로', () => {
  const sets = [
    { id: 1, title: 'a', subject: '양액·배지' }, { id: 2, title: '[하드] a', subject: '[보관] 옛 폴더' },
    { id: 3, title: '[하드] 원래 없음', subject: '환경 제어' },
  ];
  assert.deepEqual(planMove(groupHardSets(sets), [1, 3], toArchive).map((it) => [it.id, it.to]),
    [[1, '[보관] 양액·배지'], [2, '[보관] 양액·배지'], [3, '[보관] 환경 제어']]);
  // 꺼내기도 보통의 원래 폴더로 둘 다
  const archived = applyPlan(sets, planMove(groupHardSets(sets), [1], toArchive));
  assert.deepEqual(planMove(groupHardSets(archived), [1], fromArchive).map((it) => [it.id, it.to]), [[1, '양액·배지'], [2, '양액·배지']]);
});

test('folderStats 이번 주: 월요일부터 오늘까지(하드만 공부해도 그 카드), 지난주 일요일·앞날은 빼고', () => {
  const cards = groupHardSets([
    { id: 1, title: 'a', subject: 'x' }, { id: 2, title: '[하드] a', subject: '' },
    { id: 3, title: 'b', subject: 'x' },
    { id: 4, title: 'c', subject: 'x' },
    { id: 5, title: 'd', subject: 'x' },
  ]);
  const days = { 2: ['2026-11-09'], 3: ['2026-11-08'], 4: ['2026-11-14'], 5: ['2026-11-12', '2026-11-11'] }; // 11/9 월 · 11/8 일 · 11/14 앞날
  const s = folderStats(cards, { days, today: '2026-11-12', now: new Date('2026-11-12T03:00:00.000Z') });
  assert.equal(s.week, 2); // 1(하드 11/9) · 5
  assert.equal(folderStats(cards, { days, today: '2026-11-09', now: new Date('2026-11-09T03:00:00.000Z') }).week, 1); // 월요일 당일
  assert.equal(folderStats(cards, { days, today: '2026-11-15', now: new Date('2026-11-15T03:00:00.000Z') }).week, 3); // 일요일: 11/9 ~ 11/15
});

test('자리 열쇠: 폴더 이름의 띄어쓰기·가운뎃점·조합형이 달라도 같은 자리(같은 스크롤 기억), 이름이 다르면 다른 자리', () => {
  const a = placeKey({ kind: 'folder', name: '양액 · 배지' });
  assert.equal(a, placeKey({ kind: 'folder', name: '양액·배지'.normalize('NFD') }));
  assert.equal(a, 'folder:양액·배지');
  assert.notEqual(a, placeKey({ kind: 'folder', name: '양액' }));
  assert.equal(placeKey(null), 'home');
  assert.equal(placeKey({ kind: 'folder', name: '' }), 'home');
  // 카드의 자리 열쇠(대시보드 카드의 data-card-place)
  assert.deepEqual(CARDS.map((c) => placeKey(folderOf(c))),
    ['folder:증산·습도', 'folder:증산·습도', 'folder:양액·배지', 'archive', 'folder:기타', 'folder:기타', 'inbox']);
});

test('폴더 목록: 폴더가 하나라도 있으면 폴더 목록(보관함만으로는 아님), 줄 정렬은 통계의 마지막 공부로', () => {
  const g = groupCardsByFolder(groupHardSets([
    { id: 1, title: 'a', subject: '' }, { id: 2, title: 'b', subject: '[보관] 가' }, { id: 3, title: 'c', subject: '나' },
    { id: 4, title: 'd', subject: '다' },
  ]));
  assert.equal(hasFolders(g), true);
  // 폴더 '나'·'다' 를 빼면(보관함 + 새로 들어옴만) 평평한 목록 — 폴더 목록 줄은 보관함 줄 하나(평평한 목록 아래에 그림)
  const onlyArchive = groupCardsByFolder(groupHardSets([{ id: 1, title: 'a', subject: '' }, { id: 2, title: 'b', subject: '[보관] 가' }]));
  assert.equal(hasFolders(onlyArchive), false);
  assert.deepEqual(folderRows(onlyArchive).filter((r) => r.kind === 'archive').map((r) => r.cards.length), [1]);
  const studied = { 3: '2026-11-01T00:00:00.000Z', 4: '2026-11-10T00:00:00.000Z', 2: '2026-11-11T00:00:00.000Z' };
  const rows = folderRows(g).map((r) => ({ ...r, stats: folderStats(r.cards, { studied, today: '2026-11-12', now: new Date('2026-11-12T00:00:00Z') }) }));
  assert.deepEqual(rows.map((r) => r.key), ['inbox', 'folder:나', 'folder:다', 'archive']);
  assert.deepEqual(sortFolderRows(rows, 'recent').map((r) => r.key), ['inbox', 'folder:다', 'folder:나', 'archive']);
  assert.deepEqual(sortFolderRows(rows, 'review').map((r) => r.key), ['inbox', 'folder:나', 'folder:다', 'archive']);
});

// ── 보관 막기 · 이름 바꾸기 대상 ──

test('archiveTooLong: [보관] + 원래 폴더가 50자를 넘는 폴더(옛 긴 과목)만 — 보관하기 전에 막음(꺼낼 곳을 잃지 않게)', () => {
  assert.equal(archiveTooLong({ kind: 'folder', name: '가'.repeat(45) }), false);
  assert.equal(archiveTooLong({ kind: 'folder', name: '가'.repeat(46) }), true);
  assert.equal(archiveTooLong(parseSubject(` ${'가'.repeat(46)} `)), true);
  assert.equal(archiveTooLong({ kind: 'inbox' }), false);
  assert.equal(archiveTooLong({ kind: 'archive', origin: '가'.repeat(48) }), false);
  assert.equal(archiveTooLong(null), false);
  // 앱에서 짓는 폴더 이름(40자까지)은 언제나 보관할 수 있고, 원래 폴더를 그대로 기억
  assert.equal(archiveTooLong(parseSubject('가'.repeat(40))), false);
  assert.equal(toArchive(parseSubject('가'.repeat(40))), `[보관] ${'가'.repeat(40)}`);
});

test('renameCardIds: 그 폴더 카드 + 그 폴더에서 보관함으로 간 카드(이름 바꾸기 진행 수)', () => {
  const cards = groupHardSets([
    { id: 1, title: 'a', subject: '증산·습도' }, { id: 2, title: '[하드] a', subject: null },
    { id: 3, title: 'b', subject: '[보관] 증산 · 습도' }, { id: 4, title: 'c', subject: '양액·배지' },
  ]);
  assert.deepEqual(renameCardIds(cards, '증산 · 습도'), [1, 3]);
  assert.deepEqual(renameCardIds(cards, ''), []);
  assert.deepEqual(renameCardIds(null, '증산·습도'), []);
});

// ── 쓰기 차례(runPlan) ──

test('itemStep·cardBatches: 쓰기 직전 지금 값으로 본 할 일, 계획을 카드별 묶음으로', () => {
  const it = { id: 1, from: '가', to: '나', card: 1 };
  assert.equal(itemStep(null, it), 'gone');
  assert.equal(itemStep({ id: 1, subject: '나' }, it), 'done');
  assert.equal(itemStep({ id: 1, subject: '다' }, it), 'changed');
  assert.equal(itemStep({ id: 1, subject: '가' }, it), 'write');
  assert.equal(itemStep({ id: 1, subject: null }, { id: 1, from: '', to: 'x', card: 1 }), 'write'); // null 과 '' 는 같은 새로 들어옴
  assert.deepEqual(cardBatches([{ id: 1, card: 1 }, { id: 2, card: 1 }, { id: 3, card: 3 }]).map((b) => b.map((x) => x.id)), [[1, 2], [3]]);
  assert.deepEqual(cardBatches(null), []);
});

// 가짜 서버(메모리): getSets · updateSet(제목·과목을 통째로 — 앱의 qm_update_set 과 같음).
// failAt: n 번째 쓰기부터 실패(연결 끊김 흉내 — null 로 하면 다시 됨), failGet: 다음 목록 받기 한 번 실패,
// onWrite(n, srv): n 번째 쓰기가 끝난 뒤(그사이 다른 기기·도구가 바꾸는 것 흉내)
function fakeServer(sets, opt = {}) {
  const srv = { sets: sets.map((s) => ({ ...s })), writes: [], gets: 0, failAt: opt.failAt ?? null, failGet: false, onWrite: opt.onWrite ?? null };
  const offline = () => Object.assign(new Error('서버에 연결하지 못했습니다.'), { offline: true });
  srv.set = (id, patch) => Object.assign(srv.sets.find((s) => s.id === id), patch);
  srv.subject = (id) => srv.sets.find((s) => s.id === id)?.subject;
  srv.io = {
    async getSets() {
      srv.gets++;
      if (srv.failGet) {
        srv.failGet = false;
        throw offline();
      }
      return srv.sets.map((s) => ({ ...s }));
    },
    async updateSet(id, title, subject) {
      const n = srv.writes.length + 1;
      if (srv.failAt && n >= srv.failAt) throw offline();
      const s = srv.sets.find((x) => String(x.id) === String(id));
      if (!s) throw Object.assign(new Error('존재하지 않는 세트입니다.'), { code: 'QM404' });
      srv.writes.push([id, title, subject]);
      Object.assign(s, { title, subject });
      srv.onWrite?.(n, srv);
    },
    isGone: (e) => e?.code === 'QM404',
  };
  return srv;
}

test("runPlan '다시': 보통만 쓰고 하드에서 끊긴 카드도 하드까지 같은 값 — 보관함으로·꺼내기·이름 바꾸기(목적지를 카드 자리로 정하는 일)", async () => {
  const cases = [
    {
      name: '보관함으로',
      sets: [{ id: 2, title: '[하드] a', subject: '양액·배지' }, { id: 1, title: 'a', subject: '양액·배지' }, { id: 3, title: 'b', subject: '양액·배지' }],
      plan: (fresh) => planMove(groupHardSets(fresh), [1, 3], toArchive),
      want: { 1: '[보관] 양액·배지', 2: '[보관] 양액·배지', 3: '[보관] 양액·배지' },
    },
    {
      name: '꺼내기',
      sets: [{ id: 2, title: '[하드] a', subject: '[보관] 양액·배지' }, { id: 1, title: 'a', subject: '[보관] 양액·배지' }, { id: 3, title: 'b', subject: '[보관]' }],
      plan: (fresh) => planMove(groupHardSets(fresh), [1, 3], fromArchive),
      want: { 1: '양액·배지', 2: '양액·배지', 3: '' },
    },
    {
      name: '이름 바꾸기',
      sets: [{ id: 2, title: '[하드] a', subject: '증산·습도' }, { id: 1, title: 'a', subject: '증산·습도' }, { id: 3, title: 'b', subject: '증산·습도' }],
      plan: (fresh) => planRename(groupHardSets(fresh), '증산·습도', '습도'),
      want: { 1: '습도', 2: '습도', 3: '습도' },
    },
  ];
  for (const c of cases) {
    const srv = fakeServer(c.sets, { failAt: 2 }); // 2번째 쓰기(1 의 하드)에서 끊김
    const job = folderJob(c.plan, 2, folderJobTexts('archive'));
    await assert.rejects(runPlan(job, srv.io), /연결/, c.name);
    assert.deepEqual(srv.writes.map((w) => w[0]), [1], c.name);
    // 1 은 보통이 옮겨져 옮긴 것으로 보이고(하드 하나가 남음), 3 이 남음 — 막대 '남은 1개 다시'
    assert.deepEqual(jobCounts(job.items, job.finished), { total: 2, moved: 1, left: 1, hidden: 1 }, c.name);
    srv.failAt = null;
    await runPlan(job, srv.io);
    for (const [id, subject] of Object.entries(c.want)) assert.equal(srv.subject(Number(id)), subject, `${c.name} ${id}`);
    assert.deepEqual(srv.writes.map((w) => w[0]), [1, 2, 3], c.name); // 남은 것만 차례로(보통 → 하드)
    assert.deepEqual(jobCounts(job.items, job.finished), { total: 2, moved: 2, left: 0, hidden: 0 }, c.name);
    assert.deepEqual(job.done.map((d) => d.id), [1, 2, 3], c.name); // 되돌리기는 셋 모두
    await runPlan(job, srv.io); // 몇 번 더 불러도 더 쓰지 않음
    assert.equal(srv.writes.length, 3, c.name);
  }
});

test("runPlan '다시': 그새 다른 기기가 옮긴 카드는 덮지 않음(끝낸 것은 다시 쓰지 않고, 남은 것도 지금 값이 계획 때 그대로일 때만)", async () => {
  const srv = fakeServer([
    { id: 1, title: 'a', subject: '양액·배지' }, { id: 2, title: 'b', subject: '양액·배지' }, { id: 3, title: 'c', subject: '양액·배지' },
  ], { failAt: 2 });
  const job = folderJob((fresh) => planMove(groupHardSets(fresh), [1, 2, 3], '환경 제어'), 3, folderJobTexts('move', { name: '환경 제어' }));
  await assert.rejects(runPlan(job, srv.io));
  // 그사이 태블릿에서: 끝낸 1 을 '현장 노하우'로, 남은 2 를 '생육·착과'로
  srv.set(1, { subject: '현장 노하우' });
  srv.set(2, { subject: '생육·착과' });
  srv.failAt = null;
  await runPlan(job, srv.io);
  assert.deepEqual([srv.subject(1), srv.subject(2), srv.subject(3)], ['현장 노하우', '생육·착과', '환경 제어']);
  assert.deepEqual(srv.writes.map((w) => w[0]), [1, 3]);
  assert.deepEqual([...job.skipped], ['2']);
  assert.equal(jobEndText(job), '「환경 제어」로 옮겼습니다. 그새 다른 곳에서 바뀐 1개는 그대로 두었습니다.');

  // 보통이 그새 바뀐 카드는 하드도 그대로(그쪽 기기가 하던 일과 짝을 맞춤)
  const srv2 = fakeServer([{ id: 1, title: 'a', subject: 'x' }, { id: 2, title: '[하드] a', subject: 'x' }]);
  const job2 = folderJob((fresh) => planMove(groupHardSets(fresh), [1], 'y'), 1, folderJobTexts('move', { name: 'y' }));
  job2.items = job2.plan(await srv2.io.getSets()); // 계획을 세운 뒤 다른 기기가 보통만 바꿈
  srv2.set(1, { subject: 'z' });
  await runPlan(job2, srv2.io);
  assert.deepEqual([srv2.subject(1), srv2.subject(2)], ['z', 'x']);
  assert.equal(srv2.writes.length, 0);
  assert.equal(jobEndText(job2), '그새 다른 곳에서 바뀌어 그대로 두었습니다.');
});

test('runPlan: 카드마다 쓰기 바로 앞에서 목록을 새로 받아 그 제목으로 — 쓰는 동안 도구가 바꾼 제목을 옛 제목으로 덮지 않음', async () => {
  const srv = fakeServer([
    { id: 1, title: 'a', subject: '' }, { id: 3, title: 'b', subject: '' }, { id: 4, title: '[하드] b', subject: '' },
  ], {
    // 1 을 쓴 직후 도구가 3·4 의 제목을 바꿈(retitle)
    onWrite: (n, s) => {
      if (n === 1) {
        s.set(3, { title: 'b (고침)' });
        s.set(4, { title: '[하드] b (고침)' });
      }
    },
  });
  const job = folderJob((fresh) => planMove(groupHardSets(fresh), [1, 3], '기타'), 2, folderJobTexts('move', { name: '기타' }));
  await runPlan(job, srv.io);
  assert.deepEqual(srv.writes, [[1, 'a', '기타'], [3, 'b (고침)', '기타'], [4, '[하드] b (고침)', '기타']]);
  assert.equal(srv.gets, 2); // 계획 때 한 번(첫 카드도 그것으로) + 둘째 카드 앞에서 한 번
  assert.deepEqual(groupHardSets(srv.sets).map((c) => [c.set.id, c.hard?.id ?? null]), [[1, null], [3, 4]]); // 짝 그대로
});

test('runPlan: 다시 할 때 목록 받기부터 실패해도 남은 수는 그대로(처음 고른 수로 늘지 않음), 멈춤·닫기 안내 글', async () => {
  const sets = [];
  for (const id of [1, 3, 5, 7]) sets.push({ id, title: `t${id}`, subject: '양액·배지' }, { id: id + 1, title: `[하드] t${id}`, subject: '양액·배지' });
  const srv = fakeServer(sets, { failAt: 5 }); // 4번째 쓰기까지(카드 1·3) 되고 5번째(카드 5 의 보통)에서 끊김
  const job = folderJob((fresh) => planMove(groupHardSets(fresh), [1, 3, 5, 7], '기타'), 4, folderJobTexts('move', { name: '기타' }));
  await assert.rejects(runPlan(job, srv.io));
  const c = jobCounts(job.items, job.finished);
  assert.deepEqual(c, { total: 4, moved: 2, left: 2, hidden: 0 });
  assert.equal(jobFailText(job, c, '서버에 연결하지 못했습니다.'), '다 옮기지 못했습니다(4개 중 2개 옮김). 서버에 연결하지 못했습니다.');
  srv.failGet = true; // 아직 오프라인: '다시'를 눌렀는데 목록 받기부터 실패
  await assert.rejects(runPlan(job, srv.io));
  assert.deepEqual(jobCounts(job.items, job.finished), c); // '남은 2개' 그대로
  assert.equal(jobCloseText(job, c), '4개 중 2개만 「기타」로 옮겼습니다.');
  srv.failAt = null;
  await runPlan(job, srv.io);
  assert.deepEqual(jobCounts(job.items, job.finished), { total: 4, moved: 4, left: 0, hidden: 0 });
  assert.equal(srv.writes.length, 8);
  // 아무것도 못 쓰고 멈추면 괄호 없이
  assert.equal(jobFailText(job, { total: 4, moved: 0, left: 4, hidden: 0 }, '서버가 쉬는 중입니다.'), '다 옮기지 못했습니다. 서버가 쉬는 중입니다.');
});

test('runPlan: 마지막 카드의 하드에서 끊기면 카드는 모두 옮겨 보이고 하드만 남음 — 막대·닫기 글이 그대로 말함', async () => {
  const srv = fakeServer([{ id: 1, title: 'a', subject: 'x' }, { id: 2, title: '[하드] a', subject: 'x' }], { failAt: 2 });
  const job = folderJob((fresh) => planMove(groupHardSets(fresh), [1], toArchive), 1, folderJobTexts('archive', { one: true }));
  await assert.rejects(runPlan(job, srv.io));
  const c = jobCounts(job.items, job.finished);
  assert.deepEqual(c, { total: 1, moved: 1, left: 0, hidden: 1 });
  assert.equal(jobFailText(job, c, '서버에 연결하지 못했습니다.'), '보관함으로 옮기지 못했습니다(하드 문제집 1개 남음). 서버에 연결하지 못했습니다.');
  assert.equal(jobCloseText(job, c), '보관함으로 옮겼습니다. 하드 문제집 1개는 그대로입니다.');
  srv.failAt = null;
  await runPlan(job, srv.io);
  assert.deepEqual([srv.subject(1), srv.subject(2)], ['[보관] x', '[보관] x']);
});

test('runPlan: 앞서 쓴 것이 응답만 못 받았으면(서버에는 들어감) 다시 할 때 또 쓰지 않고 되돌리기에는 넣음 · 그새 지워진 문제집은 건너뜀', async () => {
  const srv = fakeServer([{ id: 1, title: 'a', subject: 'x' }, { id: 2, title: 'b', subject: 'x' }, { id: 3, title: 'c', subject: 'x' }]);
  const real = srv.io.updateSet;
  // 2 는 서버에 들어갔는데 응답이 끊기고, 3 은 쓰려는 순간 지워져 있음(QM404)
  srv.io.updateSet = async (id, title, subject) => {
    if (id === 3) throw Object.assign(new Error('존재하지 않는 세트입니다.'), { code: 'QM404' });
    await real(id, title, subject);
    if (id === 2) throw Object.assign(new Error('끊김'), { offline: true });
  };
  const job = folderJob((fresh) => planMove(groupHardSets(fresh), [1, 2, 3], 'y'), 3, folderJobTexts('move', { name: 'y' }));
  await assert.rejects(runPlan(job, srv.io), /끊김/);
  await runPlan(job, srv.io);
  assert.deepEqual(srv.writes.map((w) => w[0]), [1, 2]); // 2 를 두 번 쓰지 않음
  assert.deepEqual(job.done.map((d) => d.id), [1, 2]);
  assert.deepEqual(jobCounts(job.items, job.finished), { total: 3, moved: 3, left: 0, hidden: 0 });
  assert.deepEqual(planUndo(await srv.io.getSets(), job.done).map((it) => [it.id, it.to]), [[1, 'x'], [2, 'x']]);
  // 목록에서 그새 사라진 문제집도 건너뛰고 이어 씀
  const srv2 = fakeServer([{ id: 1, title: 'a', subject: '' }, { id: 2, title: 'b', subject: '' }, { id: 3, title: 'c', subject: '' }], {
    onWrite: (n, s) => { if (n === 1) s.sets = s.sets.filter((x) => x.id !== 2); },
  });
  const job2 = folderJob((fresh) => planMove(groupHardSets(fresh), [1, 2, 3], '기타'), 3, folderJobTexts('move', { name: '기타' }));
  await runPlan(job2, srv2.io);
  assert.deepEqual(srv2.writes.map((w) => w[0]), [1, 3]);
});

test("folderJobTexts: 있는 폴더에 넣으면 '만들었습니다'가 아니라 '넣었습니다', 되돌릴 것이 없으면 '되돌릴 것이 없습니다'", () => {
  assert.equal(folderJobTexts('newFolder', { name: '기타', exists: true }).doneText, '「기타」에 넣었습니다.');
  assert.equal(folderJobTexts('newFolder', { name: '양액·배지', exists: false }).doneText, '「양액·배지」 폴더를 만들었습니다.');
  const undo = folderJob(() => [], 0, folderJobTexts('undo'));
  assert.equal(jobEndText(undo), '되돌릴 것이 없습니다.');
  assert.equal(undo.undo, false);
  assert.equal(jobEndText(folderJob(() => [], 0, folderJobTexts('move', { name: '기타' }))), '바꿀 것이 없습니다(이미 그 자리에 있습니다).');
  assert.equal(folderJobTexts('unarchive', { origin: '', one: true }).doneText, '「새로 들어옴」으로 꺼냈습니다.');
  assert.equal(folderJobTexts('unarchive', { origin: '생리장해·병', one: true }).doneText, '「생리장해·병」으로 꺼냈습니다.');
  assert.equal(folderJobTexts('unarchive').doneText, '원래 폴더로 꺼냈습니다.');
  assert.equal(folderJobTexts('rename', { from: '증산·습도', to: '습도' }).doneText, '폴더 이름을 「습도」로 바꿨습니다.');
  assert.equal(folderJobTexts('merge', { from: '습도', to: '증산·습도' }).doneText, '「습도」 폴더를 「증산·습도」에 합쳤습니다.');
  const rename = folderJob(() => [], 0, folderJobTexts('rename', { from: '증산·습도', to: '습도' }));
  assert.equal(jobFailText(rename, { total: 6, moved: 2, left: 4, hidden: 0 }), '이름을 다 바꾸지 못했습니다(6개 중 2개 옮김).');
  assert.equal(jobCloseText(rename, { total: 6, moved: 2, left: 4, hidden: 0 }), '6개 중 2개만 「습도」로 옮겼습니다.');
});
