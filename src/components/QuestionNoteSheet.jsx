import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createNote, listNotes, updateNote } from "../api/notes";
import { SESSION_EXPIRED_MESSAGE } from "../utils/session";
import { useBack } from "../utils/backStack";
import {
  NOTE_CONTENT_MAX, NOTE_CONTEXT_MAX, clearNoteDraft, loadNoteDraft, saveNoteDraft,
  clearNoteEditDraft, formatNoteTime, keepNewerNotes, loadNoteEditDraft, noteEditDraftsForSet, orderSheetNotes,
  saveNoteEditDraft, sameNotePlace, sheetNoteLabel, sheetNoteRank,
} from "../utils/notes";
import NoteContextText from "./NoteContextText";
import PrevNoteList from "./PrevNoteList";

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
//
//  start: { listOpen, editId } — 풀기 화면 빈칸의 ✎ 로 열 때. 목록을 펴서 열고, editId 가 있으면 그 메모 고치기로 시작
//  이전 메모 고치기: 머리 줄의 '이전 메모 N' 단추로 이 문제집 메모 목록(PrevNoteList)을 펴고 접는다
//  (접어서 시작. 지금 문항에 쓴 메모가 있거나 태블릿처럼 보이는 영역이 넉넉하면 새로 쓸 때, 목록이 오기 전에 입력칸을 건드리지 않았을 때만 편다 —
//   늦게 온 목록이 쓰는(S펜으로 손글씨를 쓰는) 중인 입력칸을 밀어내지 않게).
//  수는 이 문제집 메모 전부(해결 포함), 지금 빈칸에 쓴 메모가 있으면 노랗게.
//  줄을 누르면 그 메모 고치기: 글이 입력칸에, 머리는 '메모 고치기'(입력칸 위 상자에도 '고치는 메모' — 자판에 머리가
//  밀려 올라가도 보이게), 저장은 updateNote(새 메모를 만들지 않음).
//  쓰던 새 메모 글은 따로 두었다가 '새 메모로'에서 되살린다(그동안에도 새 메모 초안으로 이 기기에 남아 있음).
//   · 고친 글은 메모마다 초안('qm:note-edit-draft:v1:<id>')으로 남긴다 — 뒤로 가기로 닫혀도 잃지 않게.
//     다시 열 때 그 메모와 같은 자리(같은 문항·같은 빈칸)에서 열면 그 고치기로 돌아가고, 다른 자리에서 열면
//     새 메모 쓰기로 열고 '고치다 둔 메모 · 이어 고치기' 한 줄과 목록 줄 표시로만 알린다(새 질문을 쓰려고 연 창을 차지하지 않게)
//   · 고친 글을 버리게 되는 때(다른 메모로·'새 메모로'·취소/✕)는 묻는다(메모 화면 NotesView 와 같은 말).
//     이 기기에 남겨 둔 고친 글(불러옴·저장 실패)은 묻지 않고 초안으로 둔다 — 버리기는 그 안내 줄의 '버리기'로.
//     뒤로 가기는 묻지 않고 초안을 남긴다(새 메모와 같음)
//   · 고친 뒤에는 창을 닫지 않고 새 메모 쓰기로 돌아간다(목록의 그 줄도 고친 글로). 알림은 onSaved(메모, 정보, { edited: true }).
//     되살린 새 메모 글은 잠깐(NEW_LOCK_MS) 저장을 막는다 — 저장을 두 번 눌러 쓰다 만 새 메모까지 저장되지 않게(글을 고치면 바로 풀림)
//   · 고치던 메모가 그사이 지워졌으면(받은 목록에 없음·서버가 '존재하지 않는 메모') 고친 글을 그 메모의 자리·맥락으로
//     '새 메모로 저장'한다(저장할 곳 없이 실패만 되풀이하지 않게)
//   · 빈 글로는 저장하지 않는다(지우기는 '질문 메모' 목록에서)
const S = {
  overlay: {
    position: "fixed", left: 0, right: 0, top: 0, bottom: 0, zIndex: 200, background: "rgba(0,0,0,0.7)",
    display: "flex", alignItems: "flex-start", justifyContent: "center",
    // 긴 속성으로 따로(자판이 올라오면 paddingTop·paddingBottom 만 바꾼다 — 줄임 속성 padding 과 섞으면 자판이 내려갈 때
    // React 가 padding-top 을 비워 창이 화면 맨 위에 붙는다)
    paddingTop: "max(12px, 5vh)", paddingRight: 12, paddingBottom: 12, paddingLeft: 12,
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
  // 머리 줄의 '이전 메모 N' 펴기·접기(아래 linkBtn 과 같은 높이 32 — 머리 줄을 높이지 않게)
  listBtn: (open) => ({
    flexShrink: 0, height: 32, padding: "0 9px", borderRadius: 6, whiteSpace: "nowrap",
    display: "inline-flex", alignItems: "center", gap: 4,
    background: open ? "rgba(245,158,11,0.12)" : "#242424",
    border: `1px solid ${open ? "rgba(245,158,11,0.55)" : "#333"}`,
    color: open ? "#f59e0b" : "#b0b0b0", fontSize: 12, fontWeight: 600, cursor: "pointer",
  }),
  // 수: 지금 빈칸에 쓴 메모가 있으면 노랗게(접혀 있어도 '여기 이미 물어본 것이 있다'를 알게)
  listCount: (open, here) => ({ fontWeight: 700, color: open || here ? "#f5b544" : "#d6d6d6" }),
  // 고친 뒤 잠깐: 풀기 화면 알림(아래쪽)이 휴대폰 자판에 가려도 창 안에서 보이게
  savedMark: { fontSize: 12, fontWeight: 700, color: "#34d399", whiteSpace: "nowrap" },
  draftRow: {
    display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: 6,
    marginBottom: 8, padding: "6px 8px 6px 10px",
    borderRadius: 6, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.35)",
    color: "#e8c27a", fontSize: 12, lineHeight: 1.4,
  },
  draftText: { flex: "1 1 100%", minWidth: 0 }, // 안내 글은 한 줄 전체, 단추들은 그 아래 오른쪽
  // 고치기 초안 안내(불러옴·고치다 둔 메모): 글과 단추 하나를 한 줄에(입력칸을 덜 밀어내게)
  noticeRow: {
    display: "flex", alignItems: "center", gap: 6, marginBottom: 8, padding: "3px 4px 3px 10px",
    borderRadius: 6, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.35)",
    color: "#e8c27a", fontSize: 12, lineHeight: 1.4,
  },
  noticeText: { flex: 1, minWidth: 0, wordBreak: "keep-all", overflowWrap: "anywhere" },
  // 입력칸 바로 위 상자의 '고치는 메모'·'지워진 메모'(자판이 올라와 머리 줄이 창 위로 밀려도 무엇을 쓰는지 보이게)
  metaMode: (gone) => ({ fontWeight: 700, color: gone ? "#f87171" : "#f59e0b" }),
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
  hint: { color: "#8a8a8a", fontSize: 12.5, lineHeight: 1.45, paddingTop: 8 },
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
// 고치던 메모가 그사이 지워져 서버가 거절한 경우(qm_update_note 의 QM404 — 앱에는 status 400 + 이 문장으로 온다)
const NOTE_GONE = /존재하지 않는 메모/;

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

