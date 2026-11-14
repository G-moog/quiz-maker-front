// 태블릿 프로필(geometry GALAXY·Y700)과 고른 태블릿 저장(ink/tablet) 시험.
// 갤럭시 = 지금까지와 똑같음: GALAXY 는 내보낸 상수 그대로, 프로필을 넘기든 안 넘기든 판정 함수 결과가 같음(경계값 격자)
import { test } from "node:test";
import assert from "node:assert/strict";
import * as G from "../../src/ink/geometry.js";
import { DEFAULT_TABLET, TABLETS, TABLET_KEY, baselineText, createTabletStore, modelHint, parseTablet, tabletOf } from "../../src/ink/tablet.js";

const { GALAXY, Y700, TABLET_PROFILES, profileOf } = G;
const SHARED = ["TAP_SLOP", "PEN_BLANK_TAP_SLOP", "TAP_MS", "DOUBLE_TAP_MS", "PALM_MS", "PALM_SAFE_MS", "PEN_STUCK_MS", "PEN_HELD_MAX_MS", "TOUCH_SLOP", "PALM_CONTACT_PX"];

test("GALAXY = 내보낸 상수 그대로 + 예전 숫자(100·2·34), 새 규칙은 0(끔)", () => {
  for (const k of SHARED) assert.equal(GALAXY[k], G[k], k);
  assert.equal(GALAXY.id, "galaxy");
  assert.equal(GALAXY.PEN_TOUCH_MS, 100);
  assert.equal(GALAXY.PEN_TOUCH_PX, 2);
  assert.equal(GALAXY.ERASER_BUTTONS, 34);
  assert.equal(GALAXY.HAND_TAP_AFTER_PEN_MS, 0);
  assert.equal(GALAXY.PEN_BOUNCE_MS, 0);
  assert.equal(GALAXY.PEN_OVERLAP_BLOCK, 0);
});

test("Y700: 같은 열쇠, 모두 유한한 수, 얼려 있음, 처음 값", () => {
  assert.deepEqual(Object.keys(Y700).sort(), Object.keys(GALAXY).sort());
  for (const [k, v] of Object.entries(Y700)) if (k !== "id") assert.ok(Number.isFinite(v), k);
  assert.ok(Object.isFrozen(GALAXY) && Object.isFrozen(Y700) && Object.isFrozen(TABLET_PROFILES));
  const diff = Object.keys(GALAXY).filter((k) => GALAXY[k] !== Y700[k]).sort();
  assert.deepEqual(diff, ["HAND_TAP_AFTER_PEN_MS", "PALM_CONTACT_PX", "PALM_MS", "PEN_BOUNCE_MS", "PEN_OVERLAP_BLOCK", "id"]);
  assert.deepEqual([Y700.PALM_MS, Y700.PALM_CONTACT_PX, Y700.HAND_TAP_AFTER_PEN_MS, Y700.PEN_BOUNCE_MS, Y700.PEN_OVERLAP_BLOCK], [700, 42, 1000, 50, 1]);
});

test("profileOf: 모르는 값('__proto__' 등)은 GALAXY, 프로필 차례 = 고르기 차례", () => {
  assert.equal(profileOf("y700"), Y700);
  assert.equal(profileOf("galaxy"), GALAXY);
  for (const bad of ["x", "__proto__", "constructor", "toString", undefined, null, 7, "Y700", ""]) assert.equal(profileOf(bad), GALAXY, String(bad));
  assert.deepEqual(Object.keys(TABLET_PROFILES), TABLETS.map((t) => t.id));
});

