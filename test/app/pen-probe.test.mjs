// 펜 시험(?pentest) 자세히 표의 계산(ink/penProbe) — 순수 함수, DOM 없음
import { test } from "node:test";
import assert from "node:assert/strict";
import { PROBE, createProbe, median, resultText } from "../../src/ink/penProbe.js";

const GALAXY = { TAP_MS: 300, PEN_BLANK_TAP_SLOP: 12 };
const pen = (type, t, x = 100, y = 100, o = {}) => ({ type, pointerType: "pen", pointerId: 9, timeStamp: t, clientX: x, clientY: y, buttons: type === "pointerdown" || (type === "pointermove" && o.down) ? 1 : 0, relatedTarget: null, ...o });
const fing = (type, t, x = 300, y = 300, o = {}) => ({ type, pointerType: "touch", pointerId: o.id ?? 1, isPrimary: o.isPrimary ?? true, timeStamp: t, clientX: x, clientY: y, width: o.w ?? 20, height: o.h ?? 20, ...o });
const row = (p, name, prof = GALAXY, ink = {}) => p.rows(prof, ink).find(([k]) => k === name)[1];

test("호버 줄기: 8ms 간격 30개 → 초당 약 125개, 300ms 넘게 비면 새 줄기·끊김은 줄기 안에서만", () => {
  const p = createProbe();
  for (let i = 0; i < 30; i++) p.pointer(pen("pointermove", 1000 + i * 8));
  for (let i = 0; i < 30; i++) p.pointer(pen("pointermove", 2000 + i * 8 + (i === 10 ? 40 : 0)));
  const t = row(p, "펜 호버 자세히");
  assert.match(t, /^예 — 호버 60번 · 범위 들어옴 0번 · 띄운 동안 초당 약 1\d\d개 · 가장 긴 끊김 48ms$/);
  assert.equal(createProbe().rows(GALAXY)[0][1], "없음 — 펜을 화면 1cm 위에 띄워 조금씩 움직여 보세요");
  const q = createProbe();
  q.pointer(pen("pointerover", 10, 0, 0, { relatedTarget: {} }));
  assert.equal(row(q, "펜 호버 자세히"), "범위 들어옴 1번뿐 — 띄운 채 움직임은 오지 않음");
});

test("닿기 전 호버: 줄기 시작부터 누름까지, 닿는 순간 함께 온 것은 세지 않음, 뗀 뒤 호버", () => {
  const p = createProbe();
  p.pointer(pen("pointerover", 1000, 100, 100, { relatedTarget: {} }));
  p.pointer(pen("pointermove", 1010));
  p.pointer(pen("pointermove", 1180));
  p.pointer(pen("pointerdown", 1200));
  p.pointer(pen("pointerup", 1260));
  p.pointer(pen("pointermove", 1300)); // 뗀 뒤 40ms 호버
  p.pointer(pen("pointerout", 1400, 100, 100, { relatedTarget: null }));
  // 호버 없는 펜: over 가 누름과 같은 때(크롬이 누름 앞에 붙여 보냄)
  p.pointer(pen("pointerover", 5000, 100, 100, { relatedTarget: {} }));
  p.pointer(pen("pointerdown", 5000));
  p.pointer(pen("pointerup", 5050));
  p.pointer(pen("pointerout", 5050, 100, 100, { relatedTarget: null }));
  assert.equal(row(p, "닿기 전·뗀 뒤 호버"), "펜 누름 2번 중 호버가 먼저 온 것 1번 · 미리 온 시간 가운데값 200ms(가장 짧은 200ms) · 뗀 뒤 0.3초 안 호버 1번(뗌 2번)");
  assert.equal(createProbe().rows(GALAXY)[1][1], "아직 펜으로 누르지 않음");
});

