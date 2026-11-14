// 펜 시험(?pentest) — 펜이 어디를 눌렀고 필기(InkInput)가 그 누름을 받았는지. 순수 계산(DOM 없음 — Node 시험).
// 실기기(Y700, 운영의 옛 ?pentest)에서 펜 누름 25번에 '펜으로 그은 선 0 · 펜 콕 0 · 취소 0'이 나왔다 — 필기 코드가 펜 누름을 하나도 받지 않았다.
// 글(필기 영역)이 아니라 설명·결과 표 등을 눌렀는지(표 위에서 펜으로 끌면 화면이 밀려 손처럼 보임), 정말 못 받았는지를 바로 가른다.
//  - 결과 요약 '펜 누른 곳'(whereText): 글 안 N번(필기가 받음 K번) · 글 밖 M번(칸별) · 필기 모드 꺼짐 f번 — N > K 면 빨간 경고,
//    그은 선이 0개인데 글 밖을 눌렀거나 필기 모드를 끈 채 눌렀으면 회색 안내
//  - 위 모니터 '펜 자리'(spotLive): 마지막 펜 누름의 자리(글 안인데 필기가 받지 못했으면 「글 안(못 받음)」)
//  - 자세히 '마지막 펜 누름'(lastPressText): 그 누름 한 번의 차례(자리 · id · 주 포인터 · 단추 · 압력 · 접촉 → 움직임 → 뗌 · 필기가 한 일).
//    글 밖의 단추·링크·입력칸을 누른 것(결과 복사·결과 표로 ↓ 등 — ctl)은 칸별 수와 위 '펜 자리'에만 넣고 이 기록은 바꾸지 않는다
//    (펜으로 결과 복사를 누르면 복사 글의 이 줄이 그 복사 누름이 되지 않게)
// 기록은 바꾸지 않고 새로 만들어 돌려준다(PenTestView 의 기록 보관소 — 바뀐 것이 없으면 같은 객체).
// PenTestView 가 창 캡처 리스너에서 펜 포인터 이벤트와 누름의 자리(spot — spotOf)를 wherePointer 로, 필기 코드의 알림(onEvent)을 whereInk 로 넣는다.
// 창 캡처가 먼저 돌므로 같은 누름의 필기 코드 'down'(영역 pointerdown 첫머리) 알림은 그 누름의 pointerdown 기록 다음에 온다(같은 이벤트 안).

// 글 밖 칸(PenTestView 의 카드·머리 줄에 붙인 data-pentest-zone) — 이 차례로 글을 낸다
export const ZONES = Object.freeze([["steps", "설명"], ["buttons", "단추 줄"], ["result", "결과 표"], ["head", "머리 줄"], ["other", "그 밖"]]);
const ZONE_NAME = Object.freeze(Object.fromEntries(ZONES));
const isZone = (k) => typeof k === "string" && Object.hasOwn(ZONE_NAME, k);

// 글 밖에서 이것을 누른 펜은 '단추를 누른 것'(ctl) — 마지막 펜 누름 기록을 바꾸지 않는다
export const CONTROL = 'button, a[href], input, textarea, select, label, [role="button"]';

// n: 누름 수 — in 글 안 · got 그중 필기가 받은 것 · off 필기 모드 꺼짐 · 칸 이름마다 글 밖.
// spot: 마지막 펜 누름(단추 누름 포함)의 자리, last: 마지막 펜 누름(글 밖 단추 누름은 빼고)의 기록
export const WHERE_ZERO = Object.freeze({
  n: Object.freeze({ in: 0, got: 0, off: 0, ...Object.fromEntries(ZONES.map(([k]) => [k, 0])) }),
  spot: null,
  last: null,
});

// 펜 누름의 자리: 필기 모드 꺼짐 "off"(경고 아님 — 필기 코드가 붙어 있지 않음), 필기 영역([data-ink-area="on"]) 안 "in",
// 아니면 가장 가까운 칸 표시(zone — 모르는 값·없음은 "other")
export function spotOf({ inkOn, inArea, zone }) {
  if (!inkOn) return "off";
  if (inArea) return "in";
  return isZone(zone) ? zone : "other";
}

// 위 모니터 '펜 자리'·자세히 줄의 자리 글. 누름이 없으면 "-"
export function spotText(spot) {
  if (spot === "in") return "글 안";
  if (spot === "off") return "필기 모드 꺼짐";
  return isZone(spot) ? `글 밖(${ZONE_NAME[spot]})` : "-";
}

// 글 밖인가(위 모니터 강조)
export const spotIsOut = (spot) => isZone(spot);