test("같음 격자: f(...a) === f(...a, GALAXY) (갤럭시 판정이 바뀌지 않음)", () => {
  let n = 0;
  const same = (name, a, b, args) => { n++; assert.equal(b, a, `${name}(${JSON.stringify(args)})`); };
  for (const type of ["pen", "mouse", "touch", ""]) for (const blank of [true, false]) same("tapSlop", G.tapSlop(type, blank), G.tapSlop(type, blank, GALAXY), [type, blank]);
  for (const moved of [0, 5.9, 6, 6.9, 7, 9.9, 10, 11.9, 12, 13.9, 14, 20]) for (const ms of [0, 299, 300, 1000]) for (const type of ["pen", "mouse", "touch", ""]) {
    for (const slop of [undefined, 6, 7, 10, 12, 14]) {
      const a = slop === undefined ? G.isTap(moved, ms, type) : G.isTap(moved, ms, type, slop);
      same("isTap", a, G.isTap(moved, ms, type, slop, GALAXY), [moved, ms, type, slop]);
    }
  }
  for (const gap of [-1, 0, 49, 50, 399, 400, 401]) for (const pb of [3, 4, null]) for (const prevNull of [false, true]) {
    const prev = prevNull ? null : { blank: 3, downAt: 0, upAt: 100 };
    const tap = { blank: pb, downAt: 100 + gap, upAt: 150 + gap };
    same("isDoubleTap", G.isDoubleTap(prev, tap), G.isDoubleTap(prev, tap, GALAXY), [prev, tap]);
  }
  const sizes = [NaN, undefined, 0, 1, 2, 35, 36, 42, 43, 70, 71, 80];
  for (const w of sizes) for (const h of sizes) same("isLargeContact", G.isLargeContact(w, h), G.isLargeContact(w, h, GALAXY), [w, h]);
  const T = 20000;
  const offs = [0, 1, 149, 150, 151, 499, 500, 501, 699, 700, 999, 1000, 1999, 2000, 2001, 9999, 10000, 10001];
  for (const penDown of [false, true]) for (const lastPenDown of [undefined, -Infinity, T - 100, T - 2500]) for (const lastPenHover of [-Infinity, T - 300, T - 1200])
    for (const lastPenUp of [-Infinity, T - 50, T - 600]) for (const penActiveAt of [null, T - 400, T - 12000]) for (const lastPenAir of [-Infinity, T - 200]) {
      const s = { penDown, lastPenHover, lastPenUp, penActiveAt, lastPenAir };
      if (lastPenDown !== undefined) s.lastPenDown = lastPenDown;
      for (const o of offs) {
        const now = T + o - 1000;
        same("palmBlocked", G.palmBlocked(s, now), G.palmBlocked(s, now, false, GALAXY), [s, now]);
        same("palmBlocked safe", G.palmBlocked(s, now, true), G.palmBlocked(s, now, true, GALAXY), [s, now]);
        assert.equal(G.handTapGuarded(s, now, GALAXY), false);
        assert.equal(G.handTapGuarded(s, now), false);
      }
    }
  for (const gap of [-1, 0, 1, 20, 49, 50, 60]) {
    assert.equal(G.isPenBounce({ blank: 2, upAt: 100 }, { blank: 2, downAt: 100 + gap }, GALAXY), false);
    assert.equal(G.isPenBounce({ blank: 2, upAt: 100 }, { blank: 2, downAt: 100 + gap }), false);
  }
  assert.ok(n > 10000, `격자 ${n}개`);
});

test("Y700 차이(의도한 것만)", () => {
  assert.equal(G.isLargeContact(40, 40, Y700), false);
  assert.equal(G.isLargeContact(40, 40, GALAXY), true);
  assert.equal(G.isLargeContact(43, 1, Y700), true);
  const up = { penDown: false, lastPenDown: 0, lastPenHover: -Infinity, lastPenUp: 0 };
  assert.equal(G.palmBlocked(up, 600, false, Y700), true);
  assert.equal(G.palmBlocked(up, 600, false, GALAXY), false);
  assert.equal(G.palmBlocked(up, 600, true, Y700), false, "머리 줄(safe)은 같게 150ms");
  assert.equal(G.tapSlop("pen", true, Y700), 12, "콕 한도는 실측 전까지 갤럭시와 같음");
  assert.equal(G.isTap(6.5, 100, "pen", undefined, { ...Y700, TAP_SLOP: 7 }), true, "slop 을 빼면 넘긴 프로필의 TAP_SLOP");
  assert.equal(G.handTapGuarded({ lastPenUp: 0 }, 999, Y700), true);
  assert.equal(G.handTapGuarded({ lastPenUp: 0 }, 1000, Y700), false);
  assert.equal(G.handTapGuarded({ lastPenUp: 0, lastPenHover: 1000 }, 1999, Y700), true, "마지막 호버부터 셈");
  assert.equal(G.handTapGuarded({}, 5, Y700), false, "펜을 쓴 적 없음");
  assert.equal(G.isPenBounce({ blank: 2, upAt: 100 }, { blank: 2, downAt: 149 }, Y700), true);
  assert.equal(G.isPenBounce({ blank: 2, upAt: 100 }, { blank: 2, downAt: 150 }, Y700), false);
  assert.equal(G.isPenBounce({ blank: 2, upAt: 100 }, { blank: 2, downAt: 99 }, Y700), false);
  assert.equal(G.isPenBounce({ blank: 2, upAt: 100 }, { blank: 3, downAt: 120 }, Y700), false);
  assert.equal(G.isPenBounce({ blank: null, upAt: 100 }, { blank: null, downAt: 120 }, Y700), false);
  assert.equal(G.isPenBounce(null, { blank: 2, downAt: 120 }, Y700), false);
});

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  const log = [];
  return { log, m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { log.push(["set", k, v]); m.set(k, String(v)); }, removeItem: (k) => { log.push(["remove", k]); m.delete(k); } };
}

