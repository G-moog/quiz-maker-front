// '필기 모드' 단추 길게 누르기(ink/longPress) 상태 기계 시험 — 가짜 창(EventTarget)·가짜 시각·mock 타이머.
// React 의 onContextMenu 는 MouseEvent 꼴이라 pointerType 이 nativeEvent 에만 있다 — 그 꼴({ nativeEvent: { pointerType } })로도 부른다
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { GALAXY, Y700 } from "../../src/ink/geometry.js";
import { LONG_PRESS_BOUNCE_MS, LONG_PRESS_CLICK_MS, LONG_PRESS_VETO_MS, LongPress } from "../../src/ink/longPress.js";

function setup(prof = () => GALAXY) {
  let t = 1000;
  const win = new EventTarget();
  const reg = new Set(); // 실제로 붙어 있는 (종류, 함수, 캡처, 옵션)
  const key = (type, fn, o) => [type, fn, !!(o === true || o?.capture), o];
  const find = (k) => [...reg].find((x) => x[0] === k[0] && x[1] === k[1] && x[2] === k[2]);
  const add = win.addEventListener.bind(win);
  const rem = win.removeEventListener.bind(win);
  win.addEventListener = (type, fn, o) => { const k = key(type, fn, o); if (!find(k)) reg.add(k); add(type, fn, o); };
  win.removeEventListener = (type, fn, o) => { const f = find(key(type, fn, o)); if (f) reg.delete(f); rem(type, fn, o); };
  const lp = new LongPress({ win, now: () => t, prof });
  const log = [];
  const open = () => log.push("OPEN");
  const ev = (type, o = {}) => { const e = Object.assign(new Event(type, { cancelable: true }), o); win.dispatchEvent(e); return e; };
  const click = (detail = 1) => { const e = Object.assign(new Event("click", { cancelable: true }), { detail }); win.dispatchEvent(e); return e.defaultPrevented ? "swallowed" : "passed"; };
  // 뗄 때 크롬이 보내는 호환 mousedown — 초점을 옮기는 기본 동작이 막혔나
  const mousedown = (detail = 1) => (ev("mousedown", { detail }).defaultPrevented ? "kept" : "moved");
  const advance = (ms) => { t += ms; mock.timers.tick(ms); };
  const down = (o = {}) => lp.down({ isPrimary: true, pointerType: "touch", pointerId: 1, button: 0, clientX: 50, clientY: 20, width: 20, height: 20, ...o }, open);
  const of = (type) => [...reg].filter((x) => x[0] === type);
  return { lp, win, log, open, ev, click, mousedown, advance, down, live: () => reg.size, of };
}
const react = (pointerType) => ({ preventDefault() { this.prevented = true; }, prevented: false, nativeEvent: { pointerType } });

test("500ms 에 한 번(499 는 아님), 뗀 뒤 click 하나만 삼킴, 창 리스너는 끝나면 0", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const s = setup();
    s.down();
    s.advance(499);
    assert.deepEqual(s.log, []);
    s.advance(1);
    assert.deepEqual(s.log, ["OPEN"]);
    s.advance(300);
    s.ev("pointerup", { pointerId: 1, pointerType: "touch" });
    assert.equal(s.click(), "swallowed");
    assert.equal(s.click(), "passed", "두 번째 click 은 통과");
    assert.equal(s.live(), 0);
  } finally { mock.timers.reset(); }
});

