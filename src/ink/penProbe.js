// 펜 시험(?pentest)의 '자세히(새 태블릿 확인용)' 표 — 브라우저가 펜·손을 어떻게 알려 주는지 재는 순수 계산(DOM 없음 — Node 시험).
// PenTestView 가 창·문서 리스너에서 받은 이벤트를 넣고(pointer·touch·key·contextmenu·focusLost·hidden·inkBlocked),
// rows(프로필, 필기 셈)로 표 줄 [[이름, 글], …] 을 만든다. 이벤트는 필드만 읽으므로 시험에서는 평범한 객체로 부른다.
// 펜 '범위 안'(떠 있음)은 pointerover(펜) ~ relatedTarget 없는 pointerout(펜)으로 따로 센다 — 펜을 가만히 띄우면
// 호버 움직임(pointermove)이 끊길 수 있으므로 움직임만으로는 정하지 않는다(마지막 호버 움직임 HOVER_NEAR_MS 안도 떠 있음으로 봄).

export const PROBE = Object.freeze({
  HOVER_RUN_GAP_MS: 300, // 호버 움직임 사이가 이보다 비면 새 줄기
  HOVER_RUN_MIN_MS: 100, // 초당 개수는 이보다 긴 줄기로만
  HOVER_NEAR_MS: 300, // 마지막 호버 움직임이 이 안이면 '떠 있음'(범위 들어옴·나감 이벤트가 없어도)
  HOVER_LEAD_MS: 100, // 펜이 닿을 때 마지막 호버 움직임이 이 안(또는 범위 안)이어야 호버가 먼저 온 것
  AFTER_UP_MS: 300, // 뗀 뒤 이 안에 호버 움직임이 오면 '뗀 뒤 호버'
  NEAR_UP_MS: 500, // 펜을 뗀 뒤 이 안에 닿은 손은 '뗀 뒤'
  NEAR_PEN_MS: 300, // 손 터치 취소가 마지막 펜 이벤트 뒤 이 안이면 '펜 가까이'
  PEN_STALE_MS: 2000, // '펜 닿음'은 마지막 펜 이벤트 뒤 이만큼만 믿는다(떼기를 놓쳐도)
  BOUNCE_MS: 60, // 뗀 뒤 이 안에 같은 자리(BOUNCE_PX)에 다시 닿으면 튐
  BOUNCE_PX: 10,
  REPEAT_MS: 150, // 뗀 뒤 이 안에 같은 자리에 다시 닿은 간격은 모두 적는다(튐과 빠른 두 번 콕을 가르게)
  REPEAT_KEEP: 20,
  COMPANION_MS: 100, // 펜이 함께 보낸 touch: 펜 누름 뒤 이 안·±COMPANION_PX(InkInput.isPenTouch 와 같은 값)
  COMPANION_PX: 2,
  COMPANION_NEAR_PX: 30, // 짝은 못 맞췄지만 닿아 있는 펜에서 이 안 = 어긋난 touch(손바닥으로 막혀 펜으로 단추를 못 누름)
  GHOST_MS: 100, // 펜 누름 앞뒤 이 안·GHOST_PX 안에 닿은 손 포인터 = 유령 손가락
  GHOST_PX: 20,
  PAIR_MS: 50, // 같은 입력의 포인터(pointerdown)와 Touch(touchstart) 짝: 시각·자리 차이 한도
  PAIR_PX: 2,
  PAIR_KEEP: 5,
  CONTACTS_KEEP: 40,
  BLOCKED_KEEP: 8,
  KEYS_KEEP: 8,
  KEEP: 200, // 가운데값을 셀 배열 한도
});

