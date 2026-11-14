// 펜 시험(?pentest) '펜 누른 곳'·'펜 자리'·'마지막 펜 누름'(ink/penWhere) — 순수 함수, DOM 없음
import { test } from "node:test";
import assert from "node:assert/strict";
import { WHERE_ZERO, ZONES, lastPressText, spotIsOut, spotOf, spotText, whereInk, wherePointer, whereText } from "../../src/ink/penWhere.js";

const pen = (type, o = {}) => ({ type, pointerType: "pen", pointerId: 2, isPrimary: true, button: type === "pointerdown" ? 0 : -1, buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1, pressure: 0.31, width: 1, height: 1, clientX: 100, clientY: 100, ...o });
// 펜 누름 한 번: 누름(자리) → 필기 코드 알림들 → 움직임 → 뗌. inks: [[종류, 알림 값], …] (영역 pointerdown 첫머리의 'down' 은 recv 일 때 대본이 넣음)
function press(w, { spot = "in", recv = spot === "in", t0 = 1000, ms = 80, moves = [], inks = [], end = "pointerup", id = 2 } = {}) {
  let v = wherePointer(w, pen("pointerdown", { pointerId: id }), { t: t0, spot });
  if (recv) v = whereInk(v, "down", { type: "pen" });
  moves.forEach(([dx, dy], i) => { v = wherePointer(v, pen("pointermove", { pointerId: id, clientX: 100 + dx, clientY: 100 + dy }), { t: t0 + (i + 1) * 10 }); });
  if (end) v = wherePointer(v, pen(end, { pointerId: id, clientX: 100 + (moves.at(-1)?.[0] ?? 0), clientY: 100 + (moves.at(-1)?.[1] ?? 0) }), { t: t0 + ms });
  for (const [type, d] of inks) v = whereInk(v, type, d);
  return v;
}

test("자리 가르기: 필기 모드 꺼짐이 먼저, 필기 영역 안, 칸 표시, 모르는 칸·없음은 그 밖", () => {
  assert.equal(spotOf({ inkOn: false, inArea: true, zone: "result" }), "off");
  assert.equal(spotOf({ inkOn: false, inArea: false, zone: undefined }), "off");
  assert.equal(spotOf({ inkOn: true, inArea: true, zone: "result" }), "in");
  for (const [k] of ZONES) assert.equal(spotOf({ inkOn: true, inArea: false, zone: k }), k);
  assert.equal(spotOf({ inkOn: true, inArea: false, zone: "text" }), "other");
  assert.equal(spotOf({ inkOn: true, inArea: false, zone: undefined }), "other");
  assert.equal(spotOf({ inkOn: true, inArea: false, zone: "__proto__" }), "other");
  assert.deepEqual(["in", "off", "result", "steps", "buttons", "head", "other", undefined, "x"].map(spotText),
    ["글 안", "필기 모드 꺼짐", "글 밖(결과 표)", "글 밖(설명)", "글 밖(단추 줄)", "글 밖(머리 줄)", "글 밖(그 밖)", "-", "-"]);
  assert.deepEqual(["in", "off", "result", "other", undefined].map(spotIsOut), [false, false, true, true, false]);
});

test("펜 누른 곳: 아직 없음 → 글 안(필기가 받음) → 받지 못한 누름은 빨간 경고", () => {
  assert.deepEqual(whereText(WHERE_ZERO.n, 0), { text: "아직 없음", warn: null, hint: null });
  let w = press(WHERE_ZERO, { inks: [["stroke", { type: "pen" }]] });
  w = press(w, { t0: 2000, inks: [["pen-tap", { blank: 0 }]] });
  assert.deepEqual(whereText(w.n, 1), { text: "글 안 2번(필기가 받음 2번) · 글 밖 0번", warn: null, hint: null });
  w = press(w, { t0: 3000, recv: false }); // 글 안인데 필기 코드의 'down' 이 오지 않음
  assert.deepEqual(whereText(w.n, 1), { text: "글 안 3번(필기가 받음 2번) · 글 밖 0번", warn: "— 글 안에서 누른 펜 1번을 필기가 받지 못함(알려 주세요)", hint: null });
});

test("펜 누른 곳: 결과 표 위만 25번(실기기 장면) → 글 밖 칸별 수 + 회색 안내, 선을 그으면 안내 없음", () => {
  let w = WHERE_ZERO;
  for (let i = 0; i < 25; i++) w = press(w, { spot: "result", t0: 1000 + i * 700, moves: [[0, -30], [0, -60]], end: "pointercancel" });
  const r = whereText(w.n, 0);
  assert.deepEqual(r, { text: "글 안 0번(필기가 받음 0번) · 글 밖 25번(설명 0 · 단추 줄 0 · 결과 표 25 · 머리 줄 0 · 그 밖 0)", warn: null, hint: "선은 글 위에서만 그어집니다" });
  w = press(w, { spot: "steps", t0: 30000 });
  w = press(w, { spot: "head", t0: 31000 });
  w = press(w, { spot: "buttons", t0: 32000 });
  w = press(w, { spot: "other", t0: 33000 });
  w = press(w, { t0: 34000, inks: [["stroke", { type: "pen" }]] });
  assert.deepEqual(whereText(w.n, 1), { text: "글 안 1번(필기가 받음 1번) · 글 밖 29번(설명 1 · 단추 줄 1 · 결과 표 25 · 머리 줄 1 · 그 밖 1)", warn: null, hint: null });
});

