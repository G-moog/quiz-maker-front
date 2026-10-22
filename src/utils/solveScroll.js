// 풀기 화면의 스크롤 도우미(DOM): 읽던 자리 재기·되돌리기, 읽은 정도, 요소로 가기, 잠깐 깜빡이기.
// '읽는 줄' = 위에 붙어 있는 머리 묶음(sticky)의 아래 끝. 그 아래부터가 실제로 읽히는 곳이다.
// 읽던 자리 값의 모양은 utils/solveStudy.js 머리말 참고.

const ANCHORS = "[data-ink-blank], [data-qm-h]";

function anchorOf(el) {
  if (el.hasAttribute("data-ink-blank")) return { k: "b", i: Number(el.getAttribute("data-ink-blank")) };
  return { k: "h", i: Number(el.getAttribute("data-qm-h")) };
}

function findAnchorEl(body, a) {
  if (!a || !Number.isInteger(a.i)) return null;
  if (a.k === "b") return body.querySelector(`[data-ink-blank="${a.i}"]`);
  if (a.k === "h") return body.querySelector(`[data-qm-h="${a.i}"]`);
  return null;
}

// 지금 읽던 자리. 본문 맨 위가 아직 읽는 줄 아래에 있으면 null(맨 위)
export function captureAnchor(body, lineY) {
  if (!body || !body.isConnected) return null;
  const r = body.getBoundingClientRect();
  if (r.height <= 0) return null;
  const rel = lineY - r.top;
  if (rel <= 0) return null;
  const f = Math.round(Math.min(1, rel / r.height) * 10000) / 10000;
  // 읽는 줄에 가장 가까운 빈칸·제목(글 순서라 위에서 아래로 — 읽는 줄을 처음 넘은 것 다음은 더 멀다)
  let best = null;
  for (const el of body.querySelectorAll(ANCHORS)) {
    const d = el.getBoundingClientRect().top - lineY;
    if (!best || Math.abs(d) < Math.abs(best.d)) best = { el, d };
    if (d > 0) break;
  }
  if (best && Math.abs(best.d) < window.innerHeight) {
    return { ...anchorOf(best.el), d: Math.round(best.d), f };
  }
  return { f };
}

// 읽던 자리로: 그 요소가 읽는 줄에서 d 만큼 아래 오게. 요소를 못 찾으면 비율로, 자리가 없으면(null) 맨 위
export function applyAnchor(body, lineY, a) {
  if (!body) return;
  if (!a) {
    window.scrollTo(0, 0);
    return;
  }
  const el = findAnchorEl(body, a);
  if (el && a.k === "h" && Number.isFinite(a.p)) {
    // 절 안 비율(보통 ↔ 하드 바꾸기): 그 제목에서 다음 제목(없으면 본문 끝)까지의 p 지점이 읽는 줄에 오게
    const { top, end } = sectionSpan(body, el, a.i);
    window.scrollTo(0, window.scrollY + top + a.p * Math.max(0, end - top) - lineY);
    return;
  }
  if (el) {
    window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - (lineY + a.d));
    return;
  }
  if (Number.isFinite(a.f)) {
    const r = body.getBoundingClientRect();
    window.scrollTo(0, window.scrollY + r.top + a.f * r.height - lineY);
  }
}

// 제목 hid 의 절: 제목 위 끝 ~ 다음 제목(없으면 본문 끝)의 위 끝(화면 기준 px)
function sectionSpan(body, el, hid) {
  const next = body.querySelector(`[data-qm-h="${hid + 1}"]`);
  const top = el.getBoundingClientRect().top;
  const end = next ? next.getBoundingClientRect().top : body.getBoundingClientRect().bottom;
  return { top, end };
}

// 읽는 줄이 제목 hid 의 절 안 어디쯤인가(0~1) — 보통 ↔ 하드를 바꿀 때 짝 문제집의 같은 절 같은 비율로 가려고
export function sectionProgress(body, lineY, hid) {
  const el = body && hid != null ? body.querySelector(`[data-qm-h="${hid}"]`) : null;
  if (!el) return 0;
  const { top, end } = sectionSpan(body, el, hid);
  if (end - top <= 1) return 0;
  return Math.min(1, Math.max(0, (lineY - top) / (end - top)));
}

// 본문을 얼마나 읽었나(0~1): 본문 맨 위가 읽는 줄에 닿으면 0, 본문 맨 아래가 화면 아래에 닿으면 1
export function readingProgress(body, lineY) {
  if (!body || !body.isConnected) return 0;
  const r = body.getBoundingClientRect();
  const span = r.height - (window.innerHeight - lineY);
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (lineY - r.top) / span));
}

const reducedMotion = () => {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
};

// el 의 위 끝이 읽는 줄에서 gap 만큼 아래 오게 스크롤. 실제로 가게 될 scrollY 를 돌려준다(끝에 걸리면 덜 감)
export function scrollElTo(el, lineY, gap, smooth = false) {
  const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const top = Math.round(Math.min(max, Math.max(0, window.scrollY + el.getBoundingClientRect().top - lineY - gap)));
  window.scrollTo({ top, behavior: smooth && !reducedMotion() ? "smooth" : "auto" });
  return top;
}

// 잠깐 테두리를 깜빡여 어디인지 보이게(outline 이라 글 배치는 그대로). React 가 붙인 class 는 건드리지 않는다
export function pulse(el) {
  if (!el) return;
  el.classList.remove("qm-pulse");
  void el.offsetWidth; // 같은 요소를 연달아 깜빡일 때 애니메이션을 처음부터
  el.classList.add("qm-pulse");
  const done = () => el.classList.remove("qm-pulse");
  el.addEventListener("animationend", done, { once: true });
  setTimeout(done, 2000);
}