test("거부: 움직임(10px)·둘째 손가락·펜 다가옴·막힌 touchstart·isPrimary 아님 — 거부 뒤 3초는 contextmenu 로도 안 열림", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const s = setup();
    s.down();
    s.ev("pointermove", { pointerId: 1, pointerType: "touch", clientX: 59, clientY: 20 });
    s.advance(600);
    assert.deepEqual(s.log, ["OPEN"], "9px 는 유지");
    s.ev("pointerup", { pointerId: 1, pointerType: "touch" }); s.click(); s.log.length = 0;

    s.down();
    s.ev("pointermove", { pointerId: 1, pointerType: "touch", clientX: 60, clientY: 20 });
    s.advance(600);
    assert.deepEqual(s.log, [], "10px 는 거부");
    const e1 = react("touch");
    s.lp.contextMenu(e1, s.open);
    assert.ok(e1.prevented);
    assert.deepEqual(s.log, [], "거부 뒤 안드로이드 contextmenu");
    s.lp.contextMenu(react("mouse"), s.open);
    assert.deepEqual(s.log, [], "거부 3초 안에는 메뉴 키도 안 열림");
    s.advance(LONG_PRESS_VETO_MS);
    s.lp.contextMenu(react("mouse"), s.open);
    assert.deepEqual(s.log, ["OPEN"], "3초 뒤 메뉴 키");
    s.log.length = 0;

    s.down();
    s.ev("pointerdown", { pointerId: 2, pointerType: "touch" });
    s.advance(600);
    assert.deepEqual(s.log, [], "둘째 손가락");
    s.down();
    s.ev("pointermove", { pointerId: 9, pointerType: "pen", buttons: 0 });
    s.advance(600);
    assert.deepEqual(s.log, [], "펜 호버");
    s.down();
    s.lp.touchStart({ nativeEvent: { defaultPrevented: true } });
    s.advance(600);
    assert.deepEqual(s.log, [], "필기 손바닥 무시가 막은 touchstart");
    s.down({ isPrimary: false });
    s.advance(600);
    assert.deepEqual(s.log, [], "둘째 손가락이 단추에서 시작");
    s.advance(LONG_PRESS_VETO_MS);
    assert.equal(s.live(), 0);
  } finally { mock.timers.reset(); }
});

test("펜·마우스 누름: 손(손바닥)·막힌 touchstart 는 무시, 펜 한도는 max(10, PEN_BLANK_TAP_SLOP), 오른쪽 단추는 contextmenu 로만", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const s = setup();
    s.down({ pointerType: "pen", width: 1, height: 1 });
    s.ev("pointerdown", { pointerId: 3, pointerType: "touch" });
    s.lp.touchStart({ nativeEvent: { defaultPrevented: true } });
    s.ev("pointermove", { pointerId: 1, pointerType: "pen", clientX: 61, clientY: 20 });
    s.advance(600);
    assert.deepEqual(s.log, ["OPEN"], "11px 미끄러짐 유지(펜 한도 12)");
    s.ev("pointerup", { pointerId: 1, pointerType: "pen" }); s.click(); s.log.length = 0;
    s.down({ pointerType: "pen" });
    s.ev("pointermove", { pointerId: 1, pointerType: "pen", clientX: 62, clientY: 20 });
    s.advance(600);
    assert.deepEqual(s.log, [], "12px 는 거부");
    s.advance(LONG_PRESS_VETO_MS);
    const y = setup(() => ({ ...Y700, PEN_BLANK_TAP_SLOP: 14 }));
    y.down({ pointerType: "pen" });
    y.ev("pointermove", { pointerId: 1, pointerType: "pen", clientX: 63, clientY: 20 });
    y.advance(600);
    assert.deepEqual(y.log, ["OPEN"], "프로필 한도를 따름(14)");
    y.ev("pointerup", { pointerId: 1, pointerType: "pen" }); y.click();
    s.down({ pointerType: "mouse", button: 2 });
    s.advance(600);
    assert.deepEqual(s.log, [], "오른쪽 단추는 누름 시작 안 함");
    s.lp.contextMenu(react("mouse"), s.open);
    assert.deepEqual(s.log, ["OPEN"], "오른쪽 단추 contextmenu");
    s.log.length = 0;
    s.lp.contextMenu(react("touch"), s.open);
    s.lp.contextMenu({ preventDefault() {}, pointerType: "pen" }, s.open);
    assert.deepEqual(s.log, [], "누름 없는 손가락·펜 contextmenu(React 꼴·네이티브 꼴)는 안 열림");
    assert.equal(s.live(), 0);
  } finally { mock.timers.reset(); }
});

