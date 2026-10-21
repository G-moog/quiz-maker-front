import {
  ERASER_RADIUS, HL_COLOR, HL_OPACITY, HL_WIDTH, INERTIA_MAX, INERTIA_START, INERTIA_STOP, PEN_WIDTH, TAP_MS,
  TAP_SLOP, TOUCH_SLOP, addPoint, centerlinePath, distance, inertiaStep, isDoubleTap, isTap, midpoint,
  outlinePath, palmBlocked, pushSample, releaseVelocity, strokeTouches,
} from "./geometry";

// 필기 모드의 입력 처리(DOM). 필기 영역 요소에 붙어 펜·손·마우스를 가른다.
//  펜(S펜)  : 긋기 = 필기, 빈칸 두 번 콕 = 정답 보이기/가리기(한 번 콕은 아무 일 없음, 콕은 점을 남기지 않음)
//  손가락   : 하나로 끌기 = 아무 일 없음(손바닥 대비), 빈칸 한 번 터치 = 지금처럼 토글(브라우저 click 그대로),
//             둘로 밀기 = 페이지 스크롤(떼면 관성), 벌리기(확대)는 영역의 touch-action: none 이 막는다
//  마우스   : 왼쪽 끌기 = 필기, 움직이지 않은 클릭 = 빈칸 토글
//  손바닥 무시: 펜이 닿아 있는 동안, 펜 호버(에어뷰)·펜을 뗀 뒤 PALM_MS 동안 손 입력(스크롤·클릭)을 받지 않는다
// hooks: { onBlankTap(i), onEvent(type, detail), livePath(kind) } — livePath 는 그리는 중인 선을 그릴 <path>
// 펜 시험 페이지가 onEvent 로 무슨 일이 있었는지 센다.

// 입력칸·(빈칸이 아닌) 단추 위에서 누르면 필기를 시작하지 않고 원래 동작(포커스·클릭)을 하게 둔다
const INTERACTIVE = "input, textarea, select, a[href], label, [contenteditable]:not([contenteditable='false']), button:not([data-ink-blank])";

const now = () => performance.now();
// 이벤트 시각: 실제 입력은 이벤트 시각, 시각이 0 인 이벤트(옛 브라우저)는 지금
const timeOf = (e) => (e.timeStamp > 0 ? e.timeStamp : now());

