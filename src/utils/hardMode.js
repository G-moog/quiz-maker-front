// 하드모드: 빈칸이 더 많은 문제는 서버에 별도 문제집으로 둔다(제목 = "[하드] " + 원래 제목).
// 백엔드는 그대로 두고, 목록에서 짝을 찾아 원래 문제집 카드에 묶는다.
export const HARD_PREFIX = "[하드] ";

export function isHardTitle(title) {
  return typeof title === "string" && title.startsWith(HARD_PREFIX);
}

export function hardTitleOf(title) {
  return HARD_PREFIX + title;
}

// 서버 목록 → 카드 목록 [{ set, hard }]. hard 는 짝인 하드 문제집(없으면 null).
// 짝: "[하드] " 를 뗀 제목이 원래 문제집 제목과 정확히 같은 것. 원래가 여럿이면 id 가 가장 큰 것,
// 같은 원래에 하드가 여럿이면 id 가 가장 큰 하드 하나만 짝이다.
// 짝인 하드는 따로 그리지 않고, 짝이 없는 하드("[초안] [하드] …", 원래가 지워진 것 등)는
// 보통 카드로 그대로 남긴다(사라지지 않게). 순서는 서버 목록 그대로.
export function groupHardSets(sets) {
  const baseByTitle = new Map();
  for (const s of sets) {
    if (isHardTitle(s.title)) continue;
    const prev = baseByTitle.get(s.title);
    if (!prev || Number(s.id) > Number(prev.id)) baseByTitle.set(s.title, s);
  }

  const hardByBase = new Map();
  for (const s of sets) {
    if (!isHardTitle(s.title)) continue;
    const base = baseByTitle.get(s.title.slice(HARD_PREFIX.length));
    if (!base) continue;
    const prev = hardByBase.get(base);
    if (!prev || Number(s.id) > Number(prev.id)) hardByBase.set(base, s);
  }

  const paired = new Set(hardByBase.values());
  return sets
    .filter((s) => !paired.has(s))
    .map((s) => ({ set: s, hard: hardByBase.get(s) ?? null }));
}

// 하드모드를 켠 원래 문제집 id 목록은 기기에 기억한다(사용자별). 저장소를 못 쓰면 기억 없이 동작.
function storageKey(username) {
  return `qm:hard-mode:v1:${username}`;
}

export function loadHardModeIds(username) {
  try {
    const list = JSON.parse(localStorage.getItem(storageKey(username)) || "[]");
    return Array.isArray(list) ? list.map(String) : [];
  } catch {
    return [];
  }
}

export function saveHardModeIds(username, ids) {
  try {
    localStorage.setItem(storageKey(username), JSON.stringify([...ids]));
  } catch {
    // 저장하지 못해도 이번 화면에서는 켜짐/꺼짐이 그대로 동작한다
  }
}

// ── 풀기 화면의 '하드로 / 보통으로' ──
// 이 문제집의 짝(대시보드 카드와 같은 짝 규칙 — groupHardSets). sets: 서버 목록.
// 돌려주는 값: { set: 짝 문제집, toHard: 짝이 하드인가, baseId: 원래(보통) 문제집 id } 또는 null(짝이 없음)
export function pairOf(sets, setId) {
  if (!Array.isArray(sets)) return null;
  for (const c of groupHardSets(sets)) {
    if (!c.hard) continue;
    if (String(c.set.id) === String(setId)) return { set: c.hard, toHard: true, baseId: c.set.id };
    if (String(c.hard.id) === String(setId)) return { set: c.set, toHard: false, baseId: c.set.id };
  }
  return null;
}

// 목록에 이 문제집이 있나(없으면 목록이 오래된 것 — 새로 받아 짝을 찾는다)
export function hasSet(sets, setId) {
  return Array.isArray(sets) && sets.some((s) => s && String(s.id) === String(setId));
}

// 하드 문제집의 '원래 문제집 카드' 켬/끔 기억(대시보드 '하드모드')을 바꾼 쪽에 맞춘다 — 풀기 화면에서 바꾼 뒤 목록으로 가도 같은 쪽으로 열리게
export function rememberHardMode(username, baseId, on) {
  const ids = new Set(loadHardModeIds(username));
  if (on) ids.add(String(baseId)); else ids.delete(String(baseId));
  saveHardModeIds(username, ids);
}

// 보통 ↔ 하드를 바꿀 때 같은 절 찾기. 하드는 같은 페이지에서 낱말을 더 가린 것이라 빈칸 번호는 다르지만 제목 줄은 거의 같다
// (제목 줄 안 낱말이 빈칸이 되면 목차 글에서 '(  )' 로 빠짐). src: { kind, label, hid, total(그쪽 제목 수) },
// dst: 이쪽 textModel().headings. 찾는 순서:
//  1) 빈칸·띄어쓰기를 뺀 글이 같은 같은 종류 제목  2) 한쪽 글이 다른 쪽 글에서 낱말만 빠진 것(차례가 같은 글자들)
//  3) 제목 수가 같으면 같은 번호. 1)·2)에서 여럿이면 제목 번호가 (비율로 보아) 가까운 것. 못 찾으면 null
export function matchHeading(src, dst) {
  if (!src || !Array.isArray(dst) || !dst.length || !Number.isInteger(src.hid)) return null;
  const want = normLabel(src.label);
  const total = Number.isInteger(src.total) && src.total > 0 ? src.total : dst.length;
  const expect = total > 1 ? (src.hid * (dst.length - 1)) / (total - 1) : 0;
  const nearest = (list) => list.reduce((best, h) => (
    !best || Math.abs(h.hid - expect) < Math.abs(best.hid - expect) ? h : best
  ), null).hid;
  const kin = dst.filter((h) => h.kind === src.kind);
  const same = kin.filter((h) => normLabel(h.label) === want);
  if (same.length) return nearest(same);
  const near = kin.filter((h) => {
    const got = normLabel(h.label);
    const [a, b] = got.length <= want.length ? [got, want] : [want, got];
    return a.length >= Math.max(2, Math.ceil(b.length * 0.4)) && isSubsequence(a, b);
  });
  if (near.length) return nearest(near);
  if (dst.length === total && dst[src.hid]) return dst[src.hid].hid;
  return null;
}

function normLabel(s) {
  return String(s || "").replace(/\(\s*\)/g, "").replace(/\s+/g, "");
}

// a 의 글자가 b 안에 같은 차례로 다 있나
function isSubsequence(a, b) {
  let j = 0;
  for (let i = 0; i < b.length && j < a.length; i++) if (b[i] === a[j]) j += 1;
  return j === a.length;
}
