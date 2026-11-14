// InkInput 의 펜 뒤 손 막기(HAND_TAP_AFTER_PEN_MS)·겹침 막기(PEN_OVERLAP_BLOCK) 갈래: 창 리스너 onWinDown → onWinClick → 'click-blocked'(why).
// 11/15 실측 뒤 두 태블릿 모두 이 규칙을 끄므로(0) 고정 시험 프로필로 지킨다(다시 켤 때 깨져 있지 않게). 같은 장면을 Y700·갤럭시로도
// 돌려 손바닥 시간(500ms) 뒤로는 모두 통과함을 본다.
// DOM 없이: Element·Node 는 가짜(instanceof·closest 만), 손가락은 모두 필기 영역 밖(contains false — 보기·다음 문제·머리 줄 자리).
// (node --test 는 파일마다 따로 돌아 이 전역은 다른 시험에 새지 않음)
import { test } from "node:test";
import assert from "node:assert/strict";

class FakeEl {
  constructor(attrs = {}) { this.attrs = attrs; }
  // InkInput 은 [data-ink-palm-safe]·[data-ink-guard-free] 를 closest 로 찾는다 — attrs 에 있으면 이 요소
  closest(sel) {
    const m = /^\[([a-z-]+)\]$/.exec(sel);
    return m && this.attrs[m[1]] ? this : null;
  }
}
globalThis.Element = FakeEl;
globalThis.Node = FakeEl;
const { InkInput } = await import("../../src/ink/InkInput.js");
const { GALAXY, Y700 } = await import("../../src/ink/geometry.js");

// 고정 시험 프로필: GUARD = 갤럭시 + 펜 뒤 손 막기 1000ms·겹침 막기(ink-tablet 시험과 같음),
// OLD_Y700 = 옛 Y700 처음 값(GUARD + 손바닥 700ms — 11/15 전 Y700)
const GUARD = Object.freeze({ ...GALAXY, id: "t-guard", HAND_TAP_AFTER_PEN_MS: 1000, PEN_OVERLAP_BLOCK: 1 });
const OLD_Y700 = Object.freeze({ ...GUARD, id: "t-old-y700", PALM_MS: 700 });
const PROFILES = [OLD_Y700, GUARD, Y700, GALAXY];
const each = (scene) => PROFILES.map((p) => scene(p));

const GUARD_FREE = { "data-ink-guard-free": 1 }; // 질문 메모 창·펜 시험 단추 줄
const PALM_SAFE = { "data-ink-palm-safe": 1 }; // 머리 줄·도구 막대

function setup(prof) {
  const events = [];
  const el = { getBoundingClientRect: () => ({ left: 0, top: 0 }), contains: () => false, setPointerCapture() {} };
  const store = { getSnapshot: () => ({ tool: "pen", color: "#ff4d4f", key: "k", hidden: false }), setBusy() {}, addStroke: () => true };
  const ink = new InkInput(el, store, { livePath: () => null, profile: () => prof, onEvent: (type, d) => events.push([type, d]) });
  return { ink, events };
}
const pe = (type, pointerType, t, o = {}) => ({
  type, pointerType, pointerId: o.id ?? (pointerType === "pen" ? 9 : 1), isPrimary: o.isPrimary ?? true, button: 0,
  buttons: o.buttons ?? (type === "pointerup" ? 0 : 1), width: o.w ?? 1, height: o.h ?? 1, clientX: 500, clientY: 900, timeStamp: t,
  target: new FakeEl(o.attrs), defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
});

