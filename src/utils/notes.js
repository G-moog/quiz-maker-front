// 질문 메모 도우미: 풀기 화면의 맥락 글, 목록 묶기·복사 글, 시각 표시, 저장하지 못한 초안 보관
import { plainPreview } from "./textBlocks";

export const NOTE_CONTENT_MAX = 2000;
export const NOTE_CONTEXT_MAX = 1000; // 서버 한도
const CONTEXT_CHARS = 300; // 화면에서 만드는 맥락 길이(이 안팎)
const TABLE_LINE = /^\s*\|.*\|\s*$/;

// 빈칸 문항 본문에서 blankIndex(0부터) 번째 빈칸이 있는 줄을 맥락 글로 만든다.
// 빈칸 순서는 TableAwareText 와 같다(줄 순서 → 표는 칸 순서 → 칸 안 왼쪽부터).
// 표 줄은 칸을 ' · ' 로 잇고, 그 빈칸은 '[N: 정답]', 다른 빈칸은 '___'. 길면 그 빈칸 둘레로 300자 안팎만.
export function blankContext(text, blankIndex, answers = []) {
  const lines = (text || "").split("\n");
  const mark = `[${blankIndex + 1}: ${answers[blankIndex] ?? "?"}]`;
  let seen = 0;
  for (const line of lines) {
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
    const body = TABLE_LINE.test(line)
      ? line.trim().replace(/^\||\|$/g, "").split("|").map((c) => fill(c.trim())).join(" · ")
      : fill(line);
    return clipAround(body.replace(/\s+/g, " ").trim(), mark, CONTEXT_CHARS);
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

// 빈칸 문항이 아닌 문항(객관식·주관식·O/X)의 맥락: 문제 본문 앞부분
export function questionContext(text) {
  return plainPreview(text, CONTEXT_CHARS);
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

export function loadNoteDraft(user) {
  try {
    const d = JSON.parse(localStorage.getItem(NOTE_DRAFT_KEY) || "null");
    if (!d || typeof d.content !== "string" || !d.info || d.user !== user) return null;
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
