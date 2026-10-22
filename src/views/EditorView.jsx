import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { getQuestions, addQuestion, updateQuestion, deleteQuestion } from "../api/quiz";
import { IMAGE_ACCEPT, uploadImage } from "../api/image";
import FillText from "../components/FillText";
import TableAwareText from "../components/TableAwareText";
import { buildTableTemplate, plainPreview } from "../utils/textBlocks";
import { parseAnswers } from "../utils/answers";
import { fillLockReason, fromInline, toInline } from "../utils/fillInline";
import { SESSION_EXPIRED_MESSAGE } from "../utils/session";
import { STAY, useBack } from "../utils/backStack";
import "./EditorView.css";

// 목록·편집 폼을 한 화면에 하나씩 보이는 폭(index.css 의 편집기 @media 와 같은 값)
const NARROW_QUERY = "(max-width: 900px)";

const TYPE_LABEL = { multiple: "객관식", short: "주관식", ox: "O/X", fill: "빈칸 채우기" };
// App 의 뒤로 가기 확인과 같은 문구
const LEAVE_MESSAGE = "저장하지 않은 내용이 있습니다. 나갈까요?";
const SWITCH_MESSAGE = "고치던 문항을 저장하지 않고 넘어갈까요?";
const PREVIEW_MESSAGE = "저장하지 않은 내용이 있습니다. 저장하고 미리보기로 갈까요?\n(미리보기는 저장된 내용만 보여 줍니다)";
const PREVIEW_DELAY_MS = 250; // 글을 치다 멈춘 뒤 미리보기를 다시 그리기까지(빈칸 수백 개 페이지가 타자마다 다시 그려지지 않게)

const TYPE_COLOR = {
  multiple: { text: "#60a5fa", bg: "rgba(96,165,250,0.1)", border: "#60a5fa" },
  short:    { text: "#34d399", bg: "rgba(52,211,153,0.1)",  border: "#34d399" },
  ox:       { text: "#f87171", bg: "rgba(248,113,113,0.1)", border: "#f87171" },
  fill:     { text: "#f59e0b", bg: "rgba(245,158,11,0.1)",  border: "#f59e0b" },
};

// 백엔드 타입명(short_answer, multiple_choice 등)을 프론트엔드 내부명으로 정규화
function normalizeType(type) {
  const map = { short_answer: "short", multiple_choice: "multiple" };
  const lower = (type || "").toLowerCase();
  return map[lower] ?? lower;
}

function emptyForm(type, orderIndex = 0) {
  return {
    type,
    text: "",
    options: type === "multiple" ? ["", "", "", ""] : null,
    answerIndex: type === "multiple" ? 0 : null,
    answer: "",
    answers: type === "fill" ? [] : null,
    explanation: "",
    orderIndex,
    questionImageUrl: "",
    answerImageUrl: "",
    answerMode: "text", // "text" | "image"
  };
}

function parseOptions(opts) {
  if (!opts) return ["", "", "", ""];
  if (Array.isArray(opts)) return opts;
  try { return JSON.parse(opts); } catch { return ["", "", "", ""]; }
}

// 저장할 내용만 이은 글 — 폼을 연 때(또는 저장한 뒤)와 다르면 '저장하지 않은 내용이 있음'
function formSig(f) {
  if (!f) return "";
  return JSON.stringify([
    f.type, f.text, f.options, f.answerIndex, f.answer, f.explanation,
    f.questionImageUrl, f.answerImageUrl, f.answerMode,
  ]);
}

// 값이 ms 동안 더 바뀌지 않으면 그 값. 다른 폼(key)으로 바뀌면 기다리지 않고 바로 지금 값
function useSettled(value, key, ms) {
  const [settled, setSettled] = useState({ value, key });
  useEffect(() => {
    if (settled.value === value && settled.key === key) return undefined;
    const t = setTimeout(() => setSettled({ value, key }), ms);
    return () => clearTimeout(t);
  }, [value, key, ms, settled]);
  return settled.key === key ? settled.value : value;
}

