import { useEffect, useState } from "react";
import { GALAXY } from "./geometry.js";

// '필기 모드' 단추 길게 누르기 → 태블릿 고르기 창. 짧게 누르기·Enter·Space 는 단추의 click(켜고 끄기) 그대로.
//  - 손가락·펜·마우스 왼쪽으로 LONG_PRESS_MS 누름(타이머), 또는 contextmenu(안드로이드 길게 누름·오른쪽 단추·메뉴 키·Shift+F10)로 연다.
//  - 길게 누른 뒤 따라오는 click 하나를 창(window) 캡처에서 삼킨다 — 손가락을 떼면 click 이 '손 밑에 새로 생긴' 창의 선택지로 가므로
//    (헤드리스 실험) 단추의 onClick 에서만 막으면 안 된다. 자판 click(detail 0)은 삼키지 않는다.
//  - 손바닥·두 손가락 스크롤·펜이 다가옴·움직임이면 누름을 '거부'한다. 거부 뒤 LONG_PRESS_VETO_MS 동안은 안드로이드가 뒤늦게 보내는
//    길게 누름 contextmenu 로도 열지 않는다(새로 누르면 바로 풂).
//  - 창 리스너는 누르는 동안·삼키는 동안에만 붙는다(필기 모드를 끈 화면에 창 리스너를 남기지 않음).
// 여는 함수(open)는 누를 때마다 넘긴다 — 인스턴스가 콜백·ref 를 들고 있지 않게(react-hooks/refs 규칙)
export const LONG_PRESS_MS = 500;
export const LONG_PRESS_MOVE_PX = 10; // 손가락·마우스: 이만큼 움직이면 거부. 펜은 max(이 값, 프로필 PEN_BLANK_TAP_SLOP)
export const LONG_PRESS_CLICK_MS = 300; // 뗀 뒤 이만큼 안의 click 하나를 삼킨다(크롬이 click 을 보내면 바로 옴)
export const LONG_PRESS_SWALLOW_MAX_MS = 5000; // 떼기를 못 받아도 이만큼 뒤에는 삼키기를 끝낸다
export const LONG_PRESS_VETO_MS = 3000;

const CAP = { capture: true, passive: true };
// click 삼키기는 preventDefault 를 하므로 passive 아님. 불 값 true 대신 객체로 — Node 의 EventTarget 은 removeEventListener(…, true) 를
// 캡처로 보지 않아(단위 시험에서 리스너가 안 떨어짐) 늘 객체를 쓴다
const CLICK_CAP = { capture: true };
const WIN_TYPES = ["pointerdown", "pointermove", "pointerup", "pointercancel"];
// React 합성 이벤트면 원래 이벤트(React 의 onContextMenu 는 MouseEvent 꼴이라 pointerType 이 없다)
const nat = (e) => e?.nativeEvent || e;
const contactOf = (e) => Math.max(Number.isFinite(e.width) ? e.width : 0, Number.isFinite(e.height) ? e.height : 0);

export class LongPress {
  // win·now·ms 는 시험용. prof: 지금 태블릿 값 묶음(손바닥 크기·펜 미끄러짐 한도)
  constructor({ win = globalThis.window, now = () => performance.now(), ms = LONG_PRESS_MS, prof = () => GALAXY } = {}) {
    this.win = win;
    this.now = now;
    this.ms = ms;
    this.prof = prof;
    this.press = null; // { id, type, x, y, move, palmPx, fired }
    this.open = null;
    this.timer = 0;
    this.vetoUntil = 0;
    this.swallowing = false;
    this.swallowEnd = 0;
    this.swallowTimer = 0;
    for (const k of ["down", "onWin", "touchStart", "contextMenu", "fire", "onSwallow", "disarm"]) this[k] = this[k].bind(this);
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
    const palmPx = 2 * prof.PALM_CONTACT_PX;
    if (ev.pointerType === "touch" && contactOf(ev) > palmPx) {
      this.veto(); // 손바닥만큼 큰 접촉(머리 줄은 크기를 보지 않으므로 넉넉히 두 배)
      return;
    }
    this.open = open;
    this.press = {
      id: ev.pointerId, type: ev.pointerType, x: ev.clientX, y: ev.clientY, fired: false, palmPx,
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
        if (!p.fired && (Math.hypot(e.clientX - p.x, e.clientY - p.y) >= p.move || (p.type === "touch" && contactOf(e) > p.palmPx))) this.veto();
        return;
      }
      if (e.type === "pointerup" || e.type === "pointercancel") this.end();
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
    this.open?.();
  }

  // 뗌·취소·창 초점 잃음
  end() {
    const fired = !!this.press?.fired;
    this.cancel();
    if (!fired) return;
    this.arm(LONG_PRESS_CLICK_MS);
    // click 이 오지 않는 경우(안드로이드): 뗀 뒤 새로 누르면(창의 선택지를 빨리 콕) 바로 삼키기를 끝낸다
    this.win.addEventListener("pointerdown", this.disarm, CAP);
  }

  arm(ms) {
    if (!this.swallowing) {
      this.win.addEventListener("click", this.onSwallow, CLICK_CAP);
      this.swallowing = true;
    }
    this.swallowEnd = this.now() + ms;
    clearTimeout(this.swallowTimer);
    this.swallowTimer = setTimeout(this.disarm, ms + 50);
  }

  onSwallow(e) {
    if (this.now() > this.swallowEnd) {
      this.disarm();
      return;
    }
    if (e.detail === 0) return; // 자판(Enter·Space) click 은 그대로
    e.preventDefault();
    e.stopPropagation();
    this.disarm();
  }

  disarm() {
    this.win.removeEventListener("click", this.onSwallow, CLICK_CAP);
    this.win.removeEventListener("pointerdown", this.disarm, CAP);
    clearTimeout(this.swallowTimer);
    this.swallowTimer = 0;
    this.swallowing = false;
  }

  cancel() {
    clearTimeout(this.timer);
    this.timer = 0;
    for (const t of WIN_TYPES) this.win.removeEventListener(t, this.onWin, CAP);
    this.win.removeEventListener("blur", this.onWin);
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
