// 풀기 화면의 '이어 보기' 기록 — 무엇을 남기고 열 때 어떻게 되살리는지(DOM·React 없는 순수 함수, test/app 에서 시험).
// 저장소는 utils/studyState.js(이 기기 localStorage, 문제집마다 한 줄). 여기서 정하는 내용:
//  { mode: "ordered" | "random", ids: [서버 순서 문항 id], order?: [랜덤일 때 푸는 순서 id], cur: 보던 문항 id,
//    res?: { [문항 id]: { c: 맞음, u: 낸 답 } }  (채점 문항),
//    q?: { [문항 id]: { h: 본문 지문,
//                      r?: [연 빈칸 번호], a?: 읽던 자리, f?: [★만 가리기 전 연 빈칸 번호]   (지금 문항만, f 는 ★만 가리기를 켰을 때만)
//                      s?: [★ 표시한 빈칸 번호]   (문항마다 — 끝낸 뒤에도 남김)
//                      n?: 연 빈칸 수 } }        (지나온 문항 — 결과 화면의 '연 빈칸 N/전체') }
// 결과 화면까지 가면(끝냄) 자리·연 빈칸은 지우고 { ids } 와 ★(q 의 h·s)만 남긴다 — 마지막으로 본 때(at)는 그래도 남는다.
// ★·지나온 문항 수(s·n·f)가 없는 옛 기록도 그대로 읽힌다(없으면 빈 것).
// 읽던 자리 a: { k: "b"(빈칸) | "h"(제목), i: 번호, d: 읽는 줄(머리 줄 아래)에서 그 요소까지 px, f: 본문 높이에 대한 비율,
//               p?: (제목일 때) 그 절 안에서 읽는 줄의 비율 — 보통 ↔ 하드를 바꿀 때만 }
//  — 화면 폭·글자 크기가 바뀌어도 같은 빈칸·제목을 찾아가고, 못 찾으면 비율로. null 이면 맨 위.
import { textHash } from "../ink/geometry.js";
import { parseAnswers } from "./answers.js";
import { textModel } from "./textBlocks.js";
import { matchHeading } from "./hardMode.js";

// 백엔드 타입명(short_answer, multiple_choice 등)을 프론트엔드 내부명으로 정규화
export function normalizeType(type) {
  const map = { short_answer: "short", multiple_choice: "multiple" };
  const lower = (type || "").toLowerCase();
  return map[lower] ?? lower;
}

// 채점하는 유형. 그 밖(빈칸·모르는 유형)은 채점 없는 학습 문항 — '다음 문제' 단추가 늘 보인다
export const GRADED_TYPES = new Set(["multiple", "short", "ox"]);

export function blankCountOf(q) {
  return q && normalizeType(q.type) === "fill" ? (q.text || "").split("___").length - 1 : 0;
}

// 문항 본문 지문: 필기(ink)가 쓰는 것과 같은 값(유형 + 본문 + 빈칸 문항이면 정답). 다르면 연 빈칸·읽던 자리·★ 는 버린다
export function questionHash(q) {
  if (!q) return "";
  const fill = normalizeType(q.type) === "fill";
  return textHash([q.type, q.text || "", fill ? parseAnswers(q.answers).join("\u0001") : ""].join("\u0000"));
}

// 저장할 때마다(스크롤이 멈출 때마다) 24KB 본문을 다시 훑지 않게 문항 객체마다 지문을 기억한다.
// 같은 객체라도 글·정답·유형이 바뀌었으면 다시 계산
const hashCache = new WeakMap();
function hashOf(q) {
  if (!q || typeof q !== "object") return questionHash(q);
  const c = hashCache.get(q);
  if (c && c.text === q.text && c.answers === q.answers && c.type === q.type) return c.h;
  const h = questionHash(q);
  hashCache.set(q, { text: q.text, answers: q.answers, type: q.type, h });
  return h;
}

const idsOf = (qs) => qs.map((q) => String(q.id));

