import { useEffect, useState } from "react";
import { GALAXY } from "./geometry.js";

// '필기 모드' 단추 길게 누르기 → 태블릿 고르기 창. 짧게 누르기·Enter·Space 는 단추의 click(켜고 끄기) 그대로.
//  - 손가락·펜·마우스 왼쪽으로 LONG_PRESS_MS 누름(타이머), 또는 contextmenu(안드로이드 길게 누름·오른쪽 단추·메뉴 키·Shift+F10)로 연다.
//  - 길게 누른 뒤 따라오는 click 하나를 창(window) 캡처에서 삼킨다 — 손가락을 떼면 click 이 '손 밑에 새로 생긴' 창의 선택지로 가므로
//    (헤드리스 실험) 단추의 onClick 에서만 막으면 안 된다. 자판 click(detail 0)은 삼키지 않는다.
//    삼키는 동안은 그 click 앞의 mousedown 도 기본 동작(초점 옮기기)을 막는다 — 손가락을 뗄 때 크롬이 보내는 호환 mousedown 이
//    덮개(초점 안 받음)에 떨어져 창이 준 초점(지금 고른 것)이 body 로 가지 않게.
//    뗄 때 촉이 튀어(뗀 자리에 같은 종류의 누름이 곧바로 다시 옴 — LONG_PRESS_BOUNCE_MS·뗀 자리 max(12, PEN_BLANK_TAP_SLOP)px 안)
//    생긴 click 도 삼킨다(창이 열리자마자 닫히지 않게). 멀거나 늦은 누름(창의 선택지를 바로 누름)이면 삼키기를 바로 끝낸다.
//  - 필기 모드의 손바닥 무시가 막은 누름·둘째 손가락(두 손가락 스크롤)·펜이 다가옴·움직임이면 누름을 '거부'한다. 거부 뒤 LONG_PRESS_VETO_MS
//    동안은 안드로이드가 뒤늦게 보내는 길게 누름 contextmenu 로도 열지 않는다(새로 누르면 바로 풂).
//    접촉 크기는 보지 않는다 — 머리 줄 단추라 손바닥이 닿기 어렵고, 기기마다 크기 단위가 달라 손가락 꾹이 늘 거부될 수 있다
//    (InkInput 도 머리 줄에서는 크기를 보지 않는다)
//  - 창이 열린 뒤 누르던 손가락을 끌어도 뒤 페이지가 스크롤되지 않게 뗄 때까지 창 touchmove 를 막는다(열리기 전에는 막지 않음 —
//    단추에서 끌어 스크롤하는 것은 그대로).
//  - 창 리스너는 누르는 동안·삼키는 동안에만 붙는다(필기 모드를 끈 화면에 창 리스너를 남기지 않음). 창을 연 뒤 떼기(pointerup·pointercancel)를
//    LONG_PRESS_SWALLOW_MAX_MS 안에 못 받으면 떼기를 놓친 것으로 보고 누름도 끝낸다 — touchmove 막기가 남아 페이지 스크롤이 죽지 않게.
// 여는 함수(open)는 누를 때마다 넘긴다 — 인스턴스가 콜백·ref 를 들고 있지 않게(react-hooks/refs 규칙)
export const LONG_PRESS_MS = 500;
export const LONG_PRESS_MOVE_PX = 10; // 손가락·마우스: 이만큼 움직이면 거부. 펜은 max(이 값, 프로필 PEN_BLANK_TAP_SLOP)
export const LONG_PRESS_CLICK_MS = 300; // 뗀 뒤 이만큼 안의 click 하나를 삼킨다(크롬이 click 을 보내면 바로 옴)
export const LONG_PRESS_SWALLOW_MAX_MS = 5000; // 떼기를 못 받아도 이만큼 뒤에는 삼키기·touchmove 막기를 끝낸다(누름도 끝냄)
export const LONG_PRESS_VETO_MS = 3000;
export const LONG_PRESS_BOUNCE_MS = 120; // 창을 연 누름을 뗀 뒤 이 안에 뗀 자리로 다시 온 같은 종류의 누름 = 촉 튐
export const LONG_PRESS_BOUNCE_PX = 12; // 촉 튐 자리 한도: max(이 값, 프로필 PEN_BLANK_TAP_SLOP)

