// 질문 메모 도우미: 풀기 화면의 맥락 글, 목록 묶기·복사 글, 시각 표시, 저장하지 못한 초안 보관, 메모 창의 이전 메모(순서·고치기 초안)
export const NOTE_CONTENT_MAX = 2000;
export const NOTE_CONTEXT_MAX = 1000; // 서버 한도
const CONTEXT_CHARS = 300; // 화면에서 만드는 맥락 길이(이 안팎)
const TABLE_LINE = /^\s*\|.*\|\s*$/;
const HEAD_LABEL_MAX = 24; // 표 칸 앞에 붙이는 열 이름 길이
const OPTION_MAX = 40; // 객관식 보기 하나의 길이
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩";

const tableCells = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
const oneLine = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const clipEnd = (s, max) => (s.length > max ? `${s.slice(0, max)}…` : s);

// 빈칸 문항 본문에서 blankIndex(0부터) 번째 빈칸이 있는 줄을 맥락 글로 만든다.
// 빈칸 순서는 TableAwareText 와 같다(줄 순서 → 표는 칸 순서 → 칸 안 왼쪽부터).
// 표 줄은 칸을 ' · ' 로 잇고, 머리 행(그 표의 첫 행)이 따로 있으면 칸마다 열 이름을 붙인다
// ('기온: 24도 · RH 40%: 13.1 / 1.79 · 60%: [13: 8.7] / 1.19 …') — 메모만 읽어도 어느 열 값인지 알게.
// 그 빈칸은 '[N: 정답]', 다른 빈칸은 '___'. 길면 그 빈칸 둘레로 300자 안팎만.
export function blankContext(text, blankIndex, answers = []) {
  const lines = (text || "").split("\n");
  const mark = `[${blankIndex + 1}: ${answers[blankIndex] ?? "?"}]`;
  let seen = 0;
  let tableStart = -1; // 지금 줄이 든 표의 첫 행 번호(표가 아니면 -1)
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const isTable = TABLE_LINE.test(line);
    if (!isTable) tableStart = -1;
    else if (tableStart < 0) tableStart = li;
    const count = line.split("___").length - 1;
    if (blankIndex >= seen + count) {
      seen += count;
      continue;
    }
    let k = seen;
    const fill = (segment) =>
      segment.split("___").reduce((acc, part, pi) => {
        if (pi === 0) return part;
        const out = acc + (k === blankIndex ? mark : "___") + part;
        k += 1;
        return out;
      }, "");
    let body;
    if (isTable) {
      const head = li > tableStart ? tableCells(lines[tableStart]).map((h) => clipEnd(oneLine(h), HEAD_LABEL_MAX)) : null;
      body = tableCells(line)
        .map(fill) // 칸 순서대로 불러야 빈칸 번호(k)가 맞는다
        .map((c, ci) => (head && head[ci] && c ? `${head[ci]}: ${c}` : c))
        .join(" · ");
    } else {
      body = fill(line);
    }
    return clipAround(oneLine(body), mark, CONTEXT_CHARS);
  }
  return "";
}

// s 가 max 자보다 길면 focus 글이 앞쪽 40% 쯤 오게 잘라 앞뒤에 '…'
function clipAround(s, focus, max) {
  if (s.length <= max) return s;
  const at = Math.max(0, s.indexOf(focus));
  const start = Math.max(0, Math.min(at - Math.floor(max * 0.4), s.length - max));
  const end = Math.min(s.length, Math.max(start + max, at + focus.length));
  return (start > 0 ? "…" : "") + s.slice(start, end) + (end < s.length ? "…" : "");
}

// 빈칸 문항이 아닌 문항(객관식·주관식·O/X)의 맥락: 문제 본문 앞부분(+ 객관식이면 보기).
// 표는 칸을 ' · ', 행을 ' / ' 로 잇는다('구분 · 특징 / 성충 · 잎 뒷면'). 정답은 넣지 않는다(풀기 전에 창을 열 수 있어서).
export function questionContext(text, options = []) {
  const parts = [];
  let rows = [];
  const flush = () => {
    if (rows.length) parts.push(rows.join(" / "));
    rows = [];
  };
  for (const line of (text || "").split("\n")) {
    if (TABLE_LINE.test(line)) {
      rows.push(tableCells(line).join(" · "));
    } else {
      flush();
      if (line.trim()) parts.push(line.trim());
    }
  }
  flush();
  const body = oneLine(parts.join(" "));
  const opts = (Array.isArray(options) ? options : [])
    .map((o, i) => `${CIRCLED[i] ?? `(${i + 1})`} ${clipEnd(oneLine(o), OPTION_MAX)}`)
    .join(" ");
  const optText = opts ? `보기: ${opts}` : "";
  const room = Math.max(120, CONTEXT_CHARS - (optText ? optText.length + 3 : 0));
  return [body ? clipEnd(body, room) : "", optText].filter(Boolean).join(" — ");
}