// 같은 문항 묶음인가(순서는 보지 않음)
export function sameIdSet(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const set = new Set(a.map(String));
  return set.size === a.length && b.every((id) => set.has(String(id)));
}

function isAnchor(a) {
  return !!a && typeof a === "object" && (
    (a.k === "b" || a.k === "h") && Number.isInteger(a.i) && Number.isFinite(a.d) ||
    Number.isFinite(a.f)
  );
}

// ── 빈칸 번호 목록(★·연 빈칸) ──
// 0 ≤ i < n 인 정수만, 겹치지 않게, 작은 것부터
export function cleanIndices(list, n) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((i) => Number.isInteger(i) && i >= 0 && i < n))].sort((a, b) => a - b);
}

// [참/거짓] → 참인 번호들
export function indicesOf(flags) {
  const out = [];
  (flags || []).forEach((v, i) => { if (v) out.push(i); });
  return out;
}

// 번호들 → 길이 n 의 [참/거짓]
export function flagsOf(n, list) {
  const out = Array(Math.max(0, n)).fill(false);
  for (const i of list || []) if (Number.isInteger(i) && i >= 0 && i < n) out[i] = true;
  return out;
}

// ★ 하나 달기/떼기 — 새 목록(작은 것부터)
export function toggleIndex(list, i) {
  const set = new Set(list || []);
  if (set.has(i)) set.delete(i); else set.add(i);
  return [...set].sort((a, b) => a - b);
}

// '★만 가리기': ★ 아닌 빈칸은 모두 열고 ★ 빈칸만 가린 상태
export function starOnlyRevealed(n, stars) {
  return flagsOf(n, stars).map((s) => !s);
}

// 사용자가 스스로 연 빈칸 번호 — 머리 줄 '연 빈칸 n/전체'·목차·결과 화면의 수, ★만 가리기를 끌 때 돌아갈 상태.
// revealed: 화면의 [열림], starFlags: [★], filterPre: ★만 가리기 전 연 빈칸 번호(꺼져 있으면 null).
// ★만 가리기 중에는 가리기가 대신 연 ★ 아닌 빈칸을 세지 않는다(★ 만 복습하고 끝내면 '연 빈칸 34/37' 처럼 부풀던 것):
//  ★ 빈칸 = 켜기 전에 열었거나 켠 뒤 연 것, ★ 아닌 빈칸 = 켜기 전에 열었고 아직 열린 것
export function openedIndices(revealed, starFlags, filterPre) {
  if (!Array.isArray(filterPre)) return indicesOf(revealed);
  const pre = new Set(filterPre);
  const out = [];
  (revealed || []).forEach((v, i) => {
    if (starFlags && starFlags[i] ? v || pre.has(i) : v && pre.has(i)) out.push(i);
  });
  return out;
}

// [start, end) 범위에서 flags 가 참인 수(목차의 절마다 연 빈칸·★ 수)
export function countIn(flags, start, end) {
  let k = 0;
  if (flags) for (let i = start; i < end; i++) if (flags[i]) k += 1;
  return k;
}

// 기록의 ★: { [문항 id]: [빈칸 번호…] } — 지문이 같은 문항 것만(문항을 고치면 그 문항의 ★ 는 버림).
// 문항 묶음이 바뀌어도(문항을 더함) 남은 문항의 ★ 는 그대로
export function savedStars(saved, questions) {
  const out = {};
  const q = saved && saved.q && typeof saved.q === "object" ? saved.q : null;
  if (!q) return out;
  for (const qq of questions) {
    const e = q[String(qq.id)];
    if (!e || !Array.isArray(e.s) || !e.s.length || e.h !== hashOf(qq)) continue;
    const s = cleanIndices(e.s, blankCountOf(qq));
    if (s.length) out[String(qq.id)] = s;
  }
  return out;
}