const CAP = { capture: true, passive: true };
// click·mousedown 삼키기는 preventDefault 를 하므로 passive 아님. 불 값 true 대신 객체로 — Node 의 EventTarget 은 removeEventListener(…, true) 를
// 캡처로 보지 않아(단위 시험에서 리스너가 안 떨어짐) 늘 객체를 쓴다
const CLICK_CAP = { capture: true };
// 창이 열린 뒤 touchmove 막기(preventDefault — passive 아님). 붙이고 뗄 때 같은 객체
const TOUCH_BLOCK = { capture: true, passive: false };
const WIN_TYPES = ["pointerdown", "pointermove", "pointerup", "pointercancel"];
// React 합성 이벤트면 원래 이벤트(React 의 onContextMenu 는 MouseEvent 꼴이라 pointerType 이 없다)
const nat = (e) => e?.nativeEvent || e;

export class LongPress {
  // win·now·ms 는 시험용. prof: 지금 태블릿 값 묶음(펜 미끄러짐 한도·촉 튐 자리 한도)
  constructor({ win = globalThis.window, now = () => performance.now(), ms = LONG_PRESS_MS, prof = () => GALAXY } = {}) {
    this.win = win;
    this.now = now;
    this.ms = ms;
    this.prof = prof;
    this.press = null; // { id, type, x, y, move, fired }
    this.open = null;
    this.timer = 0;
    this.vetoUntil = 0;
    this.swallowing = false;
    this.swallowEnd = 0;
    this.swallowTimer = 0;
    this.holdTimer = 0; // 창을 연 누름의 떼기를 기다리는 한도(LONG_PRESS_SWALLOW_MAX_MS) — 삼키기 타이머와 따로(click 을 삼켜도 그대로)
    this.lastUp = null; // 창을 연 누름을 뗀 자리·때 { type, x, y, t } — 촉 튐 판정
    for (const k of ["down", "onWin", "touchStart", "contextMenu", "fire", "onSwallow", "onMouseDown", "onRepress", "onTouchMove", "expire", "disarm"]) this[k] = this[k].bind(this);
  }

  // 단추 onPointerDown(e, 여는 함수)
  down(e, open) {
    this.cancel();
    this.vetoUntil = 0;
    const ev = nat(e);
    if (!ev.isPrimary) {
      this.veto(); // 둘째 손가락이 단추에 — 두 손가락 스크롤의 시작
      return;
    }
    if (ev.pointerType === "mouse" && ev.button !== 0) return; // 오른쪽 단추는 contextmenu 로
    const prof = this.prof() || GALAXY;
    this.open = open;
    this.press = {
      id: ev.pointerId, type: ev.pointerType, x: ev.clientX, y: ev.clientY, fired: false,
      move: ev.pointerType === "pen" ? Math.max(LONG_PRESS_MOVE_PX, prof.PEN_BLANK_TAP_SLOP) : LONG_PRESS_MOVE_PX,
    };
    this.timer = setTimeout(this.fire, this.ms);
    for (const t of WIN_TYPES) this.win.addEventListener(t, this.onWin, CAP);
    this.win.addEventListener("blur", this.onWin);
  }

