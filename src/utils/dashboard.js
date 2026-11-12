// 대시보드 도우미(화면 없이 값만): 찾기·정렬·마지막 공부 표시·공부 요약·문제집별 메모 수, 그리고 목록 기억.
// Node 시험(test/app)도 그대로 불러오도록 다른 파일을 부르지 않는다.

// 마지막으로 본 때 → '오늘'·'어제'·'3일 전'·'2주 전'·'3개월 전'·'1년 전'. 이 기기 달력 날짜로 센다(24시간 단위 아님)
export function relativeDay(iso, now = new Date()) {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const dayNo = (d) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  const diff = dayNo(now) - dayNo(t);
  if (diff <= 0) return "오늘"; // 시계가 어긋나 앞날이면 '오늘'
  if (diff === 1) return "어제";
  if (diff < 14) return `${diff}일 전`;
  if (diff < 60) return `${Math.floor(diff / 7)}주 전`;
  if (diff < 365) return `${Math.floor(diff / 30)}개월 전`;
  return `${Math.floor(diff / 365)}년 전`;
}

function timeOf(iso) {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? null : t;
}

// 카드(원래 문제집 + 짝인 하드)의 마지막 공부 때(ISO). 하드 짝은 둘 중 늦은 것. 없으면 null
// map: studyState.lastStudiedMap 결과 { 문제집 id(문자열): ISO }
export function lastStudiedOf(card, map) {
  const a = map?.[String(card.set.id)] || null;
  const b = card.hard ? map?.[String(card.hard.id)] || null : null;
  const ta = timeOf(a);
  const tb = timeOf(b);
  if (ta === null) return tb === null ? null : b;
  if (tb === null) return a;
  return tb > ta ? b : a;
}

