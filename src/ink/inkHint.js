import { WIDTH_TOLERANCE_PX } from "./geometry.js";

// 필기가 있는 문항 기억(이 기기의 localStorage) — 필기를 다 불러오기 전 첫 그림부터 필기 층을 켜 두려고 쓴다.
// 필기 모드를 끈 채 필기가 있는 문항을 열면 IndexedDB 를 읽는 동안(앱을 처음 열 때는 수십 ms 넘게) 빈칸이 번호 폭으로
// 그려졌다가 정답 폭(필기 층 — 열고 닫아도 폭이 그대로인 빈칸)으로 바뀌며 긴 글이 한 번 다시 흘렀다. 필기가 있는 문항을
// 미리 알면 첫 그림부터 정답 폭으로 그린다. 불러오기가 끝나면 진짜 값으로 바로잡히므로 틀려도 그때까지만이다.
// 모양: { v: 1, w: 마지막으로 잰 본문 폭, k: { "<열쇠>": ["<지문>", [필기가 있는 폭…]] } } — 최근에 바뀐 것이 뒤(넘치면 앞에서 지움)
const STORAGE_KEY = "qm:ink-hint:v1";
export const HINT_MAX = 400;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// 저장된 글 → { w, k: Map(열쇠 → { h: 지문, w: [폭…] }) }. 틀린 글·모르는 판은 빈 기억
export function parseHint(raw) {
  const out = { w: 0, k: new Map() };
  let v;
  try {
    v = typeof raw === "string" ? JSON.parse(raw) : null;
  } catch {
    v = null;
  }
  if (!v || typeof v !== "object" || v.v !== 1) return out;
  if (isNum(v.w) && v.w > 0) out.w = v.w;
  if (v.k && typeof v.k === "object") {
    for (const [key, e] of Object.entries(v.k)) {
      if (!Array.isArray(e) || typeof e[0] !== "string" || !Array.isArray(e[1])) continue;
      const ws = e[1].filter((x) => isNum(x) && x > 0);
      if (ws.length) out.k.set(key, { h: e[0], w: ws });
    }
  }
  return out;
}

export function serializeHint(hint) {
  const k = {};
  for (const [key, e] of hint.k) k[key] = [e.h, e.w];
  return JSON.stringify({ v: 1, w: hint.w, k });
}

// 이 문항(key)·지금 본문(textHash)에 보여 줄 필기가 있을 것 같은가: 같은 지문이고, 마지막으로 잰 본문 폭(±WIDTH_TOLERANCE_PX)에서
// 쓴 필기가 있음(폭을 아직 모르면 아무 폭이나)
export function hintHas(hint, key, textHash) {
  const e = key ? hint.k.get(key) : null;
  if (!e || e.h !== textHash) return false;
  return hint.w ? e.w.some((w) => Math.abs(w - hint.w) <= WIDTH_TOLERANCE_PX) : e.w.length > 0;
}

// 필기 기록(record: 화면용 { textHash, layouts }, 없으면 null)으로 이 문항의 기억을 고친다. 바뀌었으면 true.
// 고친 문항은 뒤로 옮기고, HINT_MAX 를 넘으면 오래된 것부터 지운다
export function hintNote(hint, key, record) {
  if (!key) return false;
  const widths = record
    ? Object.entries(record.layouts || {}).filter(([, l]) => l?.strokes?.length).map(([w]) => Number(w)).filter((w) => w > 0).sort((a, b) => a - b)
    : [];
  const cur = hint.k.get(key);
  if (!widths.length) return hint.k.delete(key);
  if (cur && cur.h === record.textHash && cur.w.length === widths.length && cur.w.every((w, i) => w === widths[i])) return false;
  hint.k.delete(key);
  hint.k.set(key, { h: record.textHash, w: widths });
  while (hint.k.size > HINT_MAX) hint.k.delete(hint.k.keys().next().value);
  return true;
}

// 마지막으로 잰 본문 폭. 바뀌었으면 true
export function hintWidth(hint, w) {
  if (!isNum(w) || w <= 0 || w === hint.w) return false;
  hint.w = w;
  return true;
}

// 이 기기의 기억(localStorage). 처음 쓸 때 한 번 읽고, 바뀔 때만 쓴다. 막힌 브라우저에서도 화면은 동작하게 실패는 무시
let mem = null;
function current() {
  if (!mem) {
    let raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      raw = null;
    }
    mem = parseHint(raw);
  }
  return mem;
}
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, serializeHint(mem));
  } catch {
    // 기억하지 못해도 불러오기가 끝나면 바로잡힌다
  }
}

export const inkHints = {
  has: (key, textHash) => hintHas(current(), key, textHash),
  note: (key, record) => {
    if (hintNote(current(), key, record)) persist();
  },
  width: (w) => {
    if (hintWidth(current(), w)) persist();
  },
};
