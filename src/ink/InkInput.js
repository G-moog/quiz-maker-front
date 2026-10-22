import {
  DRAW_SCALE, ERASER_RADIUS, HL_COLOR, HL_OPACITY, HL_WIDTH, INERTIA_MAX, INERTIA_START, INERTIA_STOP, OUTSIDE_JOIN_MS, OUTSIDE_STILL_PX,
  PEN_WIDTH, PREDICT_HOLD_MS, TAP_MS, TAP_SLOP, TOUCH_SLOP, addPoint, centerlinePath, distance, flingVelocity,
  inertiaStep, isDoubleTap, isLargeContact, isTap, midpoint, outlinePath, outsideJoinable, palmBlocked, predictTail,
  pushSample, releaseVelocity, strokeTouches, tapBlockedByScroll, tapSlop,
} from "./geometry.js";

// 필기 모드의 입력 처리(DOM). 필기 영역 요소에 붙어 펜·손·마우스를 가른다.
//  펜(S펜)  : 긋기 = 필기, 빈칸 두 번 콕 = 정답 보이기/가리기(한 번 콕은 아무 일 없음, 콕은 점을 남기지 않음).
//             빈칸 위 콕은 촉이 PEN_BLANK_TAP_SLOP 만큼 미끄러져도 콕(TAP_MS 안). 브라우저가 입력을 가져가도(취소) 그은 선은 남긴다
//  손가락   : 하나로 끌기 = 아무 일 없음(손바닥 대비), 빈칸 한 번 터치 = 지금처럼 토글(브라우저 click 그대로),
//             둘로 밀기 = 페이지 스크롤(하나를 먼저 떼면 남은 손가락으로 이어 감 — 혼자 미끄러지지 않음, 다 떼면 관성), 벌리기(확대)는
//             영역의 touch-action: none 이 막는다. 손가락 하나는 글 위, 하나는 카드 밖(여백·머리 줄)이어도 거의 함께 닿았으면 두 손가락 스크롤.
//             관성·스크롤을 멈추려고 친 터치(관성 중, 끝난 뒤 SCROLL_TAP_GUARD_MS 안, 페이지가 움직이는 중)는 빈칸을 열지 않는다
//  마우스   : 왼쪽 끌기 = 필기, 움직이지 않은 클릭 = 빈칸 토글
//  손바닥 무시: 펜이 닿아 있는 동안(영역에서 긋는 중이면 가만히 대고 있어도), 펜 호버(에어뷰)·펜을 뗀 뒤 PALM_MS 동안
//             손 입력(스크롤·클릭)을 받지 않는다. 접촉이 손바닥만큼 크면(PALM_CONTACT_PX) 펜이 없어도 뗄 때까지 무시.
//             영역 밖(카드 여백·화면 가장자리)에 닿은 손바닥이 브라우저 스크롤을 일으키지 않게 창의 touch 이벤트도 막는다.
//             머리 줄·도구 막대([data-ink-palm-safe])는 펜이 닿아 있거나 막 뗀 때만 막는다(펜을 든 손으로 단추를 누를 수 있게 —
//             접촉 크기도 보지 않는다: 크기 문턱이 기기와 맞지 않아도 단추는 눌리게)
// 이 리스너들은 필기 모드를 켰을 때만 붙는다(InkSurface) — 끄면 앱은 예전 그대로
// hooks: { onBlankTap(i), onEvent(type, detail), livePath(kind) } — livePath 는 그리는 중인 선을 그릴 <path>
// 펜 시험 페이지가 onEvent 로 무슨 일이 있었는지 센다('stroke' 에는 그 선의 입력 값: 움직임·점 수·예측 점·입력 → 그림 시간).
// 그리는 중인 선: 점은 getCoalescedEvents 로 빠짐없이 모으고, 그림은 rAF 한 번에 path 의 d 만 바꾼다(React 를 거치지 않음).
// 브라우저가 예측 점(getPredictedEvents)을 주면 그리는 선 끝에만 잠깐 붙인다(저장하지 않음 — geometry.predictTail)

// 입력칸·(빈칸이 아닌) 단추 위에서 누르면 필기를 시작하지 않고 원래 동작(포커스·클릭)을 하게 둔다
const INTERACTIVE = "input, textarea, select, a[href], label, [contenteditable]:not([contenteditable='false']), button:not([data-ink-blank])";
// 선을 긋기 시작하면 초점을 빼 줄 입력칸(화면 자판이 내려가 글을 가리지 않게 — 필기 모드를 끄고 글을 누를 때와 같다)
const TEXT_INPUT = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

// 손바닥이 닿기 어려운 곳(머리 줄·도구 막대·안내 띠): 손바닥 무시를 짧게
const isPalmSafe = (target) => target instanceof Element && !!target.closest("[data-ink-palm-safe]");

const now = () => performance.now();
// 이벤트 시각: 실제 입력은 이벤트 시각, 시각이 0 인 이벤트(옛 브라우저)는 지금
const timeOf = (e) => (e.timeStamp > 0 ? e.timeStamp : now());