// 처음 열 때의 상태. saved: loadStudy 값(없으면 null), questions: 서버가 준 순서.
// 돌려주는 값: { questions(푸는 순서), mode, index, results, revealed, anchor, resumed, stars, counts, filterPre }
//  - 기록이 지금 문항 묶음과 맞고 이어 볼 것이 있으면(지나온 문항·채점·연 빈칸·내려간 자리) 그대로 — resumed: true
//  - 아니면 문항이 하나뿐이면 바로 '순번대로', 여럿이면 고르기 화면(mode null)
//  - ★(stars)는 이어 보든 아니든 되살린다. counts(지나온 문항의 연 빈칸 수)·filterPre(★만 가리기)는 이어 볼 때만
export function initialSolveState(saved, questions) {
  const stars = savedStars(saved, questions);
  const fresh = (mode) => ({
    questions, mode, index: 0, results: {},
    revealed: Array(blankCountOf(questions[0])).fill(false), anchor: null, resumed: false,
    stars, counts: {}, filterPre: null,
  });
  if (!questions.length) return fresh(null);
  const ids = idsOf(questions);
  const base = questions.length === 1 ? fresh("ordered") : fresh(null);
  if (!saved || (saved.mode !== "ordered" && saved.mode !== "random") || !sameIdSet(saved.ids, ids)) return base;

  let order = questions;
  if (saved.mode === "random" && sameIdSet(saved.order, ids)) {
    const byId = new Map(questions.map((q) => [String(q.id), q]));
    order = saved.order.map((id) => byId.get(String(id)));
  }
  const index = Math.max(0, order.findIndex((q) => String(q.id) === String(saved.cur)));
  const results = {};
  if (saved.res && typeof saved.res === "object") {
    order.forEach((q, i) => {
      const r = saved.res[String(q.id)];
      if (r && typeof r === "object") results[i] = { correct: !!r.c, userAnswer: String(r.u ?? "") };
    });
  }
  const cq = order[index];
  const n = blankCountOf(cq);
  const revealed = Array(n).fill(false);
  const entries = saved.q && typeof saved.q === "object" ? saved.q : {};
  const entry = entries[String(cq.id)];
  let anchor = null;
  let filterPre = null;
  if (entry && entry.h === hashOf(cq)) {
    if (Array.isArray(entry.r)) for (const i of entry.r) if (Number.isInteger(i) && i >= 0 && i < n) revealed[i] = true;
    if (isAnchor(entry.a)) anchor = entry.a;
    if (Array.isArray(entry.f)) filterPre = cleanIndices(entry.f, n);
  }
  const counts = {};
  for (const q of order) {
    const id = String(q.id);
    const e = entries[id];
    if (id === String(cq.id) || !e || !Number.isInteger(e.n) || e.n < 0 || e.h !== hashOf(q)) continue;
    counts[id] = Math.min(e.n, blankCountOf(q));
  }
  const resumed = index > 0 || Object.keys(results).length > 0 || revealed.some(Boolean) || !!anchor;
  if (!resumed) return base;
  return { questions: order, mode: saved.mode, index, results, revealed, anchor, resumed: true, stars, counts, filterPre };
}