test("안드로이드(누르는 중 contextmenu, 뗀 뒤 click 없음): 한 번만 열고, 새 누름이 삼키기를 끝냄; 자판 click·300ms·5초", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const s = setup();
    s.down();
    s.advance(420);
    s.lp.contextMenu(react("touch"), s.open);
    assert.deepEqual(s.log, ["OPEN"]);
    s.advance(200);
    assert.deepEqual(s.log, ["OPEN"], "타이머로 두 번째 없음");
    s.ev("pointerup", { pointerId: 1, pointerType: "touch" });
    s.advance(100);
    s.ev("pointerdown", { pointerId: 5, pointerType: "touch" });
    assert.equal(s.click(), "passed", "새 누름 뒤 click 은 통과(창의 선택지를 바로 고름)");
    s.down();
    s.advance(500);
    s.ev("pointerup", { pointerId: 1, pointerType: "touch" });
    assert.equal(s.click(0), "passed", "자판 click(detail 0)은 늘 통과");
    s.advance(301);
    assert.equal(s.click(), "passed", "뗀 뒤 300ms 넘으면 통과");
    s.down();
    s.advance(500);
    s.advance(5001);
    assert.equal(s.click(), "passed", "떼기를 못 받아도 5초 뒤 통과");
    s.ev("blur");
    s.lp.destroy();
    assert.equal(s.live(), 0, "destroy 뒤 창 리스너 0");
  } finally { mock.timers.reset(); }
});

test("접촉 크기는 보지 않음(머리 줄 단추): 누를 때 큰 접촉·누르는 중 커져도 열림 — 갤럭시·Y700", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    for (const [name, prof] of [["galaxy", () => GALAXY], ["y700", () => Y700]]) {
      const s = setup(prof);
      for (const [w, h] of [[71, 30], [90, 90]]) {
        s.down({ width: w, height: h });
        s.advance(500);
        assert.deepEqual(s.log, ["OPEN"], `${name} 누를 때 ${w}×${h}`);
        s.ev("pointerup", { pointerId: 1, pointerType: "touch" }); s.click(); s.log.length = 0;
      }
      s.down({ width: 30, height: 30 });
      s.ev("pointermove", { pointerId: 1, pointerType: "touch", clientX: 50, clientY: 20, width: 120, height: 90 });
      s.advance(500);
      assert.deepEqual(s.log, ["OPEN"], `${name} 누르는 중 커짐`);
      s.ev("pointerup", { pointerId: 1, pointerType: "touch" }); s.click();
      s.lp.contextMenu(react("mouse"), s.open);
      assert.deepEqual(s.log, ["OPEN", "OPEN"], "거부 기록 없음(메뉴 키 바로 열림)");
      assert.equal(s.live(), 0);
    }
  } finally { mock.timers.reset(); }
});

