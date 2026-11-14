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

test("닿기 전 호버: 호버 움직임 줄기 시작부터 누름까지, 닿는 순간 함께 온 것은 세지 않음, 뗀 뒤 호버", () => {
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
  assert.equal(row(p, "닿기 전·뗀 뒤 호버"), "펜 누름 2번 중 호버가 먼저 온 것 1번 · 미리 온 시간 가운데값 190ms(가장 짧은 190ms) · 뗀 뒤 0.3초 안 호버 1번(뗌 2번)");
  assert.equal(createProbe().rows(GALAXY)[1][1], "아직 펜으로 누르지 않음");
});

test("안드로이드 차례(호버 → out → over+down → up → out → over → 호버): 호버되는 펜은 '먼저 온 것'·'뗀 뒤 호버'로 셈", () => {
  const p = createProbe();
  for (let i = 0; i < 10; i++) {
    const T = 1000 + i * 2000;
    for (let k = 0; k <= 180; k += 10) p.pointer(pen("pointermove", T + k)); // 다가오며 호버
    p.pointer(pen("pointerout", T + 190, 100, 100, { relatedTarget: null })); // 닿기 직전 HOVER_EXIT
    p.pointer(pen("pointerover", T + 200, 100, 100, { relatedTarget: null }));
    p.pointer(pen("pointerdown", T + 200));
    p.pointer(pen("pointerup", T + 260));
    p.pointer(pen("pointerout", T + 261, 100, 100, { relatedTarget: null })); // 뗀 직후 out
    p.pointer(pen("pointerover", T + 270, 100, 100, { relatedTarget: null }));
    for (let k = 280; k <= 400; k += 10) p.pointer(pen("pointermove", T + k)); // 뗀 뒤 다시 호버
  }
  assert.equal(row(p, "닿기 전·뗀 뒤 호버"), "펜 누름 10번 중 호버가 먼저 온 것 10번 · 미리 온 시간 가운데값 200ms(가장 짧은 200ms) · 뗀 뒤 0.3초 안 호버 10번(뗌 10번)");
  assert.equal(p.penState(19400), "떠 있음");
  // 같은 차례의 호버 없는 펜(호버 움직임 없음)은 0번
  const q = createProbe();
  for (let i = 0; i < 3; i++) {
    const T = 1000 + i * 2000;
    q.pointer(pen("pointerover", T, 100, 100, { relatedTarget: null }));
    q.pointer(pen("pointerdown", T));
    q.pointer(pen("pointerup", T + 60));
    q.pointer(pen("pointerout", T + 61, 100, 100, { relatedTarget: null }));
  }
  assert.equal(row(q, "닿기 전·뗀 뒤 호버"), "펜 누름 3번 중 호버가 먼저 온 것 0번 · 뗀 뒤 0.3초 안 호버 0번(뗌 3번)");
});

test("닿기 전 호버는 앞 누름을 뗀 뒤 온 호버만: 호버 → 콕 → 20ms 뒤 다시 닿음(튐)은 '먼저 온 것' 1번", () => {
  const p = createProbe();
  for (let t = 1000; t <= 1080; t += 10) p.pointer(pen("pointermove", t));
  p.pointer(pen("pointerdown", 1090));
  p.pointer(pen("pointerup", 1130));
  p.pointer(pen("pointerdown", 1150)); // 뗀 뒤 호버 없이 곧바로(마지막 호버 70ms 전)
  p.pointer(pen("pointerup", 1155));
  assert.equal(row(p, "닿기 전·뗀 뒤 호버"), "펜 누름 2번 중 호버가 먼저 온 것 1번 · 미리 온 시간 가운데값 90ms(가장 짧은 90ms) · 뗀 뒤 0.3초 안 호버 0번(뗌 2번)");
});