// 지금 상태를 기록 값으로. base: 서버 순서 문항, questions: 푸는 순서, mode null(고르기 화면)·done(결과 화면)이면 { ids } (+ ★) 만.
// stars: { [문항 id]: [빈칸 번호] }, counts: { [문항 id]: 지나온 문항의 연 빈칸 수 }, filterPre: ★만 가리기 전 연 빈칸 번호(켜져 있을 때만)
export function studySnapshot({ base, questions, mode, index, results, revealed, anchor, done, stars, counts, filterPre }) {
  const ids = idsOf(base);
  const qOut = {};
  // ★ 는 문항마다, 끝낸 뒤에도 남긴다(다음에 '★만 가리기'로 다시 볼 수 있게)
  if (stars) {
    for (const bq of base) {
      const s = stars[String(bq.id)];
      if (Array.isArray(s) && s.length) qOut[String(bq.id)] = { h: hashOf(bq), s: [...s] };
    }
  }
  const q = questions[index];
  if (!q || done || (mode !== "ordered" && mode !== "random")) {
    return Object.keys(qOut).length ? { ids, q: qOut } : { ids };
  }
  const cur = String(q.id);
  const out = { mode, ids, cur };
  if (mode === "random") out.order = idsOf(questions);
  const res = {};
  for (const [i, r] of Object.entries(results || {})) {
    const rq = questions[Number(i)];
    if (rq && r) res[String(rq.id)] = { c: !!r.correct, u: String(r.userAnswer ?? "") };
  }
  if (Object.keys(res).length) out.res = res;
  if (counts) {
    const byId = new Map(base.map((bq) => [String(bq.id), bq]));
    for (const [id, n] of Object.entries(counts)) {
      const cq = byId.get(id);
      if (id === cur || !cq || !Number.isInteger(n)) continue;
      qOut[id] = { ...(qOut[id] || { h: hashOf(cq) }), n };
    }
  }
  const entry = { ...(qOut[cur] || {}), h: hashOf(q), r: indicesOf(revealed), a: isAnchor(anchor) ? anchor : null };
  if (Array.isArray(filterPre)) entry.f = [...filterPre];
  qOut[cur] = entry;
  out.q = qOut;
  return out;
}

// ── 질문 메모에서 열기(엿보기) ──
// 메모의 빈칸을 보러 열었을 때는 이어 볼 자리(보던 문항·읽던 자리)를 바꾸지 않는다 — 다음에 대시보드에서 열면 읽던 곳 그대로.
// 연 빈칸·★ 은 지금 것으로 남긴다. snap: 지금 상태(studySnapshot), saved: 메모로 열기 전의 기록(없으면 null)
//  - 이어 볼 기록이 없었으면(처음 엶·끝낸 기록) 지킬 자리가 없으니 지금 상태 그대로 — 보통처럼 저장해
//    메모에서 와서 읽은 자리·연 빈칸이 남는다(예전에는 ★ 만 남겨 그만큼 공부한 것이 사라졌다)
//  - 같은 문항이면 연 빈칸·★ 은 지금 것, 읽던 자리(a)만 지난 것
//  - 다른 문항이면 지난 기록 그대로 + ★ 만 지금 것
export function keepResume(snap, saved) {
  const ok = saved && (saved.mode === "ordered" || saved.mode === "random") && saved.cur != null && Array.isArray(saved.ids);
  if (!ok || !snap || snap.cur == null) return snap;
  const cur = String(snap.cur);
  const prevQ = saved.q && typeof saved.q === "object" ? saved.q : {};
  if (String(saved.cur) === cur && snap.mode === saved.mode) {
    const e = snap.q[cur];
    const pe = prevQ[cur];
    return { ...snap, q: { ...snap.q, [cur]: { ...e, a: pe && pe.h === e.h && isAnchor(pe.a) ? pe.a : null } } };
  }
  const out = { ...saved };
  delete out.v;
  delete out.at;
  const q = {};
  for (const [id, e] of Object.entries(prevQ)) {
    if (!e || typeof e !== "object") continue;
    const keep = { ...e };
    delete keep.s; // ★ 는 아래에서 지금 것으로
    q[id] = keep;
  }
  for (const [id, e] of Object.entries(snap.q || {})) {
    if (!e || !Array.isArray(e.s) || !e.s.length) continue;
    q[id] = { ...(q[id] && q[id].h === e.h ? q[id] : { h: e.h }), s: [...e.s] };
  }
  out.q = q;
  return out;
}

