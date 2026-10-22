// 풀기 화면의 '이어 보기' 기록 — 무엇을 남기고 열 때 어떻게 되살리는지(DOM·React 없는 순수 함수, test/app 에서 시험).
// 저장소는 utils/studyState.js(이 기기 localStorage, 문제집마다 한 줄). 여기서 정하는 내용:
//  { mode: "ordered" | "random", ids: [서버 순서 문항 id], order?: [랜덤일 때 푸는 순서 id], cur: 보던 문항 id,
//    res?: { [문항 id]: { c: 맞음, u: 낸 답 } }  (채점 문항),
//    q?: { [문항 id]: { h: 본문 지문, r: [연 빈칸 번호], a: 읽던 자리 } }  (지금 문항만) }
// 결과 화면까지 가면(끝냄) 자리·연 빈칸은 지우고 { ids } 만 남긴다 — 마지막으로 본 때(at)는 그래도 남는다.
// 읽던 자리 a: { k: "b"(빈칸) | "h"(제목), i: 번호, d: 읽는 줄(머리 줄 아래)에서 그 요소까지 px, f: 본문 높이에 대한 비율 }
//  — 화면 폭·글자 크기가 바뀌어도 같은 빈칸·제목을 찾아가고, 못 찾으면 비율로. null 이면 맨 위.
import { textHash } from "../ink/geometry.js";
import { parseAnswers } from "./answers.js";

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

// 문항 본문 지문: 필기(ink)가 쓰는 것과 같은 값(유형 + 본문 + 빈칸 문항이면 정답). 다르면 연 빈칸·읽던 자리는 버린다
export function questionHash(q) {
  if (!q) return "";
  const fill = normalizeType(q.type) === "fill";
  return textHash([q.type, q.text || "", fill ? parseAnswers(q.answers).join("\u0001") : ""].join("\u0000"));
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

// 처음 열 때의 상태. saved: loadStudy 값(없으면 null), questions: 서버가 준 순서.
// 돌려주는 값: { questions(푸는 순서), mode, index, results, revealed, anchor, resumed }
//  - 기록이 지금 문항 묶음과 맞고 이어 볼 것이 있으면(지나온 문항·채점·연 빈칸·내려간 자리) 그대로 — resumed: true
//  - 아니면 문항이 하나뿐이면 바로 '순번대로', 여럿이면 고르기 화면(mode null)
export function initialSolveState(saved, questions) {
  const fresh = (mode) => ({
    questions, mode, index: 0, results: {},
    revealed: Array(blankCountOf(questions[0])).fill(false), anchor: null, resumed: false,
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
  const entry = saved.q && saved.q[String(cq.id)];
  let anchor = null;
  if (entry && entry.h === questionHash(cq)) {
    if (Array.isArray(entry.r)) for (const i of entry.r) if (Number.isInteger(i) && i >= 0 && i < n) revealed[i] = true;
    if (isAnchor(entry.a)) anchor = entry.a;
  }
  const resumed = index > 0 || Object.keys(results).length > 0 || revealed.some(Boolean) || !!anchor;
  if (!resumed) return base;
  return { questions: order, mode: saved.mode, index, results, revealed, anchor, resumed: true };
}

// 지금 상태를 기록 값으로. base: 서버 순서 문항, questions: 푸는 순서, mode null(고르기 화면)·done(결과 화면)이면 { ids } 만
export function studySnapshot({ base, questions, mode, index, results, revealed, anchor, done }) {
  const ids = idsOf(base);
  const q = questions[index];
  if (!q || done || (mode !== "ordered" && mode !== "random")) return { ids };
  const out = { mode, ids, cur: String(q.id) };
  if (mode === "random") out.order = idsOf(questions);
  const res = {};
  for (const [i, r] of Object.entries(results || {})) {
    const rq = questions[Number(i)];
    if (rq && r) res[String(rq.id)] = { c: !!r.correct, u: String(r.userAnswer ?? "") };
  }
  if (Object.keys(res).length) out.res = res;
  const r = [];
  (revealed || []).forEach((v, i) => { if (v) r.push(i); });
  out.q = { [String(q.id)]: { h: questionHash(q), r, a: isAnchor(anchor) ? anchor : null } };
  return out;
}

// 이어 볼 '진도'가 있나: 지나온 문항·채점·연 빈칸. initialSolveState 가 이어 볼지와 같은 판단을 문항 없이 한다
// (본문 지문 h 는 견주지 않음 — 문항을 고쳤으면 진도로 쳐도 열 때 버려진다).
// 읽던 자리(a)만 있는 것은 진도로 치지 않는다: 공부 기록 나누기(utils/studyState.js)에서 진도 없는 저장은 다른 기기의 진도를
// 덮지 못한다 — 다른 기기 기록을 아직 받지 못한 채 열고 조금 내려 본 것만으로 그 기기에서 연 빈칸들이 지워지지 않게.
// 풀기 화면 꼴이 아닌 값(ids 없음)은 모르니 진도로 친다(빈 객체만 빼고)
export function hasStudyProgress(saved) {
  if (!saved || typeof saved !== "object") return false;
  if (!Array.isArray(saved.ids)) return Object.keys(saved).length > 0;
  if (saved.mode !== "ordered" && saved.mode !== "random") return false;
  const order = saved.mode === "random" && sameIdSet(saved.order, saved.ids) ? saved.order : saved.ids;
  if (saved.cur != null && order.length && String(saved.cur) !== String(order[0])) return true;
  if (saved.res && typeof saved.res === "object" && Object.keys(saved.res).length) return true;
  const entries = saved.q && typeof saved.q === "object" ? Object.values(saved.q) : [];
  return entries.some((e) => e && Array.isArray(e.r) && e.r.some((i) => Number.isInteger(i) && i >= 0));
}

// 읽던 자리(a)를 뺀 값 — 두 저장 사이에 진도(문항·채점·연 빈칸)가 바뀌었는지 견줄 때(바뀌었으면 다른 기기로 곧바로 올린다)
export function progressPart(saved) {
  if (!saved || typeof saved !== "object" || !saved.q || typeof saved.q !== "object") return saved ?? null;
  const q = {};
  for (const [id, e] of Object.entries(saved.q)) {
    q[id] = e && typeof e === "object" ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== "a")) : e;
  }
  return { ...saved, q };
}
