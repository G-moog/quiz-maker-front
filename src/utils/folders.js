// 문제집 폴더 도우미(화면 없이 값만): 폴더는 서버 question_sets.subject 칸 하나에 담는다(서버 표·DB 함수는 그대로).
//  null·''·공백뿐 → '새로 들어옴'(inbox) · '[보관]' 또는 '[보관] <원래 폴더>' → 보관함(꺼내면 원래 폴더로) · 그 밖 → 폴더 이름
// 카드(원래 + 짝인 하드)의 폴더는 원래(보통) 문제집의 subject 다. 짝인 하드의 subject 는 보지 않고, 쓸 때는 보통 → 하드 차례로 같은 값을 쓴다.
// 짝 없는 하드(카드의 set 이 하드)는 자기 subject. 문제 등록 도구(quiz-maker-notion lib/folders.mjs)와 같은 규칙·같은 시험 예시를 쓴다.
// Node 시험(test/app)도 그대로 불러오도록 다른 파일을 부르지 않는다 — 카드는 hardMode.groupHardSets 결과({ set, hard })를 받는다.

export const FOLDER_MAX = 40; // 폴더 이름 한도 — '[보관] ' + 이름이 subject 한도 안에 들게
export const SUBJECT_MAX = 50; // 서버 subject 칸 한도(qm_check_set_fields)
export const ARCHIVE_MARK = "[보관]";
export const ETC_FOLDER = "기타"; // 폴더 가나다 순서에서 맨 뒤(보관함 바로 앞)
export const INBOX_LABEL = "새로 들어옴";
export const ARCHIVE_LABEL = "보관함";
export const REVIEW_LABEL = "복습 차례";
// 화면의 자리 이름과 겹쳐 폴더 이름으로 못 쓰는 이름
export const RESERVED_NAMES = [ARCHIVE_LABEL, INBOX_LABEL, REVIEW_LABEL, "전체"];

const DAY_MS = 86400000;
const NEW_DAYS = 7; // '새' = 만든 지 이 날수 안 + 공부 기록 없음

// 글자 수는 서버(char_length)처럼 코드 포인트로 센다(그림 글자 하나 = 1자)
function charLength(s) {
  return [...s].length;
}

// 폴더 이름 다듬기: NFC → 앞뒤 공백 빼기 → 이어진 공백은 하나로 → '·' 앞뒤 공백 빼기('양액 · 배지' → '양액·배지'). 글이 아니면 ''
export function normalizeFolder(name) {
  if (typeof name !== "string") return "";
  return name.normalize("NFC").trim().replace(/\s+/g, " ").replace(/ ?· ?/g, "·");
}

// subject → 자리 { kind: 'inbox' } | { kind: 'folder', name } | { kind: 'archive', origin }(origin '' 이면 꺼낼 때 새로 들어옴)
export function parseSubject(subject) {
  const s = typeof subject === "string" ? subject.normalize("NFC").trim() : "";
  if (!s) return { kind: "inbox" };
  if (s.startsWith(ARCHIVE_MARK)) return { kind: "archive", origin: normalizeFolder(s.slice(ARCHIVE_MARK.length)) };
  return { kind: "folder", name: normalizeFolder(s) };
}

// 자리 → subject. 새로 들어옴은 ''(지금 앱이 빈 과목을 보내는 값 그대로 — null 이 아님).
// 보관 표시와 원래 폴더가 subject 한도(50자)를 넘으면(옛 과목처럼 긴 이름) 원래 폴더 없이 '[보관]' — 꺼내면 새로 들어옴.
// 화면은 그런 카드를 보관하기 전에 막는다(archiveTooLong). 여기의 줄임은 그새 바뀐 값 등으로 막지 못했을 때 서버가
// 거절해 '다시'가 끝없이 실패하지 않게 하는 마지막 방어다
export function buildSubject(place) {
  if (!place || typeof place !== "object") return "";
  if (place.kind === "folder") return normalizeFolder(place.name);
  if (place.kind === "archive") {
    const origin = normalizeFolder(place.origin);
    const full = origin ? `${ARCHIVE_MARK} ${origin}` : ARCHIVE_MARK;
    return charLength(full) <= SUBJECT_MAX ? full : ARCHIVE_MARK;
  }
  return "";
}

