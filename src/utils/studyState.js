// 공부 기록 — 문제집마다 한 줄을 이 기기(localStorage)에 두고, 서버(study_states, 마이그레이션 ⑥)와 나눠
// 휴대폰과 태블릿이 같은 '이어 보기'·'마지막 공부'·공부한 날을 본다.
// 열쇠 "qm:study:<아이디>:<문제집 id>" (하드 문제집은 id 가 달라 기록도 따로).
// 값: { v: 1, at, ct, days, ...내용 }
//   내용(보던 문항, 문항별 연 빈칸·읽던 자리 등)은 SolveView(utils/solveStudy.js)가 정한다. 여기서는 통째로 견주고,
//   진도가 있는지·사용자가 진도를 바꿨는지·두 기록을 어떻게 합칠지는 solveStudy.js 에 묻는다
//   (hasStudyProgress·progressOf·progressPart·rebaseStudy).
//   at   마지막으로 본 때(ISO) — 저장할 때마다 지금. 대시보드 '마지막 공부'·'최근 공부 순'
//   ct   진도가 바뀐 때(ISO) — 기기 사이 '나중에 고친 쪽이 이김'의 기준(서버 client_at). 새 ct 는 사용자가 풀기 화면에서 진도
//        (지나온 문항·채점·연 빈칸·★)를 바꾼 저장에만 준다. 읽던 자리만 바뀐 저장·열 때 저장·진도 없는 기록은 ct 를 그대로
//        (처음이면 WEAK_CT): 다른 기기 기록을 아직 받지 못한 채 문제집을 열기만 한(조금 내려 본) 기기가 그 기기의 진도를 덮지 않게
//   days 공부한 날(서울 날짜 YYYY-MM-DD, 최근 120일) — 저장할 때 오늘을 더하고, 기기 사이에서는 합친다(지우지 않음)
//   이 기기에만: dirty(서버에 올릴 것이 있음), bh(이 기기 풀기 화면이 마지막으로 저장한(보여 준) 내용의 지문),
//                bb(그 화면이 굳힌 바탕 — 사용자가 진도를 바꿨는지 견주는 기준. 내용과 같으면 두지 않는다),
//                hd(받는 동안 ct 를 두고 저장한 진도가 있음 — 받기가 끝나면 새 ct 로 굳힌다).
//                저장된 내용이 bh 와 다르면 화면이 보여 주지 못한 다른 기기 기록을 받은 것 — 그 화면의 다음 저장은 통째로 덮지 않고
//                그 위에 화면에서 한 일만 얹는다(rebaseStudy)
// 바깥 API(loadStudy·saveStudy·clearStudy·lastStudiedMap)는 동기 그대로 — 서버와 주고받기는 뒤에서(아래 '나누기').
import { textHash } from "../ink/geometry.js";
import { hasStudyProgress, progressOf, progressPart, rebaseStudy } from "./solveStudy.js";

const PREFIX = "qm:study:";
const VERSION = 1;
const MAX_SETS = 300; // 이보다 많으면 오래 안 본 것부터 지운다
const MAX_DAYS = 120;
const MAX_BYTES = 60000; // 서버 qm_put_study 한도와 같게 — 넘는 기록은 이 기기에만 둔다
const META = new Set(["v", "at", "ct", "days", "dirty", "bh", "bb", "hd"]);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
// 진도 없이 처음 생긴 기록의 ct — 어느 기기의 진도(늦은 ct)에도 진다(서버 qm_put_study 도 그대로 받는다)
export const WEAK_CT = "1970-01-01T00:00:00.000Z";

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

// 저장. 용량이 차면 오래 안 본 기록을 반쯤 지우고 한 번 더. 그래도 안 되면 false(이어 보기만 안 됨).
// prune: 저장 뒤 개수 한도를 볼지(받기처럼 여러 줄을 한꺼번에 쓸 때는 끝에 한 번만)
function writeKey(username, k, value, prune = true) {
  try {
    localStorage.setItem(k, JSON.stringify(value));
  } catch {
    pruneStudy(username, Math.floor(MAX_SETS / 2));
    try { localStorage.setItem(k, JSON.stringify(value)); } catch { return false; }
    return true;
  }
  if (prune) pruneStudy(username, MAX_SETS);
  return true;
}

// ── 값 다루기(순수 함수) ──────────────────────────────────────

