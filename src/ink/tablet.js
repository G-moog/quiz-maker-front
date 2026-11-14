import { profileOf } from "./geometry.js";

// 고른 태블릿(펜·손을 가르는 기준) — 이 기기에만 기억(localStorage). 열쇠가 없으면 갤럭시탭(지금까지와 같음)이고,
// 갤럭시탭을 고르면 열쇠를 지운다(갤럭시로 쓰는 기기의 저장 상태가 예전과 똑같게). 같은 기기의 다른 탭(앱 ↔ ?pentest)과는
// storage 이벤트로 맞춘다. 판정 값 묶음은 geometry 의 GALAXY·Y700(이 파일은 geometry 만 부른다 — 순환 없음)
export const TABLET_KEY = "qm:ink-tablet:v1";
export const DEFAULT_TABLET = "galaxy";
export const TABLETS = [
  { id: "galaxy", name: "갤럭시탭", sub: "S펜", chip: "갤럭시탭 · S펜", changed: "태블릿을 갤럭시탭으로 바꿨습니다" },
  { id: "y700", name: "레노버 Y700 5세대", sub: "펜 AP501U", chip: "레노버 Y700 5세대 · 펜 AP501U", changed: "태블릿을 레노버 Y700으로 바꿨습니다" },
];

export function parseTablet(raw) {
  return TABLETS.some((t) => t.id === raw) ? raw : DEFAULT_TABLET;
}

export function tabletOf(id) {
  return TABLETS.find((t) => t.id === id) || TABLETS[0];
}

// '태블릿 기준' 한 줄(?pentest 표 맨 위 — 캡처·복사한 결과가 어느 기준인지 스스로 말하게)
export function baselineText(id) {
  const p = profileOf(id);
  const parts = [
    `손바닥 ${p.PALM_MS}ms`, `손 접촉 ${p.PALM_CONTACT_PX}px`, `손 터치 ${p.TOUCH_SLOP}px`,
    `빈칸 콕 ${p.PEN_BLANK_TAP_SLOP}px`, `콕 ${p.TAP_MS}ms`, `두 번 콕 ${p.DOUBLE_TAP_MS}ms`,
  ];
  if (p.HAND_TAP_AFTER_PEN_MS > 0) parts.push(`펜 뒤 손 터치 ${p.HAND_TAP_AFTER_PEN_MS}ms 막음`);
  if (p.PEN_BOUNCE_MS > 0) parts.push(`콕 튐 ${p.PEN_BOUNCE_MS}ms 합침`);
  if (p.PEN_OVERLAP_BLOCK) parts.push("펜과 겹친 손 막음");
  return `${tabletOf(id).name} — ${parts.join(" · ")}`;
}

// ?pentest 안내: 브라우저가 알려 준 기기 모델(UA-CH)과 고른 태블릿이 어긋나 보이면 한 줄(맞거나 모르면 "")
const LENOVO_MODEL = /^(lenovo\s*)?tb[-\s]?[a-z]?\d{3}/i; // TB323FU(Y700 5세대) 등 레노버 태블릿
const GALAXY_MODEL = /^SM-[XTP]/i; // 갤럭시탭
export function modelHint(model, tablet) {
  const m = typeof model === "string" ? model.trim() : "";
  if (!m) return "";
  if (tablet === "galaxy" && LENOVO_MODEL.test(m)) return `이 기기는 레노버 태블릿(${m})으로 보입니다 — '레노버 Y700 5세대'를 고르세요.`;
  if (tablet === "y700" && GALAXY_MODEL.test(m)) return `이 기기는 갤럭시탭(${m})으로 보입니다 — '갤럭시탭'을 고르세요.`;
  return "";
}

// 저장소·창을 넘겨 받을 수 있게(시험용). 모듈을 불러올 때는 아무것도 읽지 않는다(Node 시험 안전)
export function createTabletStore(getStorage = () => globalThis.localStorage, getWindow = () => globalThis.window) {
  let cur = null;
  const subs = new Set();
  let listening = false;
  const read = () => {
    try {
      return parseTablet(getStorage()?.getItem(TABLET_KEY));
    } catch {
      return DEFAULT_TABLET;
    }
  };
  const notify = () => {
    for (const f of [...subs]) f();
  };
  const onStorage = (e) => {
    if (e.key !== TABLET_KEY && e.key !== null) return;
    const next = read();
    if (next === cur) return;
    cur = next;
    notify();
  };
  return {
    get: () => (cur ??= read()),
    set(id) {
      const next = parseTablet(id);
      try {
        const s = getStorage();
        if (next === DEFAULT_TABLET) s?.removeItem(TABLET_KEY);
        else s?.setItem(TABLET_KEY, next);
      } catch {
        // 저장 못 해도 이번 화면에서는 고른 대로
      }
      if (next === cur) return;
      cur = next;
      notify();
    },
    subscribe(f) {
      subs.add(f);
      if (!listening) {
        const w = getWindow();
        if (w?.addEventListener) {
          w.addEventListener("storage", onStorage);
          listening = true;
        }
      }
      return () => subs.delete(f);
    },
  };
}

export const tabletStore = createTabletStore();
// InkInput·LongPress·펜 시험이 이벤트마다 부른다(모르는 값 → GALAXY)
export const profileNow = () => profileOf(tabletStore.get());