// 이어 볼 '진도'가 있나: 지나온 문항·채점·연 빈칸은 initialSolveState 가 이어 볼지와 같은 판단을 문항 없이 한다
// (본문 지문 h 는 견주지 않음 — 문항을 고쳤으면 진도로 쳐도 열 때 버려진다).
// ★(헷갈림 표시)도 진도다: 이어 보기와 상관없이(끝낸 뒤·고르기 화면·'처음부터' 뒤에도) 남기는 사용자 표시라,
// 진도로 치지 않으면 ★ 만 단 기록이 진도 없는 기록(WEAK_CT)으로 올라가 열기만 한 다른 기기의 저장에 지워지고,
// 마지막 ★ 를 뗀 것도 다른 기기로 가지 않는다(solve + sync 통합).
// 읽던 자리(a)만 있는 것은 진도로 치지 않는다: 공부 기록 나누기(utils/studyState.js)에서 진도 없는 저장은 다른 기기의 진도를
// 덮지 못한다 — 다른 기기 기록을 아직 받지 못한 채 열고 조금 내려 본 것만으로 그 기기에서 연 빈칸들이 지워지지 않게.
// 풀기 화면 꼴이 아닌 값(ids 없음)은 모르니 진도로 친다(빈 객체만 빼고)
export function hasStudyProgress(saved) {
  if (!saved || typeof saved !== "object") return false;
  if (!Array.isArray(saved.ids)) return Object.keys(saved).length > 0;
  return Object.keys(starMap(saved)).length > 0 || hasPlaceProgress(saved);
}

const isMode = (m) => m === "ordered" || m === "random";
const isIdx = (i) => Number.isInteger(i) && i >= 0;
const qEntries = (saved) => (saved && saved.q && typeof saved.q === "object" ? saved.q : {});

// 칸 순서와 상관없는 JSON(서버 jsonb 는 칸 순서를 바꿔 돌려준다)
function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}
const same = (a, b) => canon(a ?? null) === canon(b ?? null);

// ★ 말고 자리에 딸린 진도(지나온 문항·채점·연 빈칸)가 있나 — ids 꼴인 값만
function hasPlaceProgress(saved) {
  if (!isMode(saved.mode)) return false;
  const order = saved.mode === "random" && sameIdSet(saved.order, saved.ids) ? saved.order : saved.ids;
  if (saved.cur != null && order.length && String(saved.cur) !== String(order[0])) return true;
  if (saved.res && typeof saved.res === "object" && Object.keys(saved.res).length) return true;
  return Object.values(qEntries(saved)).some((e) => e && Array.isArray(e.r) && e.r.some(isIdx));
}

// { [문항 id]: [★ 빈칸 번호(작은 것부터)] } — ★ 가 있는 문항만
function starMap(saved) {
  const out = {};
  for (const [id, e] of Object.entries(qEntries(saved))) {
    const s = e && Array.isArray(e.s) ? [...new Set(e.s.filter(isIdx))].sort((a, b) => a - b) : [];
    if (s.length) out[id] = s;
  }
  return out;
}

// ★ 를 뺀, 자리에 딸린 진도(없으면 null): 푸는 방식·순서·보던 문항·채점·문항마다 연 빈칸 등. 읽던 자리(a)는 뺀다
function placePart(saved) {
  if (!hasPlaceProgress(saved)) return null;
  const q = {};
  for (const [id, e] of Object.entries(qEntries(saved))) {
    if (!e || typeof e !== "object") continue;
    const rest = {};
    for (const [k, v] of Object.entries(e)) if (k !== "s" && k !== "a" && v !== undefined) rest[k] = v;
    if (Object.keys(rest).some((k) => k !== "h")) q[id] = rest; // ★ 만 있던 문항(h 만 남음)은 뺀다
  }
  return {
    mode: saved.mode, ids: saved.ids.map(String), order: saved.mode === "random" ? saved.order : undefined,
    cur: String(saved.cur), res: saved.res && Object.keys(saved.res).length ? saved.res : undefined, q,
  };
}