// 서울 날짜(YYYY-MM-DD). 한국은 서머타임이 없어 UTC+9 로 바로 센다(기기 시간대와 무관하게 같은 날)
export function studyDay(t = Date.now()) {
  const ms = t instanceof Date ? t.getTime() : Number(t);
  return new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
}

function timeOf(iso) {
  const t = typeof iso === "string" ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? null : t;
}

// 날짜 목록 정리: 꼴이 맞는 것만, 겹침 없이, 오름차순, 최근 MAX_DAYS 개
export function normDays(list) {
  const set = new Set();
  for (const d of Array.isArray(list) ? list : []) if (typeof d === "string" && DAY_RE.test(d)) set.add(d);
  return [...set].sort().slice(-MAX_DAYS);
}

function daysOf(rec) {
  if (!rec) return [];
  if (Array.isArray(rec.days)) return normDays(rec.days);
  const t = timeOf(rec.at);
  return t === null ? [] : [studyDay(t)]; // 날짜 칸이 생기기 전 기록: 마지막으로 본 날 하나
}

// 기록의 ct. 나누기 전(1차) 기록은 ct 가 없다: 진도가 있으면 마지막으로 본 때, 없으면(열기만 함) WEAK_CT —
// 이 판으로 처음 올릴 때 다른 기기에서 그 전에 공부한 기록을 '더 늦게 열어 본' 것만으로 덮지 않게
function ctOf(rec) {
  if (!rec) return null;
  if (rec.ct != null) return rec.ct;
  return hasStudyProgress(blobOf(rec)) ? rec.at ?? null : WEAK_CT;
}

function laterIso(a, b) {
  const ta = ISO_RE.test(a || "") ? timeOf(a) : null;
  const tb = ISO_RE.test(b || "") ? timeOf(b) : null;
  if (ta === null) return tb === null ? null : b;
  if (tb === null) return a;
  return tb > ta ? b : a;
}

// 내용만(풀기 화면이 정하는 칸). loadStudy 값을 그대로 다시 저장해도 내용만 남는다
function blobOf(data) {
  const out = {};
  if (data && typeof data === "object") {
    for (const [k, v] of Object.entries(data)) if (!META.has(k) && v !== undefined) out[k] = v;
  }
  return out;
}

// 칸 순서와 상관없는 JSON(서버 jsonb 는 칸 순서를 바꿔 돌려준다)
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort()
      .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

const hashOf = (blob) => textHash(stable(blob));

const isDirty = (rec) => !!rec && (rec.dirty === 1 || rec.ct === undefined); // ct 가 없으면 나누기 전 기록 — 한 번 올린다

// 서버에 올리는 꼴: 내용 + v·at·days (ct 는 client_at 으로 따로, dirty·bh 는 이 기기에만)
function serverData(rec) {
  return { ...blobOf(rec), v: VERSION, at: rec.at ?? null, days: daysOf(rec) };
}

// 서버 줄 { setId, data, clientAt } → 기록 꼴(못 읽으면 null)
export function remoteRecord(row) {
  if (!row || typeof row !== "object" || !row.data || typeof row.data !== "object" || Array.isArray(row.data)) return null;
  return {
    ...blobOf(row.data), v: VERSION, at: ISO_RE.test(row.data.at || "") ? row.data.at : null,
    ct: row.clientAt ?? null, days: normDays(row.data.days),
  };
}