export function isReservedName(name) {
  return RESERVED_NAMES.includes(normalizeFolder(name));
}

// 새로 짓는 폴더 이름 검사: 문제없으면 '', 아니면 짧은 까닭(다듬은 이름으로 본다)
export function folderNameError(name) {
  const n = normalizeFolder(name);
  if (!n) return "폴더 이름을 적어 주세요.";
  if (charLength(n) > FOLDER_MAX) return `폴더 이름은 ${FOLDER_MAX}자까지입니다.`;
  if (n.startsWith("[")) return "폴더 이름은 '[' 로 시작할 수 없습니다.";
  if (isReservedName(n)) return `'${n}'${eunNeun(n)} 폴더 이름으로 쓸 수 없습니다.`;
  return "";
}

// 받침 있는 글자로 끝나나(한글만 — 그 밖은 받침 없음으로)
function hasBatchim(word) {
  const last = String(word || "").trim().slice(-1);
  const code = last ? last.charCodeAt(0) - 0xac00 : -1;
  return code >= 0 && code < 11172 && code % 28 !== 0;
}

function eunNeun(word) {
  return hasBatchim(word) ? "은" : "는";
}

// '「양액·배지」로' · '「생리장해·병」으로'(ㄹ 받침은 '로')
export function ro(word) {
  const last = String(word || "").trim().slice(-1);
  const code = last ? last.charCodeAt(0) - 0xac00 : -1;
  return hasBatchim(word) && code % 28 !== 8 ? "으로" : "로";
}

// 카드 제목 보이기(폴더 보기·찾기·복습 차례에서만 — 실제 제목은 그대로): '[Notion] ' 은 숨기고, '[통합본] ' 은 작은 표로.
// 다른 앞표시([시험]·[하드] 등)는 그대로. 떼고 나면 빈 글이면 제목 그대로
const NOTION_MARK = "[Notion] ";
const MERGED_MARK = "[통합본] ";

export function displayTitle(title) {
  const t = typeof title === "string" ? title : "";
  const rest = (mark) => (t.startsWith(mark) ? t.slice(mark.length) : "");
  if (rest(NOTION_MARK).trim()) return { badge: "", text: rest(NOTION_MARK) };
  if (rest(MERGED_MARK).trim()) return { badge: "통합본", text: rest(MERGED_MARK) };
  return { badge: "", text: t };
}

// 비슷한 이름(띄어쓰기·'·'·대소문자만 다른 것)의 있는 폴더 — 같은 폴더가 둘로 갈리지 않게 새 이름을 지을 때 알린다. 없으면(또는 똑같으면) ''
export function similarFolder(name, names) {
  const n = normalizeFolder(name);
  if (!n) return "";
  const squash = (s) => normalizeFolder(s).replace(/[\s·]/g, "").toLowerCase();
  const key = squash(n);
  for (const other of names || []) {
    if (other !== n && squash(other) === key) return other;
  }
  return "";
}

// ── 카드 묶기 ──

// 카드의 자리(원래 문제집의 subject)
export function folderOf(card) {
  return parseSubject(card?.set?.subject);
}

// 카드 → { inbox: [카드], folders: Map(이름 → [카드]), archive: [카드] }. 순서는 받은 카드 순서 그대로
export function groupCardsByFolder(cards) {
  const inbox = [];
  const archive = [];
  const folders = new Map();
  for (const c of Array.isArray(cards) ? cards : []) {
    const p = folderOf(c);
    if (p.kind === "inbox") inbox.push(c);
    else if (p.kind === "archive") archive.push(c);
    else {
      if (!folders.has(p.name)) folders.set(p.name, []);
      folders.get(p.name).push(c);
    }
  }
  return { inbox, folders, archive };
}

// 폴더가 하나라도 있나(보관함은 빼고). 없으면(보관함 밖 카드가 모두 새로 들어옴) 대시보드는 지금처럼 평평한 목록 —
// 보관함이 있으면 그 목록 아래에 '보관함' 한 줄만 더한다(✕ → 보관함으로 한 번에 첫 화면이 폴더 목록으로 바뀌지 않게)
export function hasFolders(groups) {
  return !!groups && groups.folders.size > 0;
}