// 두 저장 사이에 사용자가 진도를 바꿨는지 견줄 값(utils/studyState.js saveStudy 가 칸 순서 없이 견준다).
// ★ 와 자리에 딸린 진도만 — 읽던 자리(a)와 진도 없는 꼴의 차이(고르기 화면 { ids } ↔ 문항 하나짜리를 연 '순번대로' 첫 문항)는
// 보지 않는다: 그런 저장은 다른 기기의 새 진도를 덮을 만한 일이 아니다. 풀기 화면 꼴이 아닌 값은 값 그대로
export function progressOf(saved) {
  if (!saved || typeof saved !== "object") return null;
  if (!Array.isArray(saved.ids)) return Object.keys(saved).length ? saved : null;
  return { s: starMap(saved), p: placePart(saved) };
}

// [번호] 세 벌 합치기: theirs 에 이 화면에서 더한 것(mine − base)을 더하고 뺀 것(base − mine)을 뺀다
function rebaseList(base, mine, theirs) {
  const b = new Set((base || []).filter(isIdx));
  const m = new Set((mine || []).filter(isIdx));
  const out = new Set((theirs || []).filter(isIdx));
  for (const i of m) if (!b.has(i)) out.add(i);
  for (const i of b) if (!m.has(i)) out.delete(i);
  return [...out].sort((x, y) => x - y);
}

// 자리: 푸는 방식·문항 묶음·(랜덤이면) 순서·보던 문항. 고르기 화면·끝낸 기록({ ids })은 null
const placeKey = (saved) => (saved && isMode(saved.mode)
  ? canon([saved.mode, (saved.ids || []).map(String), saved.mode === "random" ? (saved.order || []).map(String) : null, String(saved.cur)])
  : null);

// 다른 기기에서 받은 새 기록(theirs) 위에 이 화면에서 한 일(base → mine)을 다시 얹는다 — 공부 기록 나누기(utils/studyState.js
// saveStudy)가 이 화면이 아직 보여 주지 못한 기록을 받아 두었을 때. 통째로 바꾸면(나중에 고친 쪽이 이김) 풀기 화면을 켜 둔 채
// 다른 기기에서 공부하고 돌아와 빈칸 하나만 눌러도 그사이 다른 기기에서 연 빈칸·★ 이 모두 지워졌다.
// base: 이 화면이 마지막으로 굳힌 내용, mine: 지금 화면, theirs: 받아 둔 기록(모두 내용만)
//  - ★: 문항마다 theirs 에 이 화면에서 단 것을 더하고 뗀 것을 뺀다
//  - 자리(푸는 방식·순서·보던 문항)가 같으면 연 빈칸도 같은 식으로, 채점·★만 가리기·지나온 문항 수·읽던 자리는 이 화면에서
//    바꿨으면 이 화면 것(아니면 theirs)
//  - 자리가 다르면: 이 화면에서 ★ 말고 다른 진도를 바꿨으면(문항 이동·빈칸 열기·채점·끝냄) 이 화면 자리 — 사용자가 지금 여기서
//    공부하고 있으니. ★ 만 바꿨으면 theirs 자리
// 풀기 화면 꼴이 아닌 값은 mine 그대로(예전처럼 나중에 고친 쪽)
export function rebaseStudy(base, mine, theirs) {
  if (!mine || !Array.isArray(mine.ids) || !theirs || !Array.isArray(theirs.ids)) return mine;
  const b = base && Array.isArray(base.ids) ? base : { ids: [] };
  const bq = qEntries(b);
  const mq = qEntries(mine);
  const tq = qEntries(theirs);
  const samePlace = placeKey(mine) !== null && placeKey(mine) === placeKey(theirs);
  const baseHere = samePlace && placeKey(b) === placeKey(mine);
  let out;
  if (samePlace) {
    out = { ...theirs };
    const res = { ...(theirs.res && typeof theirs.res === "object" ? theirs.res : {}) };
    const mres = mine.res && typeof mine.res === "object" ? mine.res : {};
    const bres = baseHere && b.res && typeof b.res === "object" ? b.res : {};
    for (const [id, v] of Object.entries(mres)) if (!same(v, bres[id])) res[id] = v;
    for (const id of Object.keys(bres)) if (!(id in mres)) delete res[id];
    if (Object.keys(res).length) out.res = res;
    else delete out.res;
    const q = {};
    for (const id of new Set([...Object.keys(tq), ...Object.keys(mq)])) {
      const te = tq[id];
      const me = mq[id];
      if (!me) { q[id] = te; continue; }
      if (!te || te.h !== me.h) { q[id] = me; continue; } // 한쪽에만 있거나 본문이 다른 문항: 이 화면 것
      const be = baseHere && bq[id] && bq[id].h === me.h ? bq[id] : {};
      const e = { ...te };
      for (const k of ["r", "a", "f", "n"]) {
        let v;
        if (k === "r") v = me.r === undefined && te.r === undefined ? undefined : rebaseList(be.r, me.r, te.r);
        else v = same(me[k], be[k]) ? te[k] : me[k];
        if (v === undefined) delete e[k];
        else e[k] = v;
      }
      q[id] = e;
    }
    out.q = q;
  } else {
    const userMoved = !same(progressOf(mine).p, progressOf(b).p);
    out = { ...(userMoved ? mine : theirs) };
    out.q = { ...qEntries(out) };
  }
  // ★: 문항마다 세 벌 합치기(본문 지문 h 가 같은 것끼리 — theirs 가 다른 본문의 ★ 면 이 화면 것)
  for (const id of new Set([...Object.keys(tq), ...Object.keys(mq), ...Object.keys(bq)])) {
    const me = mq[id];
    const te = tq[id];
    const be = bq[id];
    const h = me?.h ?? te?.h ?? be?.h;
    const ms = me && Array.isArray(me.s) ? me.s : [];
    const s = te && te.h !== h ? cleanIndices(ms, Infinity)
      : rebaseList(be && be.h === h ? be.s : [], ms, te ? te.s : []);
    const e = out.q[id] ? { ...out.q[id] } : { h };
    if (s.length) e.s = s;
    else delete e.s;
    if (Object.keys(e).some((k) => k !== "h")) out.q[id] = e;
    else delete out.q[id];
  }
  if (!isMode(out.mode) && !Object.keys(out.q).length) delete out.q;
  return out;
}

