// 펜 시험(?pentest)의 '자세히(새 태블릿 확인용)' 표 — 브라우저가 펜·손을 어떻게 알려 주는지 재는 순수 계산(DOM 없음 — Node 시험).
// PenTestView 가 창·문서 리스너에서 받은 이벤트를 넣고(pointer·touch·key·contextmenu·focusLost·hidden·inkBlocked),
// rows(프로필, 필기 셈)로 표 줄 [[이름, 글], …] 을 만든다. 이벤트는 필드만 읽으므로 시험에서는 평범한 객체로 부른다.
// 펜 '범위 안'(떠 있음)은 pointerover(펜) ~ relatedTarget 없는 pointerout(펜)으로 따로 센다 — 펜을 가만히 띄우면
// 호버 움직임(pointermove)이 끊길 수 있으므로 움직임만으로는 정하지 않는다(마지막 호버 움직임 HOVER_NEAR_MS 안도 떠 있음으로 봄).
// 다만 마지막 펜 이벤트에서 PEN_IN_MS 넘게 지나면 범위 밖으로 본다 — 범위를 벗어날 때 out 이 안 오는 기기에서 '떠 있음'에 굳지 않게.
// '닿기 전 호버'는 over·out 차례에 기대지 않고 호버 움직임 줄기로 잰다 — 안드로이드 크롬은 닿기 직전·뗀 직후에도 out 을 보낸다.
// 그리고 '다가온 누름'(앞 펜을 뗀 지 NEAR_UP_MS 넘음·처음)과 '이어 쓴 누름'(그 안 — 손글씨 획 사이 등)을 따로 센다. 이어 쓴 누름은 손바닥 막기가
// 뗀 뒤 규칙으로 이미 켜져 있을 때라 호버가 막아 주는지와 상관없고, 수가 많아 섞으면 손글씨 박자가 값을 정한다 —
// 손바닥 막기 값을 갤럭시처럼 낮출지는 다가온 누름 값(호버가 먼저 온 비율·미리 온 시간 가운데값)으로 본다.
// '펜 콕 시간'·'펜 콕 튐'은 빈칸에서 시작한 펜 누름만 센다(PenTestView 가 pointer(e, { blank }) 로 알려 줌 — 손글씨 획은 빼고 따로 한도).
// 그 가운데서도 빈칸 콕으로 볼 묶음만(blankTapGroups): 앞뒤 TAP_ALONE_MS 안에 다른 펜 누름이 없는 한 번(따로 떨어진 콕), 또는
// DOUBLE_TAP_MS 안의 두 번(두 번 콕) — 빈칸 위에 답을 쓴 획(이어 씀)이 '가장 긴' 값을 끌어올리지 않게. 묶음 안의 튐은 필기 코드와 같은 식
// (geometry.isPenBounce — 지금 태블릿의 PEN_BOUNCE_MS)으로 가려 앞 누름에 합치고, 튐의 짧은 접촉(PEN_BOUNCE_CONTACT_MS 미만)은 콕 시간에서 뺀다.

import { PEN_BOUNCE_CONTACT_MS, PEN_RETAP_MIN_MS, isPenBounce } from "./geometry.js";