// 폴더 이름 순서: 가나다(ko) → '기타' 맨 뒤
export function compareFolderNames(a, b) {
  if (a === b) return 0;
  if (a === ETC_FOLDER) return 1;
  if (b === ETC_FOLDER) return -1;
  return a.localeCompare(b, "ko");
}

// 있는 폴더 이름(가나다 순서) — 폴더 고르기 칩·옮길 곳 목록
export function folderNames(groups) {
  return groups ? [...groups.folders.keys()].sort(compareFolderNames) : [];
}

// 폴더 칩으로 보일 이름: 있는 폴더(가나다) + 창을 열 때 골라 둔 폴더(chip)가 그 사이에 없으면 그 이름도 제자리에.
// 폴더는 문제집이 들어 있어야 보이므로, 카드를 모두 옮긴 빈 폴더 보기에서 연 새 문제집 창은 기본값(지금 연 폴더) 칩이 없다 —
// 골라진 칩이 화면에 보이게(어디로 가는지 모른 채 보이지 않는 폴더로 만들지 않게)
export function chipFolderNames(names, chip) {
  const list = Array.isArray(names) ? names : [];
  const name = chip && chip.kind === "folder" ? normalizeFolder(chip.name) : "";
  if (!name || list.includes(name)) return list;
  return [...list, name].sort(compareFolderNames);
}

// 옮길 곳 창의 줄: 새로 들어옴 · 폴더(받은 차례 — 가나다). key 는 자리 열쇠(placeKey — 'inbox' · 'folder:<이름>')라
// 폴더 이름이 'inbox'·'new' 여도 줄끼리 겹치지 않는다(React key·첫 포커스). 지금 자리(current)는 고를 수 없게(disabled)
export function pickerOptions(names, current) {
  const here = current ? placeKey(current) : "";
  const places = [{ kind: "inbox" }, ...(Array.isArray(names) ? names : []).map((name) => ({ kind: "folder", name }))];
  return places.map((place) => {
    const key = placeKey(place);
    return { key, label: place.kind === "folder" ? place.name : INBOX_LABEL, place, disabled: key === here };
  });
}

// 폴더 목록 줄(첫 화면): 새로 들어옴(있으면) → 폴더 가나다 → '기타' → 보관함(있으면). key 는 placeKey 와 같다
export function folderRows(groups) {
  if (!groups) return [];
  const rows = [];
  if (groups.inbox.length) rows.push({ key: "inbox", kind: "inbox", name: INBOX_LABEL, cards: groups.inbox });
  for (const name of folderNames(groups)) {
    rows.push({ key: `folder:${name}`, kind: "folder", name, cards: groups.folders.get(name) });
  }
  if (groups.archive.length) rows.push({ key: "archive", kind: "archive", name: ARCHIVE_LABEL, cards: groups.archive });
  return rows;
}

function timeOf(iso) {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? null : t;
}

const dayNoOf = (d) => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / DAY_MS);

// 폴더 줄 통계. ctx: { studied: lastStudiedMap 결과, days: studyDaysMap 결과, noteCounts: countNotesBySet 결과(못 받았으면 null),
// today: 서울 날짜 'YYYY-MM-DD'(studyDay), now: Date } — 카드(원래 + 짝인 하드)를 하나로 센다
//  count 카드 수 · notes 미해결 메모 수 · lastAt 마지막 공부(ISO, 없으면 null) · week 이번 주(월요일 ~ 오늘)에 공부한 카드 수
//  fresh '새' 카드 수(만든 지 7일 안이고 보통·하드 모두 공부 기록 없음)
export function folderStats(cards, ctx = {}) {
  const { studied, days, noteCounts, today, now } = ctx;
  const list = Array.isArray(cards) ? cards : [];
  const ids = (c) => (c.hard ? [c.set.id, c.hard.id] : [c.set.id]).map(String);
  const t = /^\d{4}-\d{2}-\d{2}$/.test(String(today || "")) ? dayNoOf(today) : null;
  const monday = t === null ? null : t - ((new Date(t * DAY_MS).getUTCDay() + 6) % 7);
  const nowMs = now instanceof Date ? now.getTime() : Date.now();
  let notes = 0;
  let last = null;
  let lastAt = null;
  let week = 0;
  let fresh = 0;
  for (const c of list) {
    let seen = false;
    for (const id of ids(c)) {
      notes += (noteCounts && noteCounts[id]) || 0;
      const at = studied ? studied[id] : null;
      const ta = timeOf(at);
      if (ta !== null) {
        seen = true;
        if (last === null || ta > last) { last = ta; lastAt = at; }
      }
    }
    if (monday !== null && days) {
      const inWeek = ids(c).some((id) => (days[id] || []).some((d) => {
        const n = dayNoOf(String(d));
        return n >= monday && n <= t;
      }));
      if (inWeek) week++;
      if (ids(c).some((id) => (days[id] || []).length)) seen = true;
    }
    const made = timeOf(c.set.createdAt);
    if (!seen && made !== null && nowMs - made < NEW_DAYS * DAY_MS) fresh++;
  }
  return { count: list.length, notes, lastAt, week, fresh };
}