// 화면이 열려 있는 동안 받은 기록(rec)을 지금 화면(view: base·questions·mode·index)에 얹을 상태.
// 자리(푸는 방식·순서·보던 문항)가 같으면 연 빈칸·채점·지나온 문항 수·★만 가리기·★ 를 기록대로(same: true),
// 다르면(다른 기기가 다른 문항으로 갔거나 끝냄) ★ 만 — 화면이 갑자기 다른 문항으로 넘어가거나 연 빈칸이 닫히지 않게.
// 읽던 자리는 옮기지 않는다(보고 있는 화면이 움직이지 않게)
export function refreshView(rec, view) {
  const init = initialSolveState(rec, view.base);
  const here = !!view.questions[view.index] && !!rec && isMode(rec.mode) && init.mode === view.mode
    && init.index === view.index && init.questions.length === view.questions.length
    && init.questions.every((x, i) => String(x.id) === String(view.questions[i].id));
  if (!here) return { same: false, stars: init.stars };
  return {
    same: true, stars: init.stars, results: init.results, revealed: init.revealed, counts: init.counts, filterPre: init.filterPre,
  };
}

// 읽던 자리(a)를 뺀 값 — 두 저장 사이에 진도(문항·채점·연 빈칸·★)가 바뀌었는지 견줄 때(바뀌었으면 다른 기기로 곧바로 올린다)
export function progressPart(saved) {
  if (!saved || typeof saved !== "object" || !saved.q || typeof saved.q !== "object") return saved ?? null;
  const q = {};
  for (const [id, e] of Object.entries(saved.q)) {
    q[id] = e && typeof e === "object" ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== "a")) : e;
  }
  return { ...saved, q };
}