// 화면 폭에 따라 바뀌는 배치(.qm-ed-*)는 index.css 참고: 넓은 화면은 왼쪽 목록 + 오른쪽 편집,
// 폭 900px 이하(휴대폰·태블릿 세로)는 목록과 편집 폼을 한 화면에 하나씩 전체 폭으로 보여 준다.
// 마우스 올림 효과는 마우스에서만 켠다(onPointerEnter + pointerType) — 휴대폰에서 누른 뒤 흐린 채 남지 않게.
const S = {
  // --qm-band-h: 미리보기·로컬 주소의 띠 높이(components/EnvBand.jsx) — 띠가 있어도 편집 화면이 한 화면에 맞게
  page: { minHeight: "calc(100vh - var(--qm-band-h, 0px))", background: "#0f0f0f", fontFamily: "system-ui, sans-serif" },
  nav: {
    background: "#1a1a1a", borderBottom: "1px solid #2e2e2e",
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
    minHeight: 52,
  },
  navLeft: { display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 },
  // 여백 10 + 음수 여백 -10: 보이는 자리는 그대로, 누르는 자리만 넓게
  backBtn: {
    background: "none", border: "none", color: "#a0a0a0", padding: 10, margin: -10, flexShrink: 0,
    fontSize: 20, cursor: "pointer", transition: "color 0.15s ease",
  },
  navTitle: { fontWeight: 700, color: "#f1f1f1", minWidth: 0, overflowWrap: "anywhere" },
  navRight: { display: "flex", gap: 8, flexShrink: 0 },
  previewBtn: {
    background: "#242424", color: "#f1f1f1", border: "1px solid #2e2e2e",
    minHeight: 36, borderRadius: 6, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
    fontSize: 13, transition: "opacity 0.15s ease",
  },

  // 사이드바 (배치·폭·스크롤은 .qm-ed-sidebar — 휴대폰에서 숨기려면 display 를 인라인에 두면 안 됨)
  sidebar: { background: "#1a1a1a" },
  addBtns: {
    padding: "14px",
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6,
    borderBottom: "1px solid #2e2e2e",
  },
  typeBtn: (color) => ({
    padding: "7px 0", minHeight: 38, background: "transparent",
    border: `1px solid ${color}`, color, borderRadius: 6,
    fontWeight: 700, fontSize: 12, cursor: "pointer", transition: "background 0.15s ease",
  }),
  // 문항 목록: 줄(li) 하나 = 고르는 단추(줄 전체) + ✕ 단추(오른쪽 위에 겹쳐 놓음, 단추 안에 단추를 넣지 않으려고).
  // 고르는 단추의 오른쪽 여백 48 = 옛 배치의 오른쪽 여백 16 + ✕ 자리 32 — 글 폭·줄 높이가 예전(누르는 div)과 같다
  qList: { listStyle: "none" },
  qItem: (active, type) => ({
    position: "relative", borderBottom: "1px solid #2e2e2e",
    background: active ? "#242424" : "#1a1a1a",
    borderLeft: `3px solid ${active ? (TYPE_COLOR[type]?.border ?? "#f59e0b") : "transparent"}`,
    transition: "background 0.15s ease",
  }),
  qPick: {
    display: "block", width: "100%", padding: "12px 48px 12px 16px",
    background: "none", border: "none", borderRadius: 0, color: "inherit", font: "inherit",
    textAlign: "left", cursor: "pointer",
  },
  qNum: { display: "block", fontSize: 11, color: "#8a8a8a", marginBottom: 3 },
  qText: { display: "block", fontSize: 13, color: "#f1f1f1", fontWeight: 500, lineHeight: 1.4, overflowWrap: "anywhere" },
  // 누르는 자리 40×40, 보이는 ✕ 위치는 예전과 같게(줄 위에서 2px, 오른쪽에서 4px)
  qDel: {
    position: "absolute", top: 2, right: 4,
    background: "none", border: "none", color: "#555555",
    cursor: "pointer", fontSize: 16, padding: 0,
    width: 40, height: 40,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    transition: "color 0.15s ease",
  },
  sideEmpty: { color: "#8a8a8a", fontSize: 13, textAlign: "center", padding: "32px 16px" },
  // 문항 목록을 못 불러왔을 때(빈 목록으로 숨기지 않음)
  loadError: {
    margin: 12, padding: "10px 12px", borderRadius: 8, fontSize: 13, lineHeight: 1.5,
    border: "1px solid rgba(248,113,113,0.4)", background: "rgba(248,113,113,0.1)", color: "#f87171",
    overflowWrap: "anywhere",
  },
  retryBtn: {
    display: "block", marginTop: 8, padding: "6px 14px", minHeight: 36, borderRadius: 6,
    border: "1px solid #f87171", background: "none", color: "#f87171", fontSize: 13, fontWeight: 600,
    cursor: "pointer",
  },

  // 편집 패널 (배치·여백·스크롤은 .qm-ed-editor)
  editor: { background: "#0f0f0f" },
  // 휴대폰에서만 보이는(.qm-ed-back) 목록으로 돌아가기 — 취소와 같음
  edBackBtn: {
    alignItems: "center", gap: 6, minHeight: 40, padding: "0 4px", marginBottom: 8,
    background: "none", border: "none", color: "#a0a0a0",
    fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
  },
  idle: { color: "#8a8a8a", textAlign: "center", marginTop: 80, fontSize: 15 },
  typeBadge: (type) => ({
    display: "inline-block", fontSize: 11, fontWeight: 700, borderRadius: 4,
    padding: "2px 7px", marginBottom: 16,
    background: TYPE_COLOR[type]?.bg ?? "rgba(245,158,11,0.1)",
    color: TYPE_COLOR[type]?.text ?? "#f59e0b",
  }),
  modeLabel: { fontWeight: 700, fontSize: 15, color: "#f1f1f1", marginBottom: 20 },
  fieldLabel: { fontSize: 13, fontWeight: 600, color: "#a0a0a0", marginBottom: 6, display: "block" },
  // 문제 칸: 글 길이만큼 자동으로 늘어남(fieldSizing: content, 크롬 123+·안드로이드 크롬) — 화면 높이 60% 까지.
  // 지원하지 않는 브라우저는 예전처럼 최소 90px + 모서리 드래그
  textarea: {
    width: "100%", padding: "10px 12px",
    background: "#242424", border: "1px solid #2e2e2e", borderRadius: 7,
    fontSize: 14, marginBottom: 16, color: "#f1f1f1",
    resize: "vertical", fieldSizing: "content", minHeight: 90, maxHeight: "60vh", outline: "none",
    boxSizing: "border-box", lineHeight: 1.6,
    transition: "border-color 0.15s ease",
  },
  input: {
    width: "100%", padding: "9px 12px",
    background: "#242424", border: "1px solid #2e2e2e", borderRadius: 7,
    fontSize: 14, marginBottom: 14, color: "#f1f1f1", outline: "none",
    transition: "border-color 0.15s ease",
  },
  // 한 줄 값(보기·모범 답안·빈칸 정답·해설) 칸: 긴 글도 옆으로 넘기지 않고 칸 안에서 줄바꿈해 보이는 textarea.
  // 값에는 줄바꿈을 넣지 않음(oneLine·blockEnter) — 예전 한 줄 input 과 같은 값
  oneLineArea: {
    display: "block", resize: "none", fieldSizing: "content",
    fontFamily: "inherit", lineHeight: 1.45, overflowWrap: "anywhere",
  },
  optionRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  // 라디오 + ① 묶음: ① 글자를 눌러도 정답이 골라지고 누르는 자리가 넉넉하게
  optionPick: {
    display: "flex", alignItems: "center", gap: 8, minHeight: 40, flexShrink: 0, cursor: "pointer",
  },
  optionRadio: { accentColor: "#60a5fa", cursor: "pointer", width: 18, height: 18, margin: 0 },
  optionNum: { color: "#a0a0a0", fontWeight: 700, width: 20, flexShrink: 0 },
  optionInput: (selected) => ({
    flex: 1, minWidth: 0, padding: "8px 10px",
    background: selected ? "rgba(96,165,250,0.08)" : "#242424",
    border: `1px solid ${selected ? "#60a5fa" : "#2e2e2e"}`,
    borderRadius: 6, fontSize: 13, color: "#f1f1f1", outline: "none",
    transition: "border-color 0.15s ease, background 0.15s ease",
  }),
  oxRow: { display: "flex", gap: 16, marginBottom: 16 },
  oxBtn: (v, selected) => ({
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 72, height: 56, borderRadius: 8, cursor: "pointer",
    fontSize: 24, fontWeight: 800,
    border: `2px solid ${selected ? (v === "O" ? "#34d399" : "#f87171") : "#2e2e2e"}`,
    background: selected
      ? (v === "O" ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)")
      : "#242424",
    color: v === "O" ? "#34d399" : "#f87171",
    transition: "all 0.15s ease",
  }),
  fillHint: {
    fontSize: 13, color: "#555555", marginBottom: 16,
    padding: "10px 12px", background: "#1a1a1a", border: "1px solid #2e2e2e",
    borderRadius: 7, lineHeight: 1.6,
  },
  fillPreviewLabel: { fontSize: 12, color: "#a0a0a0", marginBottom: 8, marginTop: 4 },
  // 문제 칸 바로 아래 한 줄: 빈칸 수 또는 {{ }} 오류(치다 멈춘 뒤 갱신)
  fillStatus: (bad) => ({
    fontSize: 12, lineHeight: 1.5, color: bad ? "#f87171" : "#8a8a8a",
    marginTop: -6, marginBottom: 12, overflowWrap: "anywhere",
  }),
  fillNote: {
    fontSize: 12, lineHeight: 1.5, color: "#f5b544", marginBottom: 12,
    padding: "8px 10px", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 7, background: "rgba(245,158,11,0.08)",
  },

  // 버튼: 화면(편집 패널) 아래에 늘 붙어 있게 — 긴 빈칸 문항(1만 자)에서도 끝까지 내려가지 않고 저장
  btnRow: {
    display: "flex", gap: 10, marginTop: 4,
    position: "sticky", bottom: 0, zIndex: 1,
    background: "#0f0f0f", padding: "10px 0", borderTop: "1px solid #2e2e2e",
  },
  cancelBtn: {
    flex: 1, padding: "10px 0", background: "#242424", color: "#a0a0a0",
    border: "1px solid #2e2e2e", borderRadius: 7, fontWeight: 700,
    cursor: "pointer", fontSize: 14, transition: "opacity 0.15s ease",
  },
  saveBtn: {
    flex: 1, padding: "10px 0", background: "#f59e0b", color: "#000000",
    border: "none", borderRadius: 7, fontWeight: 700,
    cursor: "pointer", fontSize: 14, transition: "opacity 0.15s ease",
  },
  divider: { borderTop: "1px solid #2e2e2e", margin: "16px 0" },

  // 이미지 업로드 UI
  imgSection: { marginBottom: 16 },
  imgUploadLabel: {
    position: "relative", display: "inline-flex", alignItems: "center", gap: 6,
    padding: "8px 16px", background: "#242424",
    border: "2px dashed #2e2e2e", borderRadius: 7,
    fontSize: 13, color: "#a0a0a0", cursor: "pointer",
    transition: "border-color 0.15s ease, color 0.15s ease",
  },
  // file 칸은 보이지 않게만 숨긴다(hidden = display:none 이면 Tab 으로 닿지 않음). 칸 안에 1px 로 겹쳐 두고
  // 누르기는 감싼 label 이 받는다. Tab 으로 오면 Enter·Space 로 파일 고르기가 열린다
  fileInput: {
    position: "absolute", left: 0, top: 0, width: 1, height: 1,
    opacity: 0, overflow: "hidden", pointerEvents: "none",
  },
  imgPreviewWrap: { position: "relative", display: "inline-block", marginTop: 6 },
  imgPreview: {
    display: "block", maxWidth: "100%", maxHeight: 200,
    borderRadius: 8, border: "1px solid #2e2e2e",
  },
  imgDelBtn: {
    position: "absolute", top: 6, right: 6,
    display: "inline-flex", alignItems: "center", minHeight: 36,
    background: "rgba(248,113,113,0.9)", color: "#fff",
    border: "none", borderRadius: 6,
    fontSize: 12, fontWeight: 700, padding: "0 12px", cursor: "pointer",
  },
  // 표 삽입 UI
  tableInsertBtn: {
    display: "inline-flex", alignItems: "center", gap: 6, minHeight: 38,
    padding: "7px 14px", background: "#242424",
    border: "1px dashed #2e2e2e", borderRadius: 7,
    fontSize: 13, color: "#a0a0a0", cursor: "pointer",
    marginBottom: 8, transition: "border-color 0.15s ease, color 0.15s ease",
  },
  tablePanel: {
    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
    padding: "12px 14px", background: "#1a1a1a",
    border: "1px solid #2e2e2e", borderRadius: 8, marginBottom: 16,
  },
  miniLabel: { fontSize: 12, color: "#a0a0a0" },
  numInput: {
    width: 52, minHeight: 36, padding: "6px 8px", background: "#242424",
    border: "1px solid #2e2e2e", borderRadius: 6,
    color: "#f1f1f1", fontSize: 13, textAlign: "center", outline: "none",
  },
  tableConfirmBtn: {
    padding: "6px 16px", minHeight: 36, background: "#f59e0b", color: "#000000",
    border: "none", borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: "pointer",
  },
  answerModeRow: { display: "flex", gap: 6, marginBottom: 14 },
  answerModeBtn: (active) => ({
    padding: "6px 14px", minHeight: 36,
    background: active ? "rgba(245,158,11,0.12)" : "transparent",
    border: `1px solid ${active ? "#f59e0b" : "#2e2e2e"}`,
    borderRadius: 6, fontSize: 12, fontWeight: 700,
    color: active ? "#f59e0b" : "#555555", cursor: "pointer",
    transition: "all 0.15s ease",
  }),
};