test("펜을 가만히 띄움(움직임 없음): pointerover~pointerout 동안 '떠 있음', 그동안 닿은 손은 '펜 범위 안'", () => {
  const p = createProbe();
  p.pointer(pen("pointerover", 1000, 100, 100, { relatedTarget: {} }));
  assert.equal(p.penState(1500), "떠 있음");
  assert.equal(p.penState(5000), "떠 있음", "움직임이 없어도 범위 안");
  p.pointer(fing("pointerdown", 5000));
  p.pointer(fing("pointerup", 5050));
  p.pointer(pen("pointerout", 6000, 100, 100, { relatedTarget: null }));
  assert.equal(p.penState(6001), "없음");
  p.pointer(fing("pointerdown", 9000));
  p.pointer(fing("pointerup", 9050));
  p.pointer(pen("pointerdown", 10000));
  assert.equal(p.penState(10001), "닿음");
  p.pointer(fing("pointerdown", 10010, 400, 400, { id: 2, isPrimary: true }));
  assert.equal(p.penState(10000 + PROBE.PEN_STALE_MS + 1), "없음", "떼기를 놓쳐도 2초 뒤엔 닿음이 아님");
  p.pointer(pen("pointerup", 10100));
  p.pointer(fing("pointerdown", 10400, 400, 400, { id: 3 }));
  assert.equal(row(p, "펜 가까이에서 닿은 손"), "펜 범위 안 1 · 닿아 있을 때 1 · 뗀 뒤 0.5초 안 1 · 펜 멀리(또는 모름) 1");
  // 다른 요소로 옮겨 간 pointerout(relatedTarget 있음)은 범위를 벗어난 것이 아님
  const q = createProbe();
  q.pointer(pen("pointerover", 0, 0, 0, { relatedTarget: {} }));
  q.pointer(pen("pointerout", 100, 0, 0, { relatedTarget: {} }));
  assert.equal(q.penState(5000), "떠 있음");
  q.focusLost();
  assert.equal(q.penState(5001), "없음", "창이 초점을 잃으면 범위 밖으로");
});

test("손 터치 취소: 펜 가까이와 그 밖, 펜이 와서 멈춘 스크롤 셈은 필기 코드 값", () => {
  const p = createProbe();
  p.pointer(fing("pointerdown", 1000));
  p.pointer(pen("pointerover", 1100, 0, 0, { relatedTarget: {} }));
  p.pointer(fing("pointercancel", 1110));
  p.pointer(pen("pointerout", 1200, 0, 0, { relatedTarget: null }));
  p.pointer(fing("pointerdown", 3000));
  p.pointer(fing("pointercancel", 3100));
  assert.equal(row(p, "손 터치 취소(pointercancel)", GALAXY, { palmStopScroll: 2 }), "2번 · 펜 가까이 1 · 그 밖 1 · 펜이 와서 멈춘 두 손가락 스크롤 2번");
});

test("접촉 묶음: 함께 닿은 것 +, 취소 x, 닿은 뒤 커진 크기, 크기 없음(2 이하)", () => {
  const p = createProbe();
  p.pointer(fing("pointerdown", 0, 0, 0, { w: 21, h: 18 }));
  p.pointer(fing("pointerup", 50, 0, 0, { w: 1, h: 1 }));
  p.pointer(fing("pointerdown", 100, 0, 0, { id: 1, w: 30, h: 30 }));
  p.pointer(fing("pointermove", 120, 0, 0, { id: 1, w: 58, h: 40 }));
  p.pointer(fing("pointerdown", 130, 50, 0, { id: 2, isPrimary: false, w: 31, h: 31 }));
  p.pointer(fing("pointercancel", 200, 50, 0, { id: 2 }));
  p.pointer(fing("pointerup", 210, 0, 0, { id: 1 }));
  p.pointer(fing("pointerdown", 400, 0, 0, { id: 3, w: 2, h: 2 }));
  assert.equal(row(p, "최근 손 접촉(닿은 차례 · 가장 컸던 크기 px)"), "21 58+31x 2 — + 는 함께 닿음, x 는 취소됨 · 크기 없음(2 이하) 1개");
});