// 폴더 줄 정렬(대시보드 정렬 단추와 같은 값 — 'default' · 'recent' · 'review'): 기본은 그대로.
// 최근 공부·복습 차례는 폴더 안 카드들의 마지막 공부(stats.lastAt) 기준, 공부한 적 없는 폴더는 뒤에 기본 순서대로.
// 새로 들어옴은 늘 맨 위, 보관함은 늘 맨 아래(정리할 곳·쉬는 곳이라 섞지 않음)
export function sortFolderRows(rows, mode) {
  if (mode !== "recent" && mode !== "review") return rows;
  const dir = mode === "recent" ? -1 : 1;
  const top = rows.filter((r) => r.kind === "inbox");
  const end = rows.filter((r) => r.kind === "archive");
  const mid = rows
    .filter((r) => r.kind === "folder")
    .map((r, i) => ({ r, i, t: timeOf(r.stats?.lastAt) }))
    .sort((x, y) => {
      if (x.t === null && y.t === null) return x.i - y.i;
      if (x.t === null) return 1;
      if (y.t === null) return -1;
      return dir * (x.t - y.t) || x.i - y.i;
    })
    .map((x) => x.r);
  return [...top, ...mid, ...end];
}

// 폴더 안 '통합 안 됨' 수: [통합본] 카드가 하나라도 있을 때만 '[Notion] ' 카드 수(다음 통폐합 때를 알림). 아니면 0
export function unmergedCount(cards) {
  let merged = 0;
  let notion = 0;
  for (const c of Array.isArray(cards) ? cards : []) {
    const t = typeof c?.set?.title === "string" ? c.set.title : "";
    if (t.startsWith(MERGED_MARK)) merged++;
    else if (t.startsWith(NOTION_MARK)) notion++;
  }
  return merged > 0 ? notion : 0;
}

// 찾기 결과·복습 차례 카드의 📚 표: 폴더 이름, 보관함 카드는 '보관함', 새로 들어옴은 ''(표 없음)
export function folderLabel(card) {
  const p = folderOf(card);
  if (p.kind === "folder") return p.name;
  return p.kind === "archive" ? ARCHIVE_LABEL : "";
}

// 보관함 카드는 맨 뒤로(그 밖 순서는 그대로) — 찾기 결과
export function archivedLast(cards) {
  const list = Array.isArray(cards) ? cards : [];
  const isArch = (c) => folderOf(c).kind === "archive";
  return [...list.filter((c) => !isArch(c)), ...list.filter(isArch)];
}

// ── 대시보드 자리(보던 화면) ──
// { kind: 'home' }(폴더 목록) · { kind: 'folder', name } · { kind: 'inbox' } · { kind: 'archive' } · { kind: 'review' }(보관함 밖 모든 카드)
export const HOME = Object.freeze({ kind: "home" });

// 기억해 둔 자리(목록 기억)가 이상하면 첫 화면
export function normalizePlace(place) {
  if (!place || typeof place !== "object") return HOME;
  if (place.kind === "folder") {
    const name = normalizeFolder(place.name);
    return name ? { kind: "folder", name } : HOME;
  }
  if (place.kind === "inbox" || place.kind === "archive" || place.kind === "review") return { kind: place.kind };
  return HOME;
}