test("촉 튐(펜·touch 로 오는 펜): 꾹 → 뗌 → 20ms 튐 down/up → 그 click 삼킴(호환 mousedown 도 초점 그대로), 그 뒤 선택지 콕은 통과", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    for (const type of ["pen", "touch"]) {
      for (const optionAt of [400, 150]) { // 선택지 콕: 삼키기가 다 끝난 뒤 / 튐을 기다리는 동안(뗀 뒤 150ms, 먼 자리)
        const s = setup(() => Y700);
        s.down({ pointerType: type, pointerId: 7, clientX: 700, clientY: 26, width: 1, height: 1 });
        s.advance(600);
        assert.deepEqual(s.log, ["OPEN"]);
        s.ev("pointerup", { pointerId: 7, pointerType: type, clientX: 700, clientY: 26 }); // 뗌(안드로이드: 길게 누른 뒤라 click 없음)
        s.advance(20);
        const id = type === "touch" ? 8 : 7; // touch 로 오는 펜은 튐마다 새 pointerId
        s.ev("pointerdown", { pointerId: id, pointerType: type, clientX: 703, clientY: 30 }); // 튐: 5px 옆에 다시 닿음(덮개 위)
        assert.equal(s.mousedown(), "kept", `${type}: 튐의 호환 mousedown 은 초점을 옮기지 않음`);
        s.advance(15);
        s.ev("pointerup", { pointerId: id, pointerType: type, clientX: 703, clientY: 30 });
        assert.equal(s.click(), "swallowed", `${type}: 튐의 click 은 삼킴(창이 열리자마자 닫히지 않게)`);
        s.advance(optionAt - 35);
        s.ev("pointerdown", { pointerId: 9, pointerType: type, clientX: 400, clientY: 300 }); // 창의 선택지를 콕
        assert.equal(s.mousedown(), "moved", `${type}: 선택지 누름은 초점이 옮겨 감`);
        assert.equal(s.click(), "passed", `${type}: 그 뒤(${optionAt}ms) 선택지 콕은 통과`);
        s.advance(LONG_PRESS_CLICK_MS + 100);
        assert.equal(s.live(), 0, "끝나면 창 리스너 0");
      }
    }
  } finally { mock.timers.reset(); }
});

test("튐이 아닌 새 누름은 바로 삼키기 끝(늦음·멂·다른 종류), 튐 자리 한도는 max(12, PEN_BLANK_TAP_SLOP), 뗄 때 click 이 와도 이어진 튐까지 삼킴", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const run = (second, prof = () => Y700) => {
      const s = setup(prof);
      s.down({ pointerType: "pen", pointerId: 7, clientX: 700, clientY: 26 });
      s.advance(600);
      s.ev("pointerup", { pointerId: 7, pointerType: "pen", clientX: 700, clientY: 26 });
      s.advance(second.after);
      s.ev("pointerdown", { pointerId: 7, pointerType: second.type || "pen", clientX: 700, clientY: 26 + (second.dy || 0) });
      const r = s.click();
      s.lp.destroy();
      return r;
    };
    assert.equal(run({ after: 20 }), "swallowed", "같은 자리 20ms = 튐");
    assert.equal(run({ after: LONG_PRESS_BOUNCE_MS }), "swallowed", "120ms 까지 튐");
    assert.equal(run({ after: LONG_PRESS_BOUNCE_MS + 1 }), "passed", "뗀 자리라도 120ms 넘으면 새 누름");
    assert.equal(run({ after: 20, dy: 12 }), "swallowed", "12px 안");
    assert.equal(run({ after: 20, dy: 13 }), "passed", "13px 떨어지면 새 누름(한도 12)");
    assert.equal(run({ after: 20, dy: 13 }, () => ({ ...Y700, PEN_BLANK_TAP_SLOP: 16 })), "swallowed", "프로필 PEN_BLANK_TAP_SLOP 16 이면 16px 까지");
    assert.equal(run({ after: 20, type: "touch" }), "passed", "다른 종류(펜 뒤 손가락)는 튐 아님");

    // 뗄 때 click 이 오는 경우(데스크톱, 안드로이드 '길게 누르기 시간'을 늘린 경우): 그 click 을 삼킨 뒤 이어 온 튐의 click 도 삼킨다
    const s = setup(() => Y700);
    s.down({ pointerType: "pen", pointerId: 7, clientX: 700, clientY: 26 });
    s.advance(600);
    s.ev("pointerup", { pointerId: 7, pointerType: "pen", clientX: 700, clientY: 26 });
    assert.equal(s.click(), "swallowed", "뗌의 click");
    s.advance(20);
    s.ev("pointerdown", { pointerId: 7, pointerType: "pen", clientX: 701, clientY: 27 });
    s.advance(10);
    s.ev("pointerup", { pointerId: 7, pointerType: "pen", clientX: 701, clientY: 27 });
    assert.equal(s.click(), "swallowed", "이어 온 튐의 click");
    s.advance(200);
    assert.equal(s.click(), "passed", "그 뒤 click 은 통과");
    s.advance(LONG_PRESS_CLICK_MS);
    assert.equal(s.live(), 0);
  } finally { mock.timers.reset(); }
});