// 질문 메모 → 풀기 화면을 열 값. 문제집이 없거나(문제집을 지워 떼어진 메모) 지금 내 문제집 목록에 없으면 null.
// liveSets: 지금 내 문제집 Map(id 문자열 → 문제집). 목록을 못 받았으면 null — 그때는 메모에 남은 id·제목으로 연다.
// 돌려주는 값: { set: { id, title, … }, questionId: 문항 id | null, blankNo: 빈칸 번호(1부터) | null }
//  (빈칸 번호는 문항 id 가 있을 때만 — 어느 문항의 빈칸인지 모르면 쓸 수 없다)
export function noteTarget(note, liveSets) {
  if (!note || note.setId == null || note.setId === "") return null;
  const live = liveSets ? liveSets.get(String(note.setId)) : null;
  if (liveSets && !live) return null;
  const questionId = note.questionId ?? null;
  const b = Number(note.blankNo);
  const blankNo = questionId != null && Number.isInteger(b) && b >= 1 ? b : null;
  const set = live ? { ...live } : { id: note.setId, title: note.setTitle || "" };
  return { set, questionId, blankNo };
}

// 메모 → 빈칸, 보통 ↔ 하드 바꾸기로 열 때: 처음 상태(initialSolveState 결과)를 그 문항·자리로 옮긴다.
// list: 서버 순서 문항. target:
//  { questionId, blankNo }  메모: 그 문항의 그 빈칸(1부터)
//  { qIndex, heading: { kind, label, hid, total }, p, f }  바꾸기: 서버 순서 qIndex 번째 문항. 짝 문제집에서 읽던 제목으로
//                           같은 절을 찾아 그 절 안 비율 p 자리로(제목이 없으면 본문 비율 f)
// 돌려주는 값: 처음 상태 + { index, revealed, filterPre, anchor, resumed: false, focusBlank(0부터 | null), found(문항을 찾음), missing }
//  - missing: "question"(메모의 문항이 없음 — 처음 상태 그대로) | "blank"(빈칸 번호가 문항에 없음 — 문항 맨 위) | null
//  - 이어 볼 기록이 있으면 그 순서(랜덤 포함)·채점을 그대로 쓰고, 없으면 서버 순서로 '순번대로'
//  - 기록의 보던 문항과 같으면 연 빈칸(·★만 가리기)을 그대로, 다르면 모두 가린 채로
export function applyTarget(init, list, target) {
  const out = { ...init, focusBlank: null, found: false, missing: null };
  if (!target || !list.length) return out;
  let tq = null;
  if (target.questionId != null) tq = list.find((q) => String(q.id) === String(target.questionId)) || null;
  else if (Number.isInteger(target.qIndex)) tq = list[Math.min(Math.max(target.qIndex, 0), list.length - 1)];
  if (!tq) return { ...out, missing: target.questionId != null ? "question" : null };
  const order = init.mode ? init.questions : list;
  const mode = init.mode || "ordered";
  const index = Math.max(0, order.findIndex((q) => String(q.id) === String(tq.id)));
  const same = !!init.mode && index === init.index;
  const n = blankCountOf(tq);
  let focusBlank = null;
  let missing = null;
  if (target.blankNo != null) {
    const b = Number(target.blankNo) - 1;
    if (Number.isInteger(b) && b >= 0 && b < n) focusBlank = b;
    else missing = "blank";
  }
  let anchor = null;
  if (focusBlank == null && target.questionId == null) {
    const hid = target.heading && normalizeType(tq.type) === "fill"
      ? matchHeading(target.heading, textModel(tq.text).headings)
      : null;
    if (hid != null) {
      const p = Number.isFinite(target.p) ? Math.min(1, Math.max(0, target.p)) : 0;
      anchor = { k: "h", i: hid, d: 0, p };
    } else if (Number.isFinite(target.f)) {
      anchor = { f: Math.min(1, Math.max(0, target.f)) };
    }
  }
  return {
    ...out,
    questions: order, mode, index,
    revealed: same ? init.revealed : Array(n).fill(false),
    filterPre: same ? init.filterPre : null,
    anchor, resumed: false, focusBlank, found: true, missing,
  };
}