// 찾기: 제목·과목·짝인 하드 문제집 제목에서, 띄어 쓴 낱말이 모두 들어 있는 카드만(대소문자 무시).
// labelOf(카드): 화면에 보이는 카드 표 글도 함께 찾는다(대시보드가 폴더 표 — 보관 카드의 '보관함' 등 — 를 넘김. 이 파일은 다른 파일을 부르지 않으므로)
export function filterCards(cards, query, labelOf = null) {
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return cards;
  return cards.filter((c) => {
    const hay = [c.set.title, c.set.subject, c.hard?.title, labelOf ? labelOf(c) : null]
      .filter((v) => typeof v === "string")
      .join("\n")
      .toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export const SORT_DEFAULT = "default"; // 서버 순서(만든 때 늦은 것부터)
export const SORT_RECENT = "recent"; // 최근 공부 순(공부한 적 없는 것은 뒤에, 기본 순서대로)
export const SORT_REVIEW = "review"; // 복습 차례: 공부한 지 오래된 것부터, 공부한 적 없는 것은 그 뒤에(기본 순서대로)
const SORT_MODES = new Set([SORT_DEFAULT, SORT_RECENT, SORT_REVIEW]);

export function sortCards(cards, mode, map) {
  if (mode !== SORT_RECENT && mode !== SORT_REVIEW) return cards;
  const dir = mode === SORT_RECENT ? -1 : 1; // 최근 공부: 늦은 것부터, 복습 차례: 이른 것부터
  return cards
    .map((c, i) => ({ c, i, t: timeOf(lastStudiedOf(c, map)) }))
    .sort((x, y) => {
      if (x.t === null && y.t === null) return x.i - y.i;
      if (x.t === null) return 1;
      if (y.t === null) return -1;
      return dir * (x.t - y.t) || x.i - y.i;
    })
    .map((x) => x.c);
}

// 정렬 고름은 기기에 사용자별로 기억한다(저장소를 못 쓰면 기본)
const sortKey = (username) => `qm:dash-sort:v1:${username || ""}`;

export function loadSortMode(username) {
  try {
    const v = localStorage.getItem(sortKey(username));
    return SORT_MODES.has(v) ? v : SORT_DEFAULT;
  } catch {
    return SORT_DEFAULT;
  }
}

export function saveSortMode(username, mode) {
  try {
    localStorage.setItem(sortKey(username), SORT_MODES.has(mode) ? mode : SORT_DEFAULT);
  } catch {
    // 이번 화면에서만 유지
  }
}

// ── 공부 요약('오늘 2개 · 이번 주 7개 · 연속 3일') ──
// days: studyState.studyDaysMap 결과 { 문제집 id(문자열): [서울 날짜 YYYY-MM-DD] }, today: 서울 날짜(studyDay)
// 카드(원래 + 짝인 하드)를 하나로 센다. 목록에 없는 문제집(지운 것)의 기록은 세지 않는다.
//  today  오늘 공부한 카드 수
//  week   이번 주(월요일 ~ 오늘)에 한 번이라도 공부한 카드 수
//  streak 하루도 빠짐없이 공부한 날 수 — 오늘 아직 안 했으면 어제까지로 센다(저녁에 하기 전에 0 으로 떨어지지 않게)
// 공부 기록이 하나도 없으면 null(요약 줄을 그리지 않음)
const DAY_MS = 86400000;
const dayNo = (d) => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / DAY_MS);

export function studySummary(cards, days, today) {
  if (!days || !/^\d{4}-\d{2}-\d{2}$/.test(String(today || ""))) return null;
  const t = dayNo(today);
  const monday = t - ((new Date(t * DAY_MS).getUTCDay() + 6) % 7);
  const studiedDays = new Set();
  let any = false;
  let todayN = 0;
  let weekN = 0;
  for (const c of cards) {
    const list = [...(days[String(c.set.id)] || []), ...(c.hard ? days[String(c.hard.id)] || [] : [])];
    if (!list.length) continue;
    any = true;
    let inWeek = false;
    let isToday = false;
    for (const d of list) {
      const n = dayNo(d);
      if (Number.isNaN(n)) continue;
      studiedDays.add(n);
      if (n === t) isToday = true;
      if (n >= monday && n <= t) inWeek = true;
    }
    if (isToday) todayN++;
    if (inWeek) weekN++;
  }
  if (!any) return null;
  let streak = 0;
  for (let n = studiedDays.has(t) ? t : t - 1; studiedDays.has(n); n--) streak++;
  return { today: todayN, week: weekN, streak };
}

// short: 휴대폰 머리 줄(제목 아래 172px 안팎)에 맞춘 짧은 꼴 — '개'를 뺀다('오늘 2 · 이번 주 7 · 연속 3일')
export function summaryText(s, { short = false } = {}) {
  if (!s) return "";
  const n = short ? "" : "개";
  return [`오늘 ${s.today}${n}`, `이번 주 ${s.week}${n}`, s.streak > 0 ? `연속 ${s.streak}일` : null].filter(Boolean).join(" · ");
}

// 미해결 메모 목록 → { 문제집 id(문자열): 수 }
export function countNotesBySet(notes) {
  const out = {};
  for (const n of Array.isArray(notes) ? notes : []) {
    if (n?.setId == null) continue;
    const k = String(n.setId);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

// 카드의 미해결 메모 수(하드 짝 메모도 더함)
export function cardNoteCount(card, counts) {
  if (!counts) return 0;
  return (counts[String(card.set.id)] || 0) + (card.hard ? counts[String(card.hard.id)] || 0 : 0);
}

// ── 목록 기억(이 탭의 메모리에만) ──
// 풀기·편집·메모 화면에서 대시보드로 돌아올 때 '불러오는 중' 없이 바로 그리고 보던 자리(폴더)·스크롤을 되살린 뒤 뒤에서 새로 받는다.
// sets 는 서버 목록 전체 그대로(풀기 화면이 여기서 하드 짝을 찾는다 — 보관함·다른 폴더 것도 빼지 않음).
// place: 보던 자리(utils/folders.js — 폴더 목록·폴더·복습 차례·보관함), query: 찾기 글,
// scrollByPlace: 자리별 스크롤 { 자리 열쇠(folders.placeKey): y } — 폴더에서 목록으로 나와도 목록의 그 자리로.
// 사용자 이름별로 하나. 로그아웃·로그인 끊김 때 App 이 지운다
let dashCache = null; // { username, sets, openNotes, place, query, scrollByPlace }

export function readDashCache(username) {
  return dashCache && dashCache.username === username ? dashCache : null;
}

export function writeDashCache(username, patch) {
  if (!dashCache || dashCache.username !== username) {
    dashCache = { username, sets: null, openNotes: null, place: null, query: "", scrollByPlace: {} };
  }
  Object.assign(dashCache, patch);
}

// 자리별 스크롤 기억·읽기(없으면 0 — 맨 위)
export function writeDashScroll(username, key, y) {
  writeDashCache(username, {});
  dashCache.scrollByPlace = { ...dashCache.scrollByPlace, [key]: y };
}

export function dashScrollOf(cache, key) {
  const y = cache && cache.scrollByPlace ? cache.scrollByPlace[key] : 0;
  return typeof y === "number" && y > 0 ? y : 0;
}

export function clearDashCache() {
  dashCache = null;
}