  // 누르는 동안만 붙는 창 리스너
  onWin(e) {
    const p = this.press;
    if (!p) return;
    if (e.type === "blur") {
      this.end();
      return;
    }
    if (e.pointerId === p.id) {
      if (e.type === "pointermove") {
        if (!p.fired && Math.hypot(e.clientX - p.x, e.clientY - p.y) >= p.move) this.veto();
        return;
      }
      if (e.type === "pointerup" || e.type === "pointercancel") this.end(e);
      return;
    }
    // 다른 포인터(창이 열리기 전에만): 손가락으로 누르는 중 → 둘째 손가락이 닿거나 펜이 다가오면(호버·닿음) 거부.
    // 펜·마우스로 누르는 중 → 손(손바닥)은 무시, 다른 펜·마우스가 눌리면 거부
    if (p.fired) return;
    if (p.type === "touch" ? e.type === "pointerdown" || e.pointerType === "pen" : e.type === "pointerdown" && e.pointerType !== "touch") this.veto();
  }

  veto() {
    this.cancel();
    this.vetoUntil = this.now() + LONG_PRESS_VETO_MS;
  }

  // 단추 onTouchStart — 필기 모드의 손바닥 무시(InkInput.onWinTouch, 창 캡처)가 이미 막은 손가락 누름이면 거부
  touchStart(e) {
    if (this.press?.type === "touch" && nat(e).defaultPrevented) this.veto();
  }

  // 단추 onContextMenu(e, 여는 함수) — 늘 preventDefault(글 고르기·메뉴 막기)
  contextMenu(e, open) {
    e.preventDefault();
    const p = this.press;
    if (p) {
      if (!p.fired) this.fire();
      return;
    }
    // 누름 없이 온 손가락·펜의 길게 누름 = 거부했거나 시작하지 않은 누름 — 열지 않는다(자판·오른쪽 단추는 "mouse")
    const pt = nat(e).pointerType;
    if (this.now() < this.vetoUntil || pt === "touch" || pt === "pen") return;
    open?.();
  }

  fire() {
    const p = this.press;
    if (!p || p.fired) return;
    p.fired = true;
    clearTimeout(this.timer);
    this.arm(LONG_PRESS_SWALLOW_MAX_MS);
    // 창이 열린 뒤 누르던 손가락을 끌면 덮개 뒤 페이지가 스크롤된다(이 터치의 touch-action 은 머리 줄 것) — 뗄 때까지 막는다.
    // 떼기를 못 받으면 같은 한도에 expire 가 누름을 끝낸다(삼키기 타이머와 따로 — 떼기 없이 온 click 을 삼켜 삼키기가 먼저 끝나도)
    this.win.addEventListener("touchmove", this.onTouchMove, TOUCH_BLOCK);
    this.holdTimer = setTimeout(this.expire, LONG_PRESS_SWALLOW_MAX_MS + 50);
    this.open?.();
  }

  onTouchMove(e) {
    if (e.cancelable) e.preventDefault();
  }

  // 뗌·취소(e: 그 pointerup·pointercancel)·창 초점 잃음(e 없음)
  end(e) {
    const p = this.press;
    const fired = !!p?.fired;
    this.cancel();
    if (!fired) return;
    // 뗀 자리·때(촉 튐 판정). 초점을 잃어 끝난 것은 뗀 자리가 없다 — 다음 누름에 바로 삼키기를 끝냄
    this.lastUp = e && Number.isFinite(e.clientX) && Number.isFinite(e.clientY) ? { type: p.type, x: e.clientX, y: e.clientY, t: this.now() } : null;
    this.arm(LONG_PRESS_CLICK_MS);
    // click 이 오지 않는 경우(안드로이드): 뗀 뒤 새로 누르면(창의 선택지를 빨리 콕) 바로 삼키기를 끝낸다 — 촉 튐이면 이어서 삼킴
    this.win.addEventListener("pointerdown", this.onRepress, CAP);
  }