// 자리 열쇠(자리별 스크롤 기억·폴더 줄 key): 'home' · 'folder:<이름>' · 'inbox' · 'archive' · 'review'
export function placeKey(place) {
  const p = normalizePlace(place);
  return p.kind === "folder" ? `folder:${p.name}` : p.kind;
}

// 그 자리에서 보일 카드(받은 카드 순서 그대로). 첫 화면은 모든 카드
export function cardsOfPlace(cards, place) {
  const p = normalizePlace(place);
  const list = Array.isArray(cards) ? cards : [];
  if (p.kind === "home") return list;
  return list.filter((c) => {
    const f = folderOf(c);
    if (p.kind === "review") return f.kind !== "archive";
    if (p.kind === "folder") return f.kind === "folder" && f.name === p.name;
    return f.kind === p.kind;
  });
}

// ── 쓰기 계획 ──
// 항목 { id, title, from, to, card }: id 문제집에 updateSet(id, title, to). title 은 쓰기 직전 새로 받은 제목 그대로(updateSet 은 제목·과목을
// 통째로 바꾸므로 subject 를 늘 넘긴다 — 빠지면 NULL), from 은 그때 서버 값(되돌리기), card 는 카드의 원래 문제집 id(진행 'n/N' 을 카드로 셈).
// 카드마다 보통 먼저·하드 다음. 받은 목록에 없는 카드와 이미 같은 값인 문제집은 뺀다 — 같은 계획을 몇 번 다시 해도 안전

const sameSubject = (a, b) => (a ?? "") === (b ?? "");

// freshCards: 쓰기 직전 받은 목록의 카드(groupHardSets), baseIds: 고른 카드의 원래 문제집 id,
// to: 새 subject 글, 또는 (카드 자리, 카드) → 새 subject(null 이면 그 카드는 그대로)
export function planMove(freshCards, baseIds, to) {
  const want = new Set((baseIds || []).map(String));
  const items = [];
  for (const c of Array.isArray(freshCards) ? freshCards : []) {
    if (!want.has(String(c.set.id))) continue;
    const next = typeof to === "function" ? to(folderOf(c), c) : to;
    if (typeof next !== "string") continue;
    for (const s of c.hard ? [c.set, c.hard] : [c.set]) {
      if (sameSubject(s.subject, next)) continue;
      items.push({ id: s.id, title: s.title, from: s.subject ?? "", to: next, card: c.set.id });
    }
  }
  return items;
}

// 보관함으로 옮기면 '[보관] <지금 폴더>' 가 subject 한도(50자)를 넘는 자리인가(옛 과목처럼 46자 이상인 폴더 — 앱에서 짓는 이름은 40자까지).
// 이런 카드는 보관하면 원래 폴더를 잃으므로(buildSubject 가 '[보관]' 만 씀) 화면에서 먼저 막고 폴더 이름부터 줄이게 한다
export function archiveTooLong(place) {
  if (!place || place.kind !== "folder") return false;
  return charLength(`${ARCHIVE_MARK} ${normalizeFolder(place.name)}`) > SUBJECT_MAX;
}

// planMove 의 to: 보관함으로('[보관] <지금 폴더>', 새로 들어옴이면 '[보관]'). 이미 보관함이면 그대로
export function toArchive(place) {
  if (place.kind === "archive") return null;
  return buildSubject({ kind: "archive", origin: place.kind === "folder" ? place.name : "" });
}

// planMove 의 to: 꺼내기(원래 폴더로, 없으면 새로 들어옴). 보관함이 아니면 그대로
export function fromArchive(place) {
  if (place.kind !== "archive") return null;
  return buildSubject({ kind: "folder", name: place.origin });
}

// 이름 바꾸기가 건드리는 카드(원래 문제집 id): fromName 폴더의 카드 + 그 폴더에서 보관함으로 간 카드
export function renameCardIds(cards, fromName) {
  const from = normalizeFolder(fromName);
  if (!from) return [];
  return (Array.isArray(cards) ? cards : [])
    .filter((c) => {
      const p = folderOf(c);
      return (p.kind === "folder" && p.name === from) || (p.kind === "archive" && p.origin === from);
    })
    .map((c) => c.set.id);
}