// 이 기기 기록(local, 없으면 null)과 서버 기록(remote) 합치기. 서버 qm_put_study 와 같은 규칙:
//  - 내용: ct 가 늦은 쪽. 같으면 서버 — 단 이 기기에 아직 올리지 않은 것(dirty)이면 이 기기(서버도 같은 시각이면 올리는 쪽을
//    받으므로 같은 결과. 진도 없는 기록은 ct 가 그대로라 같은 시각끼리 견주게 되는데, 받기가 올리기보다 먼저 돌아도
//    이 기기에서 방금 옮긴 읽던 자리를 서버의 옛 자리로 되돌리지 않게). 내용이 같으면 서버 ct 를 따른다(서버가 줄인 시각을 받아들여 되올리기가 돌지 않게)
//  - days 합집합, at 늦은 쪽
//  - dirty: 서버에 없는 것이 남았으면(이 기기 내용이 새것, 서버에 없는 날, 더 늦은 at) 다시 올린다
//  - bh(이 기기 풀기 화면이 아는 내용)는 그대로, bb(그 화면의 바탕)도 그대로 — 서버 내용으로 바뀌면 바뀌기 전 내용이 바탕
export function mergeRecords(local, remote) {
  if (!remote) return local ?? null;
  const rBlob = blobOf(remote);
  const rDays = normDays(remote.days);
  const rAt = ISO_RE.test(remote.at || "") ? remote.at : null;
  if (!local) return { ...rBlob, v: VERSION, at: rAt, ct: remote.ct ?? null, days: rDays, dirty: 0 };
  const lBlob = blobOf(local);
  const same = hashOf(lBlob) === hashOf(rBlob);
  const lct = timeOf(ctOf(local));
  const rct = timeOf(remote.ct);
  const localWins = !same && lct !== null && (rct === null || lct > rct || (lct === rct && isDirty(local)));
  const days = normDays([...daysOf(local), ...rDays]);
  const at = laterIso(local.at, rAt);
  const dirty = localWins || days.join() !== rDays.join() || at !== rAt;
  const content = localWins ? lBlob : rBlob;
  const out = {
    ...content, v: VERSION, at,
    ct: localWins ? ctOf(local) : remote.ct ?? ctOf(local), days, dirty: dirty ? 1 : 0,
  };
  if (local.bh) {
    out.bh = local.bh;
    const base = baseOf(local, lBlob);
    if (hashOf(base) !== hashOf(content)) out.bb = base;
  }
  // 받는 동안 저장한 진도(hd)는 이 기기 내용이 남을 때만 — 서버 내용으로 바뀌면 그 화면의 다음 저장이 다시 얹는다
  if (local.hd && (localWins || same)) out.hd = 1;
  return out;
}

// 풀기 화면이 굳힌 바탕(bb, 없으면 내용 그대로)
function baseOf(rec, blob) {
  return rec.bb && typeof rec.bb === "object" && !Array.isArray(rec.bb) ? rec.bb : blob;
}

// 기록 값: 내용 + 이 기기 칸. 바탕(bb)은 내용과 다를 때만, hd 는 받는 동안 ct 를 두고 저장한 진도가 있을 때만 둔다
function makeRecord(content, { at, ct, days, bh, bb, hd = false }) {
  const out = { ...content, v: VERSION, at, ct, days, dirty: 1, bh };
  if (bb && hashOf(bb) !== hashOf(content)) out.bb = bb;
  if (hd) out.hd = 1;
  return out;
}

// ── 바깥 API(동기) ───────────────────────────────────────────

// 이 문제집의 기록(없거나 못 읽으면 null)
export function loadStudy(username, setId) {
  if (setId == null) return null;
  return readKey(keyOf(username, setId));
}