test("범위를 벗어날 때 out 이 안 오는 기기: 1초 뒤 '없음', 그 뒤 손은 '펜 멀리', 30초 뒤 누름의 '미리 온 시간'이 부풀지 않음", () => {
  const p = createProbe();
  p.pointer(pen("pointerover", 1000, 100, 100, { relatedTarget: null }));
  for (let t = 1010; t <= 1500; t += 10) p.pointer(pen("pointermove", t));
  // 펜을 치움(out 없음)
  assert.equal(p.penState(2400), "떠 있음", "마지막 펜 이벤트 뒤 1초 안");
  assert.equal(p.penState(2600), "없음", "1초 넘으면 굳지 않음");
  p.pointer(fing("pointerdown", 3000));
  p.pointer(fing("pointercancel", 3100));
  assert.equal(row(p, "펜 가까이에서 닿은 손"), "펜 범위 안 0 · 닿아 있을 때 0 · 뗀 뒤 0.5초 안 0 · 펜 멀리(또는 모름) 1");
  assert.equal(row(p, "손 터치 취소(pointercancel)"), "1번 · 펜 가까이 0 · 그 밖 1 · 펜이 와서 멈춘 두 손가락 스크롤 0번");
  p.pointer(pen("pointerdown", 31000)); // 30초 뒤 호버 없이 바로 닿음
  p.pointer(pen("pointerup", 31060));
  for (let t = 40000; t <= 40150; t += 10) p.pointer(pen("pointermove", t)); // 다시 다가와 150ms 호버 뒤 닿음
  p.pointer(pen("pointerdown", 40160));
  p.pointer(pen("pointerup", 40220));
  assert.equal(row(p, "닿기 전·뗀 뒤 호버"), "펜 누름 2번 중 호버가 먼저 온 것 1번 · 미리 온 시간 가운데값 160ms(가장 짧은 160ms) · 뗀 뒤 0.3초 안 호버 0번(뗌 2번)");
});

