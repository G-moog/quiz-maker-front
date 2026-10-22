import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createNote } from "../api/notes";
import { SESSION_EXPIRED_MESSAGE } from "../utils/session";
import { useBack } from "../utils/backStack";
import {
  NOTE_CONTENT_MAX, NOTE_CONTEXT_MAX, clearNoteDraft, loadNoteDraft, saveNoteDraft,
} from "../utils/notes";
import NoteContextText from "./NoteContextText";

// 질문 메모 창 (풀기 화면 오른쪽 아래 '질문 메모' 단추로 연다)
//  info: { setId, setTitle, questionId, qNo, blankNo, context } — 지금 보는 문제집·문항·빈칸
//  쓰는 동안 글을 늘 이 기기(localStorage 'qm:note-draft:v1')에 초안으로 남긴다 — 뒤로 가기·앱 닫힘으로 창이 닫혀도
//  잃지 않게. 저장에 성공하거나 '취소'에서 버리기로 답하면 지운다. 저장에 실패하면 창을 닫지 않는다(failed 표시).
//  안드로이드 뒤로 가기는 창만 닫는다(useBack — 앱이 닫히지 않게). 이때는 묻지 않고 초안을 남긴다.
//  다음에 창을 열면 그 초안을 먼저 불러온다(그때의 문제집·빈칸 정보째).
//   · '지금 빈칸/문항으로 옮기기': 글은 두고 문제집·빈칸 정보만 지금 화면 것으로 바꾼다
//   · '버리고 새로 쓰기': 글이 있으면 먼저 묻는다
//   · 글을 다 지우면 초안도 지운다(빈 초안에 옛 빈칸 정보만 남아 다음 메모에 붙지 않게)
//   · 초안의 문제집·문항이 그사이 지워져 서버가 거절하면 '문제집 정보 없이 저장'을 보인다
//  휴대폰 자판이 올라오면 창을 보이는 영역(visualViewport)에 맞춰 창 안에서 스크롤되게 하고,
//  취소·저장 줄은 창 아래에 붙여 둔다(초안 안내·오류·긴 맥락이 한꺼번에 있어도 저장 단추가 자판에 가리지 않게).
const S = {
  overlay: {
    position: "fixed", left: 0, right: 0, top: 0, bottom: 0, zIndex: 200, background: "rgba(0,0,0,0.7)",
    display: "flex", alignItems: "flex-start", justifyContent: "center",
    padding: "max(12px, 5vh) 12px 12px",
  },
  sheet: {
    width: "100%", maxWidth: 520, maxHeight: "100%", overflowY: "auto",
    background: "#1a1a1a", border: "1px solid #2e2e2e", borderRadius: 10,
    padding: "10px 14px 0", boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
  },
  head: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: 700, color: "#f1f1f1" },
  close: {
    width: 36, height: 36, marginRight: -8, display: "flex", alignItems: "center", justifyContent: "center",
    background: "none", border: "none", borderRadius: 6, color: "#777", fontSize: 18, cursor: "pointer",
  },
  draftRow: {
    display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: 6,
    marginBottom: 8, padding: "6px 8px 6px 10px",
    borderRadius: 6, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.35)",
    color: "#e8c27a", fontSize: 12, lineHeight: 1.4,
  },
  draftText: { flex: "1 1 100%", minWidth: 0 }, // 안내 글은 한 줄 전체, 단추들은 그 아래 오른쪽
  ctxBox: {
    background: "#141414", border: "1px solid #2a2a2a", borderRadius: 6,
    padding: "6px 10px 8px", marginBottom: 10, fontSize: 12, color: "#8a8a8a", lineHeight: 1.5,
  },
  ctxHead: { display: "flex", alignItems: "flex-start", gap: 8 },
  ctxMeta: { flex: 1, minWidth: 0, paddingTop: 6, overflowWrap: "anywhere", color: "#9a9a9a" },
  // 긴 맥락은 네 줄(초안 안내·오류가 있으면 두 줄)로 자르고 누르면 펼친다
  ctxText: (open, lines) => ({
    marginTop: 4, color: "#8a8a8a", overflowWrap: "anywhere", cursor: "pointer",
    ...(open ? {} : { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" }),
  }),
  ctxOff: { marginTop: 2, color: "#6a6a6a" },
  // 작은 글자 단추도 손가락으로 누르기 쉽게 높이 32
  linkBtn: {
    flexShrink: 0, height: 32, padding: "0 10px", borderRadius: 6, whiteSpace: "nowrap",
    background: "#242424", border: "1px solid #333", color: "#b0b0b0", fontSize: 12, fontWeight: 600, cursor: "pointer",
  },
  textarea: {
    display: "block", width: "100%", minHeight: 104, padding: "10px 12px",
    background: "#242424", border: "1px solid #2e2e2e", borderRadius: 6, outline: "none",
    color: "#f1f1f1", fontSize: 15, lineHeight: 1.55, fontFamily: "inherit",
  },
  counter: (over) => ({ textAlign: "right", fontSize: 11, color: over ? "#f87171" : "#6a6a6a", marginTop: 3 }),
  // 창 아래에 붙는 부분(오류 글 + 취소·저장): 창이 자판 위 영역으로 줄어 안에서 스크롤돼도 늘 보인다
  foot: { position: "sticky", bottom: 0, paddingBottom: 14, background: "#1a1a1a" },
  error: { color: "#f87171", fontSize: 13, lineHeight: 1.45, paddingTop: 8 },
  orphanRow: { display: "flex", justifyContent: "flex-end", marginTop: 6 },
  btns: { display: "flex", gap: 8, paddingTop: 10 },
  cancel: {
    flex: 1, height: 42, borderRadius: 6, background: "#242424", border: "1px solid #2e2e2e",
    color: "#a0a0a0", fontWeight: 700, fontSize: 14, cursor: "pointer",
  },
  save: (off) => ({
    flex: 2, height: 42, borderRadius: 6, background: "#f59e0b", border: "none",
    color: "#000", fontWeight: 700, fontSize: 14, cursor: off ? "default" : "pointer", opacity: off ? 0.45 : 1,
  }),
};

// 서버가 '초안의 문제집·문항이 없다(지워짐)'며 거절한 경우
const TARGET_GONE = /존재하지 않는 (문제집|문항)|메모를 남길 권한이 없습니다|그 문제집의 문항이 아닙니다/;

function metaText(info) {
  return [
    info.setTitle || "(문제집 없음)",
    info.qNo ? `Q${info.qNo}` : null,
    info.blankNo ? `빈칸 ${info.blankNo}` : null,
  ].filter(Boolean).join(" · ");
}

const sameTarget = (a, b) =>
  String(a.setId ?? "") === String(b.setId ?? "") &&
  String(a.questionId ?? "") === String(b.questionId ?? "") &&
  (a.blankNo ?? null) === (b.blankNo ?? null);

// 휴대폰 자판이 올라오면 보이는 영역이 줄어든다(레이아웃 화면은 그대로) — 그 영역의 위치·높이
function useVisibleBox() {
  const [box, setBox] = useState(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const update = () => setBox({
      top: Math.round(vv.offsetTop),
      height: Math.round(vv.height),
      keyboard: vv.height < window.innerHeight - 80,
    });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return box;
}

export default function QuestionNoteSheet({ info: freshInfo, onClose, onSaved }) {
  const user = localStorage.getItem("username") || "";
  const [draft] = useState(() => loadNoteDraft(user));
  const [info, setInfo] = useState(draft ? draft.info : freshInfo);
  const [withCtx, setWithCtx] = useState(draft ? draft.withCtx !== false : true);
  const [content, setContent] = useState(draft ? draft.content : "");
  const [fromDraft, setFromDraft] = useState(!!draft);
  // 불러온 초안이 저장 실패로 남은 것인가(예전 초안은 실패 때만 남았으므로 표시가 없으면 실패로 봄) — 안내 글만 다르다
  const [draftFailed] = useState(() => !!draft && draft.failed !== false);
  // 닫을 때 묻지 않고 초안을 남겨 두는 중(저장에 실패했거나 불러온 초안)
  const [keepDraft, setKeepDraft] = useState(!!draft);
  const [failed, setFailed] = useState(draftFailed); // 이 글이 저장에 실패한 적이 있나(초안에 함께 남김)
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [orphan, setOrphan] = useState(false); // 초안의 문제집·문항이 지워져 거절됨
  const [ctxOpen, setCtxOpen] = useState(false);
  const savingRef = useRef(false);
  const ownDraft = useRef(!!draft); // 이 창이 쓴(또는 불러온) 초안이 있나 — 글을 다 지우면 그 초안도 지운다
  const textRef = useRef(null);
  const sheetRef = useRef(null);
  const footRef = useRef(null);
  const box = useVisibleBox();

  // 안드로이드 뒤로 가기: 창만 닫는다(쓴 글은 아래 초안으로 남아 있음)
  useBack(true, () => onClose());

  // 쓰는 대로 초안 저장(글자마다 — 작은 값이라 바로 써도 가볍다. 미뤄 두면 그사이 창이 닫힐 때 잃는다)
  useEffect(() => {
    if (content.trim()) {
      saveNoteDraft({ user, info, withCtx, content, failed });
      ownDraft.current = true;
    } else if (ownDraft.current) {
      clearNoteDraft();
      ownDraft.current = false;
    }
  }, [user, info, withCtx, content, failed]);

  // 자판이 올라와 창이 줄었거나 오류 글이 붙어 아래 줄이 커졌을 때: 쓰는 중인 입력칸이 아래 줄에 가리지 않게 창 안을 내린다
  useLayoutEffect(() => {
    const sh = sheetRef.current, ta = textRef.current, foot = footRef.current;
    if (!sh || !ta || !foot || document.activeElement !== ta) return;
    const t = ta.getBoundingClientRect();
    const hidden = t.bottom - (foot.getBoundingClientRect().top - 4);
    const room = t.top - (sh.getBoundingClientRect().top + 4); // 입력칸 윗부분은 창 안에 남긴다
    if (hidden > 0 && room > 0) sh.scrollTop += Math.min(hidden, room);
  }, [box, error, orphan]);

  const hasBlank = !!info.blankNo;
  const hasCtx = hasBlank || !!info.context;
  const trimmed = content.trim();
  const over = trimmed.length > NOTE_CONTENT_MAX;
  const cantSave = saving || !trimmed || over;
  const canMove = fromDraft && !sameTarget(info, freshInfo);

  // withoutSet: 초안의 문제집·문항이 지워졌을 때 — 번호 없이 보내고, 문제집 제목·문항 번호는 맥락 글 앞에 남긴다
  async function save(withoutSet = false) {
    if (cantSave || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    const body = { content: trimmed };
    const ctx = withCtx && info.context ? info.context : "";
    if (withoutSet) {
      const where = [info.setTitle, info.qNo ? `Q${info.qNo}` : null].filter(Boolean).join(" ");
      const c = [where ? `(${where})` : "", ctx].filter(Boolean).join(" ");
      if (c) body.context = c.slice(0, NOTE_CONTEXT_MAX);
    } else {
      if (info.setId != null) body.setId = info.setId;
      if (info.questionId != null) body.questionId = info.questionId;
      if (ctx) body.context = ctx.slice(0, NOTE_CONTEXT_MAX);
    }
    if (withCtx && info.blankNo) body.blankNo = info.blankNo;
    try {
      const note = await createNote(body);
      clearNoteDraft();
      ownDraft.current = false;
      savingRef.current = false;
      onSaved(note, withoutSet ? { ...info, setId: null, questionId: null } : info);
    } catch (e) {
      // 쓴 글은 잃지 않게: 이 기기에 남기고 창은 그대로(로그인이 만료되면 다시 로그인한 뒤 불러온다)
      saveNoteDraft({ user, info, withCtx, content, failed: true });
      setFailed(true);
      setKeepDraft(true);
      setOrphan(
        !withoutSet && e.status === 400 && (info.setId != null || info.questionId != null) &&
        TARGET_GONE.test(e.message || "")
      );
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
    // 이 기기에 남겨 둔 초안이 아니면, 쓴 글을 버리기 전에 묻는다(버리기로 하면 쓰는 동안 남긴 초안도 지움)
    if (!keepDraft && trimmed) {
      if (!confirm("쓴 메모를 저장하지 않고 닫을까요?")) return;
      clearNoteDraft();
      ownDraft.current = false;
    }
    onClose();
  }

  // 불러온 초안의 글은 두고, 문제집·빈칸 정보만 지금 화면 것으로
  function moveToFresh() {
    setInfo(freshInfo);
    setWithCtx(true);
    setCtxOpen(false);
    setOrphan(false);
    setError("");
    textRef.current?.focus();
  }

  function discardDraft() {
    if (trimmed && !confirm("불러온 메모 글을 버리고 새로 쓸까요?")) return;
    clearNoteDraft();
    ownDraft.current = false;
    setKeepDraft(false);
    setFromDraft(false);
    setFailed(false);
    setInfo(freshInfo);
    setWithCtx(true);
    setCtxOpen(false);
    setContent("");
    setOrphan(false);
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

  const overlayStyle = box
    ? { ...S.overlay, top: box.top, bottom: "auto", height: box.height, ...(box.keyboard ? { paddingTop: 8, paddingBottom: 8 } : {}) }
    : S.overlay;

  return (
    <div style={overlayStyle} onClick={onOverlayClick}>
      <div
        ref={sheetRef}
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
            <span style={S.draftText}>{draftFailed ? "저장하지 못한 메모를 불러왔습니다." : "쓰다 만 메모를 불러왔습니다."}</span>
            {canMove && (
              <button style={S.linkBtn} onClick={moveToFresh} disabled={saving}>
                {freshInfo.blankNo ? "지금 빈칸으로 옮기기" : "지금 문항으로 옮기기"}
              </button>
            )}
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
              style={S.ctxText(ctxOpen, fromDraft || error ? 2 : 4)}
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
        <div style={S.foot} ref={footRef}>
          {error && <div style={S.error} role="alert">{error}</div>}
          {orphan && (
            <div style={S.orphanRow}>
              <button
                style={S.linkBtn}
                onClick={() => save(true)}
                disabled={cantSave}
                title="문제집·문항 번호 없이 저장합니다. 문제집 제목은 맥락 글 앞에 남깁니다."
              >문제집 정보 없이 저장</button>
            </div>
          )}
          <div style={S.btns}>
            <button style={S.cancel} onClick={requestClose} disabled={saving}>취소</button>
            <button style={S.save(cantSave)} onClick={() => save()} disabled={cantSave}>
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