// 풀기 화면의 지금 상태(data)를 저장한다. at 은 지금, 오늘을 days 에 더하고, 서버에 올릴 것으로 표시한다.
// 기기 사이에서 '나중에 고친 쪽이 이김'이므로, 새 ct 는 사용자가 이 화면에서 진도를 바꿨을 때만 준다 — 바꿨는지는 이 화면이
// 굳힌 바탕(bb)과 견준다(progressOf: ★ 와 지나온 문항·채점·연 빈칸. 읽던 자리·진도 없는 꼴의 차이는 보지 않음).
//  - open(풀기 화면을 열 때·받은 기록을 화면에 얹은 뒤): 화면이 이 상태(data)에서 시작한다 — 바탕을 data 로. 새 ct 는 주지 않는다.
//    내용은 화면이 지금 기록(seen: 그때 읽은 loadStudy 값)을 보고 data 를 정했으면 data(메모·보통 ↔ 하드로 연 자리도 남게),
//    아니면 그대로
//  - 진도를 바꾸지 않은 저장(스크롤·자동으로 '순번대로'가 됨·떠날 때 같은 상태): 내용만 바꾸고 ct 는 그대로. 단 이 화면이
//    보여 주지 못한 기록(다른 기기 것을 그사이 받음)이 있으면 그 기록을 그대로 둔다
//  - 진도를 바꾼 저장: 새 ct. 이 화면이 보여 주지 못한 기록이 있으면 그 위에 이 화면에서 한 일만 얹는다(solveStudy.js rebaseStudy) —
//    화면을 켜 둔 채 다른 기기에서 공부하고 돌아와 빈칸 하나만 눌러도 그사이 연 빈칸·★ 이 지워지지 않게
//  - 받는 중(pullStudy — 열 때·화면이 다시 보일 때·한동안 손대지 않다가 다시 손댈 때)에는 진도를 바꿔도 ct 를 그대로 두고
//    바탕도 굳히지 않는다(hd 표시): 아직 받지 못한 다른 기기의 새 기록을 이기지 않게. 받기가 끝나면 새 ct 로 굳힌다
//    (commitHeld·화면의 다음 저장). 그사이 다른 기기 기록이 오면 그 위에 다시 얹는다
// 진도가 바뀐 저장(빈칸 열기·채점·문항 이동)은 다른 기기로 곧바로(PUSH_FAST_MS), 읽던 자리만 바뀐 저장은 모아서 올린다.
// 저장하지 못해도(사생활 보호 창·용량) 조용히 넘어간다
export function saveStudy(username, setId, data, { open = false, seen } = {}) {
  if (setId == null) return;
  const k = keyOf(username, setId);
  const prev = readKey(k);
  const blob = blobOf(data);
  const nowMs = env.now();
  const meta = { at: new Date(nowMs).toISOString(), days: normDays([...daysOf(prev), studyDay(nowMs)]), bh: hashOf(blob) };
  const hold = !!st.pull && !open;
  let value;
  let fast = false;
  if (!prev) {
    // 처음: 이 화면에서 만든 진도면 지금(받는 중이면 굳히지 않고 WEAK_CT), 열 때·진도 없음이면 WEAK_CT(어느 기기의 진도에도 짐)
    const progress = !open && hasStudyProgress(blob);
    const held = progress && hold;
    value = makeRecord(blob, {
      ...meta, ct: progress && !hold ? nextCt(null, nowMs) : WEAK_CT, bb: held ? {} : blob, hd: held,
    });
  } else {
    const prevBlob = blobOf(prev);
    const prevHash = hashOf(prevBlob);
    const prevCt = ctOf(prev) ?? WEAK_CT;
    const base = baseOf(prev, prevBlob);
    const stale = prev.bh !== undefined && prev.bh !== prevHash; // 이 화면이 보여 주지 못한 기록을 그사이 받음
    // 진도를 바꾼 저장의 ct·바탕: 받는 중이면 ct 를 두고 굳히지 않음(hd), 아니면 새 ct 로 굳힘
    const changedTo = (content, needCommit) => (hold
      ? makeRecord(content, { ...meta, ct: prevCt, bb: needCommit ? base : blob, hd: needCommit })
      : makeRecord(content, { ...meta, ct: needCommit ? nextCt(prev, nowMs) : prevCt, bb: blob }));
    if (open) {
      const fromHere = !!seen && hashOf(blobOf(seen)) === prevHash;
      value = makeRecord(fromHere ? blob : prevBlob, { ...meta, ct: prevCt, bb: blob, hd: !!prev.hd });
    } else if (stable(progressOf(blob)) === stable(progressOf(base))) {
      value = makeRecord(stale ? prevBlob : blob, { ...meta, ct: prevCt, bb: stale ? base : blob, hd: !!prev.hd });
    } else if (stale) {
      const merged = rebaseStudy(base, blob, prevBlob);
      const same = hashOf(merged) === prevHash;
      value = changedTo(merged, !same || !!prev.hd);
      fast = !same;
    } else {
      value = changedTo(blob, true);
      fast = stable(progressPart(blob)) !== stable(progressPart(prevBlob));
    }
  }
  if (writeKey(username, k, value)) schedulePush(username, setId, fast);
}

// 풀기 화면이 이 기록을 마지막으로 저장한 뒤 다른 기기 기록을 받아 화면이 보여 주는 것과 달라졌나
// (SolveView 가 받기 뒤 그 기록을 화면에 얹을지 볼 때)
export function studyStale(username, setId) {
  const rec = loadStudy(username, setId);
  return !!rec && rec.bh !== undefined && rec.bh !== hashOf(blobOf(rec));
}

// 받는 동안 ct 를 두고 저장한 진도(hd)를 새 ct 로 굳힌다 — 받기가 끝나면(실패해도). hd 가 남은 내용은 받은 기록 위에 얹은
// 것이거나(그사이 받은 것이 없음) 받은 기록과 합친 것이다(서버 내용으로 바뀌면 hd 는 mergeRecords 가 지움)
function commitHeld(username) {
  const nowMs = env.now();
  eachRecord(username, (id, rec) => {
    if (!rec.hd) return;
    const value = { ...rec, ct: nextCt(rec, nowMs), dirty: 1 };
    delete value.hd;
    if (rec.bh === hashOf(blobOf(rec))) delete value.bb; // 화면이 보여 주는 내용 그대로면 그것이 바탕
    if (writeKey(username, keyOf(username, id), value, false)) schedulePush(username, id, true);
  });
}

