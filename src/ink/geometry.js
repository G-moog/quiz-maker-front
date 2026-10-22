// 필기(S펜) 계산 — DOM·React 없이 값만 다루는 순수 함수와 상수.
// 단위: 좌표 px(필기 영역 왼쪽 위 기준), 시간 ms, 속도 px/ms. 점 하나 = [x, y, 누르는 힘(0~1)]
// (실제 태블릿으로 아직 재 보지 못한 문턱값은 모두 여기 이름 붙은 상수로 둔다 — ?pentest 로 재고 고친다)

// ── 도구 ──
// 펜 색은 어두운 화면(#1a1a1a)에서 잘 보이는 밝은 빨강·파랑·초록
export const PEN_COLORS = [
  { value: "#ff4d4f", name: "빨강" },
  { value: "#4da3ff", name: "파랑" },
  { value: "#3ddc84", name: "초록" },
];
export const PEN_WIDTH = 2.5; // 보통 힘(0.5)일 때 굵기
export const HL_COLOR = "#facc15";
export const HL_WIDTH = 16; // 형광펜은 줄 높이(약 31px)의 절반쯤
export const HL_OPACITY = 0.32; // 글자 아래에 깔리므로(InkSurface) 이 정도로도 잘 보이고 글자는 그대로 읽힌다
export const ERASER_RADIUS = 12;

// ── 입력 판정 ──
export const TAP_SLOP = 6; // '콕': 움직임 이 px 미만
export const PEN_BLANK_TAP_SLOP = 12; // 빈칸 위에서 시작한 펜 콕은 이만큼 미끄러져도 콕(S펜 촉이 닿는 순간 미끄러짐). 빈칸 밖은 TAP_SLOP 그대로(점 찍기)
export const TAP_MS = 300; // ……이고 누른 시간이 이 ms 미만(펜). 마우스는 시간 상관없이 안 움직였으면 클릭
export const DOUBLE_TAP_MS = 400; // 두 번째 콕이 첫 콕을 뗀 뒤 이 ms 안에 눌리면 두 번 콕
export const PALM_MS = 500; // 펜 호버·펜 뗀 뒤 이 ms 동안 손(touch) 입력 무시
export const PALM_SAFE_MS = 150; // 머리 줄·도구 막대(손바닥이 닿기 어려운 곳)는 펜을 뗀 뒤 이만큼만 무시하고 호버는 보지 않음
export const PEN_STUCK_MS = 2000; // '펜이 닿아 있음'(창 전체)은 마지막 펜 입력 뒤 이만큼만 믿는다(떼기를 놓쳐도 손이 계속 막히지 않게)
export const PEN_HELD_MAX_MS = 10000; // 필기 영역에서 긋는 중인 펜은 가만히 대고 있어도 이만큼은 손바닥을 막는다(떼기를 놓친 때의 안전 한도)
export const TOUCH_SLOP = 10; // 손가락 한 번 터치로 볼 움직임 한도(넘으면 끈 것 — 빈칸을 열지 않음)
// 접촉 크기(PointerEvent.width/height, Touch.radiusX·Y × 2, CSS px)가 이보다 크면 손바닥으로 보고 무시한다.
// 손가락은 보통 10~25, 손바닥은 40 이상(추정 — 크기를 알려 주지 않는 기기는 1 이라 걸리지 않음)
export const PALM_CONTACT_PX = 35;
// 두 손가락 스크롤·관성이 끝난(멈춘) 뒤 이 ms 안에 닿은 손가락은 '멈추는 터치' — 빈칸을 열지 않는다
export const SCROLL_TAP_GUARD_MS = 300;
// 페이지가 아직 움직이는 중(마지막 scroll 이벤트가 이 ms 안)에 닿은 손가락도 '멈추는 터치'
export const SCROLL_MOVING_MS = 120;

