// 대시보드 도우미(화면 없이 값만): 찾기·정렬·마지막 공부 표시·문제집별 메모 수, 그리고 목록 기억.
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

// 찾기: 제목·과목·짝인 하드 문제집 제목에서, 띄어 쓴 낱말이 모두 들어 있는 카드만(대소문자 무시)
export function filterCards(cards, query) {
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return cards;
  return cards.filter((c) => {
    const hay = [c.set.title, c.set.subject, c.hard?.title]
      .filter((v) => typeof v === "string")
      .join("\n")
      .toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export const SORT_DEFAULT = "default"; // 서버 순서(만든 때 늦은 것부터)
export const SORT_RECENT = "recent"; // 최근 공부 순(공부한 적 없는 것은 뒤에, 기본 순서대로)

export function sortCards(cards, mode, map) {
  if (mode !== SORT_RECENT) return cards;
  return cards
    .map((c, i) => ({ c, i, t: timeOf(lastStudiedOf(c, map)) }))
    .sort((x, y) => {
      if (x.t === null && y.t === null) return x.i - y.i;
      if (x.t === null) return 1;
      if (y.t === null) return -1;
      return y.t - x.t || x.i - y.i;
    })
    .map((x) => x.c);
}

// 정렬 고름은 기기에 사용자별로 기억한다(저장소를 못 쓰면 기본)
const sortKey = (username) => `qm:dash-sort:v1:${username || ""}`;

export function loadSortMode(username) {
  try {
    return localStorage.getItem(sortKey(username)) === SORT_RECENT ? SORT_RECENT : SORT_DEFAULT;
  } catch {
    return SORT_DEFAULT;
  }
}

export function saveSortMode(username, mode) {
  try {
    localStorage.setItem(sortKey(username), mode === SORT_RECENT ? SORT_RECENT : SORT_DEFAULT);
  } catch {
    // 이번 화면에서만 유지
  }
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
// 풀기·편집·메모 화면에서 대시보드로 돌아올 때 '불러오는 중' 없이 바로 그리고 스크롤 자리를 되살린 뒤 뒤에서 새로 받는다.
// 사용자 이름별로 하나. 로그아웃·로그인 끊김 때 App 이 지운다
let dashCache = null; // { username, sets, openNotes, scrollY }

export function readDashCache(username) {
  return dashCache && dashCache.username === username ? dashCache : null;
}

export function writeDashCache(username, patch) {
  if (!dashCache || dashCache.username !== username) {
    dashCache = { username, sets: null, openNotes: null, scrollY: 0 };
  }
  Object.assign(dashCache, patch);
}

export function clearDashCache() {
  dashCache = null;
}