// 새 내용의 ct: 지금, 단 이 기록의 앞 ct 보다는 늘 늦게(같은 밀리초에 두 번 고쳐도 — 올리는 중이던 옛 내용의 메아리가
// '같은 시각이면 서버' 규칙으로 새 내용을 이기지 않게)
function nextCt(prev, nowMs) {
  const p = timeOf(ctOf(prev));
  return new Date(p !== null && p >= nowMs ? p + 1 : nowMs).toISOString();
}

// '처음부터': 내용을 비운다(다른 기기도 처음부터). keep: 그래도 남길 내용 — 풀기 화면의 ★(solveStudy.js studySnapshot 의
// 고르기 화면 꼴 { ids, q: { h, s } }). 진도가 남아도 늘 새 ct(사용자가 비운 것). 마지막으로 본 때·공부한 날은 남긴다. 바로 올린다
export function clearStudy(username, setId, keep = null) {
  const k = keyOf(username, setId);
  const prev = readKey(k);
  if (!prev) return;
  const nowMs = env.now();
  const blob = blobOf(keep);
  // 바탕(bb)은 두지 않는다 — 비운 내용이 그대로 이 화면의 바탕
  const value = { ...blob, v: VERSION, at: prev.at ?? new Date(nowMs).toISOString(), ct: nextCt(prev, nowMs), days: daysOf(prev), dirty: 1, bh: hashOf(blob) };
  if (writeKey(username, k, value)) pushOne(username, setId, { urgent: true, keepalive: env.hidden() });
}

function eachRecord(username, fn) {
  const p = prefixOf(username);
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(p)) keys.push(k);
    }
    for (const k of keys) {
      const v = readKey(k);
      if (v) fn(k.slice(p.length), v);
    }
  } catch { /* 못 읽으면 빈 것으로 */ }
}

// { [문제집 id(문자열)]: 마지막으로 본 때(ISO) } — 대시보드의 '최근 공부' 표시·정렬용
export function lastStudiedMap(username) {
  const out = {};
  eachRecord(username, (id, v) => { if (v.at) out[id] = v.at; });
  return out;
}

// { [문제집 id(문자열)]: 공부한 날 목록 } — 대시보드 요약('오늘 2개 · 이번 주 7개 · 연속 3일')용
export function studyDaysMap(username) {
  const out = {};
  eachRecord(username, (id, v) => {
    const d = daysOf(v);
    if (d.length) out[id] = d;
  });
  return out;
}