export class InkInput {
  constructor(el, store, hooks) {
    this.el = el;
    this.store = store;
    this.hooks = hooks;
    this.palm = { penDown: false, lastPenHover: -Infinity, lastPenUp: -Infinity };
    this.touches = new Map(); // 영역에서 시작한 손가락들
    this.gesture = null; // 두 손가락 스크롤 중
    this.active = null; // 펜·마우스로 누르고 있는 것(하나만)
    this.lastTap = null; // 펜 콕(두 번 콕 판정용)
    this.touchClick = null; // 마지막 손가락이 빈칸을 열어도 되는 '한 번 터치'였나 { ok, at }
    this.touchDownBlocked = false; // 마지막 손가락이 손바닥 무시 중에 닿았나(영역 밖 포함)
    this.blockMouseClick = false; // 마우스로 선을 그은 뒤 따라오는 click 은 빈칸을 열지 않게
    this.lastDown = { type: "", at: -Infinity };
    this.eraseGroup = 0;
    this.inertiaRaf = 0;
    this.inertia = null;
    this.liveRaf = 0;
    for (const k of ["onDown", "onMove", "onUp", "onCancel", "onClick", "onBlockDefault",
      "onWinDown", "onWinMove", "onWinUp", "onWinClick", "stopInertia", "stepInertia", "drawLive"]) {
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
    this.stopInertia();
    this.active = null;
    this.clearLive();
  }

  emit(type, detail) {
    this.hooks.onEvent?.(type, detail);
  }

  // ── 창 전체: 펜이 있는 곳 · 손바닥 무시 ──
  onWinDown(e) {
    const t = timeOf(e);
    this.stopInertia();
    if (e.pointerType === "pen") {
      this.palm.penDown = true;
      this.ignoreTouches(t);
    } else if (e.pointerType === "touch") {
      this.touchDownBlocked = palmBlocked(this.palm, t);
    }
  }

  onWinMove(e) {
    if (e.pointerType !== "pen") return;
    // 펜 호버(에어뷰: 닿지 않고 떠 있음)도, 긋는 중도 '펜이 화면 가까이 있음'
    this.palm.lastPenHover = timeOf(e);
    if (this.touches.size) this.ignoreTouches(this.palm.lastPenHover);
  }

  onWinUp(e) {
    // 영역 안에서 누르고 붙잡기 전에(콕만큼만 움직여) 영역 밖에서 뗀 것도 뗀 것으로
    const inside = e.target instanceof Node && this.el.contains(e.target);
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

  // 손바닥 무시 중에 닿은 손가락의 click 은 영역 밖(다음 문제·도구 막대 등)에서도 막는다
  onWinClick(e) {
    if (this.clickType(e) === "touch" && this.touchDownBlocked) this.block(e, "touch", "palm");
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
      // 같은 펜·마우스가 다시 눌렸다 = 앞 누름의 떼기를 놓쳤다. 앞 것은 버린다
      this.active = null;
      this.clearLive();
    }
    const blankEl = e.target instanceof Element ? e.target.closest("[data-ink-blank]") : null;
    const { tool, color } = this.store.getSnapshot();
    // 지우개: 도구 막대에서 고르거나, S펜 옆 단추를 누른 채(buttons 2 = 옆 단추, 32 = 지우개 끝)
    const eraser = tool === "eraser" || (e.pointerType === "pen" && (e.buttons & 34) !== 0);
    const r = this.el.getBoundingClientRect();
    const origin = { x: r.left + window.scrollX, y: r.top + window.scrollY };
    const p = this.local(e, origin);
    this.active = {
      id: e.pointerId, type: e.pointerType, x0: e.clientX, y0: e.clientY, t0: t, far: 0,
      blank: blankEl ? Number(blankEl.dataset.inkBlank) : null, eraser, origin, last: p, shown: false, captured: false,
      stroke: eraser ? null : tool === "hl"
        ? { tool: "hl", color: HL_COLOR, w: HL_WIDTH, pts: [] }
        : { tool: "pen", color, w: PEN_WIDTH, pts: [] },
    };
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
    const list = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : null;
    for (const ev of list && list.length ? list : [e]) {
      a.far = Math.max(a.far, distance(a.x0, a.y0, ev.clientX, ev.clientY));
      if (a.far >= TAP_SLOP && !a.captured) {
        a.captured = true;
        try {
          this.el.setPointerCapture(e.pointerId); // 영역 밖으로 나가도 선이 이어지게
        } catch {
          // 합성 이벤트·이미 뗀 포인터
        }
      }
      const p = this.local(ev, a.origin);
      if (a.eraser) {
        if (a.far >= TAP_SLOP) this.eraseAlong(a.last, p);
        a.last = p;
      } else {
        addPoint(a.stroke.pts, p.x, p.y, a.type === "mouse" ? 0.5 : ev.pressure);
      }
    }
    if (a.eraser) return;
    if (!a.shown && (a.far >= TAP_SLOP || (a.type === "pen" && timeOf(e) - a.t0 >= TAP_MS))) {
      a.shown = true;
      if (this.store.getSnapshot().hidden) this.store.toggleHidden(); // 숨겨 둔 채 쓰면 다시 보이게
    }
    if (a.shown && !this.liveRaf) this.liveRaf = requestAnimationFrame(this.drawLive);
  }

  onUp(e) {
    if (e.pointerType === "touch") {
      this.touchUp(e, timeOf(e));
      return;
    }
    const a = this.active;
    if (!a || a.id !== e.pointerId) return;
    const t = timeOf(e);
    this.active = null;
    a.far = Math.max(a.far, distance(a.x0, a.y0, e.clientX, e.clientY));
    if (isTap(a.far, t - a.t0, a.type)) {
      // 콕: 점을 남기지 않는다. 펜은 빈칸 두 번 콕만 보고, 마우스는 뒤따르는 click 이 빈칸을 연다
      this.clearLive();
      if (a.eraser) this.eraseAlong(a.last, a.last);
      if (a.type === "pen") this.penTap(a, t);
      return;
    }
    this.lastTap = null;
    this.blockMouseClick = true;
    if (a.eraser) return;
    const p = this.local(e, a.origin);
    addPoint(a.stroke.pts, p.x, p.y, a.type === "mouse" ? 0.5 : e.pressure);
    // 보관소가 바로 다음 그림(마이크로태스크)에 선을 그리므로 그리던 선을 지금 지워도 깜빡이지 않는다
    const ok = this.store.addStroke(a.stroke);
    this.clearLive();
    this.emit(ok ? "stroke" : "stroke-dropped", { tool: a.stroke.tool, points: a.stroke.pts.length, type: a.type });
  }

  onCancel(e) {
    if (e.pointerType === "touch") {
      this.touchCancel(e, timeOf(e));
      return;
    }
    const a = this.active;
    if (!a || a.id !== e.pointerId) return;
    // 브라우저가 입력을 가져가면(시스템 제스처 등) 그리던 선은 버린다
    this.active = null;
    this.clearLive();
    this.emit("cancel", { type: a.type });
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
    this.emit("pen-tap", { blank: a.blank });
  }

  // 펜·마우스가 만든 click: 펜은 빈칸을 열지 않고(두 번 콕으로만), 마우스는 선을 그은 뒤면 막는다.
  // 손가락은 '한 번 터치'일 때만 그대로 둔다(끈 것·두 손가락·손바닥 무시 중이면 막음)
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
  touchDown(e, t) {
    // 첫 손가락(isPrimary)이 닿을 때는 다른 손가락이 없다 — 떼기를 놓쳐 남은 손가락이 있으면 지운다
    // (남아 있으면 다음 한 번 터치가 두 손가락으로 잘못 읽혀 빈칸이 열리지 않는다)
    if (e.isPrimary && this.touches.size) {
      this.touches.clear();
      if (this.gesture) this.endGesture(t, false);
    }
    const blocked = palmBlocked(this.palm, t);
    const touch = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, ignored: blocked, multi: false, moved: false };
    this.touches.set(e.pointerId, touch);
    if (blocked) {
      this.emit("palm", { n: 1 });
      return;
    }
    const live = this.liveTouches();
    if (live.length < 2) return;
    // 두 손가락(이상): 스크롤 시작. 이미 스크롤 중에 손가락이 더 오면 가운데점만 다시 잡는다
    for (const x of live) x.multi = true;
    const mid = midpoint(live).y;
    if (this.gesture) {
      this.gesture.mid = mid;
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
    const g = this.gesture;
    if (touch.ignored || !touch.multi || !g) return;
    const live = this.liveTouches().filter((x) => x.multi);
    if (live.length < 2) return;
    // 두 손가락 가운데점이 내려간 만큼 위로(글이 손가락을 따라오게). 소수점은 모아 두었다가 1px 씩
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
    if (touch.multi && this.gesture && this.liveTouches().filter((x) => x.multi).length < 2) this.endGesture(t, true);
    // 손가락 하나로 움직이지 않고 뗀 것만 빈칸을 연다(두 손가락 제스처의 손가락·손바닥은 아님)
    this.touchClick = { ok: !touch.ignored && !touch.multi && !touch.moved, at: now() };
  }

  touchCancel(e, t) {
    this.touches.delete(e.pointerId);
    if (this.gesture && this.liveTouches().filter((x) => x.multi).length < 2) this.endGesture(t, false);
    this.touchClick = null;
  }

  endGesture(t, fling) {
    const g = this.gesture;
    this.gesture = null;
    if (!g) return;
    this.emit("scroll-end", { total: g.total });
    if (!fling) return;
    const v = releaseVelocity(g.samples, t);
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
    cancelAnimationFrame(this.inertiaRaf);
    this.inertiaRaf = 0;
    const total = this.inertia.total;
    this.inertia = null;
    this.emit("inertia-end", { total });
  }

  // ── 그리기 ──
  local(e, origin) {
    return { x: e.clientX + window.scrollX - origin.x, y: e.clientY + window.scrollY - origin.y };
  }

  eraseAlong(a, b) {
    const hits = this.store.visibleStrokes().filter((s) => strokeTouches(s, [a.x, a.y], [b.x, b.y], ERASER_RADIUS));
    if (!hits.length) return;
    this.store.erase(hits, this.eraseGroup);
    this.emit("erase", { n: hits.length });
  }

  drawLive() {
    this.liveRaf = 0;
    const a = this.active;
    if (!a || !a.stroke) return;
    const s = a.stroke;
    const path = this.hooks.livePath(s.tool);
    if (!path) return;
    if (s.tool === "hl") {
      path.setAttribute("d", centerlinePath(s.pts));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", s.color);
      path.setAttribute("stroke-width", String(s.w));
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("stroke-opacity", String(HL_OPACITY));
    } else {
      path.setAttribute("d", outlinePath(s.pts, s.w));
      path.setAttribute("fill", s.color);
    }
  }

  clearLive() {
    if (this.liveRaf) cancelAnimationFrame(this.liveRaf);
    this.liveRaf = 0;
    for (const kind of ["pen", "hl"]) this.hooks.livePath(kind)?.setAttribute("d", "");
  }
}