export function distance(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

// 콕으로 볼 움직임 한도: 빈칸 위에서 시작한 펜만 넓게(두 번 콕), 나머지는 TAP_SLOP
export function tapSlop(pointerType, onBlank) {
  return pointerType === "pen" && onBlank ? PEN_BLANK_TAP_SLOP : TAP_SLOP;
}

// 펜·마우스로 누른 것이 '콕'인가 (moved: 처음 누른 곳에서 가장 멀리 간 거리, slop: tapSlop)
// 펜은 시간 한도(TAP_MS)를 늘 본다 — 짧고 느린 선이 콕으로 바뀌지 않게
export function isTap(moved, ms, pointerType, slop = TAP_SLOP) {
  return moved < slop && (pointerType === "mouse" || ms < TAP_MS);
}

// 두 번 콕: 같은 빈칸을 콕(prev) → DOUBLE_TAP_MS 안에 다시 콕(tap). 콕 = { blank, downAt, upAt }
export function isDoubleTap(prev, tap) {
  if (!prev || tap.blank == null || prev.blank !== tap.blank) return false;
  const gap = tap.downAt - prev.upAt;
  return gap >= 0 && gap <= DOUBLE_TAP_MS;
}

// 접촉이 손바닥만큼 큰가(크기를 모르면 0·1 — 아님)
export function isLargeContact(w, h) {
  const a = Number.isFinite(w) ? w : 0;
  const b = Number.isFinite(h) ? h : 0;
  return Math.max(a, b) > PALM_CONTACT_PX;
}

// 손가락이 닿은 때(now)가 스크롤을 멈추는 터치인가: 관성이 돌던 중(gliding), 두 손가락 스크롤·관성이 끝난 지
// SCROLL_TAP_GUARD_MS 안(scrollEndAt), 페이지가 아직 움직이는 중(scrollAt: 마지막 scroll 이벤트)
export function tapBlockedByScroll({ gliding = false, now, scrollEndAt = -Infinity, scrollAt = -Infinity }) {
  return gliding || now - scrollEndAt < SCROLL_TAP_GUARD_MS || now - scrollAt < SCROLL_MOVING_MS;
}

// 손바닥 무시: 펜이 닿아 있거나, 펜 호버·펜 뗀 뒤 PALM_MS 안이면 손 입력을 받지 않는다.
// 펜이 닿아 있다는 표시는 마지막 펜 입력(누름·움직임, lastPenHover 는 닿은 채 움직임도 포함) 뒤 PEN_STUCK_MS 까지만 믿는다.
// (lastPenDown 을 모르는 예전 모양이면 표시를 그대로 믿는다)
// penActiveAt: 필기 영역에서 펜으로 긋는 중이면 그 펜의 마지막 입력 시각 — 가만히 대고 있어도 PEN_HELD_MAX_MS 까지 막는다.
//   그 뒤에 펜이 공중에 떠 있다는 신호(lastPenAir: buttons 0 인 펜 움직임 = 호버)가 왔으면 닿아 있지 않은 것(떼기를 놓침) —
//   이때는 호버 규칙(PALM_MS)만 남는다. 손바닥 판정에만 쓰고 긋던 선은 건드리지 않는다
// safe(머리 줄·도구 막대): 펜이 닿아 있거나 뗀 직후(PALM_SAFE_MS)만 — 펜을 든 손으로도 단추를 누를 수 있게
export function palmBlocked({ penDown, lastPenDown, lastPenHover = -Infinity, lastPenUp = -Infinity, penActiveAt = null, lastPenAir = -Infinity }, now, safe = false) {
  const held = penActiveAt != null && !(lastPenAir > penActiveAt) && now - penActiveAt < PEN_HELD_MAX_MS;
  const down = held || (!!penDown && (lastPenDown === undefined || now - Math.max(lastPenDown, lastPenHover) < PEN_STUCK_MS));
  if (safe) return down || now - lastPenUp < PALM_SAFE_MS;
  return down || now - lastPenHover < PALM_MS || now - lastPenUp < PALM_MS;
}

// ── 두 손가락 스크롤 ──
export function midpoint(points) {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

// 속도 표본: 최근 keepMs 동안의 (시각 t, 누적 스크롤 v). 손을 뗄 때 이 표본으로 놓는 속도를 잰다
export const VELOCITY_MS = 100;
export function pushSample(samples, t, v, keepMs = VELOCITY_MS) {
  const out = samples.filter((s) => t - s.t <= keepMs);
  out.push({ t, v });
  return out;
}

// 손을 뗄 때의 속도(px/ms). 멈췄다 떼면(마지막 움직임이 keepMs 보다 오래면) 0 — 관성 없음
export function releaseVelocity(samples, now, keepMs = VELOCITY_MS) {
  const recent = samples.filter((s) => now - s.t <= keepMs);
  if (recent.length < 2) return 0;
  const a = recent[0];
  const b = recent[recent.length - 1];
  return b.t > a.t ? (b.v - a.v) / (b.t - a.t) : 0;
}

// 관성: 속도가 시간 상수 INERTIA_TAU 로 줄어든다(지수 감속). 놓은 속도 v 로 미끄러지는 거리는 약 v × TAU
export const INERTIA_TAU = 450;
export const INERTIA_START = 0.25; // 이보다 느리게(250px/s) 놓으면 관성 없음
export const INERTIA_STOP = 0.02;
export const INERTIA_MAX = 6;
export function inertiaStep(v, dt, tau = INERTIA_TAU) {
  const k = Math.exp(-dt / tau);
  return { v: v * k, d: v * tau * (1 - k) };
}

// ── 선 모양 ──
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

// ── 예측 점(그리는 중인 선에만) ──
// 브라우저가 알려 주는 '곧 올 펜 자리'(PointerEvent.getPredictedEvents)를 그리는 중인 선 끝에 잠깐 붙여 선이 펜촉을
// 더 바짝 따라오게 한다(체감 지연 줄이기). 저장하지 않는다 — 다음 움직임에서 새 예측으로 바꾸고, 뗄 때 버린다.
// 너무 앞선 예측(시간·거리)은 자르고, 펜이 멈추면 걷는다(멈춘 자리보다 앞서 그려진 꼬리가 남지 않게)
export const PREDICT_MAX_POINTS = 3;
export const PREDICT_MAX_MS = 25; // 지금 이벤트보다 이만큼 넘게 앞선 예측은 버린다
export const PREDICT_MAX_PX = 24; // 마지막 실제 점에서 이만큼 넘게 떨어진 예측은 이 거리까지만(방향은 그대로)
export const PREDICT_HOLD_MS = 60; // 새 움직임 없이 이만큼 지나면 예측 꼬리를 걷는다

// last: 마지막 실제 점 [x, y, 힘], preds: 예측 자리 [{ x, y, t }](영역 기준 px, t = 이벤트 시각), now: 지금 이벤트 시각
// → 그리는 선에 붙일 점들 [[x, y, 힘]…](힘은 마지막 실제 점 그대로 — 예측 이벤트의 힘은 믿을 수 없다)
export function predictTail(last, preds, now) {
  const out = [];
  if (!last || !preds?.length) return out;
  for (const q of preds) {
    if (out.length >= PREDICT_MAX_POINTS) break;
    if (!q || !Number.isFinite(q.x) || !Number.isFinite(q.y)) continue;
    if (Number.isFinite(q.t) && Number.isFinite(now) && q.t - now > PREDICT_MAX_MS) break;
    const d = distance(last[0], last[1], q.x, q.y);
    if (d > PREDICT_MAX_PX) {
      const k = PREDICT_MAX_PX / d;
      out.push([r1(last[0] + (q.x - last[0]) * k), r1(last[1] + (q.y - last[1]) * k), last[2]]);
      break;
    }
    out.push([r1(q.x), r1(q.y), last[2]]);
  }
  return out;
}

// 점 더하기: 앞 점과 0.75px 보다 가까우면 버린다(좌표는 소수 1자리). 더했으면 true
export function addPoint(pts, x, y, p) {
  const last = pts[pts.length - 1];
  if (last && distance(last[0], last[1], x, y) < 0.75) return false;
  pts.push([r1(x), r1(y), r2(pressureOf(p))]);
  return true;
}

// 누르는 힘. 0(힘을 모르는 기기·첫 점)은 보통 힘으로
export function pressureOf(p) {
  return p > 0 ? Math.min(1, p) : 0.5;
}

// 펜 반지름: 보통 힘(0.5)에서 굵기의 절반, 약하게 0.55배 ~ 세게 1.45배
export function penRadius(w, p) {
  return (w / 2) * (0.55 + 0.9 * pressureOf(p));
}

// 선 길이가 min 보다 짧은가(점처럼 보이는 선) — 길이를 다 재지 않고 min 을 넘는 순간 멈춘다
function shorterThan(pts, min) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += distance(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    if (len >= min) return false;
  }
  return true;
}

// ── 선 그림(SVG path 의 d) ──
// 단위는 0.1px 정수(DRAW_SCALE): 필기 층은 <g transform="scale(0.1)"> 안에 그린다(InkSurface — DRAW_TRANSFORM).
// 첫 점만 절대 좌표, 나머지는 앞 점에서 얼마나 갔는지(상대 명령 q·l·a). 소수 좌표 글보다 짧고(약 절반) 만들기 빠르다(약 4배) —
// 획이 2,000개인 긴 문항을 열 때 그리기 준비와 브라우저의 path 읽기가 함께 준다. 자리는 예전처럼 0.1px 단위로 반올림한 그대로
export const DRAW_SCALE = 10;
export const DRAW_TRANSFORM = `scale(${1 / DRAW_SCALE})`;
const tenth = (v) => Math.round(v * DRAW_SCALE);

// 점들(0.1px 정수, 평평한 배열 [x0, y0, x1, y1, …], n 개)을 지나는 매끄러운 선 — 점 사이 중간점을 잇는 2차 곡선.
// 첫 점에서 시작한 뒤 이어 붙일 부분(상대 명령). at = [x, y]: 지금 펜 자리(끝난 자리로 바뀐다)
function smoothTail(A, n, at) {
  let cx = at[0];
  let cy = at[1];
  let d = "";
  if (n < 3) {
    for (let i = 1; i < n; i++) {
      d += `l${A[2 * i] - cx},${A[2 * i + 1] - cy}`;
      cx = A[2 * i];
      cy = A[2 * i + 1];
    }
  } else {
    for (let i = 1; i < n - 1; i++) {
      const qx = A[2 * i];
      const qy = A[2 * i + 1];
      const mx = Math.round((qx + A[2 * i + 2]) / 2);
      const my = Math.round((qy + A[2 * i + 3]) / 2);
      d += `q${qx - cx},${qy - cy} ${mx - cx},${my - cy}`;
      cx = mx;
      cy = my;
    }
    d += `l${A[2 * n - 2] - cx},${A[2 * n - 1] - cy}`;
    cx = A[2 * n - 2];
    cy = A[2 * n - 1];
  }
  at[0] = cx;
  at[1] = cy;
  return d;
}

function circlePath(x, y, r) {
  const t = Math.max(1, tenth(r));
  return `M${tenth(x) - t},${tenth(y)}a${t},${t} 0 1 0 ${2 * t},0a${t},${t} 0 1 0 ${-2 * t},0z`;
}

// 펜 선: 누르는 힘에 따라 굵기가 변하는 테두리(채운 도형). 양옆 테두리를 매끄럽게 잇고 두 끝은 반원 (단위 0.1px)
export function outlinePath(pts, w) {
  const n = pts.length;
  if (!n) return "";
  const raw = new Array(n);
  for (let i = 0; i < n; i++) raw[i] = penRadius(w, pts[i][2]);
  // 힘 값이 튀어 굵기가 울퉁불퉁하지 않게 이웃과 평균
  const rs = new Array(n);
  for (let i = 0; i < n; i++) rs[i] = (raw[i > 0 ? i - 1 : 0] + 2 * raw[i] + raw[i < n - 1 ? i + 1 : n - 1]) / 4;
  if (n === 1 || shorterThan(pts, 0.5)) return circlePath(pts[0][0], pts[0][1], rs[0]);
  // 왼쪽 테두리는 앞에서부터, 오른쪽 테두리는 뒤에서부터(돌아오는 길) 담는다
  const left = new Int32Array(2 * n);
  const right = new Int32Array(2 * n);
  let nx = 0;
  let ny = 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i > 0 ? i - 1 : 0];
    const b = pts[i < n - 1 ? i + 1 : n - 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len > 1e-6) {
      nx = -dy / len;
      ny = dx / len;
    }
    const x = pts[i][0];
    const y = pts[i][1];
    const r = rs[i];
    const j = 2 * (n - 1 - i);
    left[2 * i] = tenth(x + nx * r);
    left[2 * i + 1] = tenth(y + ny * r);
    right[j] = tenth(x - nx * r);
    right[j + 1] = tenth(y - ny * r);
  }
  const at = [left[0], left[1]];
  let d = `M${left[0]},${left[1]}${smoothTail(left, n, at)}`;
  const re = tenth(rs[n - 1]);
  d += `a${re},${re} 0 0 0 ${right[0] - at[0]},${right[1] - at[1]}`;
  at[0] = right[0];
  at[1] = right[1];
  d += smoothTail(right, n, at);
  const r0 = tenth(rs[0]);
  return `${d}a${r0},${r0} 0 0 0 ${left[0] - at[0]},${left[1] - at[1]}z`;
}