const fin = (v) => (Number.isFinite(v) ? v : 0);
const timeOf = (e) => (e.timeStamp > 0 ? e.timeStamp : 0);
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const push = (arr, v, keep = PROBE.KEEP) => {
  arr.push(v);
  if (arr.length > keep) arr.splice(0, arr.length - keep);
};
export function median(arr) {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
const r0 = (v) => Math.round(v);

function fresh() {
  return {
    // 펜 상태
    penDown: false, penIn: false, lastPen: -Infinity, lastPenX: null, lastPenY: null,
    lastHover: -Infinity, hoverFrom: null, // hoverFrom: 지금 이어지는 '떠 있음'의 시작(뗀 뒤 떠 있으면 뗀 때)
    downAt: null, downX: 0, downY: 0, downFar: 0,
    lastDownPen: null, // 마지막 펜 누름 { t, x, y }
    lastUp: null, // 마지막 펜 뗌 { t, x, y }
    pendingUp: null, // 뗀 뒤 아직 호버를 기다리는 뗌 시각
    // 호버
    hovers: 0, enters: 0, run: null, runN: 0, runMs: 0, maxGap: 0,
    downs: 0, leadOk: 0, leads: [], ups: 0, afterUp: 0, afterUpGaps: [],
    // 손
    near: { inRange: 0, down: 0, afterUp: 0, far: 0 },
    cancels: { near: 0, other: 0 },
    contacts: [], live: new Map(), group: 0,
    touchDowns: [], // 최근 손 pointerdown { t, x, y, size, ghost, paired }
    radius: { seen: false, start: 0, move: 0, force: 0, pairs: [], types: {}, hasType: null },
    companion: { matched: 0, near: 0, ghost: 0 },
    bounce: 0, repeatGaps: [], taps: [],
    lastTouchDown: null, blocked: [], blockedN: { "pen-guard": 0, "pen-overlap": 0 },
    menu: { pen: 0, touch: 0, mouse: 0 }, lastDownType: "", lastDownAt: -Infinity,
    keys: 0, keyNames: [], blur: 0, hidden: 0,
  };
}

export function createProbe() {
  let s = fresh();

  const penIsDown = (t) => s.penDown && t - s.lastPen < PROBE.PEN_STALE_MS;
  const closeRun = () => {
    const r = s.run;
    if (r && r.last - r.start >= PROBE.HOVER_RUN_MIN_MS) {
      s.runN += r.n - 1;
      s.runMs += r.last - r.start;
    }
    s.run = null;
  };

  function hoverMove(t) {
    s.hovers += 1;
    if (s.run && t - s.run.last <= PROBE.HOVER_RUN_GAP_MS) {
      s.maxGap = Math.max(s.maxGap, t - s.run.last);
      s.run.last = t;
      s.run.n += 1;
    } else {
      closeRun();
      s.run = { start: t, last: t, n: 1 };
    }
    if (s.hoverFrom == null) s.hoverFrom = t;
    if (s.pendingUp != null) {
      if (t - s.pendingUp <= PROBE.AFTER_UP_MS) {
        s.afterUp += 1;
        push(s.afterUpGaps, t - s.pendingUp);
      }
      s.pendingUp = null;
    }
    s.lastHover = t;
    s.penDown = false; // 떠 있다 = 닿아 있지 않다(떼기를 놓쳐도 — InkInput 과 같게)
  }

  function penDown(t, x, y) {
    closeRun();
    s.downs += 1;
    const seen = s.hoverFrom != null && (s.penIn || t - s.lastHover <= PROBE.HOVER_LEAD_MS);
    const lead = seen ? t - s.hoverFrom : 0;
    if (lead >= 1) {
      s.leadOk += 1;
      push(s.leads, lead);
    }
    if (s.lastUp) {
      const gap = t - s.lastUp.t;
      if (gap >= 0 && gap <= PROBE.REPEAT_MS && dist(x, y, s.lastUp.x, s.lastUp.y) <= PROBE.BOUNCE_PX) {
        push(s.repeatGaps, r0(gap), PROBE.REPEAT_KEEP);
        if (gap <= PROBE.BOUNCE_MS) s.bounce += 1;
      }
    }
    // 유령 손가락(펜보다 먼저 온 손 포인터)
    for (const d of s.touchDowns) {
      if (!d.ghost && Math.abs(t - d.t) <= PROBE.GHOST_MS && dist(x, y, d.x, d.y) <= PROBE.GHOST_PX) {
        d.ghost = true;
        s.companion.ghost += 1;
      }
    }
    s.penDown = true;
    s.downAt = t;
    s.downX = x;
    s.downY = y;
    s.downFar = 0;
    s.pendingUp = null;
    s.lastDownPen = { t, x, y };
  }

  function penUp(e, t, x, y) {
    if (s.downAt != null && e.type === "pointerup") {
      s.ups += 1;
      push(s.taps, { ms: t - s.downAt, far: Math.max(s.downFar, dist(x, y, s.downX, s.downY)) });
      s.lastUp = { t, x, y };
      s.pendingUp = t;
    } else if (e.type === "pointercancel") {
      s.lastUp = null;
      s.pendingUp = null;
    }
    s.penDown = false;
    s.downAt = null;
    s.hoverFrom = s.penIn ? t : null;
  }

  function penEvent(e, t) {
    const x = fin(e.clientX);
    const y = fin(e.clientY);
    if (e.type === "pointerout") {
      // 펜이 범위를 벗어남(다른 요소로 옮겨 간 것은 relatedTarget 이 있음)
      if (e.relatedTarget == null) {
        s.penIn = false;
        s.hoverFrom = null;
        s.pendingUp = null;
        closeRun();
      }
      return;
    }
    if (e.type === "pointerover") {
      if (!s.penIn) {
        s.penIn = true;
        s.enters += 1;
        if (s.hoverFrom == null && !s.penDown) s.hoverFrom = t;
      }
    } else if (e.type === "pointermove") {
      if (e.buttons === 0) hoverMove(t);
      else if (s.downAt != null) s.downFar = Math.max(s.downFar, dist(x, y, s.downX, s.downY));
    } else if (e.type === "pointerdown") {
      penDown(t, x, y);
    } else if (e.type === "pointerup" || e.type === "pointercancel") {
      penUp(e, t, x, y);
    }
    s.lastPen = t;
    s.lastPenX = x;
    s.lastPenY = y;
  }

  function touchPointer(e, t) {
    const size = Math.max(fin(e.width), fin(e.height));
    const x = fin(e.clientX);
    const y = fin(e.clientY);
    if (e.type === "pointerdown") {
      if (penIsDown(t)) s.near.down += 1;
      else if (s.penIn || t - s.lastHover < PROBE.HOVER_NEAR_MS) s.near.inRange += 1;
      else if (s.lastUp && t - s.lastUp.t < PROBE.NEAR_UP_MS) s.near.afterUp += 1;
      else s.near.far += 1;
      if (e.isPrimary) s.live.clear(); // 첫 손가락: 떼기를 놓쳐 남은 접촉은 버린다
      if (!s.live.size) s.group += 1;
      const c = { id: e.pointerId, max: size, cancel: false, group: s.group };
      s.live.set(e.pointerId, c);
      push(s.contacts, c, PROBE.CONTACTS_KEEP);
      const p = s.lastDownPen;
      const ghost = !!p && Math.abs(t - p.t) <= PROBE.GHOST_MS && dist(x, y, p.x, p.y) <= PROBE.GHOST_PX;
      if (ghost) s.companion.ghost += 1;
      push(s.touchDowns, { t, x, y, size, ghost, paired: false }, 10);
      s.lastTouchDown = { size, x, y, penX: s.lastPenX, penY: s.lastPenY };
    } else if (e.type === "pointermove") {
      const c = s.live.get(e.pointerId);
      if (c) c.max = Math.max(c.max, size);
    } else if (e.type === "pointerup" || e.type === "pointercancel") {
      const c = s.live.get(e.pointerId);
      if (c) {
        if (e.type === "pointercancel") c.cancel = true;
        s.live.delete(e.pointerId);
      }
      if (e.type === "pointercancel") {
        if (penIsDown(t) || s.penIn || t - s.lastPen < PROBE.NEAR_PEN_MS) s.cancels.near += 1;
        else s.cancels.other += 1;
      }
    }
  }

  // ── 표 글 ──
  function hoverText() {
    if (!s.hovers && !s.enters) return "없음 — 펜을 화면 1cm 위에 띄워 조금씩 움직여 보세요";
    if (!s.hovers) return `범위 들어옴 ${s.enters}번뿐 — 띄운 채 움직임은 오지 않음`;
    let n = s.runN;
    let ms = s.runMs;
    const r = s.run;
    if (r && r.last - r.start >= PROBE.HOVER_RUN_MIN_MS) {
      n += r.n - 1;
      ms += r.last - r.start;
    }
    const hz = ms > 0 ? r0((n * 1000) / ms) : "-";
    return `예 — 호버 ${s.hovers}번 · 범위 들어옴 ${s.enters}번 · 띄운 동안 초당 약 ${hz}개 · 가장 긴 끊김 ${r0(s.maxGap)}ms`;
  }

  function leadText() {
    if (!s.downs) return "아직 펜으로 누르지 않음";
    const lead = s.leadOk ? ` · 미리 온 시간 가운데값 ${r0(median(s.leads))}ms(가장 짧은 ${r0(Math.min(...s.leads))}ms)` : "";
    return `펜 누름 ${s.downs}번 중 호버가 먼저 온 것 ${s.leadOk}번${lead} · 뗀 뒤 0.3초 안 호버 ${s.afterUp}번(뗌 ${s.ups}번)`;
  }

  function contactsText() {
    if (!s.contacts.length) return "아직 없음";
    const groups = [];
    for (const c of s.contacts) {
      const one = `${r0(c.max)}${c.cancel ? "x" : ""}`;
      const last = groups[groups.length - 1];
      if (last && last.g === c.group) last.items.push(one);
      else groups.push({ g: c.group, items: [one] });
    }
    const noSize = s.contacts.filter((c) => c.max <= 2).length;
    return `${groups.map((g) => g.items.join("+")).join(" ")} — + 는 함께 닿음, x 는 취소됨 · 크기 없음(2 이하) ${noSize}개`;
  }

  function radiusText() {
    const R = s.radius;
    if (!R.seen) return "아직 없음";
    const pairs = R.pairs.length ? R.pairs.map(([p, t]) => `${p}/${t}`).join(", ") : "-";
    const types = R.hasType
      ? Object.entries(R.types).map(([k, v]) => `${k} ${v}`).join(", ") || "-"
      : "이 브라우저에 없음";
    return `닿을 때 최대 ${r0(R.start)} · 움직이는 중 최대 ${r0(R.move)} · 같은 입력(포인터/Touch) ${pairs} · force 최대 ${Math.round(R.force * 100) / 100} · touchType ${types}`;
  }

  function tapText(p) {
    const short = s.taps.filter((x) => x.far < p.PEN_BLANK_TAP_SLOP).map((x) => x.ms);
    if (!short.length) return "아직 없음";
    const long = short.filter((ms) => ms >= p.TAP_MS).length;
    return `${short.length}번 · 가운데값 ${r0(median(short))}ms · 가장 긴 ${r0(Math.max(...short))}ms · ${p.TAP_MS}ms 넘어 점이 된 것 ${long}번`;
  }

  function blockedText() {
    const g = s.blockedN["pen-guard"];
    const o = s.blockedN["pen-overlap"];
    const list = s.blocked.map((b) => `${b.why === "pen-guard" ? "뒤" : "겹침"} ${b.size}·${b.dist ?? "?"}`).join(", ");
    return `펜 뒤 ${g}번 · 펜과 겹침 ${o}번${list ? ` — 최근(크기·펜에서 거리 px): ${list}` : ""}`;
  }

  return {
    pointer(e) {
      const t = timeOf(e);
      if (e.type === "pointerdown") {
        s.lastDownType = e.pointerType || "";
        s.lastDownAt = t;
      }
      if (e.pointerType === "pen") penEvent(e, t);
      else if (e.pointerType === "touch") touchPointer(e, t);
    },
    touch(e) {
      const t = timeOf(e);
      for (const tc of e.changedTouches || []) {
        const d = 2 * Math.max(fin(tc.radiusX), fin(tc.radiusY));
        const R = s.radius;
        if (R.hasType == null) R.hasType = "touchType" in tc;
        if (e.type === "touchstart") {
          R.seen = true;
          R.start = Math.max(R.start, d);
          R.force = Math.max(R.force, fin(tc.force));
          if (R.hasType) R.types[String(tc.touchType)] = (R.types[String(tc.touchType)] || 0) + 1;
          for (let i = s.touchDowns.length - 1; i >= 0; i--) {
            const p = s.touchDowns[i];
            if (!p.paired && Math.abs(t - p.t) <= PROBE.PAIR_MS && Math.abs(fin(tc.clientX) - p.x) <= PROBE.PAIR_PX && Math.abs(fin(tc.clientY) - p.y) <= PROBE.PAIR_PX) {
              p.paired = true;
              push(R.pairs, [r0(p.size), r0(d)], PROBE.PAIR_KEEP);
              break;
            }
          }
          const p = s.lastDownPen;
          const cx = fin(tc.clientX);
          const cy = fin(tc.clientY);
          if (p && t - p.t >= 0 && t - p.t <= PROBE.COMPANION_MS && Math.abs(cx - p.x) <= PROBE.COMPANION_PX && Math.abs(cy - p.y) <= PROBE.COMPANION_PX) {
            s.companion.matched += 1;
          } else if (penIsDown(t) && s.lastPenX != null && dist(cx, cy, s.lastPenX, s.lastPenY) <= PROBE.COMPANION_NEAR_PX) {
            s.companion.near += 1;
          }
        } else if (e.type === "touchmove") {
          R.move = Math.max(R.move, d);
        }
      }
    },
    key(e) {
      s.keys += 1;
      const name = e.key || e.code || "?";
      if (!s.keyNames.includes(name) && s.keyNames.length < PROBE.KEYS_KEEP) s.keyNames.push(name);
    },
    contextmenu(e) {
      const t = timeOf(e);
      const pt = typeof e.pointerType === "string" && e.pointerType ? e.pointerType : t - s.lastDownAt < 1000 ? s.lastDownType : "";
      if (pt === "pen") s.menu.pen += 1;
      else if (pt === "touch") s.menu.touch += 1;
      else s.menu.mouse += 1;
    },
    focusLost() {
      s.blur += 1;
      s.penIn = false;
      s.penDown = false;
    },
    hidden() {
      s.hidden += 1;
      s.penIn = false;
      s.penDown = false;
    },
    // InkInput 'click-blocked'(손, why = pen-guard | pen-overlap) — 바로 앞 손 누름의 크기와 펜에서 떨어진 거리를 남긴다
    inkBlocked(why) {
      if (!(why in s.blockedN)) return;
      s.blockedN[why] += 1;
      const d = s.lastTouchDown;
      if (!d) return;
      push(s.blocked, { why, size: r0(d.size), dist: d.penX == null ? null : r0(dist(d.x, d.y, d.penX, d.penY)) }, PROBE.BLOCKED_KEEP);
    },
    reset() {
      s = fresh();
    },
    penState(now) {
      if (penIsDown(now)) return "닿음";
      if (s.penIn || now - s.lastHover < PROBE.HOVER_NEAR_MS) return "떠 있음";
      return "없음";
    },
    // p: 지금 태블릿 프로필(geometry GALAXY·Y700), ink: PenTestView 가 필기 코드 이벤트로 센 값 { penBounce, palmStopScroll }
    rows(p, ink = {}) {
      return [
        ["펜 호버 자세히", hoverText()],
        ["닿기 전·뗀 뒤 호버", leadText()],
        ["펜 가까이에서 닿은 손", `펜 범위 안 ${s.near.inRange} · 닿아 있을 때 ${s.near.down} · 뗀 뒤 0.5초 안 ${s.near.afterUp} · 펜 멀리(또는 모름) ${s.near.far}`],
        ["손 터치 취소(pointercancel)", `${s.cancels.near + s.cancels.other}번 · 펜 가까이 ${s.cancels.near} · 그 밖 ${s.cancels.other} · 펜이 와서 멈춘 두 손가락 스크롤 ${ink.palmStopScroll || 0}번`],
        ["최근 손 접촉(닿은 차례 · 가장 컸던 크기 px)", contactsText()],
        ["Touch 반지름×2(포인터 크기와 견줌)", radiusText()],
        ["펜이 함께 보낸 touch", `펜 누름 ${s.downs}번 · 같은 자리 touch ${s.companion.matched}번 · 어긋난 touch ${s.companion.near}번(0이어야 펜으로 단추가 눌림) · 펜 옆 손 포인터(유령) ${s.companion.ghost}번(0이어야 함)`],
        ["펜 콕 튐", `뗀 뒤 ${PROBE.BOUNCE_MS}ms 안 같은 자리 다시 닿음 ${s.bounce}번(0이어야 함) · 한 번 콕으로 합친 것 ${ink.penBounce || 0}번 · 0.15초 안 다시 닿은 간격(ms) ${s.repeatGaps.join(" ") || "-"}`],
        ["펜 콕 시간(짧게 누른 것)", tapText(p)],
        ["막은 손 터치(펜 뒤·펜과 겹침)", blockedText()],
        ["길게 누름 메뉴(contextmenu)", `펜 ${s.menu.pen} · 손 ${s.menu.touch} · 마우스·자판 ${s.menu.mouse}`],
        ["펜 단추·시스템", `키 입력 ${s.keys}번${s.keyNames.length ? `(${s.keyNames.join(", ")})` : ""} · 앱이 가려짐: 초점 잃음 ${s.blur} · 숨김 ${s.hidden} (펜 단추가 메모·화면 인식을 띄우면 늘어남)`],
      ];
    },
  };
}

// 결과 복사 글: 표 묶음 → 채팅에 붙여 넣을 글. sections = [{ title, rows: [[이름, 글], …] }]
export function resultText({ when, tablet, sections }) {
  const one = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
  const parts = [`펜 시험 결과 · ${one(when)} · 태블릿 ${one(tablet)}`];
  for (const sec of sections) {
    parts.push("", `[${one(sec.title)}]`, ...sec.rows.map(([k, v]) => `${one(k)}: ${one(v)}`));
  }
  return parts.join("\n");
}