test("태블릿 저장: 열쇠 없음 = galaxy, 갤럭시를 고르면 열쇠를 지움, 같은 값은 알림 없음, 다른 탭(storage) 따라감", () => {
  const st = fakeStorage();
  const win = new EventTarget();
  const store = createTabletStore(() => st, () => win);
  assert.equal(store.get(), DEFAULT_TABLET);
  assert.equal(st.log.length, 0, "읽기만 — 아무것도 쓰지 않음");
  let calls = 0;
  store.subscribe(() => calls++);
  store.set("y700");
  assert.equal(store.get(), "y700");
  assert.deepEqual(st.log.at(-1), ["set", TABLET_KEY, "y700"]);
  assert.equal(calls, 1);
  store.set("y700");
  assert.equal(calls, 1, "같은 값은 알림 없음");
  store.set("galaxy");
  assert.deepEqual(st.log.at(-1), ["remove", TABLET_KEY]);
  assert.equal(calls, 2);
  st.m.set(TABLET_KEY, "y700");
  win.dispatchEvent(Object.assign(new Event("storage"), { key: "other" }));
  assert.equal(store.get(), "galaxy", "상관없는 열쇠는 무시");
  win.dispatchEvent(Object.assign(new Event("storage"), { key: TABLET_KEY }));
  assert.equal(store.get(), "y700");
  assert.equal(calls, 3);
  st.m.clear();
  win.dispatchEvent(Object.assign(new Event("storage"), { key: null }));
  assert.equal(store.get(), "galaxy", "다른 탭에서 localStorage.clear()");
  assert.equal(calls, 4);
  for (const bad of ["Y700", "junk", "", "__proto__"]) assert.equal(createTabletStore(() => fakeStorage({ [TABLET_KEY]: bad }), () => null).get(), "galaxy", bad);
  const boom = createTabletStore(() => ({ getItem() { throw new Error("blocked"); }, setItem() { throw new Error("x"); }, removeItem() { throw new Error("x"); } }), () => null);
  assert.equal(boom.get(), "galaxy");
  boom.set("y700");
  assert.equal(boom.get(), "y700", "저장 못 해도 이번 화면은 고른 대로");
});

test("parseTablet·tabletOf·baselineText·modelHint", () => {
  assert.equal(parseTablet("y700"), "y700");
  assert.equal(parseTablet("galaxy"), "galaxy");
  assert.equal(parseTablet(null), "galaxy");
  assert.equal(tabletOf("zzz").id, "galaxy");
  assert.equal(tabletOf("y700").changed, "태블릿을 레노버 Y700으로 바꿨습니다");
  assert.equal(baselineText("galaxy"), "갤럭시탭 — 손바닥 500ms · 손 접촉 35px · 손 터치 10px · 빈칸 콕 12px · 콕 300ms · 두 번 콕 400ms");
  assert.equal(baselineText("y700"), "레노버 Y700 5세대 — 손바닥 700ms · 손 접촉 42px · 손 터치 10px · 빈칸 콕 12px · 콕 300ms · 두 번 콕 400ms · 펜 뒤 손 터치 1000ms 막음 · 콕 튐 50ms 합침 · 펜과 겹친 손 막음");
  assert.equal(modelHint("TB323FU", "galaxy"), "이 기기는 레노버 태블릿(TB323FU)으로 보입니다 — '레노버 Y700 5세대'를 고르세요.");
  assert.equal(modelHint("Lenovo TB-J716F", "galaxy"), "이 기기는 레노버 태블릿(Lenovo TB-J716F)으로 보입니다 — '레노버 Y700 5세대'를 고르세요.");
  assert.equal(modelHint("TB323FU", "y700"), "");
  assert.equal(modelHint("SM-X710", "y700"), "이 기기는 갤럭시탭(SM-X710)으로 보입니다 — '갤럭시탭'을 고르세요.");
  assert.equal(modelHint("SM-S928N", "y700"), "", "갤럭시 폰은 안내 안 함");
  for (const m of ["", undefined, null, "Pixel Tablet"]) assert.equal(modelHint(m, "galaxy"), "");
});