// "2026-10-20T22:15:30" · "…Z" · "…+09:00" · [2026,10,20,22,15] → "10/20 22:15"
// 시간대가 붙은 값은 이 기기 시각으로, 붙지 않은 값은 서버가 준 그대로 읽는다.
export function formatNoteTime(v) {
  if (!v) return "";
  const pad = (n) => String(n).padStart(2, "0");
  if (Array.isArray(v)) {
    const [, mo, d, h = 0, mi = 0] = v;
    return mo && d ? `${mo}/${d} ${pad(h)}:${pad(mi)}` : "";
  }
  const s = String(v);
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(s);
  return m ? `${Number(m[2])}/${Number(m[3])} ${m[4]}:${m[5]}` : "";
}

// 메모 목록을 문제집별로 묶는다(순서는 받은 목록 그대로 — 묶음은 처음 나온 자리).
// liveSets: 지금 내 문제집 Map(id 문자열 → 문제집). 모르면 null.
// 지운 문제집: setId 가 없는데 저장해 둔 제목이 있거나, 목록을 아는데 거기에 없는 것.
export function groupNotes(notes, liveSets) {
  const groups = new Map();
  for (const n of notes) {
    const key = n.setId != null ? `id:${n.setId}` : `t:${n.setTitle ?? ""}`;
    let g = groups.get(key);
    if (!g) {
      const live = n.setId != null && liveSets ? liveSets.get(String(n.setId)) : null;
      const deleted = n.setId == null ? !!n.setTitle : !!liveSets && !live;
      g = { key, title: live?.title ?? n.setTitle ?? "", deleted, notes: [] };
      groups.set(key, g);
    }
    g.notes.push(n);
  }
  return [...groups.values()];
}

export function groupLabel(g) {
  if (g.deleted) return g.title ? `${g.title} (지운 문제집)` : "(지운 문제집)";
  return g.title || "(문제집 없음)";
}

// Claude 에게 붙여 넣기 좋은 글:
// ■ 문제집 제목
// - [빈칸 N] 메모 (맥락)
// 메모가 여러 줄이면 다음 줄을 두 칸 들여 쓴다
export function buildCopyText(groups) {
  return groups
    .map((g) => {
      const items = g.notes.map((n) => {
        const blank = n.blankNo ? `[빈칸 ${n.blankNo}] ` : "";
        const body = (n.content || "").trim().split(/\r?\n/).join("\n  ");
        const ctx = n.context ? ` (${n.context.replace(/\s+/g, " ").trim()})` : "";
        return `- ${blank}${body}${ctx}`;
      });
      return [`■ ${groupLabel(g)}`, ...items].join("\n");
    })
    .join("\n\n");
}

// 클립보드에 복사. 안 되면 false
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 아래 옛 방식으로 한 번 더
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

// 저장하지 못한 메모 초안(이 기기에 하나). { user, info, withCtx, content, at }
export const NOTE_DRAFT_KEY = "qm:note-draft:v1";

// 글이 빈 초안은 버린다 — 옛 문제집·빈칸 정보만 남아 다음 메모가 엉뚱한 빈칸에 붙지 않게
export function loadNoteDraft(user) {
  try {
    const d = JSON.parse(localStorage.getItem(NOTE_DRAFT_KEY) || "null");
    if (!d || typeof d.content !== "string" || !d.info || d.user !== user) return null;
    if (!d.content.trim()) {
      clearNoteDraft();
      return null;
    }
    return d;
  } catch {
    return null;
  }
}

export function saveNoteDraft(draft) {
  try {
    localStorage.setItem(NOTE_DRAFT_KEY, JSON.stringify({ ...draft, at: Date.now() }));
  } catch {
    // 저장소를 못 쓰면 창 안의 글만 남는다
  }
}

export function clearNoteDraft() {
  try {
    localStorage.removeItem(NOTE_DRAFT_KEY);
  } catch {
    // 무시
  }
}

// ── 메모 창의 '이전 메모'(이 문제집 메모를 꺼내 고치기) ──

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

// 지금 화면(info: questionId·blankNo)과 얼마나 가까운 메모인가: 0 같은 문항의 같은 빈칸 · 1 같은 문항 · 2 이 문제집의 다른 문항
export function sheetNoteRank(n, info) {
  if (!sameId(n.questionId, info?.questionId)) return 2;
  return info.blankNo != null && n.blankNo != null && Number(n.blankNo) === Number(info.blankNo) ? 0 : 1;
}

// 시각 값 → Date(시간대가 붙은 값은 그대로, 붙지 않은 값·배열은 이 기기 시각으로). 못 읽으면 null
function noteDate(v) {
  if (!v) return null;
  if (Array.isArray(v)) {
    const [y, mo, d, h = 0, mi = 0, s = 0] = v;
    return y && mo && d ? new Date(y, mo - 1, d, h, mi, s) : null;
  }
  const str = String(v);
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(str)) {
    const d = new Date(str);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(str);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)) : null;
}

