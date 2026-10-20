import { useEffect, useRef, useState } from "react";
import { createNote } from "../api/notes";
import { SESSION_EXPIRED_MESSAGE } from "../utils/session";
import {
  NOTE_CONTENT_MAX, NOTE_CONTEXT_MAX, clearNoteDraft, loadNoteDraft, saveNoteDraft,
} from "../utils/notes";
import NoteContextText from "./NoteContextText";

// 질문 메모 창 (풀기 화면 오른쪽 아래 '질문 메모' 단추로 연다)
//  info: { setId, setTitle, questionId, qNo, blankNo, context } — 지금 보는 문제집·문항·빈칸
//  저장에 실패하면 창을 닫지 않고, 쓴 글을 이 기기(localStorage 'qm:note-draft:v1')에 남긴다.
//  다음에 창을 열면 그 초안을 먼저 불러온다(그때의 문제집·빈칸 정보째).
//  휴대폰 자판이 올라와도 입력칸이 가리지 않게 창은 화면 위쪽에 붙인다.
const S = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.7)",
    display: "flex", alignItems: "flex-start", justifyContent: "center",
    padding: "max(12px, 5vh) 12px 12px",
  },
  sheet: {
    width: "100%", maxWidth: 520, maxHeight: "100%", overflowY: "auto",
    background: "#1a1a1a", border: "1px solid #2e2e2e", borderRadius: 10,
    padding: "10px 14px 14px", boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
  },
  head: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: 700, color: "#f1f1f1" },
  close: {
    width: 36, height: 36, marginRight: -8, display: "flex", alignItems: "center", justifyContent: "center",
    background: "none", border: "none", borderRadius: 6, color: "#777", fontSize: 18, cursor: "pointer",
  },
  draftRow: {
    display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "6px 10px",
    borderRadius: 6, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.35)",
    color: "#e8c27a", fontSize: 12, lineHeight: 1.4,
  },
  ctxBox: {
    background: "#141414", border: "1px solid #2a2a2a", borderRadius: 6,
    padding: "6px 10px 8px", marginBottom: 10, fontSize: 12, color: "#8a8a8a", lineHeight: 1.5,
  },
  ctxHead: { display: "flex", alignItems: "flex-start", gap: 8 },
  ctxMeta: { flex: 1, minWidth: 0, paddingTop: 3, overflowWrap: "anywhere", color: "#9a9a9a" },
  // 긴 맥락은 네 줄로 자르고 누르면 펼친다 — 휴대폰 자판이 올라와도 입력칸·저장 단추가 보이게
  ctxText: (open) => ({
    marginTop: 4, color: "#8a8a8a", overflowWrap: "anywhere", cursor: "pointer",
    ...(open ? {} : { display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }),
  }),
  ctxOff: { marginTop: 2, color: "#6a6a6a" },
  linkBtn: {
    flexShrink: 0, height: 26, padding: "0 8px", borderRadius: 6, whiteSpace: "nowrap",
    background: "#242424", border: "1px solid #333", color: "#b0b0b0", fontSize: 12, fontWeight: 600, cursor: "pointer",
  },
  textarea: {
    display: "block", width: "100%", minHeight: 104, padding: "10px 12px",
    background: "#242424", border: "1px solid #2e2e2e", borderRadius: 6, outline: "none",
    color: "#f1f1f1", fontSize: 15, lineHeight: 1.55, fontFamily: "inherit",
  },
  counter: (over) => ({ textAlign: "right", fontSize: 11, color: over ? "#f87171" : "#6a6a6a", marginTop: 3 }),
  error: { color: "#f87171", fontSize: 13, lineHeight: 1.45, marginTop: 8 },
  btns: { display: "flex", gap: 8, marginTop: 10 },
  cancel: {
    flex: 1, height: 42, borderRadius: 6, background: "#242424", border: "1px solid #2e2e2e",
    color: "#a0a0a0", fontWeight: 700, fontSize: 14, cursor: "pointer",
  },
  save: (off) => ({
    flex: 2, height: 42, borderRadius: 6, background: "#f59e0b", border: "none",
    color: "#000", fontWeight: 700, fontSize: 14, cursor: off ? "default" : "pointer", opacity: off ? 0.45 : 1,
  }),
};

function metaText(info) {
  return [
    info.setTitle || "(문제집 없음)",
    info.qNo ? `Q${info.qNo}` : null,
    info.blankNo ? `빈칸 ${info.blankNo}` : null,
  ].filter(Boolean).join(" · ");
}