// 이름 바꾸기·합치기: fromName 폴더의 카드를 toName 으로, 그 폴더에서 보관함으로 간 카드는 원래 폴더 이름도 함께
// ('[보관] <fromName>' → '[보관] <toName>' — 꺼낼 때 옛 이름 폴더가 다시 생기지 않게). toName 이 있는 폴더면 두 폴더가 합쳐진다
export function planRename(freshCards, fromName, toName) {
  const target = normalizeFolder(toName);
  const ids = renameCardIds(freshCards, fromName);
  if (!ids.length || !target) return [];
  return planMove(freshCards, ids, (p) => (
    p.kind === "archive" ? buildSubject({ kind: "archive", origin: target }) : buildSubject({ kind: "folder", name: target })
  ));
}

// 되돌리기: 한 일(planMove 등의 항목, 한 차례대로)을 옛 값으로. freshSets: 쓰기 직전 새로 받은 서버 목록(카드로 묶지 않은 것).
// 지금 값이 우리가 쓴 값(to)일 때만 — 그 뒤 다른 곳(다른 기기·도구)에서 바꾼 것은 그대로 둔다. 목록에 없는 것은 뺀다
export function planUndo(freshSets, done) {
  const byId = new Map((Array.isArray(freshSets) ? freshSets : []).map((s) => [String(s.id), s]));
  const items = [];
  const seen = new Set();
  for (const it of Array.isArray(done) ? done : []) {
    const k = String(it.id);
    if (seen.has(k)) continue;
    seen.add(k);
    const s = byId.get(k);
    if (!s || !sameSubject(s.subject, it.to) || sameSubject(s.subject, it.from)) continue;
    items.push({ id: s.id, title: s.title, from: s.subject ?? "", to: it.from ?? "", card: it.card });
  }
  return items;
}

// 계획 안의 카드 수(진행 'n/N'·'남은 N개')
export function planCardCount(items) {
  return new Set((items || []).map((it) => String(it.card))).size;
}

// ── 쓰기 차례(폴더 바꾸기 한 번 — 처음 쓰기와 '남은 N개 다시'가 같은 길) ──
// 처음 쓸 때 계획을 세워 job.items 로 고정하고, 다시 할 때는 그 항목 가운데 끝나지 않은 것만 쓴다(계획을 다시 세우면 함수 목적지 —
// 보관함으로·꺼내기·이름 바꾸기 — 가 보통만 옮겨진 카드를 통째로 빼 버려 그 하드가 옛 값에 남고, 그새 다른 기기가 옮긴 카드를 덮는다).
// 카드마다 쓰기 바로 앞에서 목록을 새로 받아(첫 카드는 계획 때 받은 것) 지금 값을 보고(itemStep), 받은 제목 그대로 쓴다
// (updateSet 은 제목도 통째로 바꾼다 — 쓰는 동안 도구가 바꾼 제목을 옛 제목으로 되돌리는 틈을 카드 하나 쓰는 동안으로 줄임)

// 계획을 카드별 묶음으로(계획 차례 그대로 — 카드마다 보통 → 하드)
export function cardBatches(items) {
  const out = [];
  const at = new Map();
  for (const it of Array.isArray(items) ? items : []) {
    const k = String(it.card);
    if (!at.has(k)) {
      at.set(k, out.length);
      out.push([]);
    }
    out[at.get(k)].push(it);
  }
  return out;
}

// 쓰기 직전 받은 서버 값(s: 그 문제집, 목록에 없으면 null)으로 본 항목의 할 일: 'gone' 그새 지워짐 ·
// 'done' 이미 to(앞서 쓴 것이 응답만 못 받은 때 등) · 'changed' from 도 to 도 아님(그새 다른 기기·도구가 바꿈 — 덮지 않음) · 'write'
export function itemStep(s, it) {
  if (!s) return "gone";
  if (sameSubject(s.subject, it.to)) return "done";
  if (!sameSubject(s.subject, it.from)) return "changed";
  return "write";
}