export class InkInput {
  constructor(el, store, hooks) {
    this.el = el;
    this.store = store;
    this.hooks = hooks;
    // penActiveAt: 이 영역에서 펜으로 긋는 중이면 그 펜의 마지막 입력 시각(손바닥 막기 — geometry.palmBlocked)
    // lastPenAir: 펜이 공중에 떠 있다는 마지막 신호(buttons 0 인 펜 움직임)
    this.palm = { penDown: false, lastPenDown: -Infinity, lastPenHover: -Infinity, lastPenUp: -Infinity, penActiveAt: null, lastPenAir: -Infinity };
    this.palmTouches = new Set(); // 손바닥으로 본 손가락(touch identifier) — 뗄 때까지 브라우저 스크롤을 막는다
    this.penTouches = new Set(); // 펜이 함께 보낸 touch(identifier) — 손바닥으로 보지 않는다
    this.lastPenAt = null; // 마지막 펜 pointerdown 자리·때 { x, y, t }
    this.touches = new Map(); // 영역에서 시작한 손가락들(+ 두 손가락 스크롤에 함께 센 영역 밖 손가락 — outside)
    this.outsidePending = new Map(); // 영역 밖에 먼저 닿아 아직 움직이지 않은 손가락 { x0, y0, x, y, at, moved } — 영역 손가락이 오면 함께 센다
    this.gesture = null; // 두 손가락 스크롤 중
    this.active = null; // 펜·마우스로 누르고 있는 것(하나만)
    this.lastTap = null; // 펜 콕(두 번 콕 판정용)
    this.touchClick = null; // 마지막 손가락이 빈칸을 열어도 되는 '한 번 터치'였나 { ok, at }
    this.touchDownBlocked = false; // 마지막 손가락이 손바닥 무시 중·관성 멈춤으로 닿았나(영역 밖 포함 — 그 click 을 막음)
    this.blockMouseClick = false; // 마우스로 선을 그은 뒤 따라오는 click 은 빈칸을 열지 않게
    this.lastDown = { type: "", at: -Infinity };
    this.scrollEndAt = -Infinity; // 두 손가락 스크롤·관성이 끝난(멈춘) 때
    this.scrollAt = -Infinity; // 마지막 scroll 이벤트(페이지가 움직이는 중인가)
    this.eraseGroup = 0;
    this.inertiaRaf = 0;
    this.inertia = null;
    this.liveRaf = 0;
    this.predTimer = 0;
    for (const k of ["onDown", "onMove", "onUp", "onCancel", "onClick", "onBlockDefault",
      "onWinDown", "onWinMove", "onWinUp", "onWinClick", "onWinTouch", "onWinBlur", "onVisibility", "onWinScroll",
      "stopInertia", "stepInertia", "drawLive", "dropPrediction"]) {
      this[k] = this[k].bind(this);
    }
  }

