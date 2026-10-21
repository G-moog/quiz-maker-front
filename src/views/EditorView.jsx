import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { getQuestions, addQuestion, updateQuestion, deleteQuestion } from "../api/quiz";
import { IMAGE_ACCEPT, uploadImage } from "../api/image";
import FillText from "../components/FillText";
import TableAwareText from "../components/TableAwareText";
import { buildTableTemplate, plainPreview } from "../utils/textBlocks";
import { SESSION_EXPIRED_MESSAGE } from "../utils/session";

const TYPE_LABEL = { multiple: "객관식", short: "주관식", ox: "O/X", fill: "빈칸 채우기" };

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

function parseAnswers(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

// 화면 폭에 따라 바뀌는 배치(.qm-ed-*)는 index.css 참고: 넓은 화면은 왼쪽 목록 + 오른쪽 편집,
// 폭 900px 이하(휴대폰·태블릿 세로)는 목록과 편집 폼을 한 화면에 하나씩 전체 폭으로 보여 준다.
// 마우스 올림 효과는 마우스에서만 켠다(onPointerEnter + pointerType) — 휴대폰에서 누른 뒤 흐린 채 남지 않게.
const S = {
  page: { minHeight: "100vh", background: "#0f0f0f", fontFamily: "system-ui, sans-serif" },
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
  qItem: (active, type) => ({
    padding: "12px 16px", borderBottom: "1px solid #2e2e2e", cursor: "pointer",
    background: active ? "#242424" : "#1a1a1a",
    borderLeft: `3px solid ${active ? (TYPE_COLOR[type]?.border ?? "#f59e0b") : "transparent"}`,
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    transition: "background 0.15s ease",
  }),
  qBody: { flex: 1, minWidth: 0 },
  qNum: { fontSize: 11, color: "#555555", marginBottom: 3 },
  qText: { fontSize: 13, color: "#f1f1f1", fontWeight: 500, lineHeight: 1.4, overflowWrap: "anywhere" },
  // 누르는 자리 40×40, 음수 여백으로 보이는 ✕ 위치는 거의 그대로
  qDel: {
    background: "none", border: "none", color: "#555555",
    cursor: "pointer", fontSize: 16, padding: 0, flexShrink: 0,
    width: 40, height: 40, margin: "-10px -12px -10px 4px",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    transition: "color 0.15s ease",
  },
  sideEmpty: { color: "#555555", fontSize: 13, textAlign: "center", padding: "32px 16px" },
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
  idle: { color: "#555555", textAlign: "center", marginTop: 80, fontSize: 15 },
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
  // 빈칸 정답 입력 행
  fillAnswerRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  fillAnswerLabel: { color: "#f59e0b", fontWeight: 700, fontSize: 12, minWidth: 44, flexShrink: 0 },
  fillHint: {
    fontSize: 13, color: "#555555", marginBottom: 16,
    padding: "10px 12px", background: "#1a1a1a", border: "1px solid #2e2e2e",
    borderRadius: 7, lineHeight: 1.6,
  },
  fillPreviewLabel: { fontSize: 12, color: "#a0a0a0", marginBottom: 8, marginTop: 4 },

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
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "8px 16px", background: "#242424",
    border: "2px dashed #2e2e2e", borderRadius: 7,
    fontSize: 13, color: "#a0a0a0", cursor: "pointer",
    transition: "border-color 0.15s ease, color 0.15s ease",
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

export default function EditorView({ set, onBack, onPreview }) {
  const [questions, setQuestions] = useState([]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingQ, setUploadingQ] = useState(false); // 문제 이미지 업로드 중
  const [uploadingA, setUploadingA] = useState(false); // 답안 이미지 업로드 중
  const [loadError, setLoadError] = useState(""); // 문항 목록을 못 불러왔을 때의 오류(빈 목록과 가리려고)
  const [showTableInsert, setShowTableInsert] = useState(false);
  const [tableRows, setTableRows] = useState(2);
  const [tableCols, setTableCols] = useState(2);
  const textareaRef = useRef(null);

  useEffect(() => { fetchQ(); }, []);

  async function fetchQ() {
    try {
      setQuestions(await getQuestions(set.id));
      setLoadError("");
    } catch (e) {
      console.error(e);
      // 로그인이 끊긴 것이면 App 이 로그인 화면으로 보낸다
      if (e.message !== SESSION_EXPIRED_MESSAGE) setLoadError(e.message || "문항을 불러오지 못했습니다.");
    }
  }

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

  // 유형 버튼 클릭 → 빈 폼 표시 (API 호출 없음)
  function handleSelectType(type) {
    setForm(emptyForm(type, questions.length));
    scrollPageTop();
  }

  // 기존 문항 클릭 → 편집 폼
  function handleSelectQuestion(q) {
    scrollPageTop();
    setForm({
      id: q.id,
      type: normalizeType(q.type),
      text: q.text || "",
      options: parseOptions(q.options),
      answerIndex: q.answerIndex ?? 0,
      answer: q.answer || "",
      answers: parseAnswers(q.answers),
      explanation: q.explanation || "",
      orderIndex: q.orderIndex,
      questionImageUrl: q.questionImageUrl || "",
      answerImageUrl: q.answerImageUrl || "",
      answerMode: q.answerImageUrl ? "image" : "text",
    });
  }

  // 저장
  async function handleSave() {
    if (!form) return;
    if (!form.text.trim()) { alert("문제 내용을 입력해주세요."); return; }
    setSaving(true);
    try {
      const payload = {
        type: form.type,
        text: form.text,
        options: form.type === "multiple" ? JSON.stringify(form.options) : null,
        answerIndex: form.type === "multiple" ? form.answerIndex : null,
        answer: form.type === "fill" ? null : form.answer,
        answers: form.type === "fill" ? (form.answers || []) : null,
        explanation: form.explanation,
        orderIndex: form.orderIndex,
        questionImageUrl: form.questionImageUrl || null,
        answerImageUrl: form.answerMode === "image" ? (form.answerImageUrl || null) : null,
      };
      if (form.id) {
        await updateQuestion(form.id, payload);
      } else {
        await addQuestion(set.id, payload);
        setForm(null);
      }
      await fetchQ();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!confirm("문항을 삭제할까요?")) return;
    try {
      await deleteQuestion(id);
      if (form?.id === id) setForm(null);
      fetchQ();
    } catch (e) { alert(e.message); }
  }

  // 이미지 업로드 핸들러 (field: "question" | "answer")
  async function handleImageUpload(file, field) {
    if (!file) return;
    if (field === "question") setUploadingQ(true); else setUploadingA(true);
    try {
      const { url } = await uploadImage(file);
      setForm((f) => ({
        ...f,
        ...(field === "question" ? { questionImageUrl: url } : { answerImageUrl: url }),
      }));
    } catch (e) {
      alert(e.message);
    } finally {
      if (field === "question") setUploadingQ(false); else setUploadingA(false);
    }
  }

  function setOpt(idx, val) {
    const opts = [...(form.options ?? ["", "", "", ""])];
    opts[idx] = val;
    setForm((f) => ({ ...f, options: opts }));
  }

  // 텍스트 반영: fill 타입이면 ___ 개수에 맞춰 answers 배열 자동 조정
  function applyTextChange(newText) {
    if (form.type === "fill") {
      const count = (newText.match(/___/g) || []).length;
      const cur = form.answers || [];
      setForm((f) => ({
        ...f,
        text: newText,
        answers: Array.from({ length: count }, (_, i) => cur[i] ?? ""),
      }));
    } else {
      setForm((f) => ({ ...f, text: newText }));
    }
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

  const isEdit = !!form?.id;
  const opts = form?.options ?? ["", "", "", ""];
  const fillBlankCount = form?.type === "fill" ? (form.text.match(/___/g) || []).length : 0;

  return (
    <div style={S.page}>
      <nav style={S.nav} className="qm-ed-nav">
        <div style={S.navLeft}>
          <button
            style={S.backBtn}
            onClick={onBack}
            onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.color = "#f1f1f1"; }}
            onPointerLeave={(e) => { e.currentTarget.style.color = "#a0a0a0"; }}
          >←</button>
          <span style={S.navTitle} className="qm-ed-title" title={set.title}>{set.title}</span>
        </div>
        {/* 휴대폰에서는 단추 글씨를 줄임(.qm-wide-only 숨김): '미리보기' */}
        <div style={S.navRight}>
          <button
            style={S.previewBtn}
            className="qm-ed-nav-btn"
            onClick={() => onPreview(set)}
            onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.7"; }}
            onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
          ><span className="qm-wide-only">출력 </span>미리보기</button>
        </div>
      </nav>

      <div className="qm-ed-layout" data-editing={form ? "true" : "false"}>
        {/* ── 사이드바 ── */}
        <div style={S.sidebar} className="qm-ed-sidebar">
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
              <button style={S.retryBtn} onClick={fetchQ}>다시 시도</button>
            </div>
          )}
          {questions.length === 0 ? (
            !loadError && <div style={S.sideEmpty}>문항을 추가해보세요</div>
          ) : (
            questions.map((q, i) => (
              <div
                key={q.id}
                style={S.qItem(form?.id === q.id, normalizeType(q.type))}
                onClick={() => handleSelectQuestion(q)}
              >
                <div style={S.qBody}>
                  <div style={S.qNum}>{i + 1}번 · {TYPE_LABEL[normalizeType(q.type)]}</div>
                  <div style={S.qText}>{plainPreview(q.text, 40) || "(내용 없음)"}</div>
                </div>
                <button
                  style={S.qDel}
                  onClick={(e) => handleDelete(e, q.id)}
                  onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.color = "#f87171"; }}
                  onPointerLeave={(e) => { e.currentTarget.style.color = "#555555"; }}
                >✕</button>
              </div>
            ))
          )}
        </div>

        {/* ── 편집 패널 ── */}
        <div style={S.editor} className="qm-ed-editor">
          {!form ? (
            <div style={S.idle}>
              위에서 유형을 선택해 새 문항을 작성하거나,<br />
              목록에서 문항을 클릭해 편집하세요.
            </div>
          ) : (
            <>
              <button className="qm-ed-back" style={S.edBackBtn} onClick={() => setForm(null)}>
                ← 문항 목록
              </button>
              <div style={S.typeBadge(form.type)}>{TYPE_LABEL[form.type]}</div>
              <div style={S.modeLabel}>{isEdit ? "문항 편집" : "새 문항 작성"}</div>

              {/* 문제 텍스트 */}
              <label style={S.fieldLabel}>
                문제
                {form.type === "fill" && (
                  <span style={{ color: "#f59e0b", fontSize: 11, fontWeight: 400, marginLeft: 8 }}>
                    빈칸은 ___ 로 표시 (자동 감지)
                  </span>
                )}
              </label>
              <textarea
                ref={textareaRef}
                style={S.textarea}
                value={form.text}
                onChange={handleTextChange}
                onFocus={focusGold}
                onBlur={blurGray}
                placeholder={
                  form.type === "fill"
                    ? "예: 가식 완료 후 ___을 덮어 ___cm 간격으로 심는다."
                    : "문제를 입력하세요"
                }
              />
              <div
                className="qm-fine-only"
                style={{ fontSize: 11, color: "#3a3a3a", textAlign: "right", marginTop: -12, marginBottom: 12 }}
              >
                ↕ 우하단 모서리를 드래그하여 크기 조절
              </div>

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
                  <span style={S.miniLabel}>행</span>
                  <input
                    type="number" min={1} max={10}
                    value={tableRows}
                    onChange={(e) => setTableRows(Math.max(1, Number(e.target.value) || 1))}
                    style={S.numInput}
                  />
                  <span style={S.miniLabel}>열</span>
                  <input
                    type="number" min={1} max={10}
                    value={tableCols}
                    onChange={(e) => setTableCols(Math.max(1, Number(e.target.value) || 1))}
                    style={S.numInput}
                  />
                  <button type="button" style={S.tableConfirmBtn} onClick={insertTable}>삽입</button>
                </div>
              )}

              {/* ── 표 미리보기 (FILL 유형은 아래 학습 미리보기에서 함께 표시) ── */}
              {form.type !== "fill" && form.text.includes("|") && (
                <div style={{ marginBottom: 16 }}>
                  <div style={S.fillPreviewLabel}>💡 표 미리보기</div>
                  <div style={{
                    padding: "14px 16px", background: "#1a1a1a",
                    border: "1px solid #2e2e2e", borderRadius: 8,
                    color: "#f1f1f1", fontSize: 14,
                  }}>
                    <TableAwareText text={form.text} />
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
                    <button
                      style={S.imgDelBtn}
                      onClick={() => setForm((f) => ({ ...f, questionImageUrl: "" }))}
                    >✕ 삭제</button>
                  </div>
                ) : (
                  <label
                    style={S.imgUploadLabel}
                    onPointerEnter={(e) => { if (e.pointerType !== "mouse") return; e.currentTarget.style.borderColor = "#f59e0b"; e.currentTarget.style.color = "#f59e0b"; }}
                    onPointerLeave={(e) => { e.currentTarget.style.borderColor = "#2e2e2e"; e.currentTarget.style.color = "#a0a0a0"; }}
                  >
                    {uploadingQ ? "⏳ 업로드 중..." : "📷 이미지 업로드"}
                    <input
                      type="file" accept={IMAGE_ACCEPT} hidden
                      disabled={uploadingQ}
                      onChange={(e) => { handleImageUpload(e.target.files[0], "question"); e.target.value = ""; }}
                    />
                  </label>
                )}
              </div>

              {/* ── 답안 방식 선택 ── */}
              <label style={{ ...S.fieldLabel, marginBottom: 6 }}>답안 방식</label>
              <div style={S.answerModeRow}>
                <button
                  style={S.answerModeBtn(form.answerMode !== "image")}
                  onClick={() => setForm((f) => ({ ...f, answerMode: "text" }))}
                >기본 답안</button>
                <button
                  style={S.answerModeBtn(form.answerMode === "image")}
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
                        onClick={() => setForm((f) => ({ ...f, answerImageUrl: "" }))}
                      >✕ 삭제</button>
                    </div>
                  ) : (
                    <label
                      style={S.imgUploadLabel}
                      onPointerEnter={(e) => { if (e.pointerType !== "mouse") return; e.currentTarget.style.borderColor = "#f59e0b"; e.currentTarget.style.color = "#f59e0b"; }}
                      onPointerLeave={(e) => { e.currentTarget.style.borderColor = "#2e2e2e"; e.currentTarget.style.color = "#a0a0a0"; }}
                    >
                      {uploadingA ? "⏳ 업로드 중..." : "📷 답안 이미지 업로드"}
                      <input
                        type="file" accept={IMAGE_ACCEPT} hidden
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
                  <label style={S.fieldLabel}>보기 (정답 라디오 선택)</label>
                  {opts.map((opt, i) => (
                    <div key={i} style={S.optionRow}>
                      <label style={S.optionPick}>
                        <input
                          type="radio"
                          name="answerIndex"
                          checked={form.answerIndex === i}
                          onChange={() => setForm((f) => ({ ...f, answerIndex: i }))}
                          style={S.optionRadio}
                        />
                        <span style={S.optionNum}>{"①②③④"[i]}</span>
                      </label>
                      <textarea
                        rows={1}
                        style={{ ...S.optionInput(form.answerIndex === i), ...S.oneLineArea }}
                        value={opt}
                        onChange={(e) => setOpt(i, oneLine(e.target.value))}
                        onKeyDown={blockEnter}
                        placeholder={`보기 ${i + 1}`}
                        onFocus={(e) => { e.target.style.borderColor = "#60a5fa"; }}
                        onBlur={(e) => {
                          e.target.style.borderColor = form.answerIndex === i ? "#60a5fa" : "#2e2e2e";
                        }}
                      />
                    </div>
                  ))}
                </>
              )}

              {/* ── 주관식 ── */}
              {form.type === "short" && form.answerMode !== "image" && (
                <>
                  <label style={S.fieldLabel}>모범 답안</label>
                  <textarea
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
                  <label style={S.fieldLabel}>정답</label>
                  <div style={S.oxRow}>
                    {["O", "X"].map((v) => (
                      <button
                        key={v}
                        style={S.oxBtn(v, form.answer === v)}
                        onClick={() => setForm((f) => ({ ...f, answer: v }))}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* ── 빈칸 채우기 ── */}
              {form.type === "fill" && form.answerMode !== "image" && (
                <>
                  {fillBlankCount === 0 ? (
                    <div style={S.fillHint}>
                      문제에{" "}
                      <span style={{ color: "#f59e0b", fontWeight: 700 }}>___</span>
                      {" "}를 입력하면 빈칸 정답 입력창이 자동으로 나타납니다.
                    </div>
                  ) : (
                    <>
                      <label style={S.fieldLabel}>빈칸 정답 ({fillBlankCount}개)</label>
                      {(form.answers || []).map((ans, i) => (
                        <div key={i} style={S.fillAnswerRow}>
                          <span style={S.fillAnswerLabel}>빈칸{i + 1}</span>
                          <textarea
                            rows={1}
                            style={{ ...S.input, ...S.oneLineArea, marginBottom: 0, flex: 1, minWidth: 0 }}
                            value={ans}
                            onChange={(e) => {
                              const next = [...(form.answers || [])];
                              next[i] = oneLine(e.target.value);
                              setForm((f) => ({ ...f, answers: next }));
                            }}
                            onKeyDown={blockEnter}
                            onFocus={focusGold}
                            onBlur={blurGray}
                            placeholder={`빈칸 ${i + 1}의 정답`}
                          />
                        </div>
                      ))}

                      {/* 학습 미리보기 */}
                      {form.text.includes("___") && (
                        <>
                          <div style={{ ...S.divider, marginTop: 20 }} />
                          <div style={S.fillPreviewLabel}>💡 학습 미리보기</div>
                          <div style={{
                            padding: "14px 16px", background: "#1a1a1a",
                            border: "1px solid #2e2e2e", borderRadius: 8, marginBottom: 16,
                          }}>
                            <FillText
                              key={form.text + (form.answers || []).join(",")}
                              text={form.text}
                              answers={form.answers || []}
                              mode="learn"
                              answered={false}
                            />
                          </div>
                        </>
                      )}
                    </>
                  )}
                </>
              )}

              {/* ── 해설 (공통) ── */}
              <label style={S.fieldLabel}>해설 (선택)</label>
              <textarea
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
                  onClick={() => setForm(null)}
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
