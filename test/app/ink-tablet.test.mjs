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
    for (const slop of [undefined, null, 6, 7, 10, 12, 14]) {
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
  // 튐: 앞 콕(60ms 접촉)을 뗀 뒤 PEN_BOUNCE_MS 안에 같은 빈칸에 짧게(5ms) 다시 닿음
  const tap = (blank, downAt, upAt) => ({ blank, downAt, upAt });
  assert.equal(G.isPenBounce(tap(2, 40, 100), tap(2, 149, 154), Y700), true);
  assert.equal(G.isPenBounce(tap(2, 40, 100), tap(2, 150, 155), Y700), false, "뗀 뒤 50ms 면 아님");
  assert.equal(G.isPenBounce(tap(2, 40, 100), tap(2, 99, 104), Y700), false);
  assert.equal(G.isPenBounce(tap(2, 40, 100), tap(3, 120, 125), Y700), false);
  assert.equal(G.isPenBounce(tap(null, 40, 100), tap(null, 120, 125), Y700), false);
  assert.equal(G.isPenBounce(null, tap(2, 120, 125), Y700), false);
});

test("isTap: slop 을 빼면(undefined) 프로필 TAP_SLOP, null 은 예전 기본 인자(slop = TAP_SLOP)처럼 그대로 — moved < null", () => {
  assert.equal(G.isTap(5.99, 100, "mouse"), true);
  assert.equal(G.isTap(5.99, 100, "mouse", undefined), true);
  assert.equal(G.isTap(5.99, 100, "mouse", null), false, "master 와 같게(기본 인자는 undefined 일 때만)");
  assert.equal(G.isTap(0, 100, "pen", null), false);
  assert.equal(G.isTap(-1, 100, "pen", null), true);
  assert.equal(G.isTap(5.99, 100, "mouse", null, Y700), false);
  assert.equal(G.isTap(5.99, 100, "mouse", undefined, Y700), true);
});

test("촉 튐: 뗀 뒤 40ms(PEN_RETAP_MIN_MS) 안에 다시 닿으면 접촉 시간과 상관없이, 40~50ms 는 두 접촉 중 하나가 30ms(PEN_BOUNCE_CONTACT_MS) 보다 짧을 때만 — 뗀 뒤 40ms 넘어 다시 닿은 진짜 빠른 두 번 콕은 열림", () => {
  const tap = (blank, downAt, upAt) => ({ blank, downAt, upAt });
  assert.equal(G.PEN_BOUNCE_CONTACT_MS, 30);
  assert.equal(G.PEN_RETAP_MIN_MS, 40);
  assert.equal(G.isPenBounce(tap(2, 0, 60), tap(2, 65, 70), Y700), true, "콕 + 5ms 뒤 튐(접촉 5ms) → 합침");
  assert.equal(G.isPenBounce(tap(2, 0, 4), tap(2, 20, 80), Y700), true, "닿는 순간 튐(접촉 4ms) 뒤 콕 → 합침");
  // 한 번 콕 가운데가 잠깐 끊김(누르는 힘이 문턱 근처) — 두 접촉 모두 30ms 넘어도 한 콕(사람은 뗀 뒤 40ms 안에 다시 콕 못 함)
  assert.equal(G.isPenBounce(tap(2, 0, 45), tap(2, 53, 110), Y700), true, "가운데 끊김 45 + 8ms + 57 → 합침");
  assert.equal(G.isPenBounce(tap(2, 0, 35), tap(2, 40, 80), Y700), true, "가운데 끊김 35 + 5ms + 40 → 합침");
  assert.equal(G.isPenBounce(tap(2, 0, 60), tap(2, 70, 100), Y700), true, "끊김 10ms 는 짧은 쪽이 30ms 여도 합침");
  assert.equal(G.isPenBounce(tap(2, 0, 60), tap(2, 99, 160), Y700), true, "끊김 39ms 까지는 접촉 시간과 상관없이 합침");
  assert.equal(G.isPenBounce(tap(2, 0, 60), tap(2, 100, 160), Y700), false, "각 60ms, 뗀 뒤 40ms → 튐 아님(진짜 빠른 두 번 콕)");
  assert.equal(G.isPenBounce(tap(2, 0, 40), tap(2, 80, 120), Y700), false, "각 40ms, 뗀 뒤 40ms → 튐 아님");
  // 뗀 뒤 40~50ms: 두 접촉 중 하나가 30ms 보다 짧을 때만
  assert.equal(G.isPenBounce(tap(2, 0, 60), tap(2, 100, 129), Y700), true, "뗀 뒤 40ms · 짧은 쪽 29ms → 튐");
  assert.equal(G.isPenBounce(tap(2, 0, 60), tap(2, 100, 130), Y700), false, "뗀 뒤 40ms · 짧은 쪽 30ms → 튐 아님");
  assert.equal(G.isPenBounce(tap(2, 0, 60), tap(2, 109, 112), Y700), true, "뗀 뒤 49ms · 짧은 쪽 3ms → 튐");
  assert.equal(G.isPenBounce(tap(2, 0, 60), tap(2, 110, 113), Y700), false, "뗀 뒤 50ms(PEN_BOUNCE_MS) → 튐 아님");
  // PEN_BOUNCE_MS 가 40 보다 작으면 그 안만(창 자체는 프로필 값)
  assert.equal(G.isPenBounce(tap(2, 0, 45), tap(2, 53, 110), { ...Y700, PEN_BOUNCE_MS: 30 }), true);
  assert.equal(G.isPenBounce(tap(2, 0, 60), tap(2, 95, 160), { ...Y700, PEN_BOUNCE_MS: 30 }), false);
  assert.equal(G.isPenBounce(tap(2, 0, 60), tap(2, 65, 70), GALAXY), false, "갤럭시(PEN_BOUNCE_MS 0)는 늘 아님");
  assert.equal(G.isPenBounce(tap(2, 0, 45), tap(2, 53, 110), GALAXY), false, "갤럭시는 가운데 끊김도 그대로(두 번 콕 — master 와 같음)");
  // InkInput.penTap 차례(튐 → 두 번 콕): 빠른 두 번 콕은 튐이 아니고 두 번 콕, 가운데 끊김은 두 번 콕 판정 전에 합침
  const first = tap(2, 0, 60);
  const second = tap(2, 100, 160);
  assert.equal(G.isPenBounce(first, second, Y700), false);
  assert.equal(G.isDoubleTap(first, second, Y700), true);
  const a = tap(2, 0, 45);
  const b = tap(2, 53, 110);
  assert.equal(G.isDoubleTap(a, b, Y700), true, "(합치지 않으면 두 번 콕으로 열렸을 차례)");
  assert.equal(G.isPenBounce(a, b, Y700), true);
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
