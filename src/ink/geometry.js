// 필기(S펜) 계산 — DOM·React 없이 값만 다루는 순수 함수와 상수.
// 단위: 좌표 px(필기 영역 왼쪽 위 기준), 시간 ms, 속도 px/ms. 점 하나 = [x, y, 누르는 힘(0~1)]

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
export const TAP_MS = 300; // ……이고 누른 시간이 이 ms 미만(펜). 마우스는 시간 상관없이 안 움직였으면 클릭
export const DOUBLE_TAP_MS = 400; // 두 번째 콕이 첫 콕을 뗀 뒤 이 ms 안에 눌리면 두 번 콕
export const PALM_MS = 500; // 펜 호버·펜 뗀 뒤 이 ms 동안 손(touch) 입력 무시
export const TOUCH_SLOP = 10; // 손가락 한 번 터치로 볼 움직임 한도(넘으면 끈 것 — 빈칸을 열지 않음)

export function distance(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

// 펜·마우스로 누른 것이 '콕'인가 (moved: 처음 누른 곳에서 가장 멀리 간 거리)
export function isTap(moved, ms, pointerType) {
  return moved < TAP_SLOP && (pointerType === "mouse" || ms < TAP_MS);
}

// 두 번 콕: 같은 빈칸을 콕(prev) → DOUBLE_TAP_MS 안에 다시 콕(tap). 콕 = { blank, downAt, upAt }
export function isDoubleTap(prev, tap) {
  if (!prev || tap.blank == null || prev.blank !== tap.blank) return false;
  const gap = tap.downAt - prev.upAt;
  return gap >= 0 && gap <= DOUBLE_TAP_MS;
}

// 손바닥 무시: 펜이 닿아 있거나, 펜 호버·펜 뗀 뒤 PALM_MS 안이면 손 입력을 받지 않는다
export function palmBlocked({ penDown, lastPenHover, lastPenUp }, now) {
  return !!penDown || now - lastPenHover < PALM_MS || now - lastPenUp < PALM_MS;
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
const xy = (p) => `${r1(p[0])},${r1(p[1])}`;

// 점 더하기: 앞 점과 0.75px 보다 가까우면 버린다(좌표는 소수 1자리). 더했으면 true
export function addPoint(pts, x, y, p) {
  const last = pts[pts.length - 1];
  if (last && distance(last[0], last[1], x, y) < 0.75) return false;
  pts.push([r1(x), r1(y), Math.round(pressureOf(p) * 100) / 100]);
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

function pathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += distance(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  return len;
}

// 점들을 지나는 매끄러운 선: 점 사이 중간점을 잇는 2차 곡선(첫 점에서 시작한 뒤 이어 붙일 부분)
function smoothTail(arr) {
  const n = arr.length;
  if (n < 3) return arr.slice(1).map((p) => `L${xy(p)}`).join("");
  let d = "";
  for (let i = 1; i < n - 1; i++) {
    d += `Q${xy(arr[i])} ${r1((arr[i][0] + arr[i + 1][0]) / 2)},${r1((arr[i][1] + arr[i + 1][1]) / 2)}`;
  }
  return `${d}L${xy(arr[n - 1])}`;
}

function circlePath(x, y, r) {
  return `M${r1(x - r)},${r1(y)}a${r1(r)},${r1(r)} 0 1 0 ${r1(2 * r)},0a${r1(r)},${r1(r)} 0 1 0 ${r1(-2 * r)},0Z`;
}

// 펜 선: 누르는 힘에 따라 굵기가 변하는 테두리(채운 도형). 양옆 테두리를 매끄럽게 잇고 두 끝은 반원
export function outlinePath(pts, w) {
  const n = pts.length;
  if (!n) return "";
  const raw = pts.map((p) => penRadius(w, p[2]));
  // 힘 값이 튀어 굵기가 울퉁불퉁하지 않게 이웃과 평균
  const rs = raw.map((v, i) => (raw[Math.max(0, i - 1)] + 2 * v + raw[Math.min(n - 1, i + 1)]) / 4);
  if (n === 1 || pathLength(pts) < 0.5) return circlePath(pts[0][0], pts[0][1], rs[0]);
  const left = [];
  const right = [];
  let nx = 0;
  let ny = 1;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len > 1e-6) {
      nx = -dy / len;
      ny = dx / len;
    }
    left.push([pts[i][0] + nx * rs[i], pts[i][1] + ny * rs[i]]);
    right.push([pts[i][0] - nx * rs[i], pts[i][1] - ny * rs[i]]);
  }
  const re = r1(rs[n - 1]);
  const r0 = r1(rs[0]);
  right.reverse();
  return `M${xy(left[0])}${smoothTail(left)}A${re},${re} 0 0 0 ${xy(right[0])}${smoothTail(right)}A${r0},${r0} 0 0 0 ${xy(left[0])}Z`;
}

// 형광펜 선: 가운데 선(굵기는 stroke-width 로)
export function centerlinePath(pts) {
  if (!pts.length) return "";
  if (pts.length === 1) return `M${xy(pts[0])}l0.01,0`;
  return `M${xy(pts[0])}${smoothTail(pts)}`;
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

// 선 하나를 저장할 모양으로: 좌표 소수 1자리, 힘 소수 2자리, 화면용 id 는 뺀다
export function packStroke(s) {
  return {
    tool: s.tool, color: s.color, w: s.w,
    pts: s.pts.map((p) => [r1(p[0]), r1(p[1]), Math.round(p[2] * 100) / 100]),
  };
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

// 저장 값 → 화면용(선마다 newId() 로 id). 모양이 틀린 선은 버린다
export function unpackRecord(raw, newId) {
  if (!raw || typeof raw !== "object" || typeof raw.textHash !== "string" || !raw.layouts || typeof raw.layouts !== "object") return null;
  const layouts = {};
  for (const [w, l] of Object.entries(raw.layouts)) {
    if (!l || !Array.isArray(l.strokes)) continue;
    const strokes = l.strokes
      .filter((s) => s && (s.tool === "pen" || s.tool === "hl") && typeof s.color === "string" && isNum(s.w)
        && Array.isArray(s.pts) && s.pts.length && s.pts.every((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1])))
      .map((s) => ({ tool: s.tool, color: s.color, w: s.w, pts: s.pts.map((p) => [p[0], p[1], isNum(p[2]) ? p[2] : 0.5]), id: newId() }));
    if (strokes.length) layouts[w] = { height: isNum(l.height) ? l.height : 0, strokes, updatedAt: isNum(l.updatedAt) ? l.updatedAt : 0 };
  }
  return { textHash: raw.textHash, layouts };
}