test("창이 열린 뒤 뗄 때까지만 창 touchmove 를 막음(capture·passive 아님) — 열리기 전·거부·뗌·취소·destroy 뒤에는 없음", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const s = setup();
    s.down();
    assert.equal(s.of("touchmove").length, 0, "열리기 전에는 없음(단추에서 끌어 스크롤은 그대로)");
    assert.equal(s.ev("touchmove").defaultPrevented, false);
    s.advance(500);
    const tm = s.of("touchmove");
    assert.equal(tm.length, 1, "열린 뒤 하나");
    assert.deepEqual([tm[0][3].capture, tm[0][3].passive], [true, false]);
    assert.equal(s.ev("touchmove").defaultPrevented, true, "누르던 손가락을 끌어도 뒤 페이지가 스크롤되지 않게");
    const nc = new Event("touchmove", { cancelable: false });
    let called = 0;
    nc.preventDefault = () => { called++; };
    s.win.dispatchEvent(nc);
    assert.equal(called, 0, "취소할 수 없는 touchmove(스크롤이 이미 시작됨)는 건드리지 않음");
    s.ev("pointerup", { pointerId: 1, pointerType: "touch" });
    assert.equal(s.of("touchmove").length, 0, "뗀 뒤 0");
    assert.equal(s.ev("touchmove").defaultPrevented, false);
    s.click();
    s.down();
    s.advance(500);
    assert.equal(s.of("touchmove").length, 1);
    s.ev("pointercancel", { pointerId: 1, pointerType: "touch" });
    assert.equal(s.of("touchmove").length, 0, "pointercancel 뒤 0");
    s.down();
    s.advance(500);
    s.lp.destroy();
    assert.equal(s.of("touchmove").length, 0, "destroy 뒤 0");
    s.down();
    s.ev("pointermove", { pointerId: 1, pointerType: "touch", clientX: 70, clientY: 20 });
    s.advance(600);
    assert.equal(s.of("touchmove").length, 0, "거부된 누름에는 붙지 않음");
    s.advance(LONG_PRESS_VETO_MS);
    assert.equal(s.live(), 0);
  } finally { mock.timers.reset(); }
});

test("삼키는 동안만 mousedown 의 초점 옮기기를 막음(손가락 꾹을 뗄 때 크롬의 호환 mousedown) — 열리기 전·자판·삼킨 뒤·300ms 뒤는 그대로", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const s = setup();
    s.down();
    assert.equal(s.mousedown(), "moved", "열리기 전");
    s.advance(500);
    s.ev("pointerup", { pointerId: 1, pointerType: "touch", clientX: 50, clientY: 20 });
    assert.equal(s.mousedown(0), "moved", "detail 0 은 그대로");
    assert.equal(s.mousedown(), "kept", "뗀 뒤 호환 mousedown → 창이 준 초점 그대로");
    assert.equal(s.click(), "swallowed");
    assert.equal(s.mousedown(), "moved", "click 을 삼킨 뒤에는 그대로");
    s.advance(LONG_PRESS_CLICK_MS + 100);
    s.down();
    s.advance(500);
    s.ev("pointerup", { pointerId: 1, pointerType: "touch", clientX: 50, clientY: 20 });
    s.advance(LONG_PRESS_CLICK_MS + 1);
    assert.equal(s.mousedown(), "moved", "300ms 지나면 그대로");
    s.advance(100);
    assert.equal(s.live(), 0);
  } finally { mock.timers.reset(); }
});