export default function QuestionNoteSheet({ info: freshInfo, onClose, onSaved }) {
  const user = localStorage.getItem("username") || "";
  const [draft] = useState(() => loadNoteDraft(user));
  const [info, setInfo] = useState(draft ? draft.info : freshInfo);
  const [withCtx, setWithCtx] = useState(draft ? draft.withCtx !== false : true);
  const [content, setContent] = useState(draft ? draft.content : "");
  const [fromDraft, setFromDraft] = useState(!!draft);
  // 초안을 이 기기에 남겨 두는 중(저장에 실패했거나 불러온 초안) — 글을 고치면 초안도 따라 고친다
  const [keepDraft, setKeepDraft] = useState(!!draft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ctxOpen, setCtxOpen] = useState(false);
  const savingRef = useRef(false);
  const textRef = useRef(null);

  useEffect(() => {
    if (keepDraft) saveNoteDraft({ user, info, withCtx, content });
  }, [keepDraft, user, info, withCtx, content]);

  const hasBlank = !!info.blankNo;
  const hasCtx = hasBlank || !!info.context;
  const trimmed = content.trim();
  const over = trimmed.length > NOTE_CONTENT_MAX;
  const cantSave = saving || !trimmed || over;

  async function save() {
    if (cantSave || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    const body = { content: trimmed };
    if (info.setId != null) body.setId = info.setId;
    if (info.questionId != null) body.questionId = info.questionId;
    if (withCtx && info.blankNo) body.blankNo = info.blankNo;
    if (withCtx && info.context) body.context = info.context.slice(0, NOTE_CONTEXT_MAX);
    try {
      const note = await createNote(body);
      clearNoteDraft();
      savingRef.current = false;
      onSaved(note, info);
    } catch (e) {
      // 쓴 글은 잃지 않게: 이 기기에 남기고 창은 그대로(로그인이 만료되면 다시 로그인한 뒤 불러온다)
      saveNoteDraft({ user, info, withCtx, content });
      setKeepDraft(true);
      setError(
        `${e.message || "저장하지 못했습니다."}` +
        (e.message === SESSION_EXPIRED_MESSAGE ? "" : " 쓴 글은 이 기기에 남겨 두었습니다.")
      );
      savingRef.current = false;
      setSaving(false);
    }
  }

  function requestClose() {
    if (savingRef.current) return;
    // 이 기기에 남겨 둔 초안이 아니면, 쓴 글을 버리기 전에 묻는다
    if (!keepDraft && trimmed && !confirm("쓴 메모를 저장하지 않고 닫을까요?")) return;
    onClose();
  }

  function discardDraft() {
    clearNoteDraft();
    setKeepDraft(false);
    setFromDraft(false);
    setInfo(freshInfo);
    setWithCtx(true);
    setContent("");
    setError("");
    textRef.current?.focus();
  }

  function onKeyDown(e) {
    if (e.key === "Escape") { e.preventDefault(); requestClose(); }
    else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
  }

  // 창 바깥을 누르면: 아무것도 안 썼을 때만 닫는다(자판을 내리려고 바깥을 눌러도 쓴 글이 날아가지 않게)
  function onOverlayClick() {
    if (!savingRef.current && !trimmed) onClose();
  }

  return (
    <div style={S.overlay} onClick={onOverlayClick}>
      <div
        style={S.sheet}
        role="dialog"
        aria-modal="true"
        aria-label="질문 메모"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div style={S.head}>
          <div style={S.title}>질문 메모</div>
          <button style={S.close} onClick={requestClose} aria-label="닫기" disabled={saving}>✕</button>
        </div>

        {fromDraft && (
          <div style={S.draftRow}>
            <span style={{ flex: 1 }}>저장하지 못한 메모를 불러왔습니다.</span>
            <button style={S.linkBtn} onClick={discardDraft} disabled={saving}>버리고 새로 쓰기</button>
          </div>
        )}

        <div style={S.ctxBox}>
          <div style={S.ctxHead}>
            <div style={S.ctxMeta}>{withCtx ? metaText(info) : metaText({ ...info, blankNo: null })}</div>
            {hasCtx && (
              <button style={S.linkBtn} onClick={() => setWithCtx((v) => !v)} disabled={saving}>
                {withCtx ? (hasBlank ? "빈칸 정보 빼기" : "문제 글 빼기") : "다시 넣기"}
              </button>
            )}
          </div>
          {hasCtx && withCtx && info.context && (
            <div
              style={S.ctxText(ctxOpen)}
              onClick={() => setCtxOpen((v) => !v)}
              role="button"
              aria-expanded={ctxOpen}
              title={ctxOpen ? "접기" : "눌러서 펼치기"}
            >
              <NoteContextText text={info.context} blankNo={info.blankNo} />
            </div>
          )}
          {hasCtx && !withCtx && (
            <div style={S.ctxOff}>{hasBlank ? "빈칸 번호·앞뒤 글 없이" : "문제 글 없이"} 저장합니다.</div>
          )}
        </div>

        <textarea
          ref={textRef}
          style={S.textarea}
          rows={4}
          value={content}
          onChange={(e) => { setContent(e.target.value); if (error) setError(""); }}
          onFocus={(e) => { e.target.style.borderColor = "#f59e0b"; }}
          onBlur={(e) => { e.target.style.borderColor = "#2e2e2e"; }}
          placeholder="읽다가 든 질문을 적어 두세요. 나중에 '질문 메모' 목록에서 모아 봅니다."
          autoFocus
          // disabled 대신 readOnly: 저장 중에도 초점·휴대폰 자판이 내려가지 않게
          readOnly={saving}
        />
        {trimmed.length > NOTE_CONTENT_MAX - 300 && (
          <div style={S.counter(over)}>{trimmed.length} / {NOTE_CONTENT_MAX}</div>
        )}
        {error && <div style={S.error} role="alert">{error}</div>}

        <div style={S.btns}>
          <button style={S.cancel} onClick={requestClose} disabled={saving}>취소</button>
          <button style={S.save(cantSave)} onClick={save} disabled={cantSave}>
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