// 진행·남은 수(카드 — 보통 + 하드 = 1). 카드의 첫 항목(보통 — 카드의 폴더를 정함)이 끝나면 '옮김'으로 센다(화면에서 그 카드가 옮겨 보이는 때).
// { total 카드 수, moved 옮긴 카드 수, left 남은 카드 수, hidden 옮긴 카드의 남은 항목 수(하드 — 화면에는 안 보임) }
export function jobCounts(items, finished) {
  const list = Array.isArray(items) ? items : [];
  const fin = (it) => !!finished && finished.has(String(it.id));
  const first = new Map();
  for (const it of list) if (!first.has(String(it.card))) first.set(String(it.card), it);
  let moved = 0;
  for (const it of first.values()) if (fin(it)) moved++;
  const hidden = list.filter((it) => !fin(it) && fin(first.get(String(it.card)))).length;
  return { total: first.size, moved, left: first.size - moved, hidden };
}

const NONE_TEXT = "바꿀 것이 없습니다(이미 그 자리에 있습니다).";

// 폴더 바꾸기 종류별 안내 글: running 진행('옮기는 중…') · noun 멈춤 글의 '(4개 중 1개 옮김)' · past 닫을 때 '4개 중 1개만 …' ·
// doneText 끝 안내 · failText 멈춤 안내 · noneText 할 일이 없을 때 · undo 끝나면 '되돌리기'를 보일지.
// o: { name 옮길 폴더 · origin 하나 꺼낼 곳('' 이면 새로 들어옴) · from/to 이름 바꾸기·합치기 · exists 있는 폴더에 넣음 · one 카드 하나 }
export function folderJobTexts(kind, o = {}) {
  const into = (n) => `「${n}」${ro(n)}`;
  let t;
  if (kind === "move") {
    t = { running: "옮기는 중", noun: "옮김", past: `${into(o.name)} 옮겼습니다`, failText: "다 옮기지 못했습니다" };
  } else if (kind === "archive") {
    t = { running: "보관함으로 옮기는 중", noun: "옮김", past: "보관함으로 옮겼습니다", failText: o.one ? "보관함으로 옮기지 못했습니다" : "다 옮기지 못했습니다" };
  } else if (kind === "unarchive") {
    const where = typeof o.origin === "string" ? into(o.origin || INBOX_LABEL) : "원래 폴더로";
    t = { running: "꺼내는 중", noun: "꺼냄", past: `${where} 꺼냈습니다`, failText: o.one ? "꺼내지 못했습니다" : "다 꺼내지 못했습니다" };
  } else if (kind === "rename") {
    t = { running: "이름을 바꾸는 중", noun: "옮김", past: `${into(o.to)} 옮겼습니다`, doneText: `폴더 이름을 ${into(o.to)} 바꿨습니다.`, failText: "이름을 다 바꾸지 못했습니다" };
  } else if (kind === "merge") {
    t = { running: "합치는 중", noun: "옮김", past: `${into(o.to)} 옮겼습니다`, doneText: `「${o.from}」 폴더를 「${o.to}」에 합쳤습니다.`, failText: "다 합치지 못했습니다" };
  } else if (kind === "newFolder") {
    t = {
      running: o.exists ? "넣는 중" : "새 폴더에 넣는 중", noun: "넣음", past: `「${o.name}」에 넣었습니다`,
      doneText: o.exists ? `「${o.name}」에 넣었습니다.` : `「${o.name}」 폴더를 만들었습니다.`, failText: "다 넣지 못했습니다",
    };
  } else if (kind === "undo") {
    t = { running: "되돌리는 중", noun: "되돌림", past: "되돌렸습니다", failText: "다 되돌리지 못했습니다", noneText: "되돌릴 것이 없습니다.", undo: false };
  } else {
    t = { running: "바꾸는 중", noun: "바꿈", past: "바꿨습니다", failText: "다 바꾸지 못했습니다" };
  }
  return { doneText: `${t.past}.`, noneText: NONE_TEXT, undo: true, ...t };
}