// 형광펜 선: 가운데 선(굵기는 stroke-width 로 — 0.1px 단위라 w × DRAW_SCALE)
export function centerlinePath(pts) {
  const n = pts.length;
  if (!n) return "";
  const A = new Int32Array(2 * n);
  for (let i = 0; i < n; i++) {
    A[2 * i] = tenth(pts[i][0]);
    A[2 * i + 1] = tenth(pts[i][1]);
  }
  if (n === 1) return `M${A[0]},${A[1]}l1,0`;
  return `M${A[0]},${A[1]}${smoothTail(A, n, [A[0], A[1]])}`;
}

// 그릴 선 묶기(InkSurface): 이웃한 선끼리 id 묶음 번호(id ÷ size)가 같으면 한 묶음 → [{ key, list }].
// 선 id 는 그은 차례로 커지므로 보통 묶음 하나에 size 개 안팎. key 는 묶음 번호 — 묶음의 첫 선을 지워도 그대로라
// 묶음을 새로 만들지 않는다. id 차례가 섞인 배열(다시 읽어 합친 필기)에서 같은 번호가 또 나오면 "번호:몇째"로 겹치지 않게.
// 선 배열 차례는 그대로(그리는 차례가 바뀌지 않게)
export const DRAW_CHUNK = 64;
export function chunkStrokes(strokes, size = DRAW_CHUNK) {
  const out = [];
  const seen = new Map();
  let cur = null;
  let ci = NaN;
  for (const s of strokes) {
    const c = Math.floor(s.id / size);
    if (!cur || c !== ci) {
      const k = seen.get(c) ?? 0;
      seen.set(c, k + 1);
      cur = { key: k ? `${c}:${k}` : String(c), list: [] };
      out.push(cur);
      ci = c;
    }
    cur.list.push(s);
  }
  return out;
}