export const PROBE = Object.freeze({
  HOVER_RUN_GAP_MS: 300, // 호버 움직임 사이가 이보다 비면 새 줄기
  HOVER_RUN_MIN_MS: 100, // 초당 개수는 이보다 긴 줄기로만
  HOVER_NEAR_MS: 300, // 마지막 호버 움직임이 이 안이면 '떠 있음'(범위 들어옴·나감 이벤트가 없어도)
  PEN_IN_MS: 1000, // '범위 안'(over 뒤 out 전)도 마지막 펜 이벤트에서 이 안만 믿는다(out 이 안 와도 굳지 않게)
  HOVER_LEAD_MS: 100, // 펜이 닿을 때 마지막 호버 움직임이 이 안이어야 호버가 먼저 온 것(그 줄기의 시작부터 잼)
  AFTER_UP_MS: 300, // 뗀 뒤 이 안에 호버 움직임이 오면 '뗀 뒤 호버'
  NEAR_UP_MS: 500, // 펜을 뗀 뒤 이 안에 닿은 손은 '뗀 뒤'. 펜 누름은 앞 펜을 뗀 지 이보다 오래면(처음이면) '다가온 누름'(갤럭시 PALM_MS)
  NEAR_PEN_MS: 300, // 손 터치 취소가 마지막 펜 이벤트 뒤 이 안이면 '펜 가까이'
  PEN_STALE_MS: 2000, // '펜 닿음'은 마지막 펜 이벤트 뒤 이만큼만 믿는다(떼기를 놓쳐도)
  BOUNCE_PX: 10, // 앞 빈칸 콕을 뗀 자리에서 이 안에 다시 닿아야 '같은 자리'(튐 후보)
  REPEAT_MS: 150, // 뗀 뒤 이 안에 같은 자리에 다시 닿은 간격은 모두 적는다(튐과 빠른 두 번 콕을 가르게 — 앞·뒤 접촉 시간과 함께)
  REPEAT_KEEP: 20,
  TAP_ALONE_MS: 500, // 빈칸 콕으로 볼 묶음: 앞뒤로 다른 펜 누름이 이보다 가까우면 이어 쓴 것(빈칸 위 손글씨)
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
  BLANK_KEEP: 100, // 빈칸에서 시작한 펜 누름(펜 콕 시간·펜 콕 튐) 한도 — 손글씨 획과 따로
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

// 빈칸 콕으로 볼 누름 가르기(펜 콕 시간·펜 콕 튐). list = 빈칸 누름 기록(blankTaps, 차례대로), p = 지금 태블릿 프로필.
//  - 묶음: 바로 앞 펜 누름이 앞 기록이고 그 사이가 TAP_ALONE_MS 보다 짧으면 같은 묶음. 묶음 바로 앞·뒤(TAP_ALONE_MS 안)에 기록 밖의
//    펜 누름(빈칸 밖 획·취소된 누름)이 붙어 있으면 이어 쓴 것으로 보고 뺀다
//  - 묶음 안 튐: 같은 자리에 곧바로 다시 닿은 콕 쌍(두 누름 모두 빈칸 콕 한도·TAP_MS 안)이 isPenBounce(필기 코드와 같은 식 — 프로필
//    PEN_BOUNCE_MS, 갤럭시 0 = 없음)면 앞 누름에 합친다
//  - 합친 뒤 한 번(따로 떨어진 콕)이거나 DOUBLE_TAP_MS 안의 두 번(두 번 콕)인 묶음만 남긴다 — 빈칸 위 손글씨(획이 이어짐)는 빠짐
// → { taps: 콕 시간에 셀 누름(콕 한도 안에서 움직인 것, 튐 쌍의 PEN_BOUNCE_CONTACT_MS 미만 접촉은 뺌),
//     links: 남긴 묶음의 같은 자리 콕 쌍 [{ gap, a: 앞 접촉 ms, b: 뒤 접촉 ms, bounce }], skipped: 콕 한도 안이지만 뺀 누름 수 }
export function blankTapGroups(list, p) {
  const groups = [];
  let g = null;
  for (const x of list) {
    if (g && x.linked && x.before < PROBE.TAP_ALONE_MS) g.push(x);
    else groups.push((g = [x]));
  }
  const near = (v) => v != null && v < PROBE.TAP_ALONE_MS;
  const tapLike = (x) => x.far < p.PEN_BLANK_TAP_SLOP && x.ms < p.TAP_MS;
  const pair = (a, b) => b.gap != null && tapLike(a) && tapLike(b);
  const taps = [];
  const links = [];
  let skipped = 0;
  for (const grp of groups) {
    // 튐: 같은 자리 콕 쌍 가운데 isPenBounce 인 것(앞 누름 a: 0~a.ms, 뒤 누름 b: a.ms + gap ~ 그 + b.ms)
    const bounce = grp.map((b, i) => i > 0 && pair(grp[i - 1], b)
      && isPenBounce({ blank: 0, downAt: 0, upAt: grp[i - 1].ms }, { blank: 0, downAt: grp[i - 1].ms + b.gap, upAt: grp[i - 1].ms + b.gap + b.ms }, p));
    // 튐을 합친 누름 수와 둘째 누름의 앞 사이(두 번 콕인지)
    let n = 0;
    let gap2 = null;
    grp.forEach((x, i) => {
      if (bounce[i]) return;
      n += 1;
      if (n === 2) gap2 = x.before;
    });
    const open = near(grp[0].before) || near(grp[grp.length - 1].after);
    const ok = !open && (n === 1 || (n === 2 && gap2 >= 0 && gap2 <= p.DOUBLE_TAP_MS));
    grp.forEach((x, i) => {
      if (x.far >= p.PEN_BLANK_TAP_SLOP) return; // 선(콕 한도 넘게 움직임)은 콕이 아님
      const bounceShort = x.ms < PEN_BOUNCE_CONTACT_MS && (bounce[i] || bounce[i + 1]);
      if (ok && !bounceShort) taps.push(x);
      else skipped += 1;
    });
    if (ok) {
      for (let i = 1; i < grp.length; i++) {
        if (pair(grp[i - 1], grp[i])) links.push({ gap: grp[i].gap, a: grp[i - 1].ms, b: grp[i].ms, bounce: bounce[i] });
      }
    }
  }
  return { taps, links, skipped };
}

function fresh() {
  return {
    // 펜 상태
    penDown: false, penIn: false, lastPen: -Infinity, lastPenX: null, lastPenY: null,
    lastHover: -Infinity,
    downAt: null, downX: 0, downY: 0, downFar: 0,
    downBlank: false, // 지금 누름이 빈칸에서 시작했나
    downGap: null, // 지금 누름이 앞 빈칸 누름을 뗀 자리에 곧바로 다시 닿은 것이면 { gap }
    downBefore: Infinity, // 지금 누름 앞 사이: 바로 앞 펜 누름(빈칸 밖·취소 포함)이 끝난 뒤 닿기까지
    downLinked: false, // 바로 앞 펜 누름이 빈칸 누름 기록(blankTaps 의 마지막)인가
    lastDownPen: null, // 마지막 펜 누름 { t, x, y }
    lastUp: null, // 마지막 펜 뗌 { t, x, y, blank, ms, far }
    pendingUp: null, // 뗀 뒤 아직 호버를 기다리는 뗌 시각
    // 호버(run: 지금 이어지는 호버 움직임 줄기, prevRun: 바로 앞에 닫힌 줄기 — 닿기 직전에 out 이 와서 닫혀도 '닿기 전 호버'를 잼)
    hovers: 0, enters: 0, run: null, prevRun: null, runN: 0, runMs: 0, maxGap: 0,
    downs: 0, ups: 0, afterUp: 0, afterUpGaps: [],
    lastEnd: null, // 마지막 펜 누름이 끝난(뗌·취소) 때 — 다가온 누름 가르기
    approach: { n: 0, ok: 0, leads: [] }, // 다가온 누름: 수·호버가 먼저 온 수·미리 온 시간
    cont: { n: 0, ok: 0 }, // 이어 쓴 누름: 수·호버가 먼저 온 수
    // 손
    near: { inRange: 0, down: 0, afterUp: 0, far: 0 },
    cancels: { near: 0, other: 0 },
    contacts: [], live: new Map(), group: 0,
    touchDowns: [], // 최근 손 pointerdown { t, x, y, size, ghost, paired }
    radius: { seen: false, start: 0, move: 0, force: 0, pairs: [], types: {}, hasType: null },
    companion: { matched: 0, near: 0, ghost: 0 },
    // 빈칸에서 시작해 뗀 펜 누름(최근 BLANK_KEEP 개, 차례대로) { ms, far, before, linked, after?, gap? } —
    // before·linked: 위 downBefore·downLinked, after: 뗀 뒤 다음 펜 누름까지(다음 누름이 오면 적음), gap: downGap
    blankTaps: [],
    lastTouchDown: null, blocked: [], blockedN: { "pen-guard": 0, "pen-overlap": 0 },
    menu: { pen: 0, touch: 0, mouse: 0 }, lastDownType: "", lastDownAt: -Infinity,
    keys: 0, keyNames: [], blur: 0, hidden: 0,
  };
}

export function createProbe() {
  let s = fresh();

  const penIsDown = (t) => s.penDown && t - s.lastPen < PROBE.PEN_STALE_MS;
  // 펜이 범위 안(over 뒤 out 전)이고 마지막 펜 이벤트가 PEN_IN_MS 안
  const penNear = (t) => s.penIn && t - s.lastPen <= PROBE.PEN_IN_MS;
  const closeRun = () => {
    const r = s.run;
    if (r && r.last - r.start >= PROBE.HOVER_RUN_MIN_MS) {
      s.runN += r.n - 1;
      s.runMs += r.last - r.start;
    }
    if (r) s.prevRun = r;
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

  // blank: 빈칸에서 시작한 누름(PenTestView 가 알려 줌)
  function penDown(t, x, y, blank) {
    s.downs += 1;
    // 닿기 전 호버: 마지막 호버 움직임이 HOVER_LEAD_MS 안이면 그 줄기의 시작부터 닿기까지. 줄기가 닿기 직전의 out 으로 닫혔어도(안드로이드) 잰다.
    // 앞 누름을 뗀 뒤 호버가 없었으면(촉 튐·곧바로 다시 콕) 세지 않고, 닿는 순간과 같은 때 시작한 줄기(0ms)도 먼저 온 것이 아님
    const run = s.run || s.prevRun;
    const lead = run && t - s.lastHover <= PROBE.HOVER_LEAD_MS && s.lastHover > (s.lastUp?.t ?? -Infinity) ? t - run.start : 0;
    closeRun();
    // 다가온 누름(앞 펜 누름이 끝난 지 NEAR_UP_MS 넘음·처음)과 이어 쓴 누름을 따로
    const approach = s.lastEnd == null || t - s.lastEnd > PROBE.NEAR_UP_MS;
    const g = approach ? s.approach : s.cont;
    g.n += 1;
    if (lead >= 1) {
      g.ok += 1;
      if (approach) push(s.approach.leads, lead);
    }
    // 빈칸 누름 묶음(펜 콕 시간·펜 콕 튐 — blankTapGroups): 바로 앞 펜 누름이 빈칸 누름 기록이면 그 기록에 '뒤 사이'를 적고,
    // 이 누름에는 '앞 사이'(바로 앞 펜 누름이 끝난 뒤 — 빈칸 밖 획·취소 포함)와 앞 누름이 그 기록인지를 남긴다
    const u = s.lastUp;
    if (u?.blank && s.blankTaps.length) s.blankTaps[s.blankTaps.length - 1].after = t - u.t;
    s.downBefore = s.lastEnd == null ? Infinity : t - s.lastEnd;
    s.downLinked = !!u?.blank;
    // 펜 콕 튐: 빈칸 누름이 앞 빈칸 누름을 뗀 자리(BOUNCE_PX)에 곧바로(REPEAT_MS) 다시 닿음 — 두 누름이 콕이었는지·튐인지는 표를 만들 때 프로필로 가름
    s.downGap = null;
    if (blank && u?.blank) {
      const gap = t - u.t;
      if (gap >= 0 && gap <= PROBE.REPEAT_MS && dist(x, y, u.x, u.y) <= PROBE.BOUNCE_PX) s.downGap = { gap: r0(gap) };
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
    s.downBlank = !!blank;
    s.pendingUp = null;
    s.lastDownPen = { t, x, y };
  }

  function penUp(e, t, x, y) {
    if (s.downAt != null && e.type === "pointerup") {
      s.ups += 1;
      const ms = t - s.downAt;
      const far = Math.max(s.downFar, dist(x, y, s.downX, s.downY));
      // 빈칸에서 시작한 누름만 따로 한도(손글씨 획에 밀리지 않게) — 펜 콕 시간·펜 콕 튐
      if (s.downBlank) push(s.blankTaps, { ms, far, before: s.downBefore, linked: s.downLinked, ...s.downGap }, PROBE.BLANK_KEEP);
      s.lastUp = { t, x, y, blank: s.downBlank, ms, far };
      s.pendingUp = t;
      s.lastEnd = t;
    } else if (e.type === "pointercancel") {
      if (s.downAt != null) s.lastEnd = t;
      s.lastUp = null;
      s.pendingUp = null;
    }
    s.penDown = false;
    s.downAt = null;
    s.downBlank = false;
    s.downGap = null;
    s.downBefore = Infinity;
    s.downLinked = false;
  }

  function penEvent(e, t, blank) {
    const x = fin(e.clientX);
    const y = fin(e.clientY);
    if (e.type === "pointerout") {
      // 펜이 범위를 벗어남(다른 요소로 옮겨 간 것은 relatedTarget 이 있음). 뗀 뒤 호버 기다림(pendingUp)은 지우지 않는다 —
      // 안드로이드는 뗀 직후에도 out 을 보내고, 기다리는 기간은 AFTER_UP_MS 가 이미 정한다
      if (e.relatedTarget == null) {
        s.penIn = false;
        closeRun();
      }
      return;
    }
    if (e.type === "pointerover") {
      if (!s.penIn) {
        s.penIn = true;
        s.enters += 1;
      }
    } else if (e.type === "pointermove") {
      if (e.buttons === 0) hoverMove(t);
      else if (s.downAt != null) s.downFar = Math.max(s.downFar, dist(x, y, s.downX, s.downY));
    } else if (e.type === "pointerdown") {
      penDown(t, x, y, blank);
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
      else if (penNear(t) || t - s.lastHover < PROBE.HOVER_NEAR_MS) s.near.inRange += 1;
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
        if (penIsDown(t) || penNear(t) || t - s.lastPen < PROBE.NEAR_PEN_MS) s.cancels.near += 1;
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

  // 다가온 누름만 '미리 온 시간'을 낸다(손바닥 막기 값을 정할 때 보는 값). 이어 쓴 누름은 수만
  function leadText() {
    if (!s.downs) return "아직 펜으로 누르지 않음";
    const a = s.approach;
    const lead = a.ok ? ` · 미리 온 시간 가운데값 ${r0(median(a.leads))}ms(가장 짧은 ${r0(Math.min(...a.leads))}ms)` : "";
    return `다가온 누름(뗀 지 0.5초 넘음) ${a.n}번 중 호버가 먼저 온 것 ${a.ok}번${lead} · 이어 쓴 누름 ${s.cont.n}번 중 호버 먼저 ${s.cont.ok}번 · 뗀 뒤 0.3초 안 호버 ${s.afterUp}번(뗌 ${s.ups}번)`;
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

  // 빈칸 콕으로 볼 묶음(blankTapGroups)의 누름 가운데 빈칸 콕 한도(프로필) 안에서 움직인 것의 시간 — 가장 긴 값과 둘째로 긴 값.
  // 뺀 누름: 빈칸 위 손글씨(이어 쓴 묶음)·튐의 짧은 접촉
  function tapText(p) {
    const { taps, skipped } = blankTapGroups(s.blankTaps, p);
    const skip = skipped ? ` · 뺀 누름 ${skipped}번(빈칸 위 손글씨·튐)` : "";
    if (!taps.length) return `아직 없음${skip}`;
    const ms = taps.map((x) => x.ms);
    const desc = [...ms].sort((a, b) => b - a);
    const long = ms.filter((v) => v >= p.TAP_MS).length;
    const second = desc.length > 1 ? ` · 둘째로 긴 ${r0(desc[1])}ms` : "";
    return `${ms.length}번 · 가운데값 ${r0(median(ms))}ms · 가장 긴 ${r0(desc[0])}ms${second} · ${p.TAP_MS}ms 넘어 점이 된 것 ${long}번${skip}`;
  }

  // 같은 자리에 곧바로(0.15초 안) 다시 닿은 빈칸 콕 쌍(두 누름 모두 콕 — 빈칸 콕 한도·TAP_MS 안, 빈칸 콕으로 볼 묶음만):
  // 간격(앞 접촉/뒤 접촉) 목록과, 그중 필기 코드가 촉 튐으로 한 콕에 합칠 것(isPenBounce — 지금 태블릿 값)의 수
  function bounceText(p, ink) {
    const { links } = blankTapGroups(s.blankTaps, p);
    const list = links.slice(-PROBE.REPEAT_KEEP).map((l) => `${l.gap}(${r0(l.a)}/${r0(l.b)})`).join(" ") || "-";
    const head = p.PEN_BOUNCE_MS > 0
      ? `튐 ${links.filter((l) => l.bounce).length}번(뗀 뒤 ${PEN_RETAP_MIN_MS}ms 안, 또는 ${p.PEN_BOUNCE_MS}ms 안 + 한쪽 접촉 ${PEN_BOUNCE_CONTACT_MS}ms 미만)`
      : "튐 합치기 안 씀(이 태블릿 기준)";
    return `${head} · 한 번 콕으로 합친 것 ${ink.penBounce || 0}번 · 0.15초 안 다시 닿은 간격 ms(앞 접촉/뒤 접촉) ${list}`;
  }

  function blockedText() {
    const g = s.blockedN["pen-guard"];
    const o = s.blockedN["pen-overlap"];
    const list = s.blocked.map((b) => `${b.why === "pen-guard" ? "뒤" : "겹침"} ${b.size}·${b.dist ?? "?"}`).join(", ");
    return `펜 뒤 ${g}번 · 펜과 겹침 ${o}번${list ? ` — 최근(크기·펜에서 거리 px): ${list}` : ""}`;
  }

  return {
    // o.blank: 펜 pointerdown 이 빈칸에서 시작했나(PenTestView 가 대상의 [data-ink-blank] 로 알려 줌)
    pointer(e, o = {}) {
      const t = timeOf(e);
      if (e.type === "pointerdown") {
        s.lastDownType = e.pointerType || "";
        s.lastDownAt = t;
      }
      if (e.pointerType === "pen") penEvent(e, t, !!o.blank);
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
    // InkInput 'click-blocked'(손, why = pen-guard | pen-overlap) — 바로 앞 손 누름의 크기와 펜에서 떨어진 거리를 남긴다.
    // 거리: 펜 뒤(pen-guard)는 손이 닿을 때의 마지막 펜 자리에서, 펜과 겹침(pen-overlap)은 겹친 펜이 닿은 자리(그 click 앞 마지막 펜 누름)에서
    inkBlocked(why) {
      if (!(why in s.blockedN)) return;
      s.blockedN[why] += 1;
      const d = s.lastTouchDown;
      if (!d) return;
      const pen = why === "pen-overlap" ? s.lastDownPen : d.penX == null ? null : { x: d.penX, y: d.penY };
      push(s.blocked, { why, size: r0(d.size), dist: pen ? r0(dist(d.x, d.y, pen.x, pen.y)) : null }, PROBE.BLOCKED_KEEP);
    },
    reset() {
      s = fresh();
    },
    penState(now) {
      if (penIsDown(now)) return "닿음";
      if (penNear(now) || now - s.lastHover < PROBE.HOVER_NEAR_MS) return "떠 있음";
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
        ["펜 콕 튐", bounceText(p, ink)],
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