  attach() {
    const el = this.el;
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointercancel", this.onCancel);
    el.addEventListener("click", this.onClick, true);
    // 길게 누르기 메뉴·글 고르기·그림 끌기 막기
    el.addEventListener("contextmenu", this.onBlockDefault);
    el.addEventListener("selectstart", this.onBlockDefault);
    el.addEventListener("dragstart", this.onBlockDefault);
    // 펜이 어디에 있든(호버 포함) 손바닥 무시에 쓰고, 새 터치·휠이 오면 관성을 멈춘다
    const opt = { capture: true, passive: true };
    window.addEventListener("pointerdown", this.onWinDown, opt);
    window.addEventListener("pointermove", this.onWinMove, opt);
    window.addEventListener("pointerup", this.onWinUp, opt);
    window.addEventListener("pointercancel", this.onWinUp, opt);
    window.addEventListener("click", this.onWinClick, true);
    window.addEventListener("wheel", this.stopInertia, { passive: true });
    window.addEventListener("scroll", this.onWinScroll, { passive: true });
    // 손바닥의 브라우저 스크롤 막기(preventDefault 를 써야 하므로 passive 아님 — 필기 모드일 때만 붙는다)
    const touchOpt = { capture: true, passive: false };
    for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"]) window.addEventListener(type, this.onWinTouch, touchOpt);
    // 펜 떼기를 놓친 채 앱이 가려지거나 창이 초점을 잃으면 '펜이 닿아 있음'을 푼다
    window.addEventListener("blur", this.onWinBlur);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  detach() {
    const el = this.el;
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerup", this.onUp);
    el.removeEventListener("pointercancel", this.onCancel);
    el.removeEventListener("click", this.onClick, true);
    el.removeEventListener("contextmenu", this.onBlockDefault);
    el.removeEventListener("selectstart", this.onBlockDefault);
    el.removeEventListener("dragstart", this.onBlockDefault);
    const opt = { capture: true, passive: true };
    window.removeEventListener("pointerdown", this.onWinDown, opt);
    window.removeEventListener("pointermove", this.onWinMove, opt);
    window.removeEventListener("pointerup", this.onWinUp, opt);
    window.removeEventListener("pointercancel", this.onWinUp, opt);
    window.removeEventListener("click", this.onWinClick, true);
    window.removeEventListener("wheel", this.stopInertia, { passive: true });
    window.removeEventListener("scroll", this.onWinScroll, { passive: true });
    const touchOpt = { capture: true, passive: false };
    for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"]) window.removeEventListener(type, this.onWinTouch, touchOpt);
    window.removeEventListener("blur", this.onWinBlur);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.palmTouches.clear();
    this.penTouches.clear();
    this.outsidePending.clear();
    this.stopInertia();
    // 긋던 선은 살리고(모드를 끄거나 영역이 사라지는 순간) 저장 미루기를 푼다
    if (this.active) this.salvage(this.active, "detach");
    this.clearLive();
  }

  emit(type, detail) {
    this.hooks.onEvent?.(type, detail);
  }

  // ── 창 전체: 펜이 있는 곳 · 손바닥 무시 ──
  onWinDown(e) {
    const t = timeOf(e);
    // 관성으로 미끄러지는 중에 닿은 것은 '멈추는 터치' — 그 click 은 어디서든(빈칸·단추) 막는다(브라우저 기본 스크롤과 같게)
    const gliding = !!this.inertia;
    this.stopInertia();
    if (e.pointerType === "pen") {
      this.palm.penDown = true;
      this.palm.lastPenDown = t;
      this.lastPenAt = { x: e.clientX, y: e.clientY, t };
      this.ignoreTouches(t);
    } else if (e.pointerType === "touch") {
      const safe = isPalmSafe(e.target);
      const large = !safe && isLargeContact(e.width, e.height);
      this.touchDownBlocked = palmBlocked(this.palm, t, safe) || large || gliding;
      const inside = e.target instanceof Node && this.el.contains(e.target);
      if (gliding) this.emit("scroll-stop-tap", { where: inside ? "area" : "outside" });
      if (!inside) this.outsideDown(e, t);
    }
  }

  // 영역 밖에 닿은 손가락(카드 여백·보기·머리 줄): 손가락 하나는 글 위, 하나는 밖에 닿은 두 손가락 스크롤도 되게 한다.
  // 영역에 손가락이 하나라도 닿아 있으면 브라우저는 스크롤하지 않으므로(두 손가락의 touch-action 교집합 = none) 여기서 함께 센다 —
  // 영역 손가락과 거의 함께(OUTSIDE_JOIN_MS 안) 닿은 것만(가장자리에 얹어 둔 엄지는 세지 않음, geometry.outsideJoinable).
  // 영역 밖 손가락이 먼저면 잠깐 기다렸다가, 그동안 영역 손가락이 오면 함께 센다(touchDown)
  outsideDown(e, t) {
    if (e.isPrimary) this.outsidePending.clear(); // 첫 손가락: 떼기를 놓쳐 남은 기록은 버린다
    const live = this.liveTouches();
    if (live.length) {
      if (live.some((x) => !x.outside && t - x.at <= OUTSIDE_JOIN_MS)) this.touchDown(e, t, true);
      return;
    }
    if (isLargeContact(e.width, e.height) || palmBlocked(this.palm, t)) return;
    this.outsidePending.set(e.pointerId, { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, at: t, moved: false });
  }

  onWinMove(e) {
    if (e.pointerType === "touch") {
      // 닿은 뒤 커진 접촉(손바닥이 눕는 중)의 click 도 막는다
      if (!this.touchDownBlocked && !isPalmSafe(e.target) && isLargeContact(e.width, e.height)) this.touchDownBlocked = true;
      const p = this.outsidePending.get(e.pointerId);
      if (p) {
        p.x = e.clientX;
        p.y = e.clientY;
        if (distance(p.x0, p.y0, p.x, p.y) >= OUTSIDE_STILL_PX) p.moved = true;
      }
      // 함께 센 영역 밖 손가락은 영역 리스너가 받지 못하므로(포인터가 영역 밖 요소에 붙어 있음) 여기서
      if (this.touches.get(e.pointerId)?.outside) this.touchMove(e);
      return;
    }
    if (e.pointerType !== "pen") return;
    // 펜 호버(에어뷰: 닿지 않고 떠 있음)도, 긋는 중도 '펜이 화면 가까이 있음'
    this.palm.lastPenHover = timeOf(e);
    // 닿지 않고 떠 있다(buttons 0) = 떼기를 놓쳤어도 펜은 닿아 있지 않다(손바닥 판정만 — 긋던 선은 건드리지 않음)
    if (e.buttons === 0) {
      this.palm.lastPenAir = this.palm.lastPenHover;
      this.palm.penDown = false;
    }
    if (this.touches.size) this.ignoreTouches(this.palm.lastPenHover);
  }

  onWinUp(e) {
    // 영역 안에서 누르고 붙잡기 전에(콕만큼만 움직여) 영역 밖에서 뗀 것도 뗀 것으로
    const inside = e.target instanceof Node && this.el.contains(e.target);
    if (e.pointerType === "touch") this.outsidePending.delete(e.pointerId);
    if (!inside && this.active && this.active.id === e.pointerId) {
      if (e.type === "pointercancel") this.onCancel(e);
      else this.onUp(e);
    }
    if (!inside && e.pointerType === "touch" && this.touches.has(e.pointerId)) {
      if (e.type === "pointercancel") this.touchCancel(e, timeOf(e));
      else this.touchUp(e, timeOf(e));
    }
    if (e.pointerType !== "pen") return;
    this.palm.penDown = false;
    this.palm.lastPenUp = timeOf(e);
  }

  onWinScroll(e) {
    this.scrollAt = timeOf(e);
  }

  // 손바닥 무시 중(또는 관성을 멈추려고) 닿은 손가락의 click 은 영역 밖(다음 문제·도구 막대 등)에서도 막는다
  onWinClick(e) {
    if (this.clickType(e) === "touch" && this.touchDownBlocked) this.block(e, "touch", "palm");
  }

  // 손바닥 무시 중에 닿거나 움직인 손가락, 손바닥만큼 큰 접촉은 뗄 때까지 손바닥으로 보고 브라우저 스크롤(영역 밖은 touch-action 이 기본)을 막는다.
  // 펜으로 쓰는 중에 카드 여백·화면 가장자리에 닿은 손바닥이 페이지를 움직이면 그리던 선이 글에서 어긋난다
  onWinTouch(e) {
    const t = timeOf(e);
    const end = e.type === "touchend" || e.type === "touchcancel";
    let palm = false;
    for (const tc of e.changedTouches) {
      const id = tc.identifier;
      if (this.isPenTouch(tc, e.type, t)) {
        if (end) this.penTouches.delete(id);
        continue;
      }
      if (end) {
        if (this.palmTouches.delete(id)) palm = true;
        continue;
      }
      if (!this.palmTouches.has(id)) {
        const safe = isPalmSafe(tc.target);
        if (palmBlocked(this.palm, t, safe) || (!safe && isLargeContact(2 * (tc.radiusX || 0), 2 * (tc.radiusY || 0)))) this.palmTouches.add(id);
      }
      if (this.palmTouches.has(id)) palm = true;
    }
    if (palm && e.cancelable) e.preventDefault();
  }

  // 안드로이드 크롬은 펜에도 touch 이벤트를 함께 보낸다 — 펜 자신은 손바닥이 아니다(막으면 펜으로 입력칸·단추를 못 누름).
  // touchType 'stylus' 로 가리고, 모르는 브라우저는 펜 pointerdown 과 같은 자리·같은 때에 닿은 touch 로 가린다
  isPenTouch(tc, type, t) {
    if (tc.touchType === "stylus" || this.penTouches.has(tc.identifier)) return true;
    const p = this.lastPenAt;
    if (type !== "touchstart" || !p || t - p.t > 100 || Math.abs(tc.clientX - p.x) > 2 || Math.abs(tc.clientY - p.y) > 2) return false;
    this.penTouches.add(tc.identifier);
    return true;
  }

  // 창이 초점을 잃거나 앱이 가려지면 펜 떼기를 받지 못할 수 있다: '펜이 닿아 있음'을 풀고 긋던 선은 살린다
  onWinBlur() {
    this.palm.penDown = false;
    if (this.active) this.salvage(this.active, "blur");
  }

  onVisibility() {
    if (document.visibilityState !== "hidden") return;
    this.palm.penDown = false;
    if (this.active) this.salvage(this.active, "hidden");
  }

  // 펜이 오면 이미 닿아 있던 손가락(손바닥)은 더 받지 않는다 — 스크롤 중이면 그 자리에서 멈춤
  ignoreTouches(t) {
    let n = 0;
    for (const touch of this.touches.values()) {
      if (!touch.ignored) {
        touch.ignored = true;
        n += 1;
      }
    }
    if (this.gesture) this.endGesture(t, false);
    if (n) this.emit("palm", { n });
  }

  // ── 영역 ──
  onBlockDefault(e) {
    e.preventDefault();
  }

  onDown(e) {
    const t = timeOf(e);
    this.lastDown = { type: e.pointerType, at: t };
    this.blockMouseClick = false;
    if (e.pointerType === "touch") {
      this.touchDown(e, t);
      return;
    }
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const hit = e.target instanceof Element ? e.target.closest(INTERACTIVE) : null;
    if (hit && this.el.contains(hit)) return;
    if (this.active) {
      if (this.active.type !== e.pointerType) return; // 펜으로 긋는 중의 마우스 등
      // 같은 펜·마우스가 다시 눌렸다 = 앞 누름의 떼기를 놓쳤다. 앞에서 그은 선은 살린다
      this.salvage(this.active, "missed-up");
    }
    const blankEl = e.target instanceof Element ? e.target.closest("[data-ink-blank]") : null;
    const { tool, color } = this.store.getSnapshot();
    // 지우개: 도구 막대에서 고르거나, S펜 옆 단추를 누른 채(buttons 2 = 옆 단추, 32 = 지우개 끝)
    const eraser = tool === "eraser" || (e.pointerType === "pen" && (e.buttons & 34) !== 0);
    const p = this.local(e, this.el.getBoundingClientRect());
    this.active = {
      id: e.pointerId, type: e.pointerType, x0: e.clientX, y0: e.clientY, t0: t, far: 0, key: this.store.getSnapshot().key,
      blank: blankEl ? Number(blankEl.dataset.inkBlank) : null, eraser, last: p, shown: false, captured: false,
      slop: eraser ? TAP_SLOP : tapSlop(e.pointerType, !!blankEl),
      // 그리는 선 끝에 잠깐 붙일 예측 점(저장 안 함)과 펜 시험 페이지에 알릴 입력 값
      // (lagAt: 지연을 마지막으로 잰 입력의 시각 — 같은 입력을 두 번 세지 않게)
      pred: [], moveAt: t, moves: 0, samples: 0, predMoves: 0, predMax: 0, predAhead: 0, frames: 0, lagSum: 0, lagMax: 0, lagAt: null,
      stroke: eraser ? null : tool === "hl"
        ? { tool: "hl", color: HL_COLOR, w: HL_WIDTH, pts: [] }
        : { tool: "pen", color, w: PEN_WIDTH, pts: [] },
    };
    // 긋는 동안: 손바닥을 (펜을 가만히 대고 있어도) 막고, 저장을 미룬다
    if (e.pointerType === "pen") this.palm.penActiveAt = t;
    this.store.setBusy?.(true);
    if (eraser) this.eraseGroup += 1;
    else addPoint(this.active.stroke.pts, p.x, p.y, e.pointerType === "mouse" ? 0.5 : e.pressure);
    // 글 고르기·마우스 호환 이벤트 막기(click 은 그대로 온다). 포인터 붙잡기는 움직이기 시작할 때 —
    // 콕(클릭)일 때 붙잡으면 click 이 빈칸 대신 영역으로 가서 마우스 클릭으로 빈칸을 못 연다
    e.preventDefault();
  }

  onMove(e) {
    if (e.pointerType === "touch") {
      this.touchMove(e);
      return;
    }
    const a = this.active;
    if (!a || a.id !== e.pointerId) return;
    if (a.type === "pen") this.palm.penActiveAt = timeOf(e);
    // 영역 자리는 움직일 때마다 다시 잰다 — 긋는 중에 위쪽 글·그림이 바뀌어 영역이 밀려도 점이 글에 맞게(좌표는 영역 기준)
    const r = this.el.getBoundingClientRect();
    const list = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : null;
    const evs = list && list.length ? list : [e];
    a.moves += 1;
    a.samples += evs.length;
    a.moveAt = timeOf(e);
    for (const ev of evs) {
      a.far = Math.max(a.far, distance(a.x0, a.y0, ev.clientX, ev.clientY));
      if (a.far >= a.slop && !a.captured) {
        a.captured = true;
        try {
          this.el.setPointerCapture(e.pointerId); // 영역 밖으로 나가도 선이 이어지게
        } catch {
          // 합성 이벤트·이미 뗀 포인터
        }
      }
      const p = this.local(ev, r);
      if (a.eraser) {
        // 숨겨 둔 채 지우개를 쓰면 보이지 않는 선이 말없이 지워지므로, 이번 한 번은 다시 보이게만 하고 지우지 않는다
        if (a.far >= a.slop && this.reveal(a)) a.revealOnly = true;
        if (a.far >= a.slop && !a.revealOnly) this.eraseAlong(a.last, p);
        a.last = p;
      } else {
        addPoint(a.stroke.pts, p.x, p.y, a.type === "mouse" ? 0.5 : ev.pressure);
      }
    }
    if (a.eraser) return;
    this.predict(e, r, a);
    if (!a.shown && (a.far >= a.slop || (a.type === "pen" && timeOf(e) - a.t0 >= TAP_MS))) this.reveal(a);
    if (a.shown && !this.liveRaf) this.liveRaf = requestAnimationFrame(this.drawLive);
  }

  // 예측 점: 이번 움직임의 예측으로 바꾼다(없으면 비움). 새 움직임 없이 PREDICT_HOLD_MS 가 지나면 걷는다
  predict(e, r, a) {
    clearTimeout(this.predTimer);
    this.predTimer = 0;
    let list;
    try {
      list = typeof e.getPredictedEvents === "function" ? e.getPredictedEvents() : null;
    } catch {
      list = null; // 합성 이벤트 등
    }
    const last = a.stroke.pts[a.stroke.pts.length - 1];
    a.pred = list && list.length
      ? predictTail(last, list.map((ev) => ({ x: ev.clientX - r.left, y: ev.clientY - r.top, t: ev.timeStamp })), timeOf(e))
      : [];
    if (!a.pred.length) return;
    a.predMoves += 1;
    a.predMax = Math.max(a.predMax, list.length);
    const tip = a.pred[a.pred.length - 1];
    a.predAhead = Math.max(a.predAhead, distance(last[0], last[1], tip[0], tip[1]));
    this.predTimer = setTimeout(this.dropPrediction, PREDICT_HOLD_MS);
  }

  dropPrediction() {
    this.predTimer = 0;
    const a = this.active;
    if (!a || !a.pred?.length) return;
    a.pred = [];
    if (a.shown && !this.liveRaf) this.liveRaf = requestAnimationFrame(this.drawLive);
  }

  // 콕이 아니라 긋기(지우기)로 판정된 순간: 숨겨 둔 필기를 다시 보이게 하고, 입력칸 초점을 뺀다(화면 자판이 글을 가리지 않게).
  // 숨김을 풀었으면 true
  reveal(a) {
    if (a.shown) return false;
    a.shown = true;
    const ae = document.activeElement;
    if (ae instanceof HTMLElement && ae !== document.body && !this.el.contains(ae) && ae.matches(TEXT_INPUT)) ae.blur();
    if (!this.store.getSnapshot().hidden) return false;
    this.store.toggleHidden();
    return true;
  }

  onUp(e) {
    if (e.pointerType === "touch") {
      this.touchUp(e, timeOf(e));
      return;
    }
    const a = this.active;
    if (!a || a.id !== e.pointerId) return;
    const t = timeOf(e);
    this.release(a);
    a.far = Math.max(a.far, distance(a.x0, a.y0, e.clientX, e.clientY));
    if (isTap(a.far, t - a.t0, a.type, a.slop)) {
      // 콕: 점을 남기지 않는다. 펜은 빈칸 두 번 콕만 보고, 마우스는 뒤따르는 click 이 빈칸을 연다.
      // 지우개 콕은 닿은 선을 지운다 — 필기를 숨겨 둔 때는 지우지 않고 다시 보이게만
      this.clearLive();
      if (a.eraser) {
        if (this.store.getSnapshot().hidden) this.store.toggleHidden();
        else this.eraseAlong(a.last, a.last);
      }
      if (a.type === "pen") this.penTap(a, t);
      return;
    }
    this.lastTap = null;
    this.blockMouseClick = true;
    if (a.eraser) return;
    const p = this.local(e, this.el.getBoundingClientRect());
    // 떼는 순간의 힘은 표준상 0 — 마지막 점의 힘을 이어 쓴다(끝이 뭉툭하거나 가늘어지지 않게)
    const lastP = a.stroke.pts[a.stroke.pts.length - 1]?.[2] ?? 0.5;
    addPoint(a.stroke.pts, p.x, p.y, a.type === "mouse" ? 0.5 : e.pressure > 0 ? e.pressure : lastP);
    // 보관소가 바로 다음 그림(마이크로태스크)에 선을 그리므로 그리던 선을 지금 지워도 깜빡이지 않는다
    this.commitStroke(a);
    this.clearLive();
  }

  // 선 저장. 긋는 사이에 문항이 바뀌었으면(다른 문항에 붙지 않게) 버린다
  commitStroke(a, why) {
    const ok = this.store.getSnapshot().key === a.key && this.store.addStroke(a.stroke);
    this.emit(ok ? "stroke" : "stroke-dropped", {
      tool: a.stroke.tool, points: a.stroke.pts.length, type: a.type, why,
      ms: a.moveAt - a.t0, moves: a.moves, samples: a.samples, predMoves: a.predMoves, predMax: a.predMax,
      predAhead: Math.round(a.predAhead * 10) / 10, frames: a.frames,
      lagAvg: a.frames ? Math.round((a.lagSum / a.frames) * 10) / 10 : null, lagMax: Math.round(a.lagMax * 10) / 10,
    });
    return ok;
  }

  onCancel(e) {
    if (e.pointerType === "touch") {
      this.touchCancel(e, timeOf(e));
      return;
    }
    const a = this.active;
    if (!a || a.id !== e.pointerId) return;
    // 브라우저가 입력을 가져가도(시스템 제스처·알림창·회전·확인 창 등) 그때까지 그은 선은 남긴다
    this.salvage(a, "cancel");
  }

  // 누름이 끝났다(뗌·취소 등): 손바닥 막기의 '긋는 중'과 저장 미루기를 푼다
  release(a) {
    if (this.active === a) this.active = null;
    if (a.type === "pen") this.palm.penActiveAt = null;
    this.store.setBusy?.(false);
  }

  // 떼기 없이 끝난 누름(취소·떼기를 놓침·앱 가려짐·모드 끔): 콕보다 멀리 그은 선(점 2개 이상)은 저장하고, 아니면 버린다
  salvage(a, why) {
    this.release(a);
    this.lastTap = null;
    const keep = !a.eraser && !!a.stroke && a.far >= a.slop && a.stroke.pts.length >= 2 && this.commitStroke(a, why);
    this.clearLive();
    this.emit("cancel", { type: a.type, why, kept: keep });
  }

  penTap(a, t) {
    const tap = { blank: a.blank, downAt: a.t0, upAt: t };
    if (isDoubleTap(this.lastTap, tap)) {
      this.lastTap = null;
      this.hooks.onBlankTap?.(a.blank);
      this.emit("pen-double-tap", { blank: a.blank });
      return;
    }
    this.lastTap = tap.blank != null ? tap : null;
    this.emit("pen-tap", { blank: a.blank, moved: Math.round(a.far * 10) / 10 });
  }

  // 펜·마우스가 만든 click: 펜은 빈칸을 열지 않고(두 번 콕으로만), 마우스는 선을 그은 뒤면 막는다.
  // 손가락은 '한 번 터치'일 때만 그대로 둔다(끈 것·두 손가락·손바닥 무시 중·스크롤을 멈춘 터치면 막음)
  onClick(e) {
    const type = this.clickType(e);
    let block = false;
    if (type === "pen") {
      const hit = e.target instanceof Element ? e.target.closest(INTERACTIVE) : null;
      block = !(hit && this.el.contains(hit));
    } else if (type === "touch") {
      const tc = this.touchClick;
      block = !tc || !tc.ok || now() - tc.at > 1500;
      this.touchClick = null;
    } else if (type === "mouse") {
      block = this.blockMouseClick;
    }
    this.blockMouseClick = false;
    if (block) {
      this.block(e, type);
      return;
    }
    const blankEl = e.target instanceof Element ? e.target.closest("[data-ink-blank]") : null;
    if (blankEl) this.emit("blank-click", { type, blank: Number(blankEl.dataset.inkBlank) });
  }

  // click 의 입력 종류: 크롬의 click 은 PointerEvent(pointerType). 모르면 바로 앞 누름의 종류,
  // 키보드(Enter·Space)로 누른 click 은 ""(막지 않음)
  clickType(e) {
    if (typeof e.pointerType === "string") return e.pointerType;
    return now() - this.lastDown.at < 1000 ? this.lastDown.type : "";
  }

  block(e, type, why) {
    e.preventDefault();
    e.stopPropagation();
    this.emit("click-blocked", { type, why });
  }

  // ── 손가락 ──
  // outside: 영역 밖에 닿았지만 두 손가락 스크롤에 함께 세는 손가락(움직임·떼기는 창 리스너가 넘겨준다)
  touchDown(e, t, outside = false) {
    // 첫 손가락(isPrimary)이 닿을 때는 다른 손가락이 없다 — 떼기를 놓쳐 남은 손가락이 있으면 지운다
    // (남아 있으면 다음 한 번 터치가 두 손가락으로 잘못 읽혀 빈칸이 열리지 않는다)
    if (e.isPrimary && this.touches.size) {
      this.touches.clear();
      if (this.gesture) this.endGesture(t, false);
    }
    this.outsidePending.delete(e.pointerId);
    // 손바닥만큼 큰 접촉은 펜이 없어도 손바닥. 스크롤·관성을 멈추려고 친 터치는 빈칸을 열지 않는다(noTap)
    const large = isLargeContact(e.width, e.height);
    const blocked = large || palmBlocked(this.palm, t);
    const noTap = tapBlockedByScroll({ now: t, scrollEndAt: this.scrollEndAt, scrollAt: this.scrollAt });
    const touch = {
      id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
      ignored: blocked, palm: large, noTap, multi: false, moved: false, outside, at: t,
    };
    this.touches.set(e.pointerId, touch);
    if (blocked) {
      if (large) this.emit("palm-contact", { w: e.width, h: e.height });
      else this.emit("palm", { n: 1 });
      return;
    }
    // 영역 밖에 먼저 닿아 가만히 있던 손가락도 함께(손가락 하나는 글 위, 하나는 카드 밖)
    if (!outside) {
      for (const [id, p] of this.outsidePending) {
        if (outsideJoinable(p, t, this.scrollAt)) {
          this.touches.set(id, { id, x0: p.x0, y0: p.y0, x: p.x, y: p.y, ignored: false, palm: false, noTap: true, multi: false, moved: false, outside: true, at: p.at });
        }
      }
      this.outsidePending.clear();
    }
    const live = this.liveTouches();
    if (live.length < 2) return;
    // 두 손가락(이상): 스크롤 시작. 이미 스크롤 중에 손가락이 더 오면 가운데점만 다시 잡는다(첫 손가락을 떼고 기다리던 중이면 다시 이어 감)
    for (const x of live) x.multi = true;
    const mid = midpoint(live).y;
    if (this.gesture) {
      this.gesture.mid = mid;
      this.gesture.lift = null;
    } else {
      this.gesture = { mid, total: 0, carry: 0, samples: [{ t, v: 0 }] };
      this.emit("scroll-start", { fingers: live.length });
    }
  }

  liveTouches() {
    return [...this.touches.values()].filter((x) => !x.ignored);
  }

  touchMove(e) {
    const touch = this.touches.get(e.pointerId);
    if (!touch) return;
    touch.x = e.clientX;
    touch.y = e.clientY;
    if (!touch.moved && distance(touch.x0, touch.y0, touch.x, touch.y) >= TOUCH_SLOP) touch.moved = true;
    // 닿은 뒤 커진 접촉(손바닥이 눕는 중): 이제부터 손바닥. 스크롤 중이었으면 그 자리에서 멈춘다
    if (!touch.ignored && isLargeContact(e.width, e.height)) {
      touch.ignored = true;
      touch.palm = true;
      this.emit("palm-contact", { w: e.width, h: e.height });
      if (touch.multi) this.fingerLeft(timeOf(e), false);
      return;
    }
    const g = this.gesture;
    if (touch.ignored || !touch.multi || !g) return;
    const live = this.liveTouches().filter((x) => x.multi);
    // 두 손가락(이상), 또는 하나를 먼저 떼고 남은 손가락 하나(g.lift — 다 뗄 때까지 그 손가락으로 이어 감)
    if (live.length < (g.lift ? 1 : 2)) return;
    // 손가락 가운데점이 내려간 만큼 위로(글이 손가락을 따라오게). 소수점은 모아 두었다가 1px 씩
    const mid = midpoint(live).y;
    g.carry += g.mid - mid;
    g.mid = mid;
    const step = Math.trunc(g.carry);
    if (!step) return;
    g.carry -= step;
    window.scrollBy(0, step);
    g.total += step;
    g.samples = pushSample(g.samples, timeOf(e), g.total);
  }

  touchUp(e, t) {
    const touch = this.touches.get(e.pointerId);
    this.touches.delete(e.pointerId);
    if (!touch) return;
    if (touch.multi) this.fingerLeft(t, true);
    if (touch.outside) return; // 영역 밖 손가락의 click 은 영역 밖으로 간다(빈칸을 열 일이 없음)
    // 손가락 하나로 움직이지 않고 뗀 것만 빈칸을 연다(두 손가락 제스처의 손가락·손바닥·스크롤을 멈춘 터치는 아님)
    const single = !touch.ignored && !touch.multi && !touch.moved;
    this.touchClick = { ok: single && !touch.noTap, at: now() };
    if (single && touch.noTap) this.emit("scroll-stop-tap", { where: "area" });
  }

  touchCancel(e, t) {
    this.touches.delete(e.pointerId);
    this.fingerLeft(t, false);
    this.touchClick = null;
  }

  // 스크롤 중 손가락이 빠졌다: 남은 손가락의 가운데점을 다시 잡는다(셋 → 둘, 둘 → 하나에서 페이지가 튀지 않게).
  // 손가락 하나를 떼어 하나만 남았으면 관성을 바로 주지 않고 남은 손가락으로 스크롤을 이어 간다(브라우저처럼 — 남은 손가락이
  // 닿아 있는 동안 페이지가 혼자 미끄러지지 않고, 휙 밀다 차례로 뗄 때 그 사이에 멈칫하지도 않게). 그 손가락까지 떼면 끝 —
  // 관성 속도는 geometry.flingVelocity(곧 떼면 첫 손가락을 뗄 때의 속도와 남은 손가락의 속도 중 빠른 것, 대고 있다 떼면 없음).
  // 하나만 남았는데 뗀 것이 아니면(취소·손바닥) 관성 없이 끝
  fingerLeft(t, fling) {
    const g = this.gesture;
    if (!g) return;
    const live = this.liveTouches().filter((x) => x.multi);
    if (live.length >= 2 || (live.length === 1 && fling)) {
      g.mid = midpoint(live).y;
      if (live.length === 1 && !g.lift) g.lift = { at: t, v: releaseVelocity(g.samples, t) };
      return;
    }
    this.endGesture(t, fling);
  }

  endGesture(t, fling) {
    const g = this.gesture;
    this.gesture = null;
    if (!g) return;
    this.scrollEndAt = Math.max(this.scrollEndAt, t);
    this.emit("scroll-end", { total: g.total });
    if (!fling) return;
    const v = flingVelocity(g.samples, t, g.lift);
    if (Math.abs(v) >= INERTIA_START) this.startInertia(v);
  }

  // ── 관성 ──
  startInertia(v) {
    this.stopInertia();
    this.inertia = { v: Math.max(-INERTIA_MAX, Math.min(INERTIA_MAX, v)), t: now(), carry: 0, total: 0 };
    this.emit("inertia-start", { v: Math.round(v * 1000) });
    this.inertiaRaf = requestAnimationFrame(this.stepInertia);
  }

  stepInertia(ts) {
    const it = this.inertia;
    if (!it) return;
    const dt = Math.min(64, Math.max(0, ts - it.t));
    it.t = ts;
    const { v, d } = inertiaStep(it.v, dt);
    it.v = v;
    it.carry += d;
    const step = Math.trunc(it.carry);
    if (step) {
      const before = window.scrollY;
      window.scrollBy(0, step);
      it.carry -= step;
      it.total += step;
      // 페이지 끝에 닿으면 멈춘다
      if (window.scrollY === before) {
        this.stopInertia();
        return;
      }
    }
    if (Math.abs(v) < INERTIA_STOP) {
      this.stopInertia();
      return;
    }
    this.inertiaRaf = requestAnimationFrame(this.stepInertia);
  }

  stopInertia() {
    if (!this.inertia) return;
    this.scrollEndAt = now();
    cancelAnimationFrame(this.inertiaRaf);
    this.inertiaRaf = 0;
    const total = this.inertia.total;
    this.inertia = null;
    this.emit("inertia-end", { total });
  }

  // ── 그리기 ──
  // 영역 왼쪽 위 기준 좌표(r = 지금 잰 영역 자리). 페이지가 움직여도 늘 지금 화면의 글 위 자리
  local(e, r) {
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  eraseAlong(a, b) {
    const hits = this.store.visibleStrokes().filter((s) => strokeTouches(s, [a.x, a.y], [b.x, b.y], ERASER_RADIUS));
    if (!hits.length) return;
    this.store.erase(hits, this.eraseGroup);
    this.emit("erase", { n: hits.length });
  }

  // 한 그림에 한 번(rAF): 지금까지 모은 점 + 예측 점으로 그리는 중인 선의 d 만 바꾼다. ts - moveAt = 마지막 입력에서 그림 시작까지.
  // 지연은 새 입력이 들어온 그림만 센다 — 펜이 멈춰 예측 꼬리만 걷는 그림(dropPrediction, PREDICT_HOLD_MS 뒤)은 입력 지연이 아니다
  drawLive(ts) {
    this.liveRaf = 0;
    const a = this.active;
    if (!a || !a.stroke) return;
    const s = a.stroke;
    const path = this.hooks.livePath(s.tool);
    if (!path) return;
    if (Number.isFinite(ts) && ts >= a.moveAt && a.lagAt !== a.moveAt) {
      a.lagAt = a.moveAt;
      a.frames += 1;
      a.lagSum += ts - a.moveAt;
      a.lagMax = Math.max(a.lagMax, ts - a.moveAt);
    }
    const pts = a.pred.length ? s.pts.concat(a.pred) : s.pts;
    if (s.tool === "hl") {
      path.setAttribute("d", centerlinePath(pts));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", s.color);
      path.setAttribute("stroke-width", String(s.w * DRAW_SCALE));
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("stroke-opacity", String(HL_OPACITY));
    } else {
      path.setAttribute("d", outlinePath(pts, s.w));
      path.setAttribute("fill", s.color);
    }
  }

  clearLive() {
    if (this.liveRaf) cancelAnimationFrame(this.liveRaf);
    this.liveRaf = 0;
    clearTimeout(this.predTimer);
    this.predTimer = 0;
    for (const kind of ["pen", "hl"]) this.hooks.livePath(kind)?.setAttribute("d", "");
  }
}
