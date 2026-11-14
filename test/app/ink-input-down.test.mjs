// InkInput.onDown 의 알림(D4 — 펜 시험 '펜 누른 곳'): 첫머리 'down', 일찍 돌아가는 곳 'down-skip'(why). 동작은 그대로인지도 본다.
// DOM 없이: Element 는 가짜(instanceof 만), 영역·보관소도 가짜. (node --test 는 파일마다 따로 돌아 이 전역은 다른 시험에 새지 않음)
import { test } from "node:test";
import assert from "node:assert/strict";

class FakeEl {
  constructor(hit = null) { this.hit = hit; }
  // InkInput 은 INTERACTIVE(입력칸·단추…)와 [data-ink-blank] 를 closest 로 찾는다 — hit 이 "interactive" 면 앞의 것만 이 요소
  closest(sel) { return this.hit === "interactive" && sel.startsWith("input, textarea") ? this : null; }
}
globalThis.Element = FakeEl;
const { InkInput } = await import("../../src/ink/InkInput.js");
const { GALAXY, Y700 } = await import("../../src/ink/geometry.js");

function setup({ withEvents = true, prof = GALAXY } = {}) {
  const events = [];
  const el = { getBoundingClientRect: () => ({ left: 0, top: 0 }), contains: () => true, setPointerCapture() {} };
  const store = { getSnapshot: () => ({ tool: "pen", color: "#ff4d4f", key: "k", hidden: false }), setBusy() {}, addStroke: () => true };
  const hooks = { livePath: () => null, profile: () => prof };
  if (withEvents) hooks.onEvent = (type, d) => events.push([type, d]);
  return { ink: new InkInput(el, store, hooks), events };
}
const ev = (pointerType, o = {}) => ({
  pointerType, pointerId: o.id ?? 1, isPrimary: true, button: o.button ?? 0, buttons: o.buttons ?? 1, pressure: 0.5, width: 1, height: 1,
  clientX: 10, clientY: 10, timeStamp: o.t ?? 100, target: new FakeEl(o.hit ?? null), defaultPrevented: false,
  preventDefault() { this.defaultPrevented = true; },
});

test("펜·마우스·손가락 누름: 첫머리에 'down'(종류) 하나, 동작은 그대로(펜·마우스는 긋기 시작, 손가락은 손가락 처리)", () => {
  for (const type of ["pen", "mouse"]) {
    const { ink, events } = setup();
    const e = ev(type);
    ink.onDown(e);
    assert.deepEqual(events, [["down", { type }]]);
    assert.equal(ink.active?.type, type, `${type}: 긋기 시작`);
    assert.equal(e.defaultPrevented, true);
  }
  const { ink, events } = setup();
  ink.onDown(ev("touch", { id: 5 }));
  assert.deepEqual(events, [["down", { type: "touch" }]]);
  assert.equal(ink.active, null);
  assert.ok(ink.touches.has(5), "손가락은 손가락 기록으로");
});

test("일찍 돌아가는 곳마다 'down-skip'(why: button·interactive·busy) — 긋기를 시작하지 않고 기본 동작도 막지 않음(그대로)", () => {
  {
    const { ink, events } = setup();
    const e = ev("mouse", { button: 2 });
    ink.onDown(e);
    assert.deepEqual(events, [["down", { type: "mouse" }], ["down-skip", { type: "mouse", why: "button" }]]);
    assert.equal(ink.active, null);
    assert.equal(e.defaultPrevented, false);
  }
  for (const type of ["pen", "mouse"]) {
    const { ink, events } = setup();
    const e = ev(type, { hit: "interactive" });
    ink.onDown(e);
    assert.deepEqual(events, [["down", { type }], ["down-skip", { type, why: "interactive" }]]);
    assert.equal(ink.active, null);
    assert.equal(e.defaultPrevented, false, "단추·입력칸은 원래 동작");
  }
  {
    const { ink, events } = setup({ prof: Y700 });
    ink.onDown(ev("pen", { id: 1 }));
    const pen = ink.active;
    const e = ev("mouse", { id: 2 });
    ink.onDown(e);
    assert.deepEqual(events, [["down", { type: "pen" }], ["down", { type: "mouse" }], ["down-skip", { type: "mouse", why: "busy" }]]);
    assert.equal(ink.active, pen, "펜으로 긋는 중은 그대로");
    assert.equal(e.defaultPrevented, false);
  }
});

test("같은 펜이 떼기 없이 다시 누름(떼기 놓침): 'down' 다음 앞 누름의 'cancel'(missed-up) — 건너뜀 아님, 새 누름으로 긋기", () => {
  const { ink, events } = setup();
  ink.onDown(ev("pen", { t: 100 }));
  const first = ink.active;
  ink.onDown(ev("pen", { t: 300 }));
  assert.deepEqual(events.map(([t, d]) => [t, d.why ?? null]), [["down", null], ["down", null], ["cancel", "missed-up"]]);
  assert.notEqual(ink.active, first);
  assert.equal(ink.active.t0, 300);
});

test("onEvent 를 넘기지 않은 화면(풀기 화면)은 알림 없이 똑같이 움직임", () => {
  const a = setup({ withEvents: false });
  const b = setup();
  for (const s of [a, b]) {
    s.ink.onDown(ev("pen", { id: 1, t: 100 }));
    s.ink.onDown(ev("mouse", { id: 2, t: 120 }));
    s.ink.onDown(ev("mouse", { id: 3, t: 140, button: 2 }));
  }
  assert.equal(a.ink.active.type, "pen");
  assert.equal(a.ink.active.t0, b.ink.active.t0);
  assert.deepEqual(a.ink.lastDown, b.ink.lastDown);
  assert.equal(b.events.length, 5);
});