test("'떠 있음'(펜 범위 안)은 pointerover~pointerout 중 마지막 펜 이벤트 1초 안 — 그동안 닿은 손은 '펜 범위 안'", () => {
  const p = createProbe();
  p.pointer(pen("pointerover", 1000, 100, 100, { relatedTarget: {} }));
  assert.equal(p.penState(1500), "떠 있음");
  assert.equal(p.penState(1000 + PROBE.PEN_IN_MS), "떠 있음", "움직임이 없어도 1초까지는 범위 안");
  assert.equal(p.penState(1001 + PROBE.PEN_IN_MS), "없음");
  p.pointer(fing("pointerdown", 1800));
  p.pointer(fing("pointerup", 1850));
  p.pointer(pen("pointermove", 2500)); // 조금 움직임 → 다시 떠 있음
  assert.equal(p.penState(3400), "떠 있음");
  p.pointer(pen("pointerout", 3500, 100, 100, { relatedTarget: null }));
  assert.equal(p.penState(3501), "없음");
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
  assert.equal(q.penState(900), "떠 있음");
  q.focusLost();
  assert.equal(q.penState(901), "없음", "창이 초점을 잃으면 범위 밖으로");
  const r = createProbe();
  r.pointer(pen("pointerover", 0, 0, 0, { relatedTarget: {} }));
  r.pointer(pen("pointerout", 100, 0, 0, { relatedTarget: null }));
  assert.equal(r.penState(900), "없음", "relatedTarget 없는 out = 범위를 벗어남");
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

const BLANK = { blank: true };

test("펜 콕 튐: 빈칸 누름끼리만, 60ms·10px 경계, 0.15초 안 간격 목록, 합친 수는 필기 코드 값", () => {
  const p = createProbe();
  const tap = (t0, t1, x = 100) => { p.pointer(pen("pointerdown", t0, x), BLANK); p.pointer(pen("pointerup", t1, x)); };
  tap(0, 50);
  tap(58, 90); // 8ms 뒤 — 튐
  tap(150, 200); // 60ms 뒤 — 튐(경계 포함)
  tap(261, 300); // 61ms — 튐 아님, 목록에는
  tap(400, 450, 115); // 100ms 뒤 15px — 목록에도 없음
  tap(1000, 1050); // 550ms 뒤
  assert.equal(row(p, "펜 콕 튐", GALAXY, { penBounce: 1 }), "뗀 뒤 60ms 안 같은 자리 다시 닿음 2번(0이어야 함) · 한 번 콕으로 합친 것 1번 · 0.15초 안 다시 닿은 간격(ms) 8 60 61");
});

test("펜 콕 튐: 손글씨 획(빈칸 밖)·빈칸 밖에서 이어진 누름·콕이 아니었던 앞 누름(길거나 미끄러짐)은 세지 않음", () => {
  const p = createProbe();
  const press = (t0, t1, x, o = BLANK, slide = 0) => {
    p.pointer(pen("pointerdown", t0, x), o);
    if (slide) p.pointer(pen("pointermove", (t0 + t1) / 2, x + slide, 100, { down: true }));
    p.pointer(pen("pointerup", t1, x + slide));
  };
  // 손글씨: 짧은 획 끝 바로 옆에서 30ms 뒤 다음 획(빈칸 밖) — 예전에는 '튐 5번'으로 셌음
  for (let i = 0; i < 6; i++) press(i * 150, i * 150 + 120, 300, {}, 0);
  assert.equal(row(p, "펜 콕 튐"), "뗀 뒤 60ms 안 같은 자리 다시 닿음 0번(0이어야 함) · 한 번 콕으로 합친 것 0번 · 0.15초 안 다시 닿은 간격(ms) -");
  press(2000, 2100, 500, {}); // 빈칸 밖 누름 뒤
  press(2120, 2160, 500); // 빈칸 누름 — 앞 누름이 빈칸이 아니면 세지 않음
  press(3000, 3400, 600); // 앞 누름이 길었음(400ms ≥ TAP_MS)
  press(3420, 3450, 600);
  press(4000, 4100, 700, BLANK, 13); // 앞 누름이 13px 미끄러짐(빈칸 콕 한도 12 넘음 — 뗀 자리는 713)
  press(4120, 4150, 713);
  press(5000, 5060, 800); // 콕
  press(5080, 5090, 800); // 20ms 뒤 튐 — 이것만
  assert.equal(row(p, "펜 콕 튐"), "뗀 뒤 60ms 안 같은 자리 다시 닿음 1번(0이어야 함) · 한 번 콕으로 합친 것 0번 · 0.15초 안 다시 닿은 간격(ms) 20");
  assert.equal(row(p, "펜 콕 튐", { TAP_MS: 500, PEN_BLANK_TAP_SLOP: 14 }), "뗀 뒤 60ms 안 같은 자리 다시 닿음 3번(0이어야 함) · 한 번 콕으로 합친 것 0번 · 0.15초 안 다시 닿은 간격(ms) 20 20 20", "프로필 한도로 앞 누름이 콕이 되면 셈");
});

test("펜 콕 시간: 빈칸에서 시작한 누름 중 빈칸 콕 한도(프로필) 안에서 움직인 것만, 프로필 TAP_MS 넘은 수", () => {
  const p = createProbe();
  p.pointer(pen("pointerdown", 0, 0, 0), BLANK); p.pointer(pen("pointermove", 50, 5, 0, { down: true })); p.pointer(pen("pointerup", 120, 5, 0));
  p.pointer(pen("pointerdown", 500, 0, 0)); p.pointer(pen("pointerup", 900, 0, 0)); // 빈칸 밖(점·손글씨) — 세지 않음
  p.pointer(pen("pointerdown", 1000, 0, 0), BLANK); p.pointer(pen("pointerup", 1350, 0, 0));
  p.pointer(pen("pointerdown", 2000, 0, 0), BLANK); p.pointer(pen("pointermove", 2050, 13, 0, { down: true })); p.pointer(pen("pointerup", 2100, 13, 0)); // 선(13px)
  p.pointer(pen("pointerdown", 3000, 0, 0), BLANK); p.pointer(pen("pointerup", 3200, 0, 0));
  assert.equal(row(p, "펜 콕 시간(짧게 누른 것)"), "3번 · 가운데값 200ms · 가장 긴 350ms · 300ms 넘어 점이 된 것 1번");
  assert.equal(row(p, "펜 콕 시간(짧게 누른 것)", { TAP_MS: 400, PEN_BLANK_TAP_SLOP: 14 }), "4번 · 가운데값 160ms · 가장 긴 350ms · 400ms 넘어 점이 된 것 0번");
  assert.equal(row(createProbe(), "펜 콕 시간(짧게 누른 것)"), "아직 없음");
});

test("빈칸 누름은 손글씨 획과 따로 최근 100개 — 획 300개 뒤에도 콕 기록이 남음", () => {
  const p = createProbe();
  for (let i = 0; i < 10; i++) { p.pointer(pen("pointerdown", i * 1000, 0, 0), BLANK); p.pointer(pen("pointerup", i * 1000 + 70, 0, 0)); }
  for (let i = 0; i < 300; i++) { // 짧은 손글씨 획(빈칸 밖)
    const t = 20000 + i * 300;
    p.pointer(pen("pointerdown", t, 300, 300)); p.pointer(pen("pointermove", t + 60, 305, 300, { down: true })); p.pointer(pen("pointerup", t + 170, 305, 300));
  }
  assert.equal(row(p, "펜 콕 시간(짧게 누른 것)"), "10번 · 가운데값 70ms · 가장 긴 70ms · 300ms 넘어 점이 된 것 0번");
  for (let i = 0; i < 120; i++) { p.pointer(pen("pointerdown", 200000 + i * 1000, 0, 0), BLANK); p.pointer(pen("pointerup", 200000 + i * 1000 + 80, 0, 0)); }
  assert.equal(row(p, "펜 콕 시간(짧게 누른 것)"), `${PROBE.BLANK_KEEP}번 · 가운데값 80ms · 가장 긴 80ms · 300ms 넘어 점이 된 것 0번`);
});

test("막은 손 터치: 바로 앞 손 누름의 크기 · 펜 뒤는 손이 닿을 때의 마지막 펜 자리에서, 펜과 겹침은 겹친 펜이 닿은 자리에서 거리, palm 은 세지 않음", () => {
  const p = createProbe();
  p.pointer(pen("pointerdown", 0, 100, 100)); p.pointer(pen("pointerup", 50, 100, 100)); // 위쪽에 한 획
  p.pointer(fing("pointerdown", 3000, 700, 1100, { w: 64, h: 50 })); // 손바닥이 먼저(오른쪽 아래)
  p.pointer(pen("pointerdown", 3050, 650, 1050)); // 펜이 그 옆에 닿음
  p.inkBlocked("pen-overlap"); // 약 71px(예전에는 앞 획 끝에서 재어 1166)
  p.pointer(pen("pointerup", 3300, 660, 1060));
  p.pointer(fing("pointerdown", 3800, 400, 500, { id: 2, w: 22, h: 18 }));
  p.inkBlocked("pen-guard"); // 손이 닿을 때의 마지막 펜 자리(660, 1060)에서
  p.inkBlocked("palm");
  assert.equal(row(p, "막은 손 터치(펜 뒤·펜과 겹침)"), "펜 뒤 1번 · 펜과 겹침 1번 — 최근(크기·펜에서 거리 px): 겹침 64·71, 뒤 22·617");
  assert.equal(row(createProbe(), "막은 손 터치(펜 뒤·펜과 겹침)"), "펜 뒤 0번 · 펜과 겹침 0번");
  const q = createProbe();
  q.pointer(fing("pointerdown", 10, 130, 140, { w: 64, h: 50 }));
  q.inkBlocked("pen-overlap");
  assert.equal(row(q, "막은 손 터치(펜 뒤·펜과 겹침)"), "펜 뒤 0번 · 펜과 겹침 1번 — 최근(크기·펜에서 거리 px): 겹침 64·?", "펜 누름을 모르면 ?");
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