// 가까운 묶음(같은 빈칸 → 같은 문항 → 나머지) 먼저, 묶음 안에서는 새것 먼저(같은 시각이면 id 큰 것). 받은 배열은 그대로 둔다
export function orderSheetNotes(notes, info) {
  const time = (n) => noteDate(n.createdAt)?.getTime() ?? 0;
  return (Array.isArray(notes) ? notes : [])
    .map((n) => ({ n, r: sheetNoteRank(n, info), t: time(n) }))
    .sort((a, b) => a.r - b.r || b.t - a.t || Number(b.n.id) - Number(a.n.id))
    .map((x) => x.n);
}

// 목록 줄·고치기 머리에 붙는 자리 이름: '빈칸 8' · '이 문항' · '다른 문항 · 빈칸 3' · '다른 문항'
// (다른 문항의 번호는 창이 모른다 — 문항 id 만 있음. 페이지 문제집은 문항이 하나라 늘 '빈칸 N')
export function sheetNoteLabel(n, info) {
  const blank = n.blankNo != null ? `빈칸 ${n.blankNo}` : null;
  if (sheetNoteRank(n, info) === 2) return blank ? `다른 문항 · ${blank}` : "다른 문항";
  return blank || "이 문항";
}

// 목록 줄의 짧은 시각: 방금 · N분 전 · N시간 전 · 어제 · N일 전(일주일 안) · 10/20(올해) · 2025/10/20
export function relativeNoteTime(v, now = Date.now()) {
  const d = noteDate(v);
  if (!d) return "";
  const diff = now - d.getTime();
  if (diff < 60_000) return "방금"; // 기기 시계가 조금 늦어 미래로 보여도 '방금'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  const today = new Date(now);
  const day0 = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day0(today) - day0(d)) / 86_400_000); // 자정끼리의 차이(서머타임이 있는 곳에서도 반올림으로 맞게)
  if (days <= 1) return "어제";
  if (days < 7) return `${days}일 전`;
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  return d.getFullYear() === today.getFullYear() ? md : `${d.getFullYear()}/${md}`;
}

// 고치던 메모 초안: 메모마다 한 칸('qm:note-edit-draft:v1:<메모 id>') — 새 메모 초안(NOTE_DRAFT_KEY)과 따로.
// 값: { user, note(고치기 시작할 때 받은 메모 그대로 — 원문 content 포함), content(고친 글), failed, at }
// 한 칸만 두면 다른 문제집에서 다른 메모를 고치기 시작할 때 앞의 고친 글을 덮으므로 메모마다 둔다
export const NOTE_EDIT_DRAFT_PREFIX = "qm:note-edit-draft:v1:";
export const noteEditDraftKey = (noteId) => `${NOTE_EDIT_DRAFT_PREFIX}${noteId}`;

// 쓸모없는 초안(글이 비었거나 원문과 같음 — 잃을 글이 없음)은 읽을 때 지운다
function readEditDraft(key, user) {
  let d;
  try {
    d = JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
  if (!d || typeof d.content !== "string" || !d.note || d.note.id == null || d.user !== user) return null;
  if (key !== noteEditDraftKey(d.note.id)) return null;
  if (!d.content.trim() || d.content.trim() === String(d.note.content ?? "").trim()) {
    try { localStorage.removeItem(key); } catch { /* 무시 */ }
    return null;
  }
  return d;
}

export function loadNoteEditDraft(user, noteId) {
  if (noteId == null) return null;
  return readEditDraft(noteEditDraftKey(noteId), user);
}

// 이 문제집(setId) 메모의 고치기 초안 중 가장 최근 것 — 창을 다시 열면 그 메모 고치기로 돌아간다
export function latestNoteEditDraft(user, setId) {
  if (setId == null) return null;
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(NOTE_EDIT_DRAFT_PREFIX)) keys.push(k);
    }
  } catch {
    return null;
  }
  let best = null;
  for (const k of keys) {
    const d = readEditDraft(k, user);
    if (d && sameId(d.note.setId, setId) && (!best || (d.at || 0) > (best.at || 0))) best = d;
  }
  return best;
}

export function saveNoteEditDraft({ user, note, content, failed = false }) {
  try {
    localStorage.setItem(noteEditDraftKey(note.id), JSON.stringify({ user, note, content, failed, at: Date.now() }));
  } catch {
    // 저장소를 못 쓰면 창 안의 글만 남는다
  }
}

export function clearNoteEditDraft(noteId) {
  if (noteId == null) return;
  try {
    localStorage.removeItem(noteEditDraftKey(noteId));
  } catch {
    // 무시
  }
}