// 백업 파일에 넣을 공부 기록(서버에 올리는 꼴 + ct): { version: 1, records: { [문제집 id]: 기록 } }
export function exportStudy(username) {
  const records = {};
  eachRecord(username, (id, v) => { records[id] = { ...serverData(v), ct: ctOf(v) }; });
  return { version: VERSION, records };
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

// ── 나누기(서버와 주고받기) ──────────────────────────────────
// 올리기: 저장하면 문제집마다 PUSH_GAP_MS 에 한 번(처음 저장은 바로). 진도가 바뀐 저장(빈칸 열기·채점·문항 이동)은
//  PUSH_FAST_MS 에 한 번 — 풀기 화면은 화면을 켜 두므로(wake lock) 태블릿을 켜 둔 채 내려놓아도 '가려질 때 올리기'가 없다.
//  앱이 가려지거나 닫힐 때·'처음부터'·대시보드로 돌아올 때는 모아 둔 것을 바로. 실패하면(연결 끊김·서버 쉼) RETRY_MS 뒤에
//  다시 — 오류는 화면에 보이지 않는다.
// 받기: 대시보드가 열릴 때·다시 보일 때(PULL_GAP_MS 에 한 번) 서버 줄을 받아 합친다. 풀기 화면은 문항을 받는 동안 받기를
//  함께 기다린다(최대 1.5초 — 처음 그릴 때 loadStudy 를 동기로 읽으므로). 늦어져 사본 없이 열어도 진도 없는 저장은
//  다른 기기의 진도를 덮지 않는다(saveStudy).
// 로그인하지 않았으면(이 기기의 username 이 다르거나 없음) 요청을 하나도 보내지 않는다.
// api 는 api/study.js 가 이어 준다: { list(since) → [줄], put(setId, data, clientAt, { keepalive }) → 줄 }
const PUSH_GAP_MS = 15000; // 읽던 자리만 바뀐 저장(스크롤)·마지막 본 때만 바뀐 저장
const PUSH_FAST_MS = 2000; // 진도가 바뀐 저장 — 작은 요청이라 Free 플랜에도 부담이 적다
const PULL_GAP_MS = 5000; // 작은 요청(받기 커서 뒤만)이라 짧게 — 기기를 바꿔 들자마자 열어도 맞게
const OPEN_FRESH_MS = 1000; // 문제집을 열 때 마지막 받기가 이보다 오래(시작 기준)면 한 번 더 받는다(문항 받기와 함께라 기다림이 거의 늘지 않음)
const RETRY_MS = 60000;
const CURSOR_OVERLAP_MS = 120000; // 받기 커서를 이만큼 앞당겨 겹쳐 받는다(늦게 끝난 쓰기를 놓치지 않게, 합치기는 몇 번 해도 같음)
const KEEPALIVE_MAX = 60000; // keepalive 요청 몸 합 한도(브라우저 64KB)

function defaultEnv() {
  return {
    now: () => Date.now(),
    setTimer: (f, ms) => setTimeout(f, ms),
    clearTimer: (t) => clearTimeout(t),
    hidden: () => typeof document !== "undefined" && document.visibilityState === "hidden",
    // App 은 로그아웃·로그인 끊김 때 이 기기의 username 을 지운다(utils/session.js clearSession)
    signedIn: (username) => {
      try { return !!username && localStorage.getItem("username") === username; } catch { return false; }
    },
  };
}

let env = defaultEnv();
let api = null;
let st = freshState();
let listening = false;

function freshState() {
  return {
    timers: new Map(), // 열쇠 → 예약한 올리기 { t: 타이머, due: 올릴 때 }
    lastPush: new Map(), // 열쇠 → 마지막으로 올리기 시작한 때
    inflight: new Map(), // 열쇠 → 올리는 중인 promise
    again: new Map(), // 열쇠 → 올리는 동안 또 저장됨("now": 끝나면 바로, "fast"·"slow": 그 간격 지켜)
    holdUntil: 0, // 연결 실패·서버 쉼 → 이때까지 예약 올리기·받기를 쉰다
    retryTimer: null,
    stopped: false, // DB 함수 없음(판이 낮음) → 이 페이지에서는 그만
    pull: null, // 받는 중인 promise
    lastPullAt: -Infinity,
    cursor: new Map(), // 아이디 → 다음 받기의 p_since(이 페이지 첫 받기는 전부)
    kaBytes: 0, // 지금 keepalive 로 나가는 몸 크기 합
  };
}

// api/study.js 가 부른다. 브라우저에서는 앱이 가려지거나 닫힐 때 바로 올리기를 한 번만 건다
// (풀기 화면이 그때 하는 마지막 저장은 saveStudy 가 가려진 것을 보고 바로 올린다)
export function connectStudySync(a) {
  api = a;
  if (listening || typeof window === "undefined" || typeof document === "undefined") return;
  listening = true;
  const onHide = () => {
    let u = "";
    try { u = localStorage.getItem("username") || ""; } catch { /* 없음 */ }
    if (u) flushStudy(u, { keepalive: true });
  };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") onHide(); });
  window.addEventListener("pagehide", onHide);
}

// 시험용: 시계·타이머·가려짐·로그인 판정·api 를 바꾸고 나누기 상태를 비운다
export function configureStudySync(opts = {}) {
  for (const t of st.timers.values()) env.clearTimer(t.t);
  if (st.retryTimer) env.clearTimer(st.retryTimer);
  env = { ...defaultEnv(), ...opts };
  if ("api" in opts) api = opts.api;
  st = freshState();
}

function utf8Length(s) {
  try { return new TextEncoder().encode(s).length; } catch { return s.length * 3; }
}

// 실패 처리(조용히). 다시 해도 소용없는 것(없는 문제집·검사 실패·권한)은 그 기록의 올리기 표시를 내려 되풀이하지 않는다
function handleError(e, username, setId) {
  if (!e || e.sessionExpired || e.signedOut) return; // 로그인 끊김은 App 이 로그인 화면으로 보낸다
  if (e.notReady) { st.stopped = true; return; }
  const status = Number(e.status) || 0;
  if (setId != null && !e.offline && !e.paused && status >= 400 && status < 500 && status !== 408 && status !== 429) {
    const k = keyOf(username, setId);
    const cur = readKey(k);
    if (cur && isDirty(cur)) writeKey(username, k, { ...cur, ct: ctOf(cur), dirty: 0 });
    return;
  }
  // 연결 끊김·서버 쉼·서버 오류: 잠시 쉬었다가 모아 둔 것을 한꺼번에
  st.holdUntil = env.now() + RETRY_MS;
  if (!st.retryTimer) {
    st.retryTimer = env.setTimer(() => { st.retryTimer = null; flushStudy(username); }, RETRY_MS);
  }
}

// 서버가 돌려준 줄을 이 기기 기록과 합쳐 쓴다(바뀌었으면 true)
function applyRemote(username, row, prune = true) {
  const remote = remoteRecord(row);
  if (!remote || row.setId == null) return false;
  const k = keyOf(username, row.setId);
  const cur = readKey(k);
  const merged = mergeRecords(cur, remote);
  if (cur && stable(merged) === stable(cur)) return false;
  writeKey(username, k, merged, prune);
  return true;
}

const AGAIN_RANK = { slow: 0, fast: 1, now: 2 };
function markAgain(k, kind) {
  const cur = st.again.get(k);
  if (cur === undefined || AGAIN_RANK[kind] > AGAIN_RANK[cur]) st.again.set(k, kind);
}

// 올리기 예약. fast: 진도가 바뀐 저장(PUSH_FAST_MS 간격). 이미 더 늦게 잡힌 예약이 있으면 앞당긴다
function schedulePush(username, setId, fast = false) {
  if (!api || st.stopped) return;
  if (env.hidden()) { pushOne(username, setId, { urgent: true, keepalive: true }); return; }
  const k = keyOf(username, setId);
  if (st.inflight.has(k)) { markAgain(k, fast ? "fast" : "slow"); return; }
  const now = env.now();
  const last = st.lastPush.get(k) ?? -Infinity;
  const due = Math.max(now, last + (fast ? PUSH_FAST_MS : PUSH_GAP_MS), st.holdUntil);
  const cur = st.timers.get(k);
  if (cur) {
    if (cur.due <= due) return;
    env.clearTimer(cur.t);
  }
  st.timers.set(k, { due, t: env.setTimer(() => { st.timers.delete(k); pushOne(username, setId); }, due - now) });
}

function pushOne(username, setId, { urgent = false, keepalive = false } = {}) {
  if (!api || st.stopped || !env.signedIn(username)) return Promise.resolve();
  if (!/^\d+$/.test(String(setId))) return Promise.resolve(); // 서버 문제집 id 가 아닌 열쇠
  const k = keyOf(username, setId);
  if (st.inflight.has(k)) {
    markAgain(k, urgent ? "now" : "slow");
    return st.inflight.get(k);
  }
  if (!urgent && env.now() < st.holdUntil) return Promise.resolve(); // 쉬는 중: 다시 시도 때 함께
  const rec = readKey(k);
  if (!isDirty(rec)) return Promise.resolve();
  const body = serverData(rec);
  const bytes = utf8Length(JSON.stringify(body));
  if (bytes > MAX_BYTES) return Promise.resolve(); // 서버 한도를 넘는 기록은 이 기기에만
  const timer = st.timers.get(k);
  if (timer) { env.clearTimer(timer.t); st.timers.delete(k); }
  st.lastPush.set(k, env.now());
  const ka = keepalive && st.kaBytes + bytes <= KEEPALIVE_MAX;
  if (ka) st.kaBytes += bytes;
  const p = (async () => {
    try {
      const row = await api.put(Number(setId), body, ctOf(rec), { keepalive: ka });
      st.holdUntil = 0; // 닿았으면 쉬기를 끝낸다
      applyRemote(username, row);
    } catch (e) {
      handleError(e, username, setId);
    } finally {
      if (ka) st.kaBytes -= bytes;
      st.inflight.delete(k);
      if (st.again.has(k)) {
        const kind = st.again.get(k);
        st.again.delete(k);
        if (kind === "now") pushOne(username, setId, { urgent: true, keepalive: env.hidden() });
        else schedulePush(username, setId, kind === "fast");
      }
    }
  })();
  st.inflight.set(k, p);
  return p;
}

// 모아 둔(올릴 것이 있는) 기록을 지금 모두 올린다. 앱이 가려질 때는 keepalive(페이지가 닫혀도 요청이 끝까지 감)
export function flushStudy(username, { keepalive = false } = {}) {
  if (!api || st.stopped || !env.signedIn(username)) return Promise.resolve();
  const jobs = [];
  eachRecord(username, (id, v) => {
    if (isDirty(v)) jobs.push(pushOne(username, id, { urgent: true, keepalive }));
  });
  return Promise.all(jobs).then(() => undefined);
}

// 서버 줄을 받아 합친다. { changed: 이 기기 기록이 바뀐 수 } 로 끝난다(실패해도 던지지 않음).
// 받은 뒤 이 기기에만 있는 새것(dirty)은 이어서 올린다(기다리지 않음). force 가 아니면 PULL_GAP_MS 에 한 번
export function pullStudy(username, { force = false } = {}) {
  if (!api || st.stopped || !env.signedIn(username)) return Promise.resolve({ changed: 0, skipped: true });
  if (st.pull) return st.pull;
  const now = env.now();
  if (!force && (now - st.lastPullAt < PULL_GAP_MS || now < st.holdUntil)) {
    return Promise.resolve({ changed: 0, skipped: true });
  }
  st.lastPullAt = now;
  const since = st.cursor.get(username) ?? null;
  const p = (async () => {
    let changed = 0;
    try {
      const rows = await api.list(since);
      st.holdUntil = 0;
      let maxUpdated = null;
      for (const row of Array.isArray(rows) ? rows : []) {
        if (applyRemote(username, row, false)) changed++;
        const u = timeOf(row?.updatedAt);
        if (u !== null && (maxUpdated === null || u > maxUpdated)) maxUpdated = u;
      }
      if (changed) pruneStudy(username, MAX_SETS);
      if (maxUpdated !== null) {
        const next = new Date(maxUpdated - CURSOR_OVERLAP_MS).toISOString();
        if (!since || next > since) st.cursor.set(username, next);
      }
    } catch (e) {
      handleError(e, username, null);
      return { changed, error: true };
    } finally {
      st.pull = null;
      commitHeld(username); // 받는 동안 ct 를 두고 저장한 진도를 이제 굳힌다
    }
    flushStudy(username);
    return { changed };
  })();
  st.pull = p;
  return p;
}

// 풀기 화면이 다시 보일 때·한동안 손대지 않다가 다시 손댈 때(다른 기기에서 공부했을 수 있음): 받는 중이면 그것을, 아니면
// 간격과 상관없이 새로 받는다(커서 뒤만 — 작은 요청). 받는 동안 그 화면의 저장은 새 ct 를 주지 않는다(saveStudy).
// 받지 않으면(로그인 전·함수 없음) null
export function refreshStudy(username) {
  if (st.pull) return st.pull;
  if (!api || st.stopped || !env.signedIn(username)) return null;
  return pullStudy(username, { force: true });
}

// 지금 받는 중인 것(없으면 null) — 풀기 화면이 열 때 기다린 받기가 1.5초를 넘겨 늦게 끝나면 받은 것을 화면에 얹으려고
export function pendingStudyPull() {
  return st.pull;
}

// 문제집을 열 때(풀기 화면이 문항을 받는 동안 함께): 받는 중이면 그것을, 마지막 받기를 시작한 지 maxAgeMs 가 지났으면
// 새로 받아(커서 뒤만 — 작은 요청) 최대 waitMs 까지 기다린다. 대시보드가 보이자마자 받은 결과는 그 뒤 다른 기기가 가려지며
// 올린 것을 모를 수 있어 짧게 본다. 연결이 끊겨 쉬는 중이면 기다리지 않는다.
// 늦어지면(느린 연결) 기다리지 않고 연다 — 받기는 뒤에서 끝나 다음 열기부터 맞고, 그사이 이 기기의 진도 없는 저장은
// 받아 온 진도를 덮지 않는다(saveStudy)
export function freshStudyBeforeOpen(username, { maxAgeMs = OPEN_FRESH_MS, waitMs = 1500 } = {}) {
  let p = st.pull;
  const now = env.now();
  if (!p && now - st.lastPullAt > maxAgeMs && now >= st.holdUntil) p = pullStudy(username, { force: true });
  if (!p) return Promise.resolve();
  return new Promise((resolve) => {
    const t = env.setTimer(resolve, waitMs);
    p.then(() => { env.clearTimer(t); resolve(); }, () => { env.clearTimer(t); resolve(); });
  });
}

// 대시보드가 열릴 때·다시 보일 때: 받기(간격 지켜 — 받은 뒤 모아 둔 것도 올림). 받기를 건너뛰면 모아 둔 것만 올린다
export function syncStudy(username, opts) {
  const p = pullStudy(username, opts);
  p.then((r) => { if (r && r.skipped) flushStudy(username); });
  return p;
}
