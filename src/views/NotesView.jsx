import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { listNotes, updateNote, deleteNote } from "../api/notes";
import { getSets } from "../api/quiz";
import { SESSION_EXPIRED_MESSAGE } from "../utils/session";
import {
  NOTE_CONTENT_MAX, buildCopyText, copyToClipboard, formatNoteTime, groupLabel, groupNotes,
} from "../utils/notes";
import NoteContextText from "../components/NoteContextText";
import { PencilIcon, TrashIcon } from "../components/NoteIcons";

// 질문 메모 목록: 문제를 풀다가 적어 둔 질문을 문제집별로 모아 보고, 해결 표시·고치기·지우기,
// 미해결 메모를 한꺼번에 복사(Claude 에게 붙여 넣어 답을 조사하게)한다.
// 목록은 한 번에 다 받아(status=all) 화면에서 거른다 — 칩마다 수를 보여 주고, 해결 표시를 바로 반영하려고.

const FILTERS = [
  { key: "open", label: "미해결" },
  { key: "resolved", label: "해결" },
  { key: "all", label: "전체" },
];

const S = {
  page: { minHeight: "100vh", background: "#0f0f0f", fontFamily: "system-ui, sans-serif" },
  // 머리줄 배치·여백은 풀기 화면과 같은 클래스(.qm-solve-nav 등)
  nav: {
    background: "#1a1a1a", borderBottom: "1px solid #2e2e2e",
    display: "flex", alignItems: "center", gap: 8,
    minHeight: 52, position: "sticky", top: 0, zIndex: 10,
  },
  navLeft: { display: "flex", alignItems: "center", flexShrink: 0 },
  backBtn: {
    background: "none", border: "none", color: "#a0a0a0",
    fontSize: 14, fontWeight: 600, cursor: "pointer",
    display: "flex", alignItems: "center", gap: 6,
    minHeight: 44, whiteSpace: "nowrap", transition: "color 0.15s ease",
  },
  navTitle: { flex: "1 1 0", minWidth: 0, textAlign: "center", fontWeight: 700, color: "#f1f1f1", whiteSpace: "nowrap" },
  navRight: { width: 80, flexShrink: 0 },

  toolbar: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 },
  chip: (on) => ({
    height: 30, padding: "0 9px", borderRadius: 6, whiteSpace: "nowrap",
    display: "inline-flex", alignItems: "center", gap: 4,
    border: `1px solid ${on ? "#f59e0b" : "#2e2e2e"}`,
    background: on ? "rgba(245,158,11,0.14)" : "#1a1a1a",
    color: on ? "#f59e0b" : "#a0a0a0", fontSize: 13, fontWeight: 700, cursor: "pointer",
  }),
  chipCount: (on) => ({ fontWeight: 600, color: on ? "#f5b544" : "#6f6f6f" }),
  copyBtn: (off) => ({
    marginLeft: "auto", height: 30, padding: "0 9px", borderRadius: 6, whiteSpace: "nowrap",
    background: "#1a1a1a", border: `1px solid ${off ? "#2e2e2e" : "rgba(245,158,11,0.6)"}`,
    color: off ? "#555" : "#f59e0b", fontSize: 13, fontWeight: 700, cursor: off ? "default" : "pointer",
  }),

  groupHead: {
    display: "flex", alignItems: "baseline", gap: 6, margin: "14px 2px 6px",
    fontSize: 13, fontWeight: 700, color: "#d0d0d0", lineHeight: 1.4,
  },
  groupMark: { color: "#f59e0b", fontSize: 9, flexShrink: 0, position: "relative", top: -1 },
  groupTitle: (deleted) => ({ flex: 1, minWidth: 0, overflowWrap: "anywhere", color: deleted ? "#7a7a7a" : "#d0d0d0" }),
  groupCount: { fontSize: 12, fontWeight: 600, color: "#666", flexShrink: 0 },
  list: { display: "flex", flexDirection: "column", gap: 6 },

  card: {
    display: "flex", alignItems: "flex-start",
    padding: "1px 4px 2px 0", background: "#1a1a1a", border: "1px solid #2e2e2e", borderRadius: 8,
  },
  // 해결 체크: 보이는 상자는 20px, 누르는 자리는 40×38
  checkBtn: {
    width: 40, height: 38, flexShrink: 0, padding: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "none", border: "none", cursor: "pointer",
  },
  checkBox: (on, busy) => ({
    width: 20, height: 20, borderRadius: 5, boxSizing: "border-box",
    border: `2px solid ${on ? "#34d399" : "#5a5a5a"}`, background: on ? "#34d399" : "transparent",
    color: "#0f0f0f", fontSize: 13, fontWeight: 900, lineHeight: 1,
    display: "flex", alignItems: "center", justifyContent: "center", opacity: busy ? 0.5 : 1,
  }),
  main: { flex: 1, minWidth: 0, paddingTop: 8 },
  content: (resolved) => ({
    fontSize: 14, lineHeight: 1.5, color: resolved ? "#8a8a8a" : "#f1f1f1",
    whiteSpace: "pre-wrap", overflowWrap: "anywhere",
  }),
  // 맥락: 회색 작은 글, 두 줄로 자르고 누르면 펼침
  ctx: (open) => ({
    marginTop: 4, padding: "0 0 0 8px", borderLeft: "2px solid #333",
    fontSize: 12, lineHeight: 1.5, color: "#8a8a8a", cursor: "pointer", overflowWrap: "anywhere",
    ...(open ? { whiteSpace: "pre-wrap" } : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }),
  }),
  metaRow: { display: "flex", alignItems: "center", gap: 4, minHeight: 32 },
  meta: { flex: 1, minWidth: 0, fontSize: 11.5, color: "#6f6f6f", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  // 고치기·지우기: SVG 아이콘, 누르는 자리 36×32, 둘 사이 6px(잘못 누르지 않게)
  actions: { display: "flex", gap: 6, flexShrink: 0 },
  iconBtn: {
    width: 36, height: 32, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
    background: "none", border: "none", borderRadius: 6, color: "#7a7a7a", cursor: "pointer",
  },
  // 고치기 입력칸: 글 길이만큼 자동으로 늘어난다(EditBox) — 화면 60% 를 넘으면 그때부터 칸 안에서 스크롤
  editArea: {
    display: "block", width: "100%", minHeight: 84, maxHeight: "60vh", padding: "8px 10px", marginTop: -2,
    background: "#242424", border: "1px solid #f59e0b", borderRadius: 6, outline: "none", resize: "none",
    color: "#f1f1f1", fontSize: 14, lineHeight: 1.5, fontFamily: "inherit",
  },
  editError: { color: "#f87171", fontSize: 12.5, marginTop: 4, lineHeight: 1.4 },
  editBtns: { display: "flex", justifyContent: "flex-end", gap: 6, margin: "6px 0 4px" },
  smallBtn: {
    height: 30, padding: "0 12px", borderRadius: 6, background: "#242424", border: "1px solid #2e2e2e",
    color: "#a0a0a0", fontSize: 13, fontWeight: 700, cursor: "pointer",
  },
  smallPrimary: (off) => ({
    height: 30, padding: "0 14px", borderRadius: 6, background: "#f59e0b", border: "none",
    color: "#000", fontSize: 13, fontWeight: 700, cursor: off ? "default" : "pointer", opacity: off ? 0.45 : 1,
  }),

  center: { textAlign: "center", padding: "56px 16px", color: "#777", fontSize: 14, lineHeight: 1.7 },
  loadError: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
    padding: "12px 14px", margin: "8px 0", borderRadius: 8,
    border: "1px solid rgba(248,113,113,0.4)", background: "rgba(248,113,113,0.1)",
    color: "#f87171", fontSize: 14, lineHeight: 1.5,
  },
  retryBtn: {
    padding: "0 14px", height: 34, borderRadius: 6, border: "1px solid #f87171",
    background: "none", color: "#f87171", fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0,
  },
  toast: (type) => ({
    position: "fixed", left: 0, right: 0, margin: "0 auto", width: "fit-content", zIndex: 300,
    bottom: "calc(20px + env(safe-area-inset-bottom, 0px))", maxWidth: "calc(100% - 32px)",
    padding: "10px 18px", borderRadius: 8, fontSize: 14, fontWeight: 600, textAlign: "center",
    border: `1px solid ${type === "error" ? "#f87171" : "#34d399"}`,
    background: type === "error" ? "#2a1515" : "#11261d",
    color: type === "error" ? "#f87171" : "#34d399",
    boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
  }),
  // 복사가 막힌 브라우저: 글을 보여 주고 직접 복사하게
  overlay: {
    position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.7)",
    display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "max(12px, 5vh) 12px 12px",
  },
  sheet: {
    width: "100%", maxWidth: 560, background: "#1a1a1a", border: "1px solid #2e2e2e",
    borderRadius: 10, padding: 14, boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
  },
  sheetTitle: { fontSize: 15, fontWeight: 700, color: "#f1f1f1", marginBottom: 6 },
  sheetHint: { fontSize: 12, color: "#8a8a8a", marginBottom: 8 },
  copyArea: {
    display: "block", width: "100%", height: "50vh", padding: "8px 10px",
    background: "#242424", border: "1px solid #2e2e2e", borderRadius: 6, outline: "none",
    color: "#f1f1f1", fontSize: 13, lineHeight: 1.5, fontFamily: "inherit",
  },
};