// 위 모니터 '펜 자리' 칸: { text, hot(강조) } — 글 밖, 그리고 글 안인데 필기가 그 누름을 받지 못함(받았는지는 같은 이벤트 안에 정해져
// 다음 그림에서 맞음)이면 강조
export function spotLive(w) {
  const s = w?.spot;
  if (s === "in" && w.last && !w.last.recv) return { text: "글 안(못 받음)", hot: true };
  return { text: spotText(s), hot: spotIsOut(s) };
}

const fin = (v) => (Number.isFinite(v) ? v : 0);
const r2 = (v) => Math.round(fin(v) * 100) / 100;

// 창 캡처 펜 포인터 이벤트 → 새 기록. e 는 필드만 읽는다(펜이 아니면 그대로).
// o = { t: 이벤트 시각, spot: pointerdown 의 자리(spotOf), ctl: 글 밖 단추·링크·입력칸을 누름(CONTROL) }
//  - pointerdown: 새 누름(자리별 수 +1, 마지막 자리). 단추 누름(ctl)이 아니면 새 기록(last) — 단추 누름은 기록을 그대로 두되,
//    앞 누름이 아직 닿아 있던 것이면 '떼기 못 받음(다음 누름)'으로 닫는다(단추 누름의 움직임·뗌이 앞 누름에 붙지 않게)
//  - 그 누름이 닿은 채 움직임(buttons > 0): 움직임 수·누른 곳에서 가장 멀리 간 거리
//  - pointerup·pointercancel: 끝(뗌·취소)과 누른 시간. 떼기 없이 떠 있는 움직임(buttons 0)이 오면 '떼기 못 받음'(필기 코드도 그렇게 봄)
export function wherePointer(w, e, { t = 0, spot, ctl = false } = {}) {
  if (!w || e?.pointerType !== "pen") return w;
  const x = fin(e.clientX);
  const y = fin(e.clientY);
  if (e.type === "pointerdown") {
    const s = spot === "in" || spot === "off" || isZone(spot) ? spot : "other";
    const n = { ...w.n, [s]: w.n[s] + 1 };
    if (ctl && s !== "in") {
      const p = w.last;
      return { n, spot: s, last: p && !p.end ? { ...p, end: "next", ms: t - p.t0 } : p };
    }
    return {
      n,
      spot: s,
      last: {
        spot: s, id: e.pointerId, primary: !!e.isPrimary, button: e.button, buttons: e.buttons,
        pressure: r2(e.pressure), w: r2(e.width), h: r2(e.height), t0: t, x0: x, y0: y,
        moves: 0, far: 0, end: null, ms: null, recv: false, skip: null, ink: null, why: null, erased: 0,
      },
    };
  }
  const p = w.last;
  if (!p || p.end || p.id !== e.pointerId) return w;
  if (e.type === "pointermove") {
    if (e.buttons === 0) return { ...w, last: { ...p, end: "air", ms: t - p.t0 } };
    return { ...w, last: { ...p, moves: p.moves + 1, far: Math.max(p.far, Math.hypot(x - p.x0, y - p.y0)) } };
  }
  if (e.type === "pointerup") return { ...w, last: { ...p, end: "up", ms: t - p.t0, far: Math.max(p.far, Math.hypot(x - p.x0, y - p.y0)) } };
  // 취소의 자리는 믿지 않는다(브라우저에 따라 0)
  if (e.type === "pointercancel") return { ...w, last: { ...p, end: "cancel", ms: t - p.t0 } };
  return w;
}

// 필기 코드(InkInput onEvent)의 알림 → 새 기록. 'down'(영역 pointerdown 첫머리, 펜) = 마지막 누름을 받음(글 안이면 받은 수 +1),
// 그 뒤 알림은 받은 누름의 결과로 붙인다: 'down-skip'(일찍 돌아감 — why), 'stroke'·'stroke-dropped'·'cancel'(펜)·'pen-tap'·'pen-double-tap'·
// 'pen-bounce'·'erase'. 앞 누름의 떼기를 놓쳐 살린 것(why 'missed-up' — 새 누름의 'down' 다음에 옴)은 앞 누름 일이라 붙이지 않는다
export function whereInk(w, type, d = {}) {
  const p = w?.last;
  if (!p) return w;
  const D = d || {};
  if (type === "down") {
    if (D.type !== "pen" || p.recv) return w;
    return { ...w, n: p.spot === "in" ? { ...w.n, got: w.n.got + 1 } : w.n, last: { ...p, recv: true } };
  }
  if (!p.recv || D.why === "missed-up") return w;
  const set = (o) => ({ ...w, last: { ...p, ...o } });
  switch (type) {
    case "down-skip": return D.type === "pen" ? set({ skip: D.why || "?" }) : w;
    case "stroke": return D.type === "pen" ? set({ ink: "stroke" }) : w;
    case "stroke-dropped": return D.type === "pen" ? set({ ink: "dropped" }) : w;
    case "cancel": return D.type === "pen" ? set({ ink: D.kept ? "cancel-kept" : "cancel", why: D.why ?? null }) : w;
    case "pen-tap": return set({ ink: "tap" });
    case "pen-double-tap": return set({ ink: "double" });
    case "pen-bounce": return set({ ink: "bounce" });
    case "erase": return set({ ink: p.ink ?? "erase", erased: p.erased + (D.n || 0) });
    default: return w;
  }
}

