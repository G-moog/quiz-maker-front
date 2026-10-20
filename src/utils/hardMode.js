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