test("펜 누른 곳: 필기 모드 꺼짐은 따로(경고 아님) · 손·마우스 알림과 같은 누름의 두 번째 'down' 은 세지 않음 · 누름 없는 'down' 은 무시", () => {
  let w = whereInk(WHERE_ZERO, "down", { type: "pen" });
  assert.equal(w, WHERE_ZERO, "누름 기록 없이 온 알림");
  w = press(w, { spot: "off", t0: 1000 });
  w = press(w, { spot: "off", t0: 2000 });
  assert.deepEqual(whereText(w.n, 0), { text: "글 안 0번(필기가 받음 0번) · 글 밖 0번 · 필기 모드 꺼짐 2번", warn: null, hint: null });
  w = wherePointer(w, pen("pointerdown"), { t: 3000, spot: "in" });
  const before = w;
  w = whereInk(w, "down", { type: "touch" });
  w = whereInk(w, "down", { type: "mouse" });
  assert.equal(w, before, "손·마우스의 'down' 은 펜 누름이 아님");
  w = whereInk(w, "down", { type: "pen" });
  w = whereInk(w, "down", { type: "pen" });
  assert.equal(w.n.got, 1);
  assert.equal(whereText(w.n, 0).text, "글 안 1번(필기가 받음 1번) · 글 밖 0번 · 필기 모드 꺼짐 2번");
  // 손 포인터 이벤트는 기록을 바꾸지 않음
  assert.equal(wherePointer(w, { ...pen("pointerdown"), pointerType: "touch" }, { t: 1, spot: "in" }), w);
  // 호버(누름이 끝난 뒤의 buttons 0 움직임)도 같은 기록
  w = wherePointer(w, pen("pointerup"), { t: 3100 });
  assert.equal(wherePointer(w, pen("pointermove", { buttons: 0 }), { t: 3200 }), w);
});

test("마지막 펜 누름: 글 안 선·콕·두 번 콕·튐 합침 — 자리·id·주 포인터·단추·압력·접촉 → 움직임 → 뗌 · 필기", () => {
  assert.equal(lastPressText(null), "아직 없음");
  let w = press(WHERE_ZERO, { ms: 240, moves: [[10, 0], [40, 3], [85, 4]], inks: [["stroke", { type: "pen" }]] });
  assert.equal(lastPressText(w.last), "글 안 · id 2 · 주 포인터 예 · 단추 0/1 · 압력 0.31 · 접촉 1×1 → 닿은 채 움직임 3번(가장 멀리 85px) → 뗌 240ms · 필기: 선");
  w = press(w, { ms: 70, inks: [["pen-tap", { blank: 3, moved: 0 }]] });
  assert.match(lastPressText(w.last), / → 닿은 채 움직임 0번\(가장 멀리 0px\) → 뗌 70ms · 필기: 콕$/);
  w = press(w, { inks: [["pen-double-tap", { blank: 3 }]] });
  assert.match(lastPressText(w.last), /필기: 두 번 콕$/);
  w = press(w, { inks: [["pen-bounce", { blank: 3, gap: 5 }]] });
  assert.match(lastPressText(w.last), /필기: 콕\(튐 합침\)$/);
  w = press(w, { inks: [["stroke-dropped", { type: "pen" }]] });
  assert.match(lastPressText(w.last), /필기: 선\(저장 안 됨\)$/);
  w = press(w, { inks: [["erase", { n: 2 }], ["pen-tap", { blank: null }]] });
  assert.match(lastPressText(w.last), /필기: 콕 · 지우개로 선 2개$/);
  w = press(w, { moves: [[20, 0], [60, 0]], inks: [["erase", { n: 1 }], ["erase", { n: 2 }]] });
  assert.match(lastPressText(w.last), /필기: 지우개\(선 3개\)$/);
  w = press(w, { moves: [[30, 0]] }); // 받았지만 알림 없음(지우개로 아무것도 안 닿음)
  assert.match(lastPressText(w.last), /필기: 받음\(선·콕 없음\)$/);
});