  // 뗀 뒤 새 누름(창 캡처 — 대상의 리스너보다 먼저): 같은 종류이고 뗀 자리 가까이에서 곧바로 왔으면 촉 튐 — 삼키기를 풀지 않고
  // 그때부터 LONG_PRESS_CLICK_MS 더 삼켜 튐의 click 까지 삼킨다. pointerId 는 보지 않는다(펜이 touch 로 오는 기기는 튐마다 새 id).
  // 멀거나 늦은 누름은 바로 끝낸다(안드로이드는 길게 누른 뒤 click 이 없어 다음 click 이 창의 선택지를 고른 것)
  onRepress(e) {
    const u = this.lastUp;
    if (u && e.pointerType === u.type && this.now() - u.t <= LONG_PRESS_BOUNCE_MS
      && Math.hypot(e.clientX - u.x, e.clientY - u.y) <= Math.max(LONG_PRESS_BOUNCE_PX, (this.prof() || GALAXY).PEN_BLANK_TAP_SLOP)) {
      this.arm(LONG_PRESS_CLICK_MS);
      return;
    }
    this.disarm();
  }

  arm(ms) {
    if (!this.swallowing) {
      this.win.addEventListener("click", this.onSwallow, CLICK_CAP);
      this.win.addEventListener("mousedown", this.onMouseDown, CLICK_CAP);
      this.swallowing = true;
    }
    this.swallowEnd = this.now() + ms;
    clearTimeout(this.swallowTimer);
    this.swallowTimer = setTimeout(this.disarm, ms + 50);
  }

  // 창을 연 누름의 떼기를 LONG_PRESS_SWALLOW_MAX_MS 안에 못 받음 — 떼기를 놓친 것으로 보고 누름을 끝낸다. 창 touchmove 막기·누름 리스너가
  // 다음 꾹·창 초점 잃음까지 남아 필기 모드를 끈 화면의 한 손가락 스크롤까지 막지 않게(삼키기는 제 타이머로 끝남)
  expire() {
    if (this.press?.fired) this.cancel();
  }

  // 삼킬 click 앞의 mousedown: 초점이 옮겨 가지 않게(손가락을 떼면 크롬이 호환 mousedown 을 덮개에 보내 초점이 body 로 감)
  onMouseDown(e) {
    if (this.now() > this.swallowEnd || e.detail === 0) return;
    e.preventDefault();
  }

  onSwallow(e) {
    if (this.now() > this.swallowEnd) {
      this.disarm();
      return;
    }
    if (e.detail === 0) return; // 자판(Enter·Space) click 은 그대로
    e.preventDefault();
    e.stopPropagation();
    // 하나만 삼킨다. 다만 뗀 직후(촉 튐을 기다리는 동안)면 새 누름 지켜보기는 남긴다 — 뗄 때 click 이 오고 이어서 튐이 와도 삼키게
    const u = this.lastUp;
    if (u && this.now() - u.t <= LONG_PRESS_BOUNCE_MS) this.stopSwallow();
    else this.disarm();
  }

  stopSwallow() {
    this.win.removeEventListener("click", this.onSwallow, CLICK_CAP);
    this.win.removeEventListener("mousedown", this.onMouseDown, CLICK_CAP);
    this.swallowing = false;
  }

  disarm() {
    this.stopSwallow();
    this.win.removeEventListener("pointerdown", this.onRepress, CAP);
    clearTimeout(this.swallowTimer);
    this.swallowTimer = 0;
    this.lastUp = null;
  }

  cancel() {
    clearTimeout(this.timer);
    this.timer = 0;
    clearTimeout(this.holdTimer);
    this.holdTimer = 0;
    for (const t of WIN_TYPES) this.win.removeEventListener(t, this.onWin, CAP);
    this.win.removeEventListener("blur", this.onWin);
    this.win.removeEventListener("touchmove", this.onTouchMove, TOUCH_BLOCK);
    this.press = null;
  }

  // 언마운트(StrictMode 의 두 번 마운트에도 다시 쓸 수 있게 — 상태만 비움)
  destroy() {
    this.cancel();
    this.disarm();
    this.vetoUntil = 0;
  }
}

// 컴포넌트마다 하나. 언마운트 때 타이머·창 리스너 정리
export function useLongPress(prof) {
  const [lp] = useState(() => new LongPress({ prof }));
  useEffect(() => () => lp.destroy(), [lp]);
  return lp;
}