test("Touch 반지름: 같은 입력의 포인터와 짝, 움직이는 중 최대, touchType 없음", () => {
  const p = createProbe();
  p.pointer(fing("pointerdown", 1000, 300, 300, { w: 22, h: 20 }));
  p.touch({ type: "touchstart", timeStamp: 1000, changedTouches: [{ identifier: 0, clientX: 300, clientY: 300, radiusX: 11, radiusY: 9, force: 0.4 }] });
  p.touch({ type: "touchmove", timeStamp: 1030, changedTouches: [{ identifier: 0, clientX: 302, clientY: 300, radiusX: 30, radiusY: 25, force: 0.9 }] });
  assert.equal(row(p, "Touch 반지름×2(포인터 크기와 견줌)"), "닿을 때 최대 22 · 움직이는 중 최대 60 · 같은 입력(포인터/Touch) 22/22 · force 최대 0.4 · touchType 이 브라우저에 없음");
  const q = createProbe();
  q.touch({ type: "touchstart", timeStamp: 5, changedTouches: [{ clientX: 1, clientY: 1, radiusX: 1, radiusY: 1, force: 0, touchType: "direct" }] });
  assert.match(row(q, "Touch 반지름×2(포인터 크기와 견줌)"), /touchType direct 1$/);
  assert.equal(createProbe().rows(GALAXY)[5][1], "아직 없음");
});

test("펜이 함께 보낸 touch: 같은 자리 짝·어긋난 것·유령 손가락(앞뒤 모두)", () => {
  const p = createProbe();
  p.pointer(pen("pointerdown", 1000, 100, 100));
  p.touch({ type: "touchstart", timeStamp: 1001, changedTouches: [{ clientX: 100, clientY: 101 }] }); // 짝
  p.touch({ type: "touchstart", timeStamp: 1300, changedTouches: [{ clientX: 120, clientY: 100 }] }); // 어긋남(펜 닿아 있음, 20px)
  p.pointer(fing("pointerdown", 1050, 110, 100, { id: 4 })); // 유령(펜 뒤 50ms·10px)
  p.pointer(pen("pointerup", 1400, 100, 100));
  p.pointer(fing("pointerdown", 2950, 205, 200, { id: 5 })); // 유령(펜 앞 50ms)
  p.pointer(pen("pointerdown", 3000, 200, 200));
  assert.equal(row(p, "펜이 함께 보낸 touch"), "펜 누름 2번 · 같은 자리 touch 1번 · 어긋난 touch 1번(0이어야 펜으로 단추가 눌림) · 펜 옆 손 포인터(유령) 2번(0이어야 함)");
});

test("펜 콕 튐: 60ms·10px 경계, 0.15초 안 간격 목록, 합친 수는 필기 코드 값", () => {
  const p = createProbe();
  const tap = (t0, t1, x = 100) => { p.pointer(pen("pointerdown", t0, x)); p.pointer(pen("pointerup", t1, x)); };
  tap(0, 50);
  tap(58, 90); // 8ms 뒤 — 튐
  tap(150, 200); // 60ms 뒤 — 튐(경계 포함)
  tap(261, 300); // 61ms — 튐 아님, 목록에는
  tap(400, 450, 115); // 100ms 뒤 15px — 목록에도 없음
  tap(1000, 1050); // 550ms 뒤
  assert.equal(row(p, "펜 콕 튐", GALAXY, { penBounce: 1 }), "뗀 뒤 60ms 안 같은 자리 다시 닿음 2번(0이어야 함) · 한 번 콕으로 합친 것 1번 · 0.15초 안 다시 닿은 간격(ms) 8 60 61");
});

