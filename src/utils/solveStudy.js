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
