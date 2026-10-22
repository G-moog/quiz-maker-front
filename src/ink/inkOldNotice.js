// 보관한 예전 필기 안내를 닫은 문항 기억(이 기기의 localStorage).
// '본문이 바뀌기 전에 쓴 예전 필기가 보관되어 있습니다' 안내는 필기 모드에서 그 문항을 열 때 저절로 뜬다(보관한 뒤 OLD_NOTICE_MS 동안).
// 닫은 기억이 화면 안에만 있으면 문항을 열 때마다 다시 떠 글 위쪽을 가리므로, 닫은 때를 문항마다 기억해 같은 보관에는 다시 띄우지 않는다.
// 닫은 뒤에 새로 보관한 예전 필기(본문이 또 바뀜)는 보관한 때가 닫은 때보다 늦으므로 다시 뜬다.
// 모양: { v: 1, k: { "<열쇠>": 닫은 때(ms) } } — 최근에 닫은 것이 뒤(넘치면 앞에서 지움)
const STORAGE_KEY = "qm:ink-old-closed:v1";
export const OLD_CLOSED_MAX = 400;

const isTime = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;

// 저장된 글 → Map(열쇠 → 닫은 때). 틀린 글·모르는 판은 빈 기억
export function parseOldClosed(raw) {
  const out = new Map();
  let v;
  try {
    v = typeof raw === "string" ? JSON.parse(raw) : null;
  } catch {
    v = null;
  }
  if (!v || typeof v !== "object" || v.v !== 1 || !v.k || typeof v.k !== "object") return out;
  for (const [key, at] of Object.entries(v.k)) if (key && isTime(at)) out.set(key, at);
  return out;
}

export function serializeOldClosed(map) {
  return JSON.stringify({ v: 1, k: Object.fromEntries(map) });
}

// 이 문항(key)의 안내를 at 에 닫았다. 고친 문항은 뒤로 옮기고, OLD_CLOSED_MAX 를 넘으면 오래된 것부터 지운다. 바뀌었으면 true
export function noteOldClosed(map, key, at) {
  if (!key || !isTime(at) || map.get(key) >= at) return false;
  map.delete(key);
  map.set(key, at);
  while (map.size > OLD_CLOSED_MAX) map.delete(map.keys().next().value);
  return true;
}

// 처음 쓸 때 한 번 읽고, 바뀔 때만 쓴다. 막힌 브라우저에서도 화면은 동작하게 실패는 무시(이 화면 동안만 기억)
let mem = null;
function current() {
  if (!mem) {
    let raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      raw = null;
    }
    mem = parseOldClosed(raw);
  }
  return mem;
}

export const oldNoticeMemory = {
  closedAt: (key) => current().get(key) || 0,
  close: (key, at = Date.now()) => {
    if (!noteOldClosed(current(), key, at)) return;
    try {
      localStorage.setItem(STORAGE_KEY, serializeOldClosed(mem));
    } catch {
      // 기억하지 못하면 다음에 열 때 안내가 한 번 더 뜰 뿐
    }
  },
};