// 폴더 바꾸기 한 번의 상태(쓰기·다시·되돌리기가 함께 씀). plan: 쓰기 직전 받은 목록 → 항목, count: 계획 전 진행 표시에 쓸 카드 수.
// items 고정한 계획 · finished 끝낸(쓴·건너뛴) 문제집 id · done 쓴 항목(쓴 차례 — 되돌리기) · skipped 그새 다른 곳에서 바뀌어 건너뛴 카드
export function folderJob(plan, count, texts, extra = {}) {
  return { plan, count: count || 0, items: null, finished: new Set(), done: [], skipped: new Set(), ...texts, ...extra };
}

// 쓰기 한 차례(처음이든 '다시'든). io: { getSets, updateSet, isGone(e) — 그새 지워진 문제집 오류인가, onProgress?(jobCounts 결과) }.
// 오류는 그대로 던진다 — 끝낸 항목은 job.finished 에 남으므로 같은 job 으로 다시 부르면 남은 것부터 이어 쓴다
export async function runPlan(job, io) {
  let fresh = null;
  if (!job.items) {
    fresh = await io.getSets();
    job.items = job.plan(fresh);
  }
  const report = () => io.onProgress?.(jobCounts(job.items, job.finished));
  report();
  for (const batch of cardBatches(job.items)) {
    const open = batch.filter((it) => !job.finished.has(String(it.id)));
    if (!open.length) continue;
    const list = fresh || (await io.getSets());
    fresh = null; // 다음 카드는 새로 받는다
    const byId = new Map((Array.isArray(list) ? list : []).map((s) => [String(s.id), s]));
    let leave = false; // 보통이 그새 다른 곳에서 바뀐 카드는 하드도 그대로(그쪽이 한 일과 짝을 맞춤)
    for (const it of open) {
      const s = byId.get(String(it.id)) || null;
      const step = leave ? "changed" : itemStep(s, it);
      if (step === "write") {
        try {
          await io.updateSet(it.id, s.title, it.to);
          job.done.push({ ...it, title: s.title });
        } catch (e) {
          if (!io.isGone(e)) throw e;
        }
      } else if (step === "done") {
        // 앞서 쓴 것이 응답만 못 받은 때 — 되돌리기에도 넣는다
        if (!job.done.some((d) => String(d.id) === String(it.id))) job.done.push({ ...it, title: s.title });
      } else if (step === "changed") {
        job.skipped.add(String(it.card));
        if (String(it.id) === String(it.card)) leave = true;
      }
      job.finished.add(String(it.id));
      report();
    }
  }
  return jobCounts(job.items, job.finished);
}

// 멈춤(일부 실패) 안내: '다 옮기지 못했습니다(4개 중 1개 옮김). <오류>'. 옮긴 카드가 없으면 괄호 없이, 하드만 남았으면 '(하드 문제집 1개 남음)'
export function jobFailText(job, counts, error = "") {
  const c = counts || { total: 0, moved: 0, left: 0, hidden: 0 };
  let head = job.failText;
  if (c.left > 0 && c.moved > 0) head += `(${c.total}개 중 ${c.moved}개 ${job.noun})`;
  else if (c.left === 0 && c.hidden > 0) head += `(하드 문제집 ${c.hidden}개 남음)`;
  return error ? `${head}. ${error}` : `${head}.`;
}

// 멈춘 채 닫을 때(쓴 것이 있을 때만): '4개 중 1개만 「X」로 옮겼습니다.' — 하드만 남았으면 끝 안내 + '하드 문제집 1개는 그대로입니다.'
export function jobCloseText(job, counts) {
  const c = counts || jobCounts(job.items, job.finished);
  if (c.left > 0) return `${c.total}개 중 ${c.moved}개만 ${job.past}.`;
  return c.hidden > 0 ? `${job.doneText} 하드 문제집 ${c.hidden}개는 그대로입니다.` : job.doneText;
}

// 다 끝났을 때: 쓴 것이 있으면 끝 안내(그새 다른 곳에서 바뀌어 건너뛴 카드가 있으면 그 수도), 없으면 할 일 없음 안내
export function jobEndText(job) {
  const skipped = job.skipped ? job.skipped.size : 0;
  if (!job.done.length) return skipped ? "그새 다른 곳에서 바뀌어 그대로 두었습니다." : job.noneText;
  return skipped ? `${job.doneText} 그새 다른 곳에서 바뀐 ${skipped}개는 그대로 두었습니다.` : job.doneText;
}