test("펜 콕 시간: 빈칸 콕 한도(프로필) 안에서 움직인 누름만, 프로필 TAP_MS 넘은 수", () => {
  const p = createProbe();
  p.pointer(pen("pointerdown", 0, 0, 0)); p.pointer(pen("pointermove", 50, 5, 0, { down: true })); p.pointer(pen("pointerup", 120, 5, 0));
  p.pointer(pen("pointerdown", 1000, 0, 0)); p.pointer(pen("pointerup", 1350, 0, 0));
  p.pointer(pen("pointerdown", 2000, 0, 0)); p.pointer(pen("pointermove", 2050, 13, 0, { down: true })); p.pointer(pen("pointerup", 2100, 13, 0)); // 선(13px)
  p.pointer(pen("pointerdown", 3000, 0, 0)); p.pointer(pen("pointerup", 3200, 0, 0));
  assert.equal(row(p, "펜 콕 시간(짧게 누른 것)"), "3번 · 가운데값 200ms · 가장 긴 350ms · 300ms 넘어 점이 된 것 1번");
  assert.equal(row(p, "펜 콕 시간(짧게 누른 것)", { TAP_MS: 400, PEN_BLANK_TAP_SLOP: 14 }), "4번 · 가운데값 160ms · 가장 긴 350ms · 400ms 넘어 점이 된 것 0번");
});

test("막은 손 터치: 바로 앞 손 누름의 크기·펜에서 거리, palm 은 세지 않음", () => {
  const p = createProbe();
  p.pointer(pen("pointermove", 10, 100, 100));
  p.pointer(fing("pointerdown", 20, 400, 500, { w: 22, h: 18 }));
  p.inkBlocked("pen-guard");
  p.pointer(fing("pointerdown", 40, 130, 140, { w: 64, h: 50 }));
  p.inkBlocked("pen-overlap");
  p.inkBlocked("palm");
  assert.equal(row(p, "막은 손 터치(펜 뒤·펜과 겹침)"), "펜 뒤 1번 · 펜과 겹침 1번 — 최근(크기·펜에서 거리 px): 뒤 22·500, 겹침 64·50");
  assert.equal(row(createProbe(), "막은 손 터치(펜 뒤·펜과 겹침)"), "펜 뒤 0번 · 펜과 겹침 0번");
});

test("contextmenu 종류(없으면 1초 안 바로 앞 누름), 키 이름 8개 상한, 초점 잃음·숨김, reset", () => {
  const p = createProbe();
  p.contextmenu({ pointerType: "pen", timeStamp: 1 });
  p.pointer(fing("pointerdown", 100));
  p.contextmenu({ timeStamp: 500 });
  p.contextmenu({ timeStamp: 1500 });
  p.contextmenu({ pointerType: "mouse", timeStamp: 1600 });
  assert.equal(row(p, "길게 누름 메뉴(contextmenu)"), "펜 1 · 손 1 · 마우스·자판 2");
  for (const k of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "a"]) p.key({ key: k });
  p.focusLost();
  p.hidden();
  assert.equal(row(p, "펜 단추·시스템"), "키 입력 10번(a, b, c, d, e, f, g, h) · 앱이 가려짐: 초점 잃음 1 · 숨김 1 (펜 단추가 메모·화면 인식을 띄우면 늘어남)");
  p.reset();
  assert.equal(row(p, "펜 단추·시스템"), "키 입력 0번 · 앱이 가려짐: 초점 잃음 0 · 숨김 0 (펜 단추가 메모·화면 인식을 띄우면 늘어남)");
  assert.equal(p.rows(GALAXY).length, 12);
});

test("결과 복사 글, 가운데값", () => {
  const txt = resultText({ when: "2026. 11. 15. 오전 9:30:12", tablet: "레노버 Y700 5세대", sections: [
    { title: "결과 요약", rows: [["태블릿 기준", "레노버 Y700 5세대 — 손바닥 700ms"], ["펜 인식(pointerType pen)", "예 —\n펜으로 3번   누름"]] },
    { title: "자세히", rows: [["펜 콕 튐", "뗀 뒤 60ms 안 …"]] },
  ] });
  assert.equal(txt, "펜 시험 결과 · 2026. 11. 15. 오전 9:30:12 · 태블릿 레노버 Y700 5세대\n\n[결과 요약]\n태블릿 기준: 레노버 Y700 5세대 — 손바닥 700ms\n펜 인식(pointerType pen): 예 — 펜으로 3번 누름\n\n[자세히]\n펜 콕 튐: 뗀 뒤 60ms 안 …");
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
});