test("마지막 펜 누름: 글 밖·필기 모드 꺼짐은 '받지 않음', 건너뜀(까닭), 취소(선 살림), 떼기 못 받음, 아직 닿아 있음", () => {
  let w = press(WHERE_ZERO, { spot: "result", ms: 30, moves: [[0, -12]], end: "pointercancel" });
  assert.equal(lastPressText(w.last), "글 밖(결과 표) · id 2 · 주 포인터 예 · 단추 0/1 · 압력 0.31 · 접촉 1×1 → 닿은 채 움직임 1번(가장 멀리 12px) → 취소 30ms · 필기: 받지 않음");
  w = press(w, { spot: "off", ms: 50 });
  assert.match(lastPressText(w.last), /^필기 모드 꺼짐 · .* → 뗌 50ms · 필기: 받지 않음$/);
  w = press(w, { inks: [["down-skip", { type: "pen", why: "interactive" }]] });
  assert.match(lastPressText(w.last), /필기: 건너뜀\(단추·입력칸 위\)$/);
  w = press(w, { inks: [["down-skip", { type: "pen", why: "busy" }]] });
  assert.match(lastPressText(w.last), /필기: 건너뜀\(다른 입력이 긋는 중\)$/);
  w = press(w, { inks: [["down-skip", { type: "mouse", why: "button" }]] });
  assert.match(lastPressText(w.last), /필기: 받음\(선·콕 없음\)$/, "마우스 건너뜀은 펜 누름에 붙지 않음");
  w = press(w, { moves: [[30, 0], [60, 0]], end: "pointercancel", inks: [["stroke", { type: "pen", why: "cancel" }], ["cancel", { type: "pen", why: "cancel", kept: true }]] });
  assert.match(lastPressText(w.last), /→ 취소 80ms · 필기: 취소\(브라우저가 가져감 — 선은 살림\)$/);
  w = press(w, { inks: [["cancel", { type: "pen", why: "blur", kept: false }]] });
  assert.match(lastPressText(w.last), /필기: 취소\(창이 초점 잃음\)$/);
  // 떼기를 못 받고 펜이 떠 있음(buttons 0 움직임) — 그 뒤 늦게 온 떼기는 무시
  w = press(w, { t0: 9000, moves: [[5, 0]], end: null });
  w = wherePointer(w, pen("pointermove", { buttons: 0, clientX: 120 }), { t: 9150 });
  w = wherePointer(w, pen("pointerup"), { t: 9400 });
  assert.match(lastPressText(w.last), /→ 떼기 못 받음\(떠 있음\) 150ms · 필기: 받음\(선·콕 없음\)$/);
  // 다른 펜 id 의 움직임·뗌은 이 누름이 아님
  w = press(w, { t0: 10000, end: null });
  const mid = w;
  w = wherePointer(w, pen("pointermove", { pointerId: 7, clientX: 300 }), { t: 10010 });
  w = wherePointer(w, pen("pointerup", { pointerId: 7 }), { t: 10020 });
  assert.equal(w, mid);
  assert.match(lastPressText(w.last), /→ 닿은 채 움직임 0번\(가장 멀리 0px\) → 아직 닿아 있음 · 필기: 받음\(닿아 있음\)$/);
  // 주 포인터 아님·단추 값·압력·접촉
  w = wherePointer(w, pen("pointerdown", { isPrimary: false, button: 5, buttons: 32, pressure: 0.123, width: 2.345, height: 3 }), { t: 11000, spot: "in" });
  assert.match(lastPressText(w.last), /^글 안 · id 2 · 주 포인터 아니오 · 단추 5\/32 · 압력 0\.12 · 접촉 2\.35×3 → /);
});

test("마지막 펜 누름: 앞 누름의 떼기를 놓쳐 살린 알림(why missed-up — 새 누름의 'down' 다음에 옴)은 새 누름에 붙이지 않음", () => {
  let w = wherePointer(WHERE_ZERO, pen("pointerdown"), { t: 1000, spot: "in" });
  w = whereInk(w, "down", { type: "pen" });
  w = wherePointer(w, pen("pointerdown"), { t: 2000, spot: "in" }); // 떼기 없이 새 누름
  w = whereInk(w, "down", { type: "pen" });
  w = whereInk(w, "stroke", { type: "pen", why: "missed-up" });
  w = whereInk(w, "cancel", { type: "pen", why: "missed-up", kept: true });
  assert.equal(w.n.in, 2);
  assert.equal(w.n.got, 2);
  assert.match(lastPressText(w.last), /필기: 받음\(닿아 있음\)$/);
  w = whereInk(w, "pen-tap", { blank: 1 });
  assert.match(lastPressText(w.last), /필기: 콕$/);
});

test("받지 않은 누름에는 필기 알림을 붙이지 않음(글 밖 누름 뒤 늦게 온 알림)", () => {
  let w = press(WHERE_ZERO, { spot: "result", inks: [["stroke", { type: "pen" }], ["pen-tap", {}]] });
  assert.match(lastPressText(w.last), /필기: 받지 않음$/);
  assert.equal(whereText(w.n, 1).hint, null, "선이 있으면 안내 없음");
});