// 손가락 click 하나를 창 리스너에 넣고 결과: "통과" | "막힘(why)". 막았으면 'click-blocked'(type touch) 알림이 꼭 하나
function clickResult(ink, events, t) {
  const c = { type: "click", pointerType: "touch", timeStamp: t, target: new FakeEl(), defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
  ink.onWinClick(c);
  const whys = events.filter(([k]) => k === "click-blocked").map(([, d]) => (d.type === "touch" ? d.why : `${d.type}:${d.why}`));
  return `${c.defaultPrevented ? "막힘" : "통과"}${whys.length ? `(${whys.join(",")})` : ""}`;
}

// 펜 콕(1000 누름 · 1050 뗌) → [hoverAt: 펜을 띄워 움직임] → 뗀 뒤 after ms 에 손가락 누름 → 40ms 뒤 뗌 → 5ms 뒤 click
// grow: 손가락이 닿은 뒤 접촉이 커짐(손바닥이 눕는 중 — 크기 px)
function afterPen(prof, after, { attrs, hoverAt, grow } = {}) {
  const { ink, events } = setup(prof);
  ink.onWinDown(pe("pointerdown", "pen", 1000));
  ink.onWinUp(pe("pointerup", "pen", 1050));
  if (hoverAt != null) ink.onWinMove(pe("pointermove", "pen", hoverAt, { buttons: 0 }));
  const t = 1050 + after;
  ink.onWinDown(pe("pointerdown", "touch", t, { attrs }));
  if (grow) ink.onWinMove(pe("pointermove", "touch", t + 20, { attrs, w: grow, h: grow }));
  ink.onWinUp(pe("pointerup", "touch", t + 40, { attrs }));
  return clickResult(ink, events, t + 45);
}

// 펜 없이 손가락(영역 밖)이 먼저 닿아 있고 → 펜이 닿음(호버 없음) → 손가락을 뗌 → click
function overlap(prof, attrs) {
  const { ink, events } = setup(prof);
  ink.onWinDown(pe("pointerdown", "touch", 5000, { id: 3, attrs }));
  ink.onWinDown(pe("pointerdown", "pen", 5100));
  ink.onWinUp(pe("pointerup", "touch", 5200, { id: 3, attrs }));
  return clickResult(ink, events, 5205);
}

test("고정 시험 프로필은 프로필과 같은 열쇠(오타면 값이 안 쓰임) · 차례 = [옛 Y700 처음 값, GUARD, Y700, 갤럭시]", () => {
  for (const p of [GUARD, OLD_Y700]) assert.deepEqual(Object.keys(p).sort(), Object.keys(GALAXY).sort(), p.id);
  assert.deepEqual(PROFILES.map((p) => [p.PALM_MS, p.HAND_TAP_AFTER_PEN_MS, p.PEN_OVERLAP_BLOCK]), [[700, 1000, 1], [500, 1000, 1], [500, 0, 0], [500, 0, 0]]);
});

test("펜 뒤 손가락 click: 손바닥 시간 안은 palm, 그 뒤 HAND_TAP_AFTER_PEN_MS 안은 pen-guard, 지나면 통과 — Y700·갤럭시는 손바닥 500ms 뒤로 모두 통과", () => {
  assert.deepEqual(each((p) => afterPen(p, 400)), ["막힘(palm)", "막힘(palm)", "막힘(palm)", "막힘(palm)"]);
  assert.deepEqual(each((p) => afterPen(p, 600)), ["막힘(palm)", "막힘(pen-guard)", "통과", "통과"]);
  assert.deepEqual(each((p) => afterPen(p, 850)), ["막힘(pen-guard)", "막힘(pen-guard)", "통과", "통과"]);
  assert.deepEqual(each((p) => afterPen(p, 999)), ["막힘(pen-guard)", "막힘(pen-guard)", "통과", "통과"]);
  assert.deepEqual(each((p) => afterPen(p, 1000)), ["통과", "통과", "통과", "통과"], "손가락이 닿은 때로 셈(1000ms 는 지남)");
  assert.deepEqual(each((p) => afterPen(p, 1100)), ["통과", "통과", "통과", "통과"]);
});

test("펜 뒤 손 막기는 마지막 펜 뗌·호버 중 늦은 것부터 셈: 뗀 뒤 1300ms 라도 호버 뒤 850ms 면 pen-guard", () => {
  assert.deepEqual(each((p) => afterPen(p, 1300, { hoverAt: 1500 })), ["막힘(pen-guard)", "막힘(pen-guard)", "통과", "통과"]);
  assert.deepEqual(each((p) => afterPen(p, 1300)), ["통과", "통과", "통과", "통과"], "호버가 없으면 뗀 때부터");
});

test("[data-ink-guard-free](질문 메모 창 등)는 펜 뒤 손 막기만 빼고 손바닥은 그대로, 머리 줄([data-ink-palm-safe])은 둘 다 짧게(150ms)", () => {
  assert.deepEqual(each((p) => afterPen(p, 850, { attrs: GUARD_FREE })), ["통과", "통과", "통과", "통과"]);
  assert.deepEqual(each((p) => afterPen(p, 400, { attrs: GUARD_FREE })), ["막힘(palm)", "막힘(palm)", "막힘(palm)", "막힘(palm)"]);
  assert.deepEqual(each((p) => afterPen(p, 850, { attrs: PALM_SAFE })), ["통과", "통과", "통과", "통과"]);
  assert.deepEqual(each((p) => afterPen(p, 400, { attrs: PALM_SAFE })), ["통과", "통과", "통과", "통과"]);
  assert.deepEqual(each((p) => afterPen(p, 100, { attrs: PALM_SAFE })), ["막힘(palm)", "막힘(palm)", "막힘(palm)", "막힘(palm)"]);
});

test("펜 뒤 손 막기로 막힌 손가락도 닿은 뒤 접촉이 커지면 손바닥(why palm)으로 바로잡음", () => {
  assert.deepEqual(each((p) => afterPen(p, 850, { grow: 50 })), ["막힘(palm)", "막힘(palm)", "막힘(palm)", "막힘(palm)"]);
});

test("겹침: 손가락이 먼저 닿아 있는데 펜이 닿으면 pen-overlap — 머리 줄에서 시작한 손은 빼고, Y700·갤럭시는 막지 않음", () => {
  assert.deepEqual(each((p) => overlap(p)), ["막힘(pen-overlap)", "막힘(pen-overlap)", "통과", "통과"]);
  assert.deepEqual(each((p) => overlap(p, PALM_SAFE)), ["통과", "통과", "통과", "통과"]);
});
