import { relativeNoteTime, sheetNoteLabel, sheetNoteRank } from "../utils/notes";

// 질문 메모 창의 '이전 메모' 목록(이 문제집의 메모, 순서는 utils/notes orderSheetNotes 가 정함).
// 줄 하나 = 단추 하나: 누르면 그 메모 고치기(onPick). 자리(빈칸 8 · 이 문항 · 다른 문항)·글 앞 두 줄·짧은 시각·해결 표시.
// 지금 화면의 같은 빈칸 메모는 자리 이름을 노란색으로, 해결한 메모는 흐리게. 고치는 중인 줄은 테두리로 표시(aria-current).
// 고치다 이 기기에 남겨 둔 글이 있는 메모(draftIds)는 '고치던 글' — 누르면 그 글부터 불러온다.
// 목록은 창 안에서 따로 스크롤(높이 172 — 줄 셋 반쯤): 메모가 많아도 입력칸을 멀리 밀어내지 않게.
const S = {
  list: {
    listStyle: "none", margin: "0 0 8px", padding: 0, display: "flex", flexDirection: "column", gap: 4,
    maxHeight: 172, overflowY: "auto", overscrollBehavior: "contain",
  },
  row: (current, resolved) => ({
    display: "flex", alignItems: "flex-start", gap: 8, width: "100%", minHeight: 40, padding: "5px 8px",
    textAlign: "left", fontFamily: "inherit", cursor: "pointer",
    background: current ? "rgba(245,158,11,0.10)" : "#141414",
    border: `1px solid ${current ? "rgba(245,158,11,0.6)" : "#2a2a2a"}`, borderRadius: 6,
    opacity: resolved && !current ? 0.55 : 1,
  }),
  // 글은 두 줄까지(줄바꿈은 한 칸으로 — 줄 높이를 아끼려고)
  main: {
    flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.4, color: "#d6d6d6",
    wordBreak: "keep-all", overflowWrap: "anywhere",
    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
  },
  tag: (hot) => ({ marginRight: 6, fontSize: 11.5, fontWeight: 700, color: hot ? "#f59e0b" : "#8a8a8a" }),
  side: {
    flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, paddingTop: 1,
    fontSize: 11, lineHeight: 1.45, color: "#6f6f6f", whiteSpace: "nowrap",
  },
  done: { color: "#34d399", fontWeight: 700 },
  drafted: { color: "#f59e0b", fontWeight: 700 },
  loading: { margin: "0 0 8px", padding: "6px 10px", fontSize: 12, color: "#8a8a8a" },
  errBox: {
    display: "flex", alignItems: "center", gap: 8, margin: "0 0 8px", padding: "6px 8px 6px 10px",
    borderRadius: 6, border: "1px solid rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.08)",
  },
  errText: { flex: 1, minWidth: 0, color: "#f87171", fontSize: 12, lineHeight: 1.45, overflowWrap: "anywhere" },
  retry: {
    flexShrink: 0, height: 32, padding: "0 10px", borderRadius: 6, whiteSpace: "nowrap",
    background: "#242424", border: "1px solid #333", color: "#b0b0b0", fontSize: 12, fontWeight: 600, cursor: "pointer",
  },
};

const oneLine = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

export default function PrevNoteList({ id, notes, state, error, info, editingId, draftIds, disabled, onPick, onRetry }) {
  if (state === "loading") return <div id={id} style={S.loading} role="status">불러오는 중…</div>;
  if (state === "error") {
    return (
      <div id={id} style={S.errBox}>
        <span style={S.errText} role="alert">{error || "이전 메모를 불러오지 못했습니다."}</span>
        <button type="button" style={S.retry} onClick={onRetry}>다시 시도</button>
      </div>
    );
  }
  return (
    <ul id={id} style={S.list} aria-label="이 문제집의 이전 메모">
      {notes.map((n) => {
        const current = editingId != null && String(editingId) === String(n.id);
        const rank = sheetNoteRank(n, info);
        const label = sheetNoteLabel(n, info);
        const when = relativeNoteTime(n.createdAt);
        const text = oneLine(n.content);
        const drafted = !current && !!draftIds && draftIds.has(String(n.id));
        const borderColor = current ? "rgba(245,158,11,0.6)" : "#2a2a2a";
        return (
          <li key={n.id}>
            <button
              type="button"
              style={S.row(current, !!n.resolved)}
              onClick={() => onPick(n)}
              disabled={disabled}
              data-note-row={n.id}
              data-rank={rank}
              data-resolved={n.resolved ? "1" : undefined}
              data-drafted={drafted ? "1" : undefined}
              aria-current={current ? "true" : undefined}
              aria-label={`${label}${when ? `, ${when}` : ""}${n.resolved ? ", 해결" : ""}${drafted ? ", 고치던 글 있음" : ""}: ${text.slice(0, 80)}${text.length > 80 ? "…" : ""} — 눌러서 고치기`}
              onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.borderColor = "#f59e0b"; }}
              onPointerLeave={(e) => { e.currentTarget.style.borderColor = borderColor; }}
            >
              <span style={S.main}>
                <span style={S.tag(rank === 0)}>{label}</span>
                {text}
              </span>
              <span style={S.side} aria-hidden="true">
                <span>{when}</span>
                {n.resolved && <span style={S.done}>✓ 해결</span>}
                {drafted && <span style={S.drafted}>고치던 글</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