// 결과 요약 '펜 누른 곳' → { text, warn(빨간 글 — 글 안 누름을 필기가 못 받음), hint(회색 안내 — 선이 0개인데 글 밖을 누름·필기 모드를 끈 채 누름) }
// strokes: 결과 요약 '펜으로 그은 선' 수
export function whereText(n, strokes = 0) {
  const out = ZONES.reduce((a, [k]) => a + n[k], 0);
  if (!n.in && !out && !n.off) return { text: "아직 없음", warn: null, hint: null };
  let text = `글 안 ${n.in}번(필기가 받음 ${n.got}번) · 글 밖 ${out}번`;
  if (out) text += `(${ZONES.map(([k, name]) => `${name} ${n[k]}`).join(" · ")})`;
  if (n.off) text += ` · 필기 모드 꺼짐 ${n.off}번`;
  const miss = n.in - n.got;
  const hints = [];
  if (!(strokes > 0)) {
    if (out > 0) hints.push("선은 글 위에서만 그어집니다");
    if (n.off > 0) hints.push("필기 모드를 켜야 선이 그어집니다");
  }
  return {
    text,
    warn: miss > 0 ? `— 글 안에서 누른 펜 ${miss}번을 필기가 받지 못함(알려 주세요)` : null,
    hint: hints.length ? hints.join(" · ") : null,
  };
}

const SKIP_TEXT = { interactive: "단추·입력칸 위", busy: "다른 입력이 긋는 중", button: "오른쪽 단추" };
const CANCEL_WHY = { cancel: "브라우저가 가져감", blur: "창이 초점 잃음", hidden: "앱이 가려짐", detach: "필기 모드 끔" };

function inkText(p) {
  if (!p.recv) return "받지 않음";
  if (p.skip) return `건너뜀(${SKIP_TEXT[p.skip] ?? p.skip})`;
  const why = CANCEL_WHY[p.why] ?? p.why ?? "?";
  const erased = p.erased && p.ink !== "erase" ? ` · 지우개로 선 ${p.erased}개` : "";
  switch (p.ink) {
    case "stroke": return "선";
    case "dropped": return "선(저장 안 됨)";
    case "tap": return `콕${erased}`;
    case "double": return `두 번 콕${erased}`;
    case "bounce": return `콕(튐 합침)${erased}`;
    case "cancel": return `취소(${why})${erased}`;
    case "cancel-kept": return `취소(${why} — 선은 살림)`;
    case "erase": return `지우개(선 ${p.erased}개)`;
    default: return p.end ? "받음(선·콕 없음)" : "받음(닿아 있음)";
  }
}

// 자세히 '마지막 펜 누름': 자리 · id · 주 포인터 · 단추(button/buttons) · 압력 · 접촉 → 닿은 채 움직임 → 뗌/취소 · 필기가 한 일
export function lastPressText(p) {
  if (!p) return "아직 없음";
  const head = `${spotText(p.spot)} · id ${p.id ?? "?"} · 주 포인터 ${p.primary ? "예" : "아니오"} · 단추 ${p.button ?? "?"}/${p.buttons ?? "?"} · 압력 ${p.pressure} · 접촉 ${p.w}×${p.h}`;
  const move = `닿은 채 움직임 ${p.moves}번(가장 멀리 ${Math.round(p.far)}px)`;
  const ms = Math.round(fin(p.ms));
  const end = p.end === "up" ? `뗌 ${ms}ms` : p.end === "cancel" ? `취소 ${ms}ms` : p.end === "air" ? `떼기 못 받음(떠 있음) ${ms}ms`
    : p.end === "next" ? `떼기 못 받음(다음 누름) ${ms}ms` : "아직 닿아 있음";
  return `${head} → ${move} → ${end} · 필기: ${inkText(p)}`;
}