function focusGold(e) { e.target.style.borderColor = "#f59e0b"; }
function blurGray(e) { e.target.style.borderColor = "#2e2e2e"; }

// 한 줄 값 칸(textarea + S.oneLineArea): 예전 한 줄 input 처럼 값에 줄바꿈이 들어가지 않게.
// Enter 는 막고(한글 조합 중 Enter 는 그대로 둠), 붙여 넣은 줄바꿈은 지운다(input 과 같은 동작)
const oneLine = (v) => v.replace(/[\r\n]+/g, "");
function blockEnter(e) {
  if (e.key === "Enter" && !e.nativeEvent.isComposing) e.preventDefault();
}

export default function EditorView({ set, onBack, onPreview, onDirtyChange }) {
  const [questions, setQuestions] = useState([]);
  const [form, setForm] = useState(null);
  // 폼을 연 때(또는 저장한 뒤)의 내용(formSig). 지금 폼과 다르면 저장하지 않은 내용이 있다
  const [baseSig, setBaseSig] = useState("");
  const [saving, setSaving] = useState(false);
  // 그림을 올리는 중인 폼(key): { question, answer }. 올리는 동안 폼을 닫거나 바꾸면 그 폼에는 붙이지 않는다
  const [uploading, setUploading] = useState({});
  const [loadError, setLoadError] = useState(""); // 문항 목록을 못 불러왔을 때의 오류(빈 목록과 가리려고)
  const [loadTry, setLoadTry] = useState(0);
  const [fillError, setFillError] = useState(""); // 저장하려다 막힌 {{ }} 오류
  const [showTableInsert, setShowTableInsert] = useState(false);
  const [tableRows, setTableRows] = useState(2);
  const [tableCols, setTableCols] = useState(2);
  const textareaRef = useRef(null);
  const formKeySeq = useRef(0);
  const formRef = useRef(form); // 비동기(저장·그림) 뒤에 지금 열린 폼을 보려고
  useEffect(() => { formRef.current = form; });
  const sidebarRef = useRef(null);
  const editorRef = useRef(null);
  // 키보드 초점 옮기기: 초점이 있던 단추가 사라지거나(줄 지우기·폼 닫기) 숨으면(폭 900px 이하는 목록·폼 중 하나만
  // 보임) 다음 그리기 뒤 보이는 곳으로 — Tab 이 문서 처음(body)부터 다시 시작하지 않게.
  // 값: { id } 그 문항의 목록 줄, "form" 폼 맨 위 '← 문항 목록', 없는 줄이면 첫 유형 단추,
  // { img: "question" | "answer" } 그 그림 칸(data-img) — 그림이 있으면 '✕ 삭제', 없으면 file 칸
  const focusNext = useRef(null);
  const returnFocusId = useRef(null); // 폼을 닫으면 초점을 돌려줄 목록 줄(연 문항 id, 새 문항이면 null)

  // 문항 목록. 늦게 온 옛 응답(다른 문제집)은 버린다
  useEffect(() => {
    let alive = true;
    getQuestions(set.id).then(
      (list) => {
        if (!alive) return;
        setQuestions(list);
        setLoadError("");
      },
      (e) => {
        if (!alive) return;
        console.error(e);
        // 로그인이 끊긴 것이면 App 이 로그인 화면으로 보낸다
        if (e.message !== SESSION_EXPIRED_MESSAGE) setLoadError(e.message || "문항을 불러오지 못했습니다.");
      }
    );
    return () => { alive = false; };
  }, [set.id, loadTry]);

  const dirty = form !== null && formSig(form) !== baseSig;
  // App 에 알림: 뒤로 가기(안드로이드)로 나갈 때 묻는 데 쓴다. 화면을 떠나면 '없음'
  const dirtyCb = useRef(onDirtyChange);
  useEffect(() => { dirtyCb.current = onDirtyChange; });
  useEffect(() => { dirtyCb.current?.(dirty); }, [dirty]);
  useEffect(() => () => dirtyCb.current?.(false), []);

  // 휴대폰(목록·편집을 한 화면에 하나씩)에서 편집 폼을 맨 위부터 보이게. 목록에서 폼을 열 때는 목록의 스크롤 위치를
  // 기억해 두었다가, 폼을 닫으면(취소·← 문항 목록·새 문항 저장) 아래 효과가 그 자리로 되돌린다.
  // 넓은 화면은 페이지가 스크롤되지 않아(scrollY 0) 영향 없음
  const listScrollY = useRef(0);
  function scrollPageTop() {
    if (!form) listScrollY.current = window.scrollY;
    window.scrollTo(0, 0);
  }
  const editing = form !== null;
  const wasEditing = useRef(false);
  useLayoutEffect(() => {
    // 화면을 그리기 전에 되돌려 목록 맨 위가 잠깐 보였다가 튀지 않게. 처음 열 때(폼을 연 적 없음)는 건드리지 않음
    if (wasEditing.current && !editing) window.scrollTo(0, listScrollY.current);
    wasEditing.current = editing;
  }, [editing]);

  // focusNext 처리(위 스크롤 되돌리기 뒤). 초점이 아직 보이는 곳에 있으면 건드리지 않는다 — 넓은 화면에서 목록 줄로
  // 폼을 열면 초점은 그 줄에 그대로. 손가락·펜으로 누른 뒤 옮긴 초점은 :focus-visible 이 아니라 테두리가 안 보인다
  useLayoutEffect(() => {
    const want = focusNext.current;
    if (!want) return;
    focusNext.current = null;
    const shown = (el) => !!el && el.isConnected && el.getClientRects().length > 0;
    const now = document.activeElement;
    if (now && now !== document.body && shown(now)) return;
    let el;
    if (want === "form") el = editorRef.current?.querySelector(".qm-ed-back");
    else if (want.img) el = editorRef.current?.querySelector(`[data-img="${want.img}"]`);
    else {
      el = want.id != null ? sidebarRef.current?.querySelector(`.qm-ed-q[data-qid="${want.id}"]`) : null;
      if (!shown(el)) el = sidebarRef.current?.querySelector("button"); // 그 줄이 없으면 첫 유형 단추(객관식)
    }
    if (!shown(el)) return;
    el.focus({ preventScroll: true });
    // 키보드로 온 초점(테두리가 보임)이 화면·목록 스크롤 칸 밖이면 보이게 — 새 문항을 저장하면 그 줄은 긴 목록 맨 끝에
    // 붙는다. 손가락·펜으로 누른 뒤(:focus-visible 아님)는 스크롤을 건드리지 않는다(되돌린 목록 자리 그대로).
    // file 칸은 1px 이라 감싼 칸(label)째로
    if (el.matches(":focus-visible")) (el.closest(".qm-ed-upload") ?? el).scrollIntoView({ block: "nearest" });
  });

  // 폼 열기·닫기. 폼마다 새 key — 늦게 끝난 그림 올리기·저장이 다른 폼에 붙지 않게
  function openForm(next) {
    const f = { ...next, key: ++formKeySeq.current };
    setForm(f);
    setBaseSig(formSig(f));
    setFillError("");
    returnFocusId.current = next.id ?? null;
    focusNext.current = "form";
  }
  function closeForm() {
    setForm(null);
    setBaseSig("");
    setFillError("");
    focusNext.current = { id: returnFocusId.current };
  }

  // 좁은 화면(폼이 목록을 가림)에서 연 폼은 history 에 한 칸 — 안드로이드 뒤로 가기가 편집기를 떠나지 않고 '← 문항 목록'처럼
  // 목록으로 돌아가게. 저장하지 않은 내용이 있으면 묻고, 남기로 하면 칸을 다시 쌓는다(STAY). 넓은 화면은 목록이 늘 보여 칸 없음
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(NARROW_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(NARROW_QUERY);
    if (!mq) return undefined;
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  useBack(editing && narrow, () => {
    if (dirty && !confirm(LEAVE_MESSAGE)) return STAY;
    closeForm();
  });

  // 다른 문항·유형으로 넘어갈 때 고치던 것이 있으면 묻는다('취소' 단추는 묻지 않음 — 버리려고 누른 것)
  function okToSwitch() {
    return !dirty || confirm(SWITCH_MESSAGE);
  }

  // 유형 버튼 클릭 → 빈 폼 표시 (API 호출 없음)
  function handleSelectType(type) {
    if (!okToSwitch()) return;
    scrollPageTop();
    openForm(emptyForm(type, questions.length));
  }

  // 기존 문항 클릭 → 편집 폼. 빈칸 문항은 글 안에 정답을 넣은 '{{정답}}' 꼴로 고친다(utils/fillInline.js)
  function handleSelectQuestion(q) {
    if (form?.id === q.id) return;
    if (!okToSwitch()) return;
    scrollPageTop();
    const type = normalizeType(q.type);
    const answers = parseAnswers(q.answers);
    let text = q.text || "";
    let fillLock = "";
    let fillExtra = 0;
    if (type === "fill") {
      fillLock = fillLockReason(text, answers);
      if (!fillLock) {
        const r = toInline(text, answers);
        text = r.inline;
        fillExtra = r.extra.length;
      }
    }
    openForm({
      id: q.id,
      type,
      text,
      options: parseOptions(q.options),
      answerIndex: q.answerIndex ?? 0,
      answer: q.answer || "",
      answers,
      fillLock,
      fillExtra,
      explanation: q.explanation || "",
      orderIndex: q.orderIndex,
      questionImageUrl: q.questionImageUrl || "",
      answerImageUrl: q.answerImageUrl || "",
      answerMode: q.answerImageUrl ? "image" : "text",
    });
  }

  // 문제 칸에서 그 자리를 골라 보여 준다({{ }} 오류 자리)
  function selectInText(at, length) {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    try { ta.setSelectionRange(at, at + length); } catch { /* 그대로 */ }
  }

  const byOrder = (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0) || Number(a.id) - Number(b.id);

  // 저장. 성공하면 true. 서버가 돌려준 문항으로 목록의 그 칸만 바꾼다(문항 전체를 다시 받지 않음)
  async function handleSave() {
    if (!form || saving) return false;
    let text = form.text;
    let answers = null;
    if (form.type === "fill") {
      if (form.fillLock) {
        answers = form.answers || [];
      } else {
        const r = fromInline(form.text);
        if (!r.ok) {
          setFillError(r.error);
          selectInText(r.at, r.length);
          return false;
        }
        text = r.text;
        answers = r.answers;
      }
    }
    if (!text.trim()) { alert("문제 내용을 입력해주세요."); return false; }
    const saved = form;
    setSaving(true);
    setFillError("");
    try {
      const payload = {
        type: saved.type,
        text,
        options: saved.type === "multiple" ? JSON.stringify(saved.options) : null,
        answerIndex: saved.type === "multiple" ? saved.answerIndex : null,
        answer: saved.type === "fill" ? null : saved.answer,
        answers: saved.type === "fill" ? answers : null,
        explanation: saved.explanation,
        orderIndex: saved.orderIndex,
        questionImageUrl: saved.questionImageUrl || null,
        answerImageUrl: saved.answerMode === "image" ? (saved.answerImageUrl || null) : null,
      };
      const still = () => formRef.current?.key === saved.key;
      if (saved.id) {
        const q = await updateQuestion(saved.id, payload);
        if (q && q.id != null) setQuestions((list) => list.map((x) => (x.id === q.id ? q : x)));
        else setLoadTry((n) => n + 1);
        // 저장한 그때의 내용이 새 기준(저장하는 동안 더 친 글은 그대로 '저장 안 함'으로 남음)
        if (still()) setBaseSig(formSig(saved));
      } else {
        const q = await addQuestion(set.id, payload);
        if (q && q.id != null) setQuestions((list) => [...list, q].sort(byOrder));
        else setLoadTry((n) => n + 1);
        if (still()) {
          returnFocusId.current = q?.id ?? null; // 닫은 뒤 키보드 초점은 새로 생긴 줄로
          closeForm();
        }
      }
      return true;
    } catch (e) {
      alert(e.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("문항을 삭제할까요?")) return;
    try {
      await deleteQuestion(id);
      setQuestions((list) => list.filter((q) => q.id !== id));
      if (formRef.current?.id === id) closeForm();
      // 눌렀던 ✕ 는 사라지므로 키보드 초점은 그 자리의 다음 줄(마지막 줄이었으면 바로 위 줄)로
      const i = questions.findIndex((q) => q.id === id);
      const near = questions[i + 1] ?? questions[i - 1];
      focusNext.current = { id: near ? near.id : null };
    } catch (e) { alert(e.message); }
  }

  // 이미지 업로드 핸들러 (field: "question" | "answer")
  // 올리는 동안 폼을 닫거나 다른 문항으로 바꾸면 끝난 그림을 붙이지 않는다(폼 key 확인)
  async function handleImageUpload(file, field) {
    if (!file || !form) return;
    const key = form.key;
    setUploading((u) => ({ ...u, [field]: key }));
    try {
      const { url } = await uploadImage(file);
      setForm((f) => (f && f.key === key
        ? { ...f, ...(field === "question" ? { questionImageUrl: url } : { answerImageUrl: url }) }
        : f));
    } catch (e) {
      if (formRef.current?.key === key) alert(e.message);
    } finally {
      // 올리는 동안 file 칸이 꺼져(disabled) 초점이 body 로 빠진다 — 끝나면 그 그림 칸으로(올렸으면 '✕ 삭제',
      // 못 올렸으면 다시 켜진 file 칸). 그 사이 다른 칸으로 옮겼으면 focusNext 처리가 건드리지 않는다
      if (formRef.current?.key === key) focusNext.current = { img: field };
      setUploading((u) => (u[field] === key ? { ...u, [field]: null } : u));
    }
  }

  function setOpt(idx, val) {
    setForm((f) => {
      const opts = [...(f.options ?? ["", "", "", ""])];
      opts[idx] = val;
      return { ...f, options: opts };
    });
  }

  // 글 바꾸기. 빈칸 문항도 글만 바꾼다 — 정답은 글 안의 {{ }} 에 있어 빈칸을 지우거나 끼워도 밀리지 않는다
  function applyTextChange(newText) {
    setForm((f) => ({ ...f, text: newText }));
    if (fillError) setFillError("");
  }

  function handleTextChange(e) {
    applyTextChange(e.target.value);
  }

  // 표 삽입: textarea 커서 위치에 행×열 템플릿 삽입
  function insertTable() {
    const ta = textareaRef.current;
    const template = buildTableTemplate(tableRows, tableCols);
    const pos = ta ? ta.selectionStart : form.text.length;
    const newText = form.text.slice(0, pos) + template + form.text.slice(pos);
    applyTextChange(newText);
    setShowTableInsert(false);
    requestAnimationFrame(() => {
      if (!ta) return;
      const newPos = pos + template.length;
      ta.focus();
      ta.setSelectionRange(newPos, newPos);
    });
  }

  // 화면의 ← (문제집 목록으로): 저장하지 않은 내용이 있으면 묻는다
  function handleBack() {
    if (dirty && !confirm(LEAVE_MESSAGE)) return;
    onBack();
  }

  // 미리보기는 저장된 내용을 서버에서 다시 읽어 보여 준다 — 고치던 것이 있으면 저장하고 갈지 묻는다
  async function handlePreview() {
    if (dirty) {
      if (!confirm(PREVIEW_MESSAGE)) return;
      if (!(await handleSave())) return;
    }
    onPreview(set);
  }

  // 미리보기(표·빈칸)는 글을 치다 멈춘 뒤에만 다시 그린다 — 빈칸 수백 개 페이지를 타자마다 다시 만들지 않게
  const formKey = form?.key ?? 0;
  const settledText = useSettled(form?.text ?? "", formKey, PREVIEW_DELAY_MS);
  const isFill = form?.type === "fill";
  const fillLock = isFill ? form.fillLock : "";
  const lockedAnswers = isFill && fillLock ? form.answers : null;
  const fillParsed = useMemo(() => {
    if (!isFill) return null;
    if (fillLock) return { ok: true, text: settledText, answers: lockedAnswers || [] };
    return fromInline(settledText);
  }, [isFill, fillLock, lockedAnswers, settledText]);
  const fillPreview = useMemo(() => {
    if (!fillParsed?.ok || !fillParsed.text.includes("___")) return null;
    return <FillText key={formKey} text={fillParsed.text} answers={fillParsed.answers} mode="learn" answered={false} />;
  }, [fillParsed, formKey]);

  const isEdit = !!form?.id;
  const opts = form?.options ?? ["", "", "", ""];
  const fillBlankCount = fillParsed?.ok ? fillParsed.answers.length : 0;
  const uploadingQ = !!form && uploading.question === form.key;
  const uploadingA = !!form && uploading.answer === form.key;

  return (
    <div style={S.page} className="qm-ed-page">
      <nav style={S.nav} className="qm-ed-nav">
        <div style={S.navLeft}>
          <button
            style={S.backBtn}
            onClick={handleBack}
            onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.color = "#f1f1f1"; }}
            onPointerLeave={(e) => { e.currentTarget.style.color = "#a0a0a0"; }}
            aria-label="문제집 목록으로"
            title="문제집 목록으로"
          >←</button>
          <span style={S.navTitle} className="qm-ed-title" title={set.title}>{set.title}</span>
        </div>
        {/* 휴대폰에서는 단추 글씨를 줄임(.qm-wide-only 숨김): '미리보기' */}
        <div style={S.navRight}>
          <button
            style={S.previewBtn}
            className="qm-ed-nav-btn"
            onClick={handlePreview}
            disabled={saving}
            onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.7"; }}
            onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
          ><span className="qm-wide-only">출력 </span>미리보기</button>
        </div>
      </nav>

      <div className="qm-ed-layout" data-editing={form ? "true" : "false"}>
        {/* ── 사이드바 ── */}
        <div style={S.sidebar} className="qm-ed-sidebar" ref={sidebarRef}>
          <div style={S.addBtns}>
            {["multiple", "short", "ox", "fill"].map((type) => (
              <button
                key={type}
                style={S.typeBtn(TYPE_COLOR[type].text)}
                onClick={() => handleSelectType(type)}
                onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.background = TYPE_COLOR[type].bg; }}
                onPointerLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                {TYPE_LABEL[type]}
              </button>
            ))}
          </div>

          {loadError && (
            <div style={S.loadError} role="alert">
              문항을 불러오지 못했습니다. ({loadError})
              <button style={S.retryBtn} onClick={() => setLoadTry((n) => n + 1)}>다시 시도</button>
            </div>
          )}
          {questions.length === 0 ? (
            !loadError && <div style={S.sideEmpty}>문항을 추가해보세요</div>
          ) : (
            // 줄마다 진짜 단추(Tab·Enter·Space), 지금 연 문항은 aria-current. 단추 안은 span(단추 안에 div 를 두지 않음)
            <ul style={S.qList} aria-label="문항 목록">
              {questions.map((q, i) => {
                const active = form?.id === q.id;
                return (
                  <li key={q.id} style={S.qItem(active, normalizeType(q.type))}>
                    <button
                      type="button"
                      className="qm-ed-q"
                      data-qid={q.id}
                      style={S.qPick}
                      aria-current={active ? "true" : undefined}
                      onClick={() => handleSelectQuestion(q)}
                    >
                      <span style={S.qNum}>{i + 1}번 · {TYPE_LABEL[normalizeType(q.type)]}</span>
                      <span style={S.qText}>{plainPreview(q.text, 40) || "(내용 없음)"}</span>
                    </button>
                    <button
                      type="button"
                      className="qm-ed-q-del"
                      style={S.qDel}
                      onClick={() => handleDelete(q.id)}
                      onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.color = "#f87171"; }}
                      onPointerLeave={(e) => { e.currentTarget.style.color = "#555555"; }}
                      aria-label={`${i + 1}번 문항 삭제`}
                      title="문항 삭제"
                    >✕</button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── 편집 패널 ── */}
        <div style={S.editor} className="qm-ed-editor" ref={editorRef}>
          {!form ? (
            <div style={S.idle}>
              위에서 유형을 선택해 새 문항을 작성하거나,<br />
              목록에서 문항을 클릭해 편집하세요.
            </div>
          ) : (
            <>
              <button className="qm-ed-back" style={S.edBackBtn} onClick={closeForm}>
                ← 문항 목록
              </button>
              <div style={S.typeBadge(form.type)}>{TYPE_LABEL[form.type]}</div>
              <div style={S.modeLabel}>{isEdit ? "문항 편집" : "새 문항 작성"}</div>

              {/* 문제 텍스트 */}
              <label style={S.fieldLabel} htmlFor="qm-ed-text">
                문제
                {isFill && !fillLock && (
                  <span style={{ color: "#f59e0b", fontSize: 11, fontWeight: 400, marginLeft: 8 }}>
                    빈칸은 {"{{정답}}"} 처럼 글 안에 정답을 넣어 표시
                  </span>
                )}
              </label>
              {isFill && fillLock && (
                <div style={S.fillNote} role="note">
                  {fillLock} 이 편집기에서는 글·빈칸 정답을 고칠 수 없습니다. 해설·그림만 고칠 수 있고, 글은 노션에서 고쳐 다시 올려 주세요.
                </div>
              )}
              {isFill && !fillLock && form.fillExtra > 0 && (
                <div style={S.fillNote} role="note">
                  저장된 정답이 빈칸보다 {form.fillExtra}개 많습니다. 저장하면 남는 정답은 지워집니다.
                </div>
              )}
              <textarea
                id="qm-ed-text"
                ref={textareaRef}
                style={S.textarea}
                value={form.text}
                onChange={handleTextChange}
                readOnly={isFill && !!fillLock}
                onFocus={focusGold}
                onBlur={blurGray}
                placeholder={
                  isFill
                    ? "예: 가식 완료 후 {{흙}}을 덮어 {{30}}cm 간격으로 심는다."
                    : "문제를 입력하세요"
                }
              />
              <div
                className="qm-fine-only"
                style={{ fontSize: 11, color: "#3a3a3a", textAlign: "right", marginTop: -12, marginBottom: 12 }}
              >
                ↕ 우하단 모서리를 드래그하여 크기 조절
              </div>
              {/* 빈칸 문항: 빈칸 수 또는 {{ }} 오류(치다 멈춘 뒤). 저장하려다 막힌 오류가 먼저 */}
              {isFill && !fillLock && (fillError || (fillParsed && settledText.trim())) && (
                <div style={S.fillStatus(!!fillError || !fillParsed?.ok)} role={fillError ? "alert" : undefined} data-fill-status="">
                  {fillError || (fillParsed.ok ? `빈칸 ${fillBlankCount}개` : fillParsed.error)}
                </div>
              )}

              {/* ── 표 삽입 ── */}
              <button
                type="button"
                style={S.tableInsertBtn}
                onClick={() => setShowTableInsert((v) => !v)}
                onPointerEnter={(e) => { if (e.pointerType !== "mouse") return; e.currentTarget.style.borderColor = "#f59e0b"; e.currentTarget.style.color = "#f59e0b"; }}
                onPointerLeave={(e) => { e.currentTarget.style.borderColor = "#2e2e2e"; e.currentTarget.style.color = "#a0a0a0"; }}
              >
                🔲 표 삽입
              </button>

              {showTableInsert && (
                <div style={S.tablePanel}>
                  {/* 글씨를 눌러도 칸에 초점(htmlFor), 초점이 오면 다른 칸처럼 테두리가 금색 */}
                  <label style={S.miniLabel} htmlFor="qm-ed-table-rows">행</label>
                  <input
                    id="qm-ed-table-rows"
                    type="number" min={1} max={10}
                    value={tableRows}
                    onChange={(e) => setTableRows(Math.max(1, Number(e.target.value) || 1))}
                    onFocus={focusGold}
                    onBlur={blurGray}
                    style={S.numInput}
                  />
                  <label style={S.miniLabel} htmlFor="qm-ed-table-cols">열</label>
                  <input
                    id="qm-ed-table-cols"
                    type="number" min={1} max={10}
                    value={tableCols}
                    onChange={(e) => setTableCols(Math.max(1, Number(e.target.value) || 1))}
                    onFocus={focusGold}
                    onBlur={blurGray}
                    style={S.numInput}
                  />
                  <button type="button" style={S.tableConfirmBtn} onClick={insertTable}>삽입</button>
                </div>
              )}

              {/* ── 표 미리보기 (FILL 유형은 아래 학습 미리보기에서 함께 표시) ── */}
              {!isFill && settledText.includes("|") && (
                <div style={{ marginBottom: 16 }}>
                  <div style={S.fillPreviewLabel}>💡 표 미리보기</div>
                  <div style={{
                    padding: "14px 16px", background: "#1a1a1a",
                    border: "1px solid #2e2e2e", borderRadius: 8,
                    color: "#f1f1f1", fontSize: 14,
                  }}>
                    <TableAwareText text={settledText} />
                  </div>
                </div>
              )}

              {/* ── 문제 이미지 (선택) ── */}
              <div style={S.imgSection}>
                <label style={{ ...S.fieldLabel, marginBottom: 6 }}>
                  문제 이미지&nbsp;
                  <span style={{ color: "#555", fontWeight: 400, fontSize: 11 }}>(선택)</span>
                </label>
                {form.questionImageUrl ? (
                  <div style={S.imgPreviewWrap}>
                    <img src={form.questionImageUrl} style={S.imgPreview} alt="문제 이미지" />
                    {/* 지우면 이 단추가 사라지므로 초점은 다시 생기는 file 칸으로(data-img, focusNext) */}
                    <button
                      style={S.imgDelBtn}
                      data-img="question"
                      onClick={() => { setForm((f) => ({ ...f, questionImageUrl: "" })); focusNext.current = { img: "question" }; }}
                    >✕ 삭제</button>
                  </div>
                ) : (
                  <label
                    style={S.imgUploadLabel}
                    className="qm-ed-upload"
                    onPointerEnter={(e) => { if (e.pointerType !== "mouse") return; e.currentTarget.style.borderColor = "#f59e0b"; e.currentTarget.style.color = "#f59e0b"; }}
                    onPointerLeave={(e) => { e.currentTarget.style.borderColor = "#2e2e2e"; e.currentTarget.style.color = "#a0a0a0"; }}
                  >
                    {uploadingQ ? "⏳ 업로드 중..." : "📷 이미지 업로드"}
                    <input
                      type="file" accept={IMAGE_ACCEPT} style={S.fileInput}
                      data-img="question"
                      disabled={uploadingQ}
                      onChange={(e) => { handleImageUpload(e.target.files[0], "question"); e.target.value = ""; }}
                    />
                  </label>
                )}
              </div>

              {/* ── 답안 방식 선택 ── */}
              {/* 묶음 이름은 칸에 이어지는 label 이 아니라 글(div) + role=group — 눌린 쪽은 aria-pressed */}
              <div id="qm-ed-answer-mode" style={{ ...S.fieldLabel, marginBottom: 6 }}>답안 방식</div>
              <div style={S.answerModeRow} role="group" aria-labelledby="qm-ed-answer-mode">
                <button
                  style={S.answerModeBtn(form.answerMode !== "image")}
                  aria-pressed={form.answerMode !== "image"}
                  onClick={() => setForm((f) => ({ ...f, answerMode: "text" }))}
                >기본 답안</button>
                <button
                  style={S.answerModeBtn(form.answerMode === "image")}
                  aria-pressed={form.answerMode === "image"}
                  onClick={() => setForm((f) => ({ ...f, answerMode: "image" }))}
                >이미지 답안</button>
              </div>

              {/* ── 이미지 답안 업로드 ── */}
              {form.answerMode === "image" && (
                <div style={S.imgSection}>
                  {form.answerImageUrl ? (
                    <div style={S.imgPreviewWrap}>
                      <img src={form.answerImageUrl} style={S.imgPreview} alt="답안 이미지" />
                      <button
                        style={S.imgDelBtn}
                        data-img="answer"
                        onClick={() => { setForm((f) => ({ ...f, answerImageUrl: "" })); focusNext.current = { img: "answer" }; }}
                      >✕ 삭제</button>
                    </div>
                  ) : (
                    <label
                      style={S.imgUploadLabel}
                      className="qm-ed-upload"
                      onPointerEnter={(e) => { if (e.pointerType !== "mouse") return; e.currentTarget.style.borderColor = "#f59e0b"; e.currentTarget.style.color = "#f59e0b"; }}
                      onPointerLeave={(e) => { e.currentTarget.style.borderColor = "#2e2e2e"; e.currentTarget.style.color = "#a0a0a0"; }}
                    >
                      {uploadingA ? "⏳ 업로드 중..." : "📷 답안 이미지 업로드"}
                      <input
                        type="file" accept={IMAGE_ACCEPT} style={S.fileInput}
                        data-img="answer"
                        disabled={uploadingA}
                        onChange={(e) => { handleImageUpload(e.target.files[0], "answer"); e.target.value = ""; }}
                      />
                    </label>
                  )}
                </div>
              )}

              {/* ── 객관식 ── */}
              {form.type === "multiple" && form.answerMode !== "image" && (
                <>
                  <div id="qm-ed-options" style={S.fieldLabel}>보기 (정답 라디오 선택)</div>
                  <div role="group" aria-labelledby="qm-ed-options">
                    {opts.map((opt, i) => (
                      <div key={i} style={S.optionRow}>
                        <label style={S.optionPick}>
                          <input
                            type="radio"
                            name="answerIndex"
                            checked={form.answerIndex === i}
                            onChange={() => setForm((f) => ({ ...f, answerIndex: i }))}
                            style={S.optionRadio}
                            aria-label={`${i + 1}번 보기를 정답으로`}
                          />
                          <span style={S.optionNum} aria-hidden="true">{"①②③④"[i]}</span>
                        </label>
                        <textarea
                          rows={1}
                          style={{ ...S.optionInput(form.answerIndex === i), ...S.oneLineArea }}
                          value={opt}
                          onChange={(e) => setOpt(i, oneLine(e.target.value))}
                          onKeyDown={blockEnter}
                          placeholder={`보기 ${i + 1}`}
                          aria-label={`보기 ${i + 1}`}
                          onFocus={(e) => { e.target.style.borderColor = "#60a5fa"; }}
                          onBlur={(e) => {
                            e.target.style.borderColor = form.answerIndex === i ? "#60a5fa" : "#2e2e2e";
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* ── 주관식 ── */}
              {form.type === "short" && form.answerMode !== "image" && (
                <>
                  <label style={S.fieldLabel} htmlFor="qm-ed-answer">모범 답안</label>
                  <textarea
                    id="qm-ed-answer"
                    rows={1}
                    style={{ ...S.input, ...S.oneLineArea }}
                    value={form.answer}
                    onChange={(e) => setForm((f) => ({ ...f, answer: oneLine(e.target.value) }))}
                    onKeyDown={blockEnter}
                    onFocus={focusGold}
                    onBlur={blurGray}
                    placeholder="모범 답안을 입력하세요"
                  />
                </>
              )}

              {/* ── O/X ── */}
              {form.type === "ox" && form.answerMode !== "image" && (
                <>
                  <div id="qm-ed-ox" style={S.fieldLabel}>정답</div>
                  <div style={S.oxRow} role="group" aria-labelledby="qm-ed-ox">
                    {["O", "X"].map((v) => (
                      <button
                        key={v}
                        style={S.oxBtn(v, form.answer === v)}
                        aria-pressed={form.answer === v}
                        onClick={() => setForm((f) => ({ ...f, answer: v }))}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* ── 빈칸 채우기 ── */}
              {/* ── 빈칸 채우기: 정답은 문제 글 안의 {{정답}}. 아래는 치다 멈춘 뒤 다시 그리는 학습 미리보기 ── */}
              {isFill && form.answerMode !== "image" && (
                fillBlankCount === 0 && fillParsed?.ok ? (
                  <div style={S.fillHint}>
                    문제 글에{" "}
                    <span style={{ color: "#f59e0b", fontWeight: 700 }}>{"{{정답}}"}</span>
                    {" "}처럼 정답을 넣으면 그 자리가 빈칸이 됩니다.
                  </div>
                ) : fillPreview && (
                  <>
                    <div style={{ ...S.divider, marginTop: 20 }} />
                    <div style={S.fillPreviewLabel}>💡 학습 미리보기</div>
                    <div style={{
                      padding: "14px 16px", background: "#1a1a1a",
                      border: "1px solid #2e2e2e", borderRadius: 8, marginBottom: 16,
                    }}>
                      {fillPreview}
                    </div>
                  </>
                )
              )}

              {/* ── 해설 (공통) ── */}
              <label style={S.fieldLabel} htmlFor="qm-ed-explanation">해설 (선택)</label>
              <textarea
                id="qm-ed-explanation"
                rows={1}
                style={{ ...S.input, ...S.oneLineArea, marginBottom: 20 }}
                value={form.explanation}
                onChange={(e) => setForm((f) => ({ ...f, explanation: oneLine(e.target.value) }))}
                onKeyDown={blockEnter}
                onFocus={focusGold}
                onBlur={blurGray}
                placeholder="해설을 입력하세요 (선택)"
              />

              {/* ── 버튼 ── */}
              <div style={S.btnRow}>
                <button
                  style={S.cancelBtn}
                  onClick={closeForm}
                  onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.7"; }}
                  onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                >취소</button>
                <button
                  style={S.saveBtn}
                  onClick={handleSave}
                  disabled={saving}
                  onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.85"; }}
                  onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                >{saving ? "저장 중..." : "저장"}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