// 고치기 입력칸: 글 줄 수만큼 높이를 맞춘다(여러 줄 메모도 칸 안에서 따로 스크롤하지 않게)
function EditBox({ value, ...rest }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`; // + 위아래 테두리
  }, [value]);
  return <textarea ref={ref} style={S.editArea} rows={3} value={value} {...rest} />;
}

export default function NotesView({ onBack }) {
  const [notes, setNotes] = useState([]);
  const [liveSets, setLiveSets] = useState(null); // 지금 내 문제집 Map(id → 문제집). 못 불러오면 null
  const [loadState, setLoadState] = useState("loading"); // loading · ok · error
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("open");
  // 이 거르기에서 방금 해결·미해결로 바꾼 메모는 칩을 바꿀 때까지 그 자리에 남긴다(잘못 눌렀으면 바로 되돌리게)
  const [stay, setStay] = useState(() => new Set());
  const [expanded, setExpanded] = useState(() => new Set());
  const [busy, setBusy] = useState(() => new Set());
  const busyRef = useRef(new Set());
  const [editing, setEditing] = useState(null); // { id, text, saving, error }
  const [copyFallback, setCopyFallback] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => { load(); }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  async function load() {
    try {
      const [list, sets] = await Promise.all([
        listNotes({ status: "all" }),
        getSets().catch(() => null),
      ]);
      setNotes(Array.isArray(list) ? list : []);
      setLiveSets(Array.isArray(sets) ? new Map(sets.map((s) => [String(s.id), s])) : null);
      setLoadState("ok");
      setLoadError("");
    } catch (e) {
      if (e.message === SESSION_EXPIRED_MESSAGE) return; // App 이 로그인 화면으로 보낸다
      setLoadState("error");
      setLoadError(e.message || "");
    }
  }

  function retry() {
    setLoadState("loading");
    load();
  }

  function showToast(message, type = "success") {
    clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  function setBusyFor(id, on) {
    if (on) busyRef.current.add(id); else busyRef.current.delete(id);
    setBusy(new Set(busyRef.current));
  }

  function replaceNote(next) {
    setNotes((prev) => prev.map((n) => (n.id === next.id ? next : n)));
  }

  function changeFilter(key) {
    setFilter(key);
    setStay(new Set());
  }

  async function toggleResolved(n) {
    if (busyRef.current.has(n.id)) return;
    setBusyFor(n.id, true);
    const want = !n.resolved;
    try {
      const updated = await updateNote(n.id, { resolved: want });
      replaceNote(updated && updated.id != null
        ? updated
        : { ...n, resolved: want, resolvedAt: want ? new Date().toISOString() : null });
      setStay((prev) => new Set(prev).add(n.id));
    } catch (e) {
      if (e.message !== SESSION_EXPIRED_MESSAGE) showToast(e.message || "바꾸지 못했습니다.", "error");
    } finally {
      setBusyFor(n.id, false);
    }
  }

  // 고치던 글이 원문과 다른지(저장하지 않고 버리면 잃는 글이 있는지)
  function editChanged() {
    if (!editing) return false;
    const before = notes.find((x) => x.id === editing.id);
    return !!before && editing.text.trim() !== (before.content || "").trim();
  }

  function startEdit(n) {
    if (editing && editing.id !== n.id && editChanged() && !confirm("고치던 메모를 저장하지 않고 넘어갈까요?")) return;
    setEditing({ id: n.id, text: n.content || "", saving: false, error: "" });
  }

  // Esc 는 실수로 누르기 쉬워 고친 글이 있으면 묻는다('취소' 단추는 묻지 않음)
  function escEdit() {
    if (editing?.saving) return;
    if (editChanged() && !confirm("고친 내용을 버릴까요?")) return;
    setEditing(null);
  }

  function goBack() {
    if (editChanged() && !confirm("고치던 메모를 저장하지 않고 나갈까요?")) return;
    onBack();
  }

  async function saveEdit() {
    if (!editing || editing.saving) return;
    const text = editing.text.trim();
    if (!text) { setEditing({ ...editing, error: "메모 내용을 입력해 주세요." }); return; }
    if (text.length > NOTE_CONTENT_MAX) { setEditing({ ...editing, error: `메모는 ${NOTE_CONTENT_MAX}자까지 쓸 수 있습니다.` }); return; }
    const id = editing.id;
    setEditing({ ...editing, saving: true, error: "" });
    try {
      const updated = await updateNote(id, { content: text });
      const old = notes.find((x) => x.id === id);
      replaceNote(updated && updated.id != null ? updated : { ...old, content: text });
      setEditing(null);
      showToast("고쳤습니다");
    } catch (e) {
      if (e.message === SESSION_EXPIRED_MESSAGE) return;
      setEditing((cur) => (cur && cur.id === id ? { ...cur, saving: false, error: e.message || "고치지 못했습니다." } : cur));
    }
  }

  async function remove(n) {
    if (busyRef.current.has(n.id)) return;
    if (!confirm("이 메모를 지울까요?")) return;
    setBusyFor(n.id, true);
    try {
      await deleteNote(n.id);
      setNotes((prev) => prev.filter((x) => x.id !== n.id));
      if (editing?.id === n.id) setEditing(null);
      showToast("지웠습니다");
    } catch (e) {
      if (e.message !== SESSION_EXPIRED_MESSAGE) showToast(e.message || "지우지 못했습니다.", "error");
    } finally {
      setBusyFor(n.id, false);
    }
  }

  function toggleExpand(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const openNotes = notes.filter((n) => !n.resolved);

  // 미해결 메모를 '■ 문제집 제목 / - [빈칸 N] 메모 (맥락)' 글로 복사(안 되면 공유 → 직접 복사 창)
  async function copyOpen() {
    if (openNotes.length === 0) return;
    const text = buildCopyText(groupNotes(openNotes, liveSets));
    if (await copyToClipboard(text)) {
      showToast(`미해결 메모 ${openNotes.length}개를 복사했습니다`);
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: "질문 메모", text });
        return;
      } catch (e) {
        if (e?.name === "AbortError") return;
      }
    }
    setCopyFallback(text);
  }

  const counts = {
    open: openNotes.length,
    resolved: notes.length - openNotes.length,
    all: notes.length,
  };
  const visible = notes.filter((n) =>
    filter === "all" || stay.has(n.id) || (filter === "open" ? !n.resolved : !!n.resolved)
  );
  const groups = groupNotes(visible, liveSets);

  function renderNote(n) {
    const isEditing = editing?.id === n.id;
    const isBusy = busy.has(n.id);
    const open = expanded.has(n.id);
    const meta = [
      n.blankNo ? `빈칸 ${n.blankNo}` : null,
      formatNoteTime(n.createdAt),
      n.resolved && n.resolvedAt ? `해결 ${formatNoteTime(n.resolvedAt)}` : null,
    ].filter(Boolean).join(" · ");
    return (
      <div key={n.id} style={S.card} data-note-id={n.id}>
        <button
          style={S.checkBtn}
          onClick={() => toggleResolved(n)}
          disabled={isBusy}
          role="checkbox"
          aria-checked={!!n.resolved}
          aria-label={n.resolved ? "미해결로 되돌리기" : "해결로 표시"}
          title={n.resolved ? "미해결로 되돌리기" : "해결로 표시"}
        >
          <span style={S.checkBox(!!n.resolved, isBusy)}>{n.resolved ? "✓" : ""}</span>
        </button>
        <div style={S.main}>
          {isEditing ? (
            <>
              <EditBox
                value={editing.text}
                autoFocus
                readOnly={editing.saving}
                onChange={(e) => setEditing({ ...editing, text: e.target.value, error: "" })}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { e.preventDefault(); escEdit(); }
                  else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveEdit(); }
                }}
              />
              {editing.error && <div style={S.editError} role="alert">{editing.error}</div>}
              <div style={S.editBtns}>
                <button style={S.smallBtn} onClick={() => setEditing(null)} disabled={editing.saving}>취소</button>
                <button style={S.smallPrimary(editing.saving || !editing.text.trim())} onClick={saveEdit} disabled={editing.saving || !editing.text.trim()}>
                  {editing.saving ? "저장 중…" : "저장"}
                </button>
              </div>
            </>
          ) : (
            <div style={S.content(!!n.resolved)}>{n.content}</div>
          )}
          {n.context && (
            <div
              style={S.ctx(open)}
              onClick={() => toggleExpand(n.id)}
              role="button"
              aria-expanded={open}
              title={open ? "접기" : "눌러서 펼치기"}
            >
              <NoteContextText text={n.context} blankNo={n.blankNo} />
            </div>
          )}
          <div style={S.metaRow}>
            <span style={S.meta}>{meta}</span>
            {!isEditing && (
              <span style={S.actions}>
                <button
                  style={S.iconBtn}
                  onClick={() => startEdit(n)}
                  disabled={isBusy}
                  onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.color = "#f59e0b"; }}
                  onPointerLeave={(e) => { e.currentTarget.style.color = "#7a7a7a"; }}
                  aria-label="고치기"
                  title="고치기"
                ><PencilIcon size={16} /></button>
                <button
                  style={S.iconBtn}
                  onClick={() => remove(n)}
                  disabled={isBusy}
                  onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.color = "#f87171"; }}
                  onPointerLeave={(e) => { e.currentTarget.style.color = "#7a7a7a"; }}
                  aria-label="지우기"
                  title="지우기"
                ><TrashIcon size={16} /></button>
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  let emptyText = "";
  if (loadState === "ok" && visible.length === 0) {
    if (notes.length === 0) emptyText = "아직 메모가 없습니다.\n문제를 풀다가 오른쪽 아래 연필(질문 메모) 단추로 적어 보세요.";
    else if (filter === "open") emptyText = "미해결 메모가 없습니다.";
    else emptyText = "해결한 메모가 없습니다.";
  }

  return (
    <div style={S.page}>
      <nav style={S.nav} className="qm-solve-nav">
        <div style={S.navLeft}>
          <button
            style={S.backBtn}
            onClick={goBack}
            onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.color = "#f1f1f1"; }}
            onPointerLeave={(e) => { e.currentTarget.style.color = "#a0a0a0"; }}
          >← 목록으로</button>
        </div>
        <span style={S.navTitle} className="qm-solve-title">질문 메모</span>
        <div style={S.navRight} className="qm-solve-spacer" />
      </nav>

      <div className="qm-notes-body">
        {loadState === "ok" && (
          <div style={S.toolbar}>
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                style={S.chip(filter === key)}
                onClick={() => changeFilter(key)}
                aria-pressed={filter === key}
              >
                {label}<span style={S.chipCount(filter === key)}>{counts[key]}</span>
              </button>
            ))}
            <button
              style={S.copyBtn(counts.open === 0)}
              onClick={copyOpen}
              disabled={counts.open === 0}
              title="미해결 메모를 문제집별 글로 복사 — Claude 에게 붙여 넣어 답을 찾게"
            >미해결 모두 복사</button>
          </div>
        )}

        {loadState === "loading" && <div style={S.center}>불러오는 중…</div>}

        {loadState === "error" && (
          <div style={S.loadError} role="alert">
            <span>
              {loadError || "질문 메모를 불러오지 못했습니다."}
            </span>
            <button style={S.retryBtn} onClick={retry}>다시 시도</button>
          </div>
        )}

        {emptyText && <div style={{ ...S.center, whiteSpace: "pre-line" }}>{emptyText}</div>}

        {loadState === "ok" && groups.map((g) => (
          <section key={g.key}>
            <div style={S.groupHead}>
              <span style={S.groupMark}>■</span>
              <span style={S.groupTitle(g.deleted)}>{groupLabel(g)}</span>
              <span style={S.groupCount}>{g.notes.length}</span>
            </div>
            <div style={S.list}>{g.notes.map(renderNote)}</div>
          </section>
        ))}
      </div>

      {copyFallback && (
        <div style={S.overlay} onClick={() => setCopyFallback(null)}>
          <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={S.sheetTitle}>미해결 메모</div>
            <div style={S.sheetHint}>이 브라우저는 바로 복사하지 못했습니다. 글을 길게 눌러 모두 선택한 뒤 복사해 주세요.</div>
            <textarea style={S.copyArea} value={copyFallback} readOnly onFocus={(e) => e.target.select()} autoFocus />
            <div style={{ ...S.editBtns, marginTop: 10 }}>
              <button style={S.smallBtn} onClick={() => setCopyFallback(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={S.toast(toast.type)} role="status">{toast.message}</div>}
    </div>
  );
}
