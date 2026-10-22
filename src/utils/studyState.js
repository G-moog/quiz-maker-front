// 공부 기록 — 이 기기(localStorage)에만 둔다. 서버·다른 기기와는 나누지 않는다.
// 문제집마다 한 줄: 열쇠 "qm:study:<아이디>:<문제집 id>" (하드 문제집은 id 가 달라 기록도 따로).
// 값: { v: 1, at: 마지막으로 본 때(ISO), ...풀기 화면이 정하는 내용 } — 내용(보던 문항, 문항별 연 빈칸·읽던 자리 등)은
// SolveView 가 정하고, 다른 곳(대시보드)은 at 만 읽는다.
const PREFIX = "qm:study:";
const VERSION = 1;
const MAX_SETS = 300; // 이보다 많으면 오래 안 본 것부터 지운다

function prefixOf(username) {
  return `${PREFIX}${username || ""}:`;
}

function keyOf(username, setId) {
  return `${prefixOf(username)}${setId}`;
}

function readKey(k) {
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && v.v === VERSION ? v : null;
  } catch {
    return null;
  }
}

// 이 문제집의 기록(없거나 못 읽으면 null)
export function loadStudy(username, setId) {
  if (setId == null) return null;
  return readKey(keyOf(username, setId));
}

// 기록을 통째로 바꿔 쓴다. at 은 지금 시각으로 붙인다. 저장하지 못해도(사생활 보호 창·용량) 조용히 넘어간다
export function saveStudy(username, setId, data) {
  if (setId == null) return;
  const value = { ...(data || {}), v: VERSION, at: new Date().toISOString() };
  try {
    localStorage.setItem(keyOf(username, setId), JSON.stringify(value));
  } catch {
    pruneStudy(username, Math.floor(MAX_SETS / 2));
    try { localStorage.setItem(keyOf(username, setId), JSON.stringify(value)); } catch { /* 이어 보기만 안 됨 */ }
    return;
  }
  pruneStudy(username, MAX_SETS);
}

export function clearStudy(username, setId) {
  try { localStorage.removeItem(keyOf(username, setId)); } catch { /* 그대로 둠 */ }
}

// { [문제집 id(문자열)]: 마지막으로 본 때(ISO) } — 대시보드의 '최근 공부' 표시·정렬용
export function lastStudiedMap(username) {
  const out = {};
  const p = prefixOf(username);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(p)) continue;
      const v = readKey(k);
      if (v?.at) out[k.slice(p.length)] = v.at;
    }
  } catch { /* 못 읽으면 빈 표 */ }
  return out;
}

// 기록이 keep 개보다 많으면 오래 안 본 것부터 지운다
function pruneStudy(username, keep) {
  try {
    const map = lastStudiedMap(username);
    const ids = Object.keys(map);
    if (ids.length <= keep) return;
    ids.sort((a, b) => String(map[a]).localeCompare(String(map[b])));
    for (const id of ids.slice(0, ids.length - keep)) localStorage.removeItem(keyOf(username, id));
  } catch { /* 그대로 둠 */ }
}