// ── 지우개 ──
const boxCache = new WeakMap();
function strokeBox(s) {
  let b = boxCache.get(s);
  if (!b) {
    b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const p of s.pts) {
      if (p[0] < b.x0) b.x0 = p[0];
      if (p[0] > b.x1) b.x1 = p[0];
      if (p[1] < b.y0) b.y0 = p[1];
      if (p[1] > b.y1) b.y1 = p[1];
    }
    boxCache.set(s, b);
  }
  return b;
}

function pointSegDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function cross(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

export function segmentDistance(p1, p2, q1, q2) {
  const d1 = cross(q1, q2, p1);
  const d2 = cross(q1, q2, p2);
  const d3 = cross(p1, p2, q1);
  const d4 = cross(p1, p2, q2);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(pointSegDist(p1, q1, q2), pointSegDist(p2, q1, q2), pointSegDist(q1, p1, p2), pointSegDist(q2, p1, p2));
}

// 지우개가 a → b 로 지나갈 때(반지름 r) 이 선에 닿는가. 선의 굵기(펜은 가장 굵은 때)까지 넣어 잰다
export function strokeTouches(stroke, a, b, r = ERASER_RADIUS) {
  const pts = stroke.pts;
  if (!pts.length) return false;
  const reach = r + (stroke.tool === "hl" ? stroke.w / 2 : penRadius(stroke.w, 1));
  const box = strokeBox(stroke);
  if (Math.max(a[0], b[0]) < box.x0 - reach || Math.min(a[0], b[0]) > box.x1 + reach
    || Math.max(a[1], b[1]) < box.y0 - reach || Math.min(a[1], b[1]) > box.y1 + reach) return false;
  if (pts.length === 1) return pointSegDist(pts[0], a, b) <= reach;
  for (let i = 0; i < pts.length - 1; i++) {
    if (segmentDistance(pts[i], pts[i + 1], a, b) <= reach) return true;
  }
  return false;
}

// ── 화면 폭 ──
// 저장된 폭이 지금 폭과 이만큼(px) 안으로 다르면 같은 폭의 필기로 본다(분할 화면·확대를 조금 바꾼 정도)
export const WIDTH_TOLERANCE_PX = 3;
// 저장할 때와 영역 높이가 이 px 보다 다르면 '필기 위치가 어긋날 수 있음' 안내. 빈칸 폭이 고정이라 같은 폭이면
// 높이도 거의 같아야 한다 — 한 줄(약 31px)만 밀려도 알 수 있게 작게
export const DRIFT_PX = 8;

// 지금 폭(width)에서 쓸 저장 폭: 같은 폭이 있으면 그 폭, 없으면 WIDTH_TOLERANCE_PX 안의 가장 가까운 폭, 그것도 없으면 지금 폭.
// layouts: { "<폭>": { strokes, updatedAt } }. 거리가 같으면 최근에 쓴 쪽
export function matchWidth(layouts, width) {
  if (!layouts || !width) return width;
  if (layouts[width]?.strokes?.length) return width;
  let best = width;
  let bestD = Infinity;
  let bestAt = -Infinity;
  for (const [k, l] of Object.entries(layouts)) {
    const w = Number(k);
    if (!l?.strokes?.length || !Number.isFinite(w)) continue;
    const d = Math.abs(w - width);
    if (d > WIDTH_TOLERANCE_PX) continue;
    const at = l.updatedAt || 0;
    if (d < bestD || (d === bestD && at > bestAt)) {
      best = w;
      bestD = d;
      bestAt = at;
    }
  }
  return best;
}

// 저장한 높이(saved)와 지금 높이(now)가 어긋났나
export function driftExceeds(saved, now) {
  if (!saved || !now) return false;
  return Math.abs(now - saved) > DRIFT_PX;
}

// ── 저장 형식 ──
// 본문 지문: 문항 글(빈칸 문항은 정답까지)이 바뀌었는지 가리는 짧은 값(cyrb53 + 글 길이)
export function textHash(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}-${str.length}`;
}

// 선 하나의 저장 모양(판 2): 점을 한 덩어리 정수 배열 q = [x×10, y×10, 힘×100, …](Int32Array)로.
// IndexedDB 에 넣을 때 복제가 메모리 복사 한 번이라 점이 많아도 빠르고 작다. 선은 한 번 그은 뒤 바뀌지 않으므로
// 선마다 한 번만 만들어 두고(packCache) 다음 저장부터는 그대로 쓴다 — 저장할 때마다 전체를 다시 만들지 않게.
// (판 1 의 pts: [[x, y, p], …] 도 읽는다 — unpackRecord)
const packCache = new WeakMap();

export function packPoints(pts) {
  const q = new Int32Array(pts.length * 3);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    q[i * 3] = Math.round(p[0] * 10);
    q[i * 3 + 1] = Math.round(p[1] * 10);
    q[i * 3 + 2] = Math.round((Number.isFinite(p[2]) ? p[2] : 0.5) * 100);
  }
  return q;
}

export function unpackPoints(q) {
  const pts = [];
  for (let i = 0; i + 2 < q.length; i += 3) pts.push([q[i] / 10, q[i + 1] / 10, q[i + 2] / 100]);
  return pts;
}

export function packStroke(s) {
  let out = packCache.get(s);
  if (!out) {
    out = { tool: s.tool, color: s.color, w: s.w, q: packPoints(s.pts) };
    packCache.set(s, out);
  }
  return out;
}

// 문항 하나의 필기 → 저장 값 { textHash, layouts: { "<폭>": { height, strokes, updatedAt } } }. 선이 없으면 null(지움)
export function packRecord(rec) {
  if (!rec) return null;
  const layouts = {};
  for (const [w, l] of Object.entries(rec.layouts || {})) {
    if (!l?.strokes?.length) continue;
    layouts[w] = { height: Math.round(l.height || 0), strokes: l.strokes.map(packStroke), updatedAt: l.updatedAt || 0 };
  }
  return Object.keys(layouts).length ? { textHash: rec.textHash, layouts } : null;
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isPts = (pts) => Array.isArray(pts) && pts.length > 0 && pts.every((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1]));
const isQ = (q) => (q instanceof Int32Array || (Array.isArray(q) && q.every(isNum))) && q.length >= 3 && q.length % 3 === 0;

// 저장된 선 하나 → 화면용(점 배열). 모양이 틀리면 null
function strokeOf(s, newId) {
  if (!s || (s.tool !== "pen" && s.tool !== "hl") || typeof s.color !== "string" || !isNum(s.w)) return null;
  if (s.q != null) {
    if (!isQ(s.q)) return null;
    const st = { tool: s.tool, color: s.color, w: s.w, pts: unpackPoints(s.q), id: newId() };
    // 읽은 Int32Array 를 그대로 저장 모양으로 기억(다음 저장 때 다시 만들지 않게)
    if (s.q instanceof Int32Array) packCache.set(st, { tool: s.tool, color: s.color, w: s.w, q: s.q });
    return st;
  }
  if (!isPts(s.pts)) return null;
  return { tool: s.tool, color: s.color, w: s.w, pts: s.pts.map((p) => [p[0], p[1], isNum(p[2]) ? p[2] : 0.5]), id: newId() };
}

// 저장 값 → 화면용(선마다 newId() 로 id). 모양이 틀린 선은 버린다
export function unpackRecord(raw, newId) {
  if (!raw || typeof raw !== "object" || typeof raw.textHash !== "string" || !raw.layouts || typeof raw.layouts !== "object") return null;
  const layouts = {};
  for (const [w, l] of Object.entries(raw.layouts)) {
    if (!l || !Array.isArray(l.strokes)) continue;
    const strokes = [];
    for (const s of l.strokes) {
      const st = strokeOf(s, newId);
      if (st) strokes.push(st);
    }
    if (strokes.length) layouts[w] = { height: isNum(l.height) ? l.height : 0, strokes, updatedAt: isNum(l.updatedAt) ? l.updatedAt : 0 };
  }
  return { textHash: raw.textHash, layouts };
}

// 화면용 필기 → JSON 으로 옮길 수 있는 모양(판 1: pts 중첩 배열). 백업 파일용
export function portableRecord(rec) {
  if (!rec) return null;
  const layouts = {};
  for (const [w, l] of Object.entries(rec.layouts || {})) {
    if (!l?.strokes?.length) continue;
    layouts[w] = {
      height: Math.round(l.height || 0),
      updatedAt: l.updatedAt || 0,
      strokes: l.strokes.map((s) => ({ tool: s.tool, color: s.color, w: s.w, pts: s.pts.map((p) => [r1(p[0]), r1(p[1]), r2(p[2])]) })),
    };
  }
  return Object.keys(layouts).length ? { textHash: rec.textHash, layouts } : null;
}
