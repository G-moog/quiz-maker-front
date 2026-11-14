// '필기 모드' 단추 길게 누르기(ink/longPress) 상태 기계 시험 — 가짜 창(EventTarget)·가짜 시각·mock 타이머.
// React 의 onContextMenu 는 MouseEvent 꼴이라 pointerType 이 nativeEvent 에만 있다 — 그 꼴({ nativeEvent: { pointerType } })로도 부른다
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { GALAXY, Y700 } from "../../src/ink/geometry.js";
import { LONG_PRESS_VETO_MS, LongPress } from "../../src/ink/longPress.js";

function setup(prof = () => GALAXY) {
  let t = 1000;
  const win = new EventTarget();
  const reg = new Set(); // 실제로 붙어 있는 (종류, 함수, 캡처)
  const key = (type, fn, o) => [type, fn, !!(o === true || o?.capture)];
  const find = (k) => [...reg].find((x) => x[0] === k[0] && x[1] === k[1] && x[2] === k[2]);
  const add = win.addEventListener.bind(win);
  const rem = win.removeEventListener.bind(win);
  win.addEventListener = (type, fn, o) => { const k = key(type, fn, o); if (!find(k)) reg.add(k); add(type, fn, o); };
  win.removeEventListener = (type, fn, o) => { const f = find(key(type, fn, o)); if (f) reg.delete(f); rem(type, fn, o); };
  const lp = new LongPress({ win, now: () => t, prof });
  const log = [];
  const open = () => log.push("OPEN");
  const ev = (type, o = {}) => win.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), o));
  const click = (detail = 1) => { const e = Object.assign(new Event("click", { cancelable: true }), { detail }); win.dispatchEvent(e); return e.defaultPrevented ? "swallowed" : "passed"; };
  const advance = (ms) => { t += ms; mock.timers.tick(ms); };
  const down = (o = {}) => lp.down({ isPrimary: true, pointerType: "touch", pointerId: 1, button: 0, clientX: 50, clientY: 20, width: 20, height: 20, ...o }, open);
  return { lp, log, open, ev, click, advance, down, live: () => reg.size };
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

test("거부: 움직임(10px)·둘째 손가락·펜 다가옴·손바닥 크기·막힌 touchstart — 거부 뒤 3초는 contextmenu 로도 안 열림", () => {
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
    s.down({ width: 71, height: 30 });
    s.advance(600);
    assert.deepEqual(s.log, [], "갤럭시 손바닥 두 배(70) 넘음");
    s.down({ width: 60, height: 30 });
    s.ev("pointermove", { pointerId: 1, pointerType: "touch", clientX: 50, clientY: 20, width: 75, height: 40 });
    s.advance(600);
    assert.deepEqual(s.log, [], "누르는 중 커짐");
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