// 이전 메모 목록을 펴 둘 만큼 보이는 영역이 넉넉한가(세로 태블릿). 휴대폰·자판이 올라온 가로 태블릿은 접어 두어
// 입력칸을 밀어내지 않게 — 높이는 자판을 뺀 보이는 높이(visualViewport)로 본다
function roomyScreen() {
  if (typeof window === "undefined") return false;
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  return window.innerWidth >= 600 && h >= 700;
}

const SAVED_MARK_MS = 2500;
const NEW_LOCK_MS = 900; // 고치기 저장 뒤 되살린 새 메모 글의 저장을 막는 동안(두 번 누름 막기)

export default function QuestionNoteSheet({ info: freshInfo, start = null, onClose, onSaved }) {
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
  const listBtnRef = useRef(null);
  const box = useVisibleBox();
  const listId = useId();

  // ── 이전 메모(지금 화면의 문제집 것) ──
  const listable = freshInfo.setId != null;
  const [notes, setNotes] = useState(null);
  const [listState, setListState] = useState(listable ? "loading" : "off"); // loading | ok | error | off
  const [listError, setListError] = useState("");
  const [listTry, setListTry] = useState(0);
  // 이 문제집 메모의 고치기 초안들(최근 것 먼저) — 안내 줄·목록 줄 표시용. 고치기를 떠나거나 다른 메모로 옮길 때 다시 읽는다
  const [setDrafts, setSetDrafts] = useState(() => noteEditDraftsForSet(user, freshInfo.setId));
  // 고치는 중인 메모(받은 메모 그대로 — content 가 원문). null 이면 새 메모 쓰기.
  // 지난번에 고치다 뒤로 가기 등으로 닫은 메모가 지금 화면과 같은 자리면 그 고치기로 돌아간다(새 메모 글은 따로 그대로).
  // 다른 자리 메모면 새 메모 쓰기로 연다(다른 빈칸에 새 질문을 쓰려고 연 창을 옛 메모 고치기가 차지하지 않게)
  const [editDraft] = useState(() => setDrafts.find((d) => sameNotePlace(d.note, freshInfo)) || null);
  const [editing, setEditing] = useState(editDraft ? editDraft.note : null);
  // 저장할 때 서버가 '존재하지 않는 메모'라고 한 메모 id(받은 목록에 없는 것과 함께 '지워진 메모'로 본다)
  const [goneId, setGoneId] = useState(null);
  // 고치기 저장 직후 잠깐 새 메모 저장을 막는다(NEW_LOCK_MS)
  const [newLock, setNewLock] = useState(false);
  const lockTimer = useRef(null);
  const edited = useRef(new Map()); // 이 창에서 고친 메모(id → 서버가 돌려준 메모) — 늦게 온 목록에 겹친다
  const touched = useRef(false); // 입력칸을 건드렸나(누름·S펜을 댐·글자) — 그 뒤에 온 목록은 저절로 펴지 않는다
  const [editText, setEditText] = useState(editDraft ? editDraft.content : "");
  // 불러온 고치기 초안 안내: "" | "kept"(쓰다 둠) | "failed"(저장 실패)
  const [editNotice, setEditNotice] = useState(editDraft ? (editDraft.failed === false ? "kept" : "failed") : "");
  const [editFailed, setEditFailed] = useState(!!editDraft && editDraft.failed !== false);
  // 닫을 때 묻지 않고 고치기 초안을 남겨 두는 중(불러온 초안·저장 실패) — 새 메모의 keepDraft 와 같은 규칙
  const [editKeep, setEditKeep] = useState(!!editDraft);
  const [savedMark, setSavedMark] = useState(false);
  const savedTimer = useRef(null);
  const focusEnd = useRef(!!editDraft); // 다음 그림 뒤 입력칸에 초점 + 글 끝으로(고치기 시작·새 메모로 돌아옴)
  // 목록은 접어서 시작하고, 넉넉한 화면(태블릿)에서 새로 쓸 때만 목록이 왔을 때 편다(그새 입력칸을 건드렸으면 접은 채 —
  // 받기 전에는 자리가 없어서, 쓰는 중에 펴면 입력칸이 목록 높이만큼 밀려 내려간다)
  const [listOpen, setListOpen] = useState(false);
  const openOnArrive = useRef(!draft && !editDraft);
  const startDone = useRef(false); // start.editId 고치기를 이미 시작했나

  // 안드로이드 뒤로 가기: 창만 닫는다(쓴 글·고친 글은 아래 초안으로 남아 있음)
  useBack(true, () => onClose());

  useEffect(() => {
    if (!listable) return undefined;
    let alive = true;
    listNotes({ status: "all", setId: freshInfo.setId })
      .then((list) => {
        if (!alive) return;
        // 고치기 저장보다 먼저 읽혔지만 늦게 온 목록이 고친 줄을 옛 글로 되돌리지 않게, 이 창에서 고친 메모를 겹친다
        const arr = keepNewerNotes(list, edited.current);
        setNotes(arr);
        setListState("ok");
        // 펴기: 빈칸의 ✎ 로 열었거나(start.listOpen), 지금 문항에 쓴 메모가 있으면(휴대폰도 — 풀다가 쓴 메모를 바로 보게),
        // 넉넉한 화면(태블릿)이면. ✎ 로 연 것이 아니면 그새 입력칸을 건드렸을 때는 접은 채
        if (start?.listOpen && arr.length > 0) setListOpen(true);
        else if (openOnArrive.current && !touched.current && arr.length > 0 &&
          (roomyScreen() || arr.some((n) => sheetNoteRank(n, freshInfo) < 2))) setListOpen(true);
        openOnArrive.current = false;
        // ✎ 로 연 빈칸의 메모가 하나면 바로 그 메모 고치기(처음 받은 목록에서 한 번만)
        if (start?.editId != null && !startDone.current) {
          startDone.current = true;
          const hit = arr.find((n) => String(n.id) === String(start.editId));
          if (hit) pickNote(hit);
        }
        // 불러온 고치기 초안의 원문을 서버 것으로(그사이 메모 화면에서 고쳤을 수 있음 — '고친 내용이 있나'를 맞게)
        setEditing((cur) => (cur ? arr.find((n) => String(n.id) === String(cur.id)) || cur : cur));
      })
      .catch((e) => {
        if (!alive) return;
        openOnArrive.current = false;
        setListError(e.message || "이전 메모를 불러오지 못했습니다.");
        setListState("error");
      });
    return () => { alive = false; };
    // 목록은 문제집이 바뀌거나 다시 시도할 때만 받는다. start·freshInfo·pickNote 는 창을 연 때의 값이면 된다(처음 받은 목록에서 한 번만 씀)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listable, freshInfo.setId, listTry]);

  useEffect(() => () => { clearTimeout(savedTimer.current); clearTimeout(lockTimer.current); }, []);

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

  // 고친 글도 쓰는 대로 그 메모의 초안으로(원문과 같거나 비면 잃을 글이 없으므로 지운다)
  const editChanged = !!editing && editText.trim() !== String(editing.content ?? "").trim();
  useEffect(() => {
    if (!editing) return;
    if (editChanged && editText.trim()) saveNoteEditDraft({ user, note: editing, content: editText, failed: editFailed });
    else clearNoteEditDraft(editing.id);
  }, [user, editing, editText, editChanged, editFailed]);

  // 고치기를 시작했거나 새 메모로 돌아왔을 때: 입력칸에 초점, 글 끝으로(휴대폰은 자판이 올라온다)
  useLayoutEffect(() => {
    if (!focusEnd.current) return;
    focusEnd.current = false;
    const ta = textRef.current;
    if (!ta) return;
    ta.focus();
    const end = ta.value.length;
    try { ta.setSelectionRange(end, end); } catch { /* 고를 수 없는 칸이면 그대로 */ }
    ta.scrollTop = ta.scrollHeight;
  });

  // 자판이 올라와 창이 줄었거나 오류 글이 붙어 아래 줄이 커졌을 때: 쓰는 중인 입력칸이 아래 줄에 가리지 않게 창 안을 내린다
  useLayoutEffect(() => {
    const sh = sheetRef.current, ta = textRef.current, foot = footRef.current;
    if (!sh || !ta || !foot || document.activeElement !== ta) return;
    const t = ta.getBoundingClientRect();
    const hidden = t.bottom - (foot.getBoundingClientRect().top - 4);
    const room = t.top - (sh.getBoundingClientRect().top + 4); // 입력칸 윗부분은 창 안에 남긴다
    if (hidden > 0 && room > 0) sh.scrollTop += Math.min(hidden, room);
  }, [box, error, orphan, editing, listOpen, listState]);

  const hasBlank = !!info.blankNo;
  const hasCtx = hasBlank || !!info.context;
  const text = editing ? editText : content; // 입력칸의 글(고치는 중이면 고친 글)
  const trimmed = text.trim();
  const over = trimmed.length > NOTE_CONTENT_MAX;
  // 고치던 메모가 그사이 지워졌나: 저장 때 서버가 그렇다고 했거나, 받은 이 문제집 목록에 없음
  const editGone = !!editing && (
    String(editing.id) === goneId ||
    (listState === "ok" && !!notes && !notes.some((n) => String(n.id) === String(editing.id)))
  );
  const cantSave = saving || !trimmed || over ||
    (editing ? !editGone && !editChanged : newLock);
  const canMove = fromDraft && !sameTarget(info, freshInfo);
  const ordered = notes ? orderSheetNotes(notes, freshInfo) : [];
  const hereCount = ordered.filter((n) => sheetNoteRank(n, freshInfo) === 0).length; // 지금 빈칸의 메모 수(단추 숫자를 노랗게)
  // 단추: 메모가 있거나, 못 불러왔거나(다시 시도), 다시 불러오는 중일 때
  const showListBtn = listState === "error" || (listState === "loading" && listTry > 0) || (listState === "ok" && ordered.length > 0);
  // 고치다 이 기기에 남겨 둔 메모(지금 고치는 것 빼고): 새 메모 쓰기에서 '이어 고치기' 한 줄, 목록 줄에 표시
  const otherDrafts = setDrafts.filter((d) => !editing || String(d.note.id) !== String(editing.id));
  const draftIds = new Set(otherDrafts.map((d) => String(d.note.id)));
  const refreshDrafts = () => setSetDrafts(noteEditDraftsForSet(user, freshInfo.setId));

  // 고치기에서 새 메모 쓰기로(쓰던 새 메모 글 content 는 그대로 있다)
  function leaveEdit() {
    setEditing(null);
    setEditText("");
    setEditNotice("");
    setEditFailed(false);
    setEditKeep(false);
    setGoneId(null);
    setCtxOpen(false);
    setError("");
    setOrphan(false);
    refreshDrafts();
  }

  // 목록의 메모(또는 고치다 둔 메모)를 누름 → 그 메모 고치기.
  // 고치던 다른 메모에 이번에 고친 글이 있으면 먼저 묻는다(이 기기에 남겨 둔 고친 글이면 묻지 않고 초안으로 둔다)
  function pickNote(n) {
    if (savingRef.current) return;
    if (editing && String(editing.id) === String(n.id)) {
      textRef.current?.focus(); // 이미 고치는 메모: 입력칸으로만
      return;
    }
    if (editing && !editKeep) {
      if (editChanged && !confirm("고치던 메모를 저장하지 않고 넘어갈까요?")) return;
      clearNoteEditDraft(editing.id);
    }
    const kept = loadNoteEditDraft(user, n.id); // 이 메모를 고치다 남긴 글이 있으면 그것부터
    setEditing(n);
    setEditText(kept ? kept.content : n.content || "");
    setEditNotice(kept ? (kept.failed === false ? "kept" : "failed") : "");
    setEditFailed(!!kept && kept.failed !== false);
    setEditKeep(!!kept);
    setGoneId(null);
    setCtxOpen(false);
    setError("");
    setOrphan(false);
    refreshDrafts();
    focusEnd.current = true;
  }

  // 새 메모 쓰기의 '이어 고치기': 고치다 둔 메모 중 가장 최근 것(받은 목록에 있으면 서버 것으로 — 원문을 맞게)
  function resumeDraft() {
    const d = otherDrafts[0];
    if (!d) return;
    pickNote((notes && notes.find((n) => String(n.id) === String(d.note.id))) || d.note);
  }

  function backToNew() {
    if (savingRef.current) return;
    // 이 기기에 남겨 둔 고친 글(불러옴·저장 실패)은 묻지 않고 초안으로 둔다(✕ 와 같은 규칙 — '이어 고치기'로 돌아올 수 있다)
    if (editing && !editKeep) {
      if (editChanged && !confirm("고친 내용을 버릴까요?")) return;
      clearNoteEditDraft(editing.id);
    }
    leaveEdit();
    focusEnd.current = true;
  }

  // 불러온 고친 글 버리기: 원문으로 되돌리고 그 초안을 지운다(고치기는 그대로 — 원문에서 다시 고치거나 '새 메모로')
  function discardEdit() {
    if (savingRef.current || !editing) return;
    if (!confirm("고친 내용을 버릴까요?")) return;
    clearNoteEditDraft(editing.id);
    setEditText(editing.content || "");
    setEditNotice("");
    setEditFailed(false);
    setEditKeep(false);
    setError("");
    refreshDrafts();
    focusEnd.current = true;
  }

  function showSavedMark() {
    clearTimeout(savedTimer.current);
    setSavedMark(true);
    savedTimer.current = setTimeout(() => setSavedMark(false), SAVED_MARK_MS);
  }

  function lockNew() {
    clearTimeout(lockTimer.current);
    setNewLock(true);
    lockTimer.current = setTimeout(() => setNewLock(false), NEW_LOCK_MS);
  }

  // 고친 글이 저장에 실패: 그 메모의 초안으로 남기고(효과를 기다리지 않고 바로) 창은 그대로
  function keepFailedEdit(target, e, fallback) {
    saveNoteEditDraft({ user, note: target, content: editText, failed: true });
    setEditFailed(true);
    setEditKeep(true);
    setError(
      `${e.message || fallback}` +
      (e.message === SESSION_EXPIRED_MESSAGE ? "" : " 고친 글은 이 기기에 남겨 두었습니다.")
    );
    savingRef.current = false;
    setSaving(false);
  }

  // 고친 글 저장(updateNote — 새 메모를 만들지 않음). 실패하면 글은 그 메모의 초안으로 남기고 창은 그대로
  async function saveEdit() {
    if (cantSave || savingRef.current || !editing) return;
    if (editGone) return saveGoneAsNew();
    const target = editing;
    const body = trimmed;
    const hadFocus = document.activeElement === textRef.current;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const updated = await updateNote(target.id, { content: body });
      const next = updated && updated.id != null ? updated : { ...target, content: body, updatedAt: new Date().toISOString() };
      clearNoteEditDraft(target.id);
      edited.current.set(String(next.id), next);
      savingRef.current = false;
      setSaving(false);
      setNotes((list) => (list ? list.map((n) => (String(n.id) === String(next.id) ? next : n)) : list));
      leaveEdit();
      lockNew();
      showSavedMark();
      // 입력칸에서 저장(Ctrl+Enter 등)했으면 새 메모 쓰기로 이어서, 단추로 저장했으면 휴대폰 자판을 다시 올리지 않게 '이전 메모' 단추로
      if (hadFocus) focusEnd.current = true;
      else requestAnimationFrame(() => listBtnRef.current?.focus());
      onSaved(next, { setId: next.setId ?? target.setId ?? null, questionId: next.questionId ?? null, blankNo: next.blankNo ?? null }, { edited: true });
    } catch (e) {
      if (e.status === 400 && NOTE_GONE.test(e.message || "")) {
        // 그사이 지워진 메모: 실패를 되풀이하지 않게 '새 메모로 저장'으로 바꾼다(글은 초안으로 남김)
        saveNoteEditDraft({ user, note: target, content: editText, failed: true });
        setEditFailed(true);
        setEditKeep(true);
        setGoneId(String(target.id));
        setNotes((list) => (list ? list.filter((n) => String(n.id) !== String(target.id)) : list)); // 목록·수에서도 뺀다
        setError("이 메모는 그사이 지워졌습니다. 고친 글은 이 기기에 남겨 두었고, '새 메모로 저장'으로 남길 수 있습니다.");
        savingRef.current = false;
        setSaving(false);
        return;
      }
      keepFailedEdit(target, e, "고치지 못했습니다.");
    }
  }

  // 지워진 메모의 고친 글을 그 메모의 자리(문제집·문항·빈칸)와 맥락 글로 새 메모로 저장한다.
  // 문항도 지워졌으면(서버가 거절) 문항 번호만 빼고 한 번 더. 저장하면 새 메모와 같이 창을 닫는다(알림 '메모했습니다')
  async function saveGoneAsNew() {
    const src = editing;
    savingRef.current = true;
    setSaving(true);
    setError("");
    const body = { content: trimmed };
    const setIdOf = src.setId ?? freshInfo.setId;
    if (setIdOf != null) body.setId = setIdOf;
    if (src.questionId != null) body.questionId = src.questionId;
    if (src.blankNo != null) body.blankNo = src.blankNo;
    if (src.context) body.context = String(src.context).slice(0, NOTE_CONTEXT_MAX);
    try {
      let note;
      try {
        note = await createNote(body);
      } catch (e) {
        if (!(e.status === 400 && body.questionId != null && TARGET_GONE.test(e.message || ""))) throw e;
        delete body.questionId;
        note = await createNote(body);
      }
      clearNoteEditDraft(src.id);
      savingRef.current = false;
      onSaved(note, { setId: note?.setId ?? body.setId ?? null, questionId: note?.questionId ?? null, blankNo: note?.blankNo ?? null });
    } catch (e) {
      keepFailedEdit(src, e, "저장하지 못했습니다.");
    }
  }

  // withoutSet: 초안의 문제집·문항이 지워졌을 때 — 번호 없이 보내고, 문제집 제목·문항 번호는 맥락 글 앞에 남긴다
  async function save(withoutSet = false) {
    if (editing) return saveEdit();
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
    if (editing) {
      // 고친 글: 남겨 둔 초안(불러옴·저장 실패)이 아니면 버리기 전에 묻는다.
      // 따로 둔 새 메모 글은 묻지 않고 초안으로 남긴다(지금 보이지 않는 글을 묻지 않게 — 다음에 열면 불러옴)
      if (!editKeep && editChanged) {
        if (!confirm("고친 내용을 버릴까요?")) return;
        clearNoteEditDraft(editing.id);
      }
      onClose();
      return;
    }
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
    if (e.target === textRef.current) touched.current = true;
    if (e.key === "Escape") { e.preventDefault(); requestClose(); }
    else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
  }

  // 창 바깥을 누르면: 아무것도 안 썼을 때(고치는 중이면 고친 것이 없을 때)만 닫는다
  // (자판을 내리려고 바깥을 눌러도 쓴 글이 날아가지 않게)
  function onOverlayClick() {
    if (!savingRef.current && (editing ? !editChanged : !trimmed)) onClose();
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
          <div style={S.title}>{editing ? "메모 고치기" : "질문 메모"}</div>
          {savedMark && <span style={S.savedMark} aria-hidden="true">✓ 고쳤습니다</span>}
          {showListBtn && (
            <button
              ref={listBtnRef}
              style={S.listBtn(listOpen)}
              onClick={() => setListOpen((v) => !v)}
              aria-expanded={listOpen}
              aria-controls={listId}
              aria-label={
                listState === "ok"
                  ? `이 문제집의 이전 메모 ${ordered.length}개${hereCount ? `, 지금 빈칸 메모 ${hereCount}개` : ""}`
                  : listState === "error" ? "이전 메모(불러오지 못함)" : "이전 메모(불러오는 중)"
              }
              title={listOpen ? "이전 메모 접기" : "이전 메모를 펴서 골라 고치기"}
            >
              이전 메모{listState === "ok" && <span style={S.listCount(listOpen, hereCount > 0)}>{ordered.length}</span>}
              <span aria-hidden="true">{listOpen ? "▴" : "▾"}</span>
            </button>
          )}
          <button style={S.close} onClick={requestClose} aria-label="닫기" disabled={saving}>✕</button>
        </div>

        {showListBtn && listOpen && (
          <PrevNoteList
            id={listId}
            notes={ordered}
            state={listState}
            error={listError}
            info={freshInfo}
            editingId={editing ? editing.id : null}
            draftIds={draftIds}
            disabled={saving}
            onPick={pickNote}
            onRetry={() => { setListState("loading"); setListError(""); setListTry((n) => n + 1); }}
          />
        )}

        {editing && editNotice && (
          <div style={S.noticeRow}>
            <span style={S.noticeText}>{editNotice === "failed" ? "고치지 못한 메모를 불러왔습니다." : "고치던 메모를 불러왔습니다."}</span>
            <button style={S.linkBtn} onClick={discardEdit} disabled={saving} aria-label="불러온 고친 글 버리기">버리기</button>
          </div>
        )}

        {!editing && otherDrafts.length > 0 && (
          <div style={S.noticeRow}>
            <span style={S.noticeText}>
              고치다 둔 메모 · {sheetNoteLabel(otherDrafts[0].note, freshInfo)}
              {otherDrafts.length > 1 ? ` 외 ${otherDrafts.length - 1}개` : ""}
            </span>
            <button
              style={S.linkBtn}
              onClick={resumeDraft}
              disabled={saving}
              aria-label={`고치다 둔 메모(${sheetNoteLabel(otherDrafts[0].note, freshInfo)}) 이어 고치기`}
            >이어 고치기</button>
          </div>
        )}

        {!editing && fromDraft && (
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

        {editing ? (
          // 고치는 메모: 자리·쓴 때·해결 여부와 그 메모의 맥락 글(고칠 수 없음 — 글만 고친다)
          <div style={S.ctxBox}>
            <div style={S.ctxHead}>
              <div style={S.ctxMeta}>
                <span style={S.metaMode(editGone)}>{editGone ? "지워진 메모" : "고치는 메모"}</span>
                {" · "}{[sheetNoteLabel(editing, freshInfo), formatNoteTime(editing.createdAt), editing.resolved ? "해결" : null].filter(Boolean).join(" · ")}
              </div>
              <button
                style={S.linkBtn}
                onClick={backToNew}
                disabled={saving}
                title={content.trim() ? "쓰던 새 메모로 돌아갑니다" : "새 메모를 씁니다"}
              >새 메모로</button>
            </div>
            {editing.context && (
              <div
                style={S.ctxText(ctxOpen, editNotice || editGone || error ? 2 : 4)}
                onClick={() => setCtxOpen((v) => !v)}
                role="button"
                aria-expanded={ctxOpen}
                title={ctxOpen ? "접기" : "눌러서 펼치기"}
              >
                <NoteContextText text={editing.context} blankNo={editing.blankNo} />
              </div>
            )}
          </div>
        ) : (
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
                style={S.ctxText(ctxOpen, fromDraft || otherDrafts.length > 0 || error ? 2 : 4)}
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
        )}

        <textarea
          ref={textRef}
          style={S.textarea}
          rows={4}
          value={text}
          onChange={(e) => {
            touched.current = true;
            if (editing) setEditText(e.target.value);
            else {
              setContent(e.target.value);
              if (newLock) { clearTimeout(lockTimer.current); setNewLock(false); } // 글을 고쳤으면 일부러 쓰는 것 — 바로 저장 가능
            }
            if (error) setError("");
          }}
          // 입력칸을 누르거나 S펜을 대면(글자가 들어오기 전에도) 늦게 온 목록을 저절로 펴지 않는다
          onPointerDown={() => { touched.current = true; }}
          onPointerEnter={(e) => { if (e.pointerType === "pen") touched.current = true; }}
          onCompositionStart={() => { touched.current = true; }}
          onFocus={(e) => { e.target.style.borderColor = "#f59e0b"; }}
          onBlur={(e) => { e.target.style.borderColor = "#2e2e2e"; }}
          placeholder={editing ? "고칠 글을 적으세요." : "읽다가 든 질문을 적어 두세요. 나중에 '질문 메모' 목록에서 모아 봅니다."}
          aria-label={editing ? "고칠 메모 글" : "새 질문 메모"}
          autoFocus
          // disabled 대신 readOnly: 저장 중에도 초점·휴대폰 자판이 내려가지 않게
          readOnly={saving}
        />
        {trimmed.length > NOTE_CONTENT_MAX - 300 && (
          <div style={S.counter(over)}>{trimmed.length} / {NOTE_CONTENT_MAX}</div>
        )}
        <div style={S.foot} ref={footRef}>
          {error && <div style={S.error} role="alert">{error}</div>}
          {editing && !trimmed && !error && (
            <div style={S.hint}>{"메모 내용을 입력해 주세요. 지우기는 '질문 메모' 목록 화면에서 합니다."}</div>
          )}
          {editing && editGone && trimmed && !error && (
            <div style={S.hint}>이 메모는 그사이 지워졌습니다. 고친 글은 이 메모의 자리·맥락으로 새 메모로 저장합니다.</div>
          )}
          {!editing && orphan && (
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
              {saving ? "저장 중…" : editGone ? "새 메모로 저장" : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
