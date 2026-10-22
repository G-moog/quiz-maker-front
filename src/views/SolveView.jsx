import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from "react";
import { getQuestions } from "../api/quiz";
import { listNotes } from "../api/notes";
import { parseAnswers } from "../utils/answers";
import TableAwareText from "../components/TableAwareText";
import FillBlank from "../components/FillBlank";
import QuestionNoteSheet from "../components/QuestionNoteSheet";
import SolveToc from "../components/SolveToc";
import { PencilIcon } from "../components/NoteIcons";
import { plainPreview, textModel } from "../utils/textBlocks";
import { blankContext, questionContext } from "../utils/notes";
import { clearStudy, loadStudy, saveStudy } from "../utils/studyState";
import { GRADED_TYPES, initialSolveState, normalizeType, questionHash, studySnapshot, blankCountOf } from "../utils/solveStudy";
import { applyAnchor, captureAnchor, pulse, readingProgress, scrollElTo } from "../utils/solveScroll";
import { useWakeLock } from "../utils/wakeLock";
import InkSurface from "../ink/InkSurface";
import InkNotices from "../ink/InkNotices";
import { InkModeButton, InkToolbar } from "../ink/InkToolbar";
import { useInk } from "../ink/useInk";
import { loadInkMode, saveInkMode } from "../ink/inkMode";
import { SESSION_EXPIRED_MESSAGE } from "../utils/session";
import "./solve.css";

const TYPE_LABEL = { multiple: "객관식", short: "주관식", ox: "O/X", fill: "빈칸 채우기" };

// 빈칸 문항 본문이 이 글자 수보다 길면(휴대폰 한 화면을 넘는 정도) 문항 머리에도 '모두 보기/가리기' 토글을 둔다.
// 짧은 문항은 본문 바로 아래 단추 두 개로 충분 — 작은 카드에 같은 일을 하는 단추가 셋이 되지 않게
const LONG_FILL_CHARS = 500;
// 빈칸이 이만큼 이상이면 오른쪽 아래에 '↓ 빈칸'(다음 가린 빈칸으로) 단추
const NEXT_BLANK_MIN = 10;
// 이어 보기 안내(머리 줄 아래 작은 띠)를 보여 두는 시간
const RESUME_CHIP_MS = 7000;
// 다시 열었을 때 읽던 자리를 맞춘 뒤, 늦게 바뀌는 배치(필기를 불러와 빈칸 폭이 바뀜·그림)를 따라 다시 맞추는 시간.
// 사용자가 손대면(누름·휠·키·직접 스크롤) 바로 그만둔다
const RESTORE_SETTLE_MS = 4000;
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩";
const NO_ANSWERS = [];

const TYPE_COLOR = {
  multiple: { text: "#60a5fa", bg: "rgba(96,165,250,0.1)" },
  short:    { text: "#34d399", bg: "rgba(52,211,153,0.1)" },
  ox:       { text: "#f87171", bg: "rgba(248,113,113,0.1)" },
  fill:     { text: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
};

// FILL 빈칸 버튼 모양은 components/FillBlank.jsx (펜 시험 페이지와 함께 씀)

// 보기 목록: 배열이 아닌 값(JSON 문자열 "abc" 등)이 와도 화면이 멈추지 않게 빈 목록으로
function parseOptions(opts) {
  if (!opts) return [];
  if (Array.isArray(opts)) return opts;
  try {
    const v = JSON.parse(opts);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function scoreColor(rate) {
  if (rate >= 80) return "#34d399";
  if (rate >= 60) return "#f59e0b";
  return "#f87171";
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 읽는 줄: 위에 붙어 있는 머리 묶음(머리 줄 + 도구 막대 + 진행 막대)의 아래 끝.
// 묶음은 화면 맨 위(top 0)에 붙으므로 그 높이 — 지금 위치(bottom)로 재면 맨 위에서는 묶음 위의 띠(미리보기 안내 등)만큼
// 아래로 잡혀, 스크롤한 뒤(묶음이 붙은 뒤) 목차·빈칸 이동이 그만큼 어긋났다
const lineOf = (head) => (head ? head.getBoundingClientRect().height : 0);

const MODES = [
  { key: "ordered", icon: "📋", title: "순번대로", desc: "문제집에 저장된\n순서대로 풀기" },
  { key: "random",  icon: "🔀", title: "랜덤 배치", desc: "문제 순서를\n무작위로 섞어 풀기" },
];

// 화면 폭에 따라 바뀌는 여백·글자 크기(.qm-solve-*, .qm-result-*, .qm-mode-page)는 index.css, 풀기 화면에만 쓰는 것은 ./solve.css.
// 마우스 올림 효과는 마우스에서만 켠다(onPointerEnter + pointerType) — 휴대폰에서 누른 뒤 흐린 채 남지 않게.
const S = {
  page: { minHeight: "100vh", background: "#0f0f0f", fontFamily: "system-ui, sans-serif" },
  // 문항 풀기 화면의 위쪽 묶음(머리줄 + 필기 모드일 때 도구 막대 + 진행 막대 + 그 아래 겹쳐 뜨는 필기 안내·이어 보기 띠)을 함께 띄운다.
  // 진행 막대도 묶음 안 — 읽은 정도를 늘 보이게(예전에는 머리 줄 아래 글 흐름에 있어 내리면 사라졌다. 전체 높이는 같음)
  head: { position: "sticky", top: 0, zIndex: 10 },
  // 머리줄: ← 목록으로 | 제목(가운데, 최대 두 줄) | 진행 (+ 필기 모드). 덩어리가 맞닿거나 쪼개지지 않게
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
    minHeight: 44, whiteSpace: "nowrap",
    transition: "color 0.15s ease",
  },
  // 줄 수는 index.css: .qm-solve-title 두 줄, .qm-solve-title--ink(필기 모드 단추가 있는 머리 줄)는 좁은 휴대폰에서 세 줄
  navTitle: {
    flex: "1 1 0", minWidth: 0, textAlign: "center",
    fontWeight: 700, color: "#f1f1f1", lineHeight: 1.3,
    display: "-webkit-box", WebkitBoxOrient: "vertical", overflow: "hidden",
    overflowWrap: "anywhere",
  },
  navProgress: { fontSize: 13, color: "#a0a0a0", fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 },
  progressBar: { height: 3, background: "#2e2e2e" },
  progressFill: (pct) => ({
    height: "100%", background: "#f59e0b",
    width: `${pct}%`, transition: "width 0.3s ease",
  }),
  // 읽은 정도 막대(문항 하나짜리 빈칸 문제집): 폭은 스크롤할 때 직접 바꾼다(렌더 없이)
  readFill: { height: "100%", width: 0, background: "#f59e0b" },
  // 이어 보기 안내: 머리 묶음 바로 아래에 겹쳐 띄운다(글 흐름 밖 — 생기거나 사라질 때 글이 움직이지 않게)
  chipBand: {
    position: "absolute", top: "100%", left: 0, right: 0,
    display: "flex", justifyContent: "center", padding: "6px 12px 0", pointerEvents: "none",
  },
  chip: {
    pointerEvents: "auto", maxWidth: "100%",
    display: "inline-flex", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: 6,
    padding: "4px 4px 4px 12px", borderRadius: 8,
    background: "#211c12", border: "1px solid rgba(245,158,11,0.45)", boxShadow: "0 6px 18px rgba(0,0,0,0.5)",
    color: "#e8c27a", fontSize: 12.5, fontWeight: 600, lineHeight: 1.4,
  },
  chipBtn: {
    height: 30, padding: "0 10px", borderRadius: 6, whiteSpace: "nowrap",
    background: "#2a2a2a", border: "1px solid #3a3a3a", color: "#f1f1f1",
    fontSize: 12.5, fontWeight: 700, cursor: "pointer",
  },
  chipClose: {
    width: 30, height: 30, borderRadius: 6, background: "transparent", border: "none",
    color: "#8a8a8a", fontSize: 14, cursor: "pointer",
  },
  body: { maxWidth: 680, margin: "0 auto" },
  card: {
    background: "#1a1a1a", borderRadius: 12,
    border: "1px solid #2e2e2e",
    boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
    overflow: "hidden",
  },
  resultBanner: (correct) => ({
    padding: "12px 20px",
    background: correct ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)",
    borderBottom: `1px solid ${correct ? "#34d399" : "#f87171"}`,
    color: correct ? "#34d399" : "#f87171",
    fontWeight: 700, fontSize: 14,
    display: "flex", alignItems: "center", gap: 8,
  }),
  qMeta: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 },
  // 문항 머리 오른쪽 묶음: 목차 · 모두 보기/가리기
  qMetaBtns: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 },
  // 본문이 긴 빈칸 문항(LONG_FILL_CHARS): 본문 위에서도 모두 보기/가리기 (긴 페이지 끝까지 내려가지 않아도 되게)
  revealToggleBtn: {
    padding: "6px 12px", minHeight: 36,
    background: "transparent", color: "#f59e0b",
    border: "1px solid #f59e0b", borderRadius: 7,
    fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
    transition: "opacity 0.15s ease",
  },
  qNum: { fontWeight: 800, fontSize: 15, color: "#f59e0b" },
  typeBadge: (type) => ({
    display: "inline-block", fontSize: 11, fontWeight: 700,
    borderRadius: 4, padding: "2px 7px",
    background: TYPE_COLOR[type]?.bg ?? "rgba(245,158,11,0.1)",
    color: TYPE_COLOR[type]?.text ?? "#f59e0b",
  }),
  qText: {
    fontSize: 16, color: "#f1f1f1", lineHeight: 1.7,
    fontWeight: 500, marginBottom: 24,
  },
  // 빈칸 문항 본문. 줄 간격 2.1: 번호 단추(높이 약 28px)가 줄(31.5px) 안에 들어가 줄이 들쭉날쭉하지 않는 가장 촘촘한 값
  fillText: { fontSize: 15, lineHeight: 2.1, color: "#f1f1f1", wordBreak: "keep-all" },
  // 객관식 보기
  optionBtn: (state) => {
    const base = {
      width: "100%", padding: "12px 16px", marginBottom: 10,
      borderRadius: 8, fontSize: 14, textAlign: "left",
      cursor: state === "disabled" ? "default" : "pointer",
      fontWeight: 500, display: "flex", alignItems: "center", gap: 12,
      transition: "border-color 0.15s ease, background 0.15s ease",
    };
    if (state === "correct")
      return { ...base, background: "rgba(52,211,153,0.1)", border: "1px solid #34d399", color: "#34d399" };
    if (state === "wrong")
      return { ...base, background: "rgba(248,113,113,0.1)", border: "1px solid #f87171", color: "#f87171" };
    if (state === "dim")
      return { ...base, background: "#242424", border: "1px solid #2e2e2e", color: "#f1f1f1", opacity: 0.35 };
    // default (unanswered)
    return { ...base, background: "#242424", border: "1px solid #2e2e2e", color: "#f1f1f1" };
  },
  optionCircle: { fontWeight: 700, flexShrink: 0 },
  // 주관식
  shortRow: { display: "flex", gap: 10, marginBottom: 8 },
  shortInput: {
    flex: 1, minWidth: 0, padding: "10px 14px",
    background: "#242424", border: "1px solid #2e2e2e",
    borderRadius: 8, fontSize: 14, color: "#f1f1f1", outline: "none",
    transition: "border-color 0.15s ease",
  },
  submitBtn: {
    padding: "10px 20px", flexShrink: 0, whiteSpace: "nowrap",
    background: "#f59e0b", color: "#000000",
    border: "none", borderRadius: 8,
    fontWeight: 700, fontSize: 14, cursor: "pointer",
    transition: "opacity 0.15s ease",
  },
  // O/X
  oxRow: { display: "flex", gap: 16, marginBottom: 8 },
  oxBtn: (v, selected, answered) => ({
    flex: 1, padding: "20px 0",
    borderRadius: 10, cursor: answered ? "default" : "pointer",
    fontSize: 28, fontWeight: 800, textAlign: "center",
    border: `2px solid ${v === "O" ? "#34d399" : "#f87171"}`,
    background: !answered
      ? (v === "O" ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)")
      : selected
        ? (v === "O" ? "rgba(52,211,153,0.18)" : "rgba(248,113,113,0.18)")
        : "transparent",
    color: v === "O" ? "#34d399" : "#f87171",
    opacity: answered && !selected ? 0.35 : 1,
    transition: "opacity 0.15s ease, background 0.15s ease",
  }),
  // 정답 표시
  correctAnswer: { fontSize: 14, color: "#34d399", marginTop: 14, fontWeight: 600 },
  // 해설/다음 버튼 영역
  actionRow: { display: "flex", gap: 10, marginTop: 20 },
  hintBtn: {
    padding: "10px 18px",
    background: "#242424", color: "#a0a0a0",
    border: "1px solid #2e2e2e", borderRadius: 8,
    fontWeight: 600, fontSize: 13, cursor: "pointer",
    transition: "opacity 0.15s ease",
  },
  nextBtn: {
    flex: 1, padding: "10px 0",
    background: "#f59e0b", color: "#000000",
    border: "none", borderRadius: 8,
    fontWeight: 700, fontSize: 14, cursor: "pointer",
    transition: "opacity 0.15s ease",
  },
  explanationBox: {
    marginTop: 14,
    background: "rgba(245,158,11,0.08)",
    border: "1px solid #f59e0b",
    borderRadius: 8, padding: "12px 16px",
    color: "#a0a0a0", fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap",
  },
  // 로딩/빈 문항
  center: { textAlign: "center", padding: "80px 20px", color: "#555555", fontSize: 15 },
  // 불러오기 실패(빈 문제집으로 숨기지 않음)
  loadError: {
    textAlign: "center", padding: "64px 20px", color: "#f87171", fontSize: 15, lineHeight: 1.6,
    overflowWrap: "anywhere",
  },
  loadRetryBtn: {
    marginTop: 14, padding: "8px 18px", minHeight: 40, borderRadius: 7, border: "1px solid #f87171",
    background: "none", color: "#f87171", fontSize: 14, fontWeight: 700, cursor: "pointer",
  },

  // ── 결과 화면 ──
  resultPage: { maxWidth: 680, margin: "0 auto" },
  resultCard: {
    background: "#1a1a1a", border: "1px solid #2e2e2e",
    borderRadius: 16,
    boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
  },
  resultTop: { textAlign: "center", marginBottom: 32 },
  resultEmoji: { fontSize: 52, marginBottom: 12 },
  resultHeading: { fontSize: 22, fontWeight: 800, color: "#f1f1f1", marginBottom: 24 },
  scoreNum: (rate) => ({
    fontSize: 52, fontWeight: 800, color: scoreColor(rate),
    lineHeight: 1, marginBottom: 8,
  }),
  scoreRate: (rate) => ({
    fontSize: 18, fontWeight: 700, color: scoreColor(rate), marginBottom: 32,
  }),
  // 채점할 문항이 없을 때(페이지 빈칸 문제집 등): 빨간 '0 / 0' 대신
  studyDone: { fontSize: 28, fontWeight: 800, color: "#f59e0b", lineHeight: 1.2, marginBottom: 8 },
  studySub: { fontSize: 14, fontWeight: 600, color: "#a0a0a0", marginBottom: 24 },
  noGradeNote: { fontSize: 12, color: "#8a8a8a", marginTop: 4 },
  resultList: { marginBottom: 32 },
  resultListTitle: { fontSize: 14, fontWeight: 600, color: "#a0a0a0", marginBottom: 12 },
  resultItem: { display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  resultIcon: (correct) => ({
    flexShrink: 0, width: 22, height: 22,
    borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 12, fontWeight: 800,
    background: correct ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)",
    color: correct ? "#34d399" : "#f87171",
  }),
  resultItemText: { fontSize: 14, color: "#a0a0a0", lineHeight: 1.5, paddingTop: 2 },
  resultBtns: { display: "flex", gap: 12 },
  retryBtn: {
    flex: 1, padding: "12px 0",
    background: "#242424", color: "#a0a0a0",
    border: "1px solid #2e2e2e", borderRadius: 8,
    fontWeight: 700, fontSize: 14, cursor: "pointer",
    transition: "opacity 0.15s ease",
  },
  backToDashBtn: {
    flex: 1, padding: "12px 0",
    background: "#f59e0b", color: "#000000",
    border: "none", borderRadius: 8,
    fontWeight: 700, fontSize: 14, cursor: "pointer",
    transition: "opacity 0.15s ease",
  },
  // ── 모드 선택 화면 ──
  modeSelectPage: { maxWidth: 480, margin: "0 auto" },
  modeSelectTitle: { fontSize: 13, color: "#a0a0a0", fontWeight: 600, marginBottom: 6 },
  modeSelectSetName: { fontSize: 22, fontWeight: 800, color: "#f1f1f1", marginBottom: 8, overflowWrap: "anywhere" },
  modeSelectCount: { fontSize: 13, color: "#8a8a8a", marginBottom: 40 },
  modeCards: { display: "flex", gap: 14 },
  // 카드는 단추(라디오) — 키보드(Tab·화살표·Space)로도 고른다
  modeCard: (active) => ({
    flex: 1, padding: "24px 20px", borderRadius: 12, cursor: "pointer",
    border: `2px solid ${active ? "#f59e0b" : "#2e2e2e"}`,
    background: active ? "rgba(245,158,11,0.06)" : "#1a1a1a",
    transition: "border-color 0.15s ease, background 0.15s ease",
    textAlign: "center", fontFamily: "inherit", color: "inherit",
  }),
  modeCardIcon: { display: "block", fontSize: 32, marginBottom: 12 },
  modeCardTitle: { display: "block", fontSize: 15, fontWeight: 800, color: "#f1f1f1", marginBottom: 6 },
  modeCardDesc: { display: "block", fontSize: 12, color: "#8a8a8a", lineHeight: 1.5, whiteSpace: "pre-line" },
  modeStartBtn: {
    width: "100%", marginTop: 28, padding: "14px 0",
    background: "#f59e0b", color: "#000",
    border: "none", borderRadius: 10,
    fontWeight: 800, fontSize: 15, cursor: "pointer",
    transition: "opacity 0.15s ease",
  },

  // 이미지 표시
  qImage: {
    display: "block", maxWidth: "100%", borderRadius: 8,
    border: "1px solid #2e2e2e", marginBottom: 20,
  },
  answerImgToggleBtn: (open) => ({
    display: "flex", alignItems: "center", gap: 6,
    padding: "10px 20px", marginBottom: 10,
    background: open ? "rgba(245,158,11,0.15)" : "#242424",
    border: `1px solid ${open ? "#f59e0b" : "#2e2e2e"}`,
    borderRadius: 8, fontWeight: 700, fontSize: 14,
    color: open ? "#f59e0b" : "#a0a0a0", cursor: "pointer",
    transition: "all 0.15s ease",
  }),
  // 열고 닫기: 줄 높이 0fr ↔ 1fr 로 펼쳐 세로로 긴 이미지(휴대폰 화면 사진)도 끝까지 보이게
  // (예전 max-height 600 은 그보다 긴 이미지 아래를 잘랐다)
  answerImgBox: (open) => ({
    display: "grid",
    gridTemplateRows: open ? "1fr" : "0fr",
    transition: "grid-template-rows 0.35s ease",
  }),
  answerImgInner: { overflow: "hidden", minHeight: 0 },
  answerImg: {
    display: "block", maxWidth: "100%", borderRadius: 8,
    border: "1px solid #2e2e2e", marginBottom: 8,
  },
  // FILL 학습 모드 버튼
  revealAllBtn: {
    padding: "10px 16px", minHeight: 40,
    background: "#f59e0b", color: "#000000",
    border: "none", borderRadius: 7,
    fontWeight: 700, fontSize: 13, cursor: "pointer",
    transition: "opacity 0.15s ease",
  },
  hideAllBtn: {
    padding: "10px 16px", minHeight: 40,
    background: "#242424", color: "#a0a0a0",
    border: "1px solid #2e2e2e", borderRadius: 7,
    fontWeight: 700, fontSize: 13, cursor: "pointer",
    transition: "opacity 0.15s ease",
  },
  // 질문 메모: 오른쪽 아래에 떠 있는 단추(자리·안전 여백은 index.css 의 .qm-note-fab)
  // 높이 40: 손가락으로 누르기 넉넉하면서 본문을 덜 가리게(휴대폰에서는 글자를 숨겨 아이콘·수만)
  noteFab: {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
    height: 40, minWidth: 42, borderRadius: 8, // 좌우 여백은 index.css .qm-note-fab(화면 폭마다 다름)
    background: "#242424", border: "1px solid #f59e0b", color: "#f59e0b",
    fontWeight: 700, fontSize: 13.5, cursor: "pointer", whiteSpace: "nowrap",
    boxShadow: "0 6px 18px rgba(0,0,0,0.55)",
  },
  // '↓ 빈칸': 메모 단추 바로 위(자리는 solve.css .qm-next-fab). 같은 모양, 조금 낮게(36)
  nextFab: {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
    height: 36, minWidth: 42, borderRadius: 8,
    background: "#242424", border: "1px solid #f59e0b", color: "#f59e0b",
    fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
    boxShadow: "0 6px 18px rgba(0,0,0,0.55)",
  },
  noteFabCount: {
    minWidth: 19, height: 19, padding: "0 5px", borderRadius: 5,
    background: "#f59e0b", color: "#000", fontSize: 12, fontWeight: 800,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
  },
  // 메모 단추 바로 위 가운데. info: 알림(성공·실패가 아닌 안내 — '가린 빈칸이 더 없습니다' 등)
  toast: (type) => ({
    position: "fixed", left: 0, right: 0, margin: "0 auto", width: "fit-content", zIndex: 300,
    bottom: "calc(72px + env(safe-area-inset-bottom, 0px))", maxWidth: "calc(100% - 32px)",
    padding: "10px 18px", borderRadius: 8, fontSize: 14, fontWeight: 600, textAlign: "center",
    border: `1px solid ${type === "error" ? "#f87171" : type === "info" ? "#3a3a3a" : "#34d399"}`,
    background: type === "error" ? "#2a1515" : type === "info" ? "#242424" : "#11261d",
    color: type === "error" ? "#f87171" : type === "info" ? "#e0e0e0" : "#34d399",
    boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
  }),
};

export default function SolveView({ set, onBack }) {
  const setId = set.id;
  const [baseQuestions, setBaseQuestions] = useState([]); // 서버가 준 순서(순번대로·다시 풀기에 씀)
  const [questions, setQuestions] = useState([]); // 푸는 순서(랜덤이면 섞인 것)
  const [loadingQ, setLoadingQ] = useState(true);
  const [loadError, setLoadError] = useState(""); // 불러오기 실패 — '문항이 없습니다'와 가린다
  const [currentIndex, setCurrentIndex] = useState(0);
  // results: { [index]: { correct: bool, userAnswer: string } }
  const [results, setResults] = useState({});
  const [showExplanation, setShowExplanation] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [fillRevealed, setFillRevealed] = useState([]); // FILL 빈칸 공개 상태
  const [showAnswerImage, setShowAnswerImage] = useState(false); // 답안 이미지 토글
  const [done, setDone] = useState(false);
  const [mode, setMode] = useState(null);       // null | "ordered" | "random"
  const [modeChoice, setModeChoice] = useState("ordered"); // 모드 선택 화면 임시 상태
  // 질문 메모: 마지막으로 누른 빈칸 { qid: 문항 id, i: 빈칸 번호(0부터) }, 열린 메모 창의 정보, 이 문제집의 미해결 메모 수
  const [lastBlank, setLastBlank] = useState(null);
  const [noteInfo, setNoteInfo] = useState(null);
  const [noteCount, setNoteCount] = useState(null);
  const [toast, setToast] = useState(null);
  const [resumeChip, setResumeChip] = useState(false); // '지난번 읽던 곳에서 이어 봅니다' 띠
  const toastTimer = useRef(null);
  // 필기 모드(S펜): 켬/끔은 이 기기에 기억(inkMode.js). 필기는 문항마다 이 기기(IndexedDB)에 — src/ink/
  const [inkOn, setInkOn] = useState(loadInkMode);
  const [username] = useState(() => localStorage.getItem("username") || "");

  const headRef = useRef(null); // 위에 붙은 머리 묶음(아래 끝 = 읽는 줄)
  const bodyRef = useRef(null); // 문항 카드 본문(읽던 자리·읽은 정도의 기준)
  const barRef = useRef(null); // 읽은 정도 막대
  const live = useRef(null); // 이벤트(스크롤·화면 가려짐·떠남)에서 읽는 지금 상태 — 렌더마다 갱신
  const restoreRef = useRef(null); // 다시 열 때 맞출 읽던 자리 { qid, anchor } — 맞추는 동안(늦은 배치 변화 포함)만 둔다
  const saveTimer = useRef(0);
  const lastJump = useRef(null); // '↓ 빈칸'으로 마지막에 간 빈칸 { i, y } — 그 뒤 스크롤하지 않았으면 다음 번호부터

  // 문항 불러오기. loadTry 를 올리면('다시 시도') 다시 부른다.
  // 이 기기에 남은 공부 기록이 지금 문항 묶음과 맞으면 이어 보고(문항·순서·연 빈칸·읽던 자리), 아니면 문항이 하나면 바로 시작
  const [loadTry, setLoadTry] = useState(0);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await getQuestions(setId);
        if (!alive) return;
        const list = Array.isArray(data) ? data : [];
        const saved = loadStudy(username, setId);
        const init = initialSolveState(saved, list);
        setBaseQuestions(list);
        setQuestions(init.questions);
        setMode(init.mode);
        setCurrentIndex(init.index);
        setResults(init.results);
        setFillRevealed(init.revealed);
        setDone(false);
        setLoadError("");
        const cq = init.questions[init.index];
        restoreRef.current = init.resumed && init.anchor && cq ? { qid: cq.id, anchor: init.anchor } : null;
        setResumeChip(init.resumed);
        // 열 때마다 '마지막으로 본 때'(대시보드)를 남긴다 — 이어 볼 기록이면 그대로, 아니면 새로
        saveStudy(username, setId, init.resumed ? saved : { ids: list.map((q) => String(q.id)) });
      } catch (e) {
        console.error(e);
        // 로그인이 끊긴 것이면 App 이 로그인 화면으로 보낸다
        if (alive && e.message !== SESSION_EXPIRED_MESSAGE) setLoadError(e.message || "문항을 불러오지 못했습니다.");
      } finally {
        if (alive) setLoadingQ(false);
      }
    })();
    return () => { alive = false; };
  }, [setId, loadTry, username]);

  function retryLoad() {
    setLoadingQ(true);
    setLoadError("");
    setLoadTry((n) => n + 1);
  }

  // 메모 수는 덤 — 못 불러오면(백엔드 배포 전 등) 단추에 숫자만 안 보인다
  useEffect(() => {
    let alive = true;
    listNotes({ status: "open", setId })
      .then((list) => { if (alive && Array.isArray(list)) setNoteCount(list.length); })
      .catch(() => {});
    return () => { alive = false; };
  }, [setId]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  function showToast(message, type = "success") {
    clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  const current = questions[currentIndex];
  const currentId = current ? current.id : null;
  const answered = results[currentIndex] !== undefined;
  const result = results[currentIndex];
  // 백엔드 타입명 정규화 (short_answer → short, multiple_choice → multiple 등)
  const qtype = normalizeType(current?.type);
  const isFill = qtype === "fill";
  const showing = !loadingQ && !loadError && mode !== null && !done && !!current;

  // 필기: 열쇠 "<아이디>:<문제집 id>:<문항 id>"(하드 문제집은 id 가 달라 필기도 따로).
  // 본문 지문이 저장 때와 다르면(문항을 고침) 예전 필기는 숨긴다 — 빈칸 문항은 정답도 넣는다(빈칸 폭이 정답 길이를 따름).
  // 지문은 이어 보기 기록도 같은 값을 쓴다(utils/solveStudy.js questionHash — 예전 계산과 같은 값)
  const inkKey = current ? `${username}:${setId}:${current.id}` : null;
  const inkHash = useMemo(() => questionHash(current), [current]);
  const [ink, hasInk] = useInk(inkKey, inkHash);
  const inkActive = inkOn && showing;
  // 필기 층: 필기 모드를 켰거나, 이 문항에 보여 줄 필기가 있을 때(이때 빈칸은 열고 닫아도 크기가 그대로 — FillBlank fixed)
  const inkLayer = inkActive || hasInk;
  // 긴 페이지를 읽는 동안 화면이 꺼지지 않게
  useWakeLock(showing);

  // FILL 학습 모드 관련 (채점 없이 토글 방식). 문항이 바뀔 때만 계산(24KB 페이지를 렌더마다 다시 나누지 않게)
  const fillAnswers = useMemo(
    () => (current && normalizeType(current.type) === "fill" ? parseAnswers(current.answers) : NO_ANSWERS),
    [current],
  );
  const fillBlankCount = useMemo(() => blankCountOf(current), [current]);
  const fillHeadings = useMemo(
    () => (current && normalizeType(current.type) === "fill" ? textModel(current.text).headings : []),
    [current],
  );
  // fillRevealed 길이가 문항 빈칸 수와 다를 경우 자동 보정(같은 배열을 돌려줘 본문이 다시 그려지지 않게)
  const fillRev = useMemo(
    () => (fillRevealed.length === fillBlankCount ? fillRevealed : Array(fillBlankCount).fill(false)),
    [fillRevealed, fillBlankCount],
  );
  const fillLong = isFill && (current?.text || "").length > LONG_FILL_CHARS;
  const showToc = fillLong && !current?.answerImageUrl && fillHeadings.filter((h) => h.kind !== "title").length >= 2;
  const showNext = showing && isFill && !current.answerImageUrl && fillBlankCount >= NEXT_BLANK_MIN;
  // 문항 하나짜리 빈칸 문제집(노션 페이지): 머리 줄은 '연 빈칸/전체', 막대는 읽은 정도
  const singleFill = questions.length === 1 && isFill && fillBlankCount > 0;
  const revealedCount = singleFill ? fillRev.reduce((n, v) => n + (v ? 1 : 0), 0) : 0;

  // 이벤트 처리기가 읽는 지금 상태
  useLayoutEffect(() => {
    live.current = {
      ready: !loadingQ && !loadError, base: baseQuestions, questions, mode, index: currentIndex,
      results, revealed: fillRev, done, qid: currentId, n: fillBlankCount,
    };
  });

  // 공부 기록 저장: 지금 상태 + 읽던 자리(화면에서 잼). 다시 연 자리를 맞추는 중이면 맞추려는 자리를 그대로
  const persist = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = 0;
    const s = live.current;
    if (!s || !s.ready || !s.base.length) return;
    const r = restoreRef.current;
    const anchor = r && String(r.qid) === String(s.qid)
      ? r.anchor
      : captureAnchor(bodyRef.current, lineOf(headRef.current));
    saveStudy(username, setId, studySnapshot({ ...s, anchor }));
  }, [username, setId]);
  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persist, 500);
  }, [persist]);

  // 상태가 바뀌면(빈칸 열고 닫기·문항 이동·채점·끝냄) 0.5초 뒤 저장
  useEffect(() => {
    scheduleSave();
  }, [scheduleSave, mode, currentIndex, results, fillRev, done, questions]);

  // 앱이 가려지거나(홈 화면·다른 앱) 닫힐 때는 바로 저장
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") persist(); };
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [persist]);
  // 화면을 떠날 때(목록으로·뒤로 가기): layout 정리 단계라 본문이 아직 붙어 있어 읽던 자리를 잴 수 있다
  useLayoutEffect(() => () => persist(), [persist]);

  // 창(목차·메모)을 닫으며 history 를 한 칸 되돌릴 때(backStack release) 크롬이 스크롤을 그 칸을 쌓을 때의 자리로
  // 되돌려 목차로 간 자리를 덮던 것은 backStack 이 앱 전체를 history.scrollRestoration = "manual" 로 두어 막는다.
  // (예전처럼 이 화면만 바꿨다 되돌리면 효과 순서 때문에 목록 화면 칸에 manual 이 남거나 auto 로 돌아가 떠나는 길마다 달랐다)

  // 스크롤: 0.5초 멈추면 저장, 읽은 정도 막대(문항 하나짜리 빈칸 문제집)는 그림마다 직접 갱신(렌더 없이)
  useEffect(() => {
    if (!showing) return undefined;
    let raf = 0;
    const update = () => {
      raf = 0;
      if (singleFill && barRef.current) {
        const p = readingProgress(bodyRef.current, lineOf(headRef.current));
        barRef.current.style.width = `${(p * 100).toFixed(1)}%`;
      }
    };
    const onScroll = () => {
      scheduleSave();
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    raf = requestAnimationFrame(update);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [showing, singleFill, scheduleSave]);

  // 다시 열었을 때 읽던 자리로: 본문을 그린 뒤(다음 그림) 맞추고, 늦게 바뀌는 배치(필기를 불러와 빈칸 폭이 바뀜·그림 로드)를
  // RESTORE_SETTLE_MS 동안 따라가며 다시 맞춘다. 사용자가 손대거나 직접 스크롤하면 그만둔다
  useEffect(() => {
    const r = restoreRef.current;
    const body = bodyRef.current;
    if (!showing || !r || !body || String(r.qid) !== String(currentId)) return undefined;
    let raf = 0;
    let expected = null;
    let stopped = false;
    const apply = () => {
      raf = 0;
      applyAnchor(body, lineOf(headRef.current), r.anchor);
      expected = window.scrollY;
    };
    const ro = typeof ResizeObserver === "function"
      ? new ResizeObserver(() => { if (!raf && !stopped) raf = requestAnimationFrame(apply); })
      : null;
    const USER = ["wheel", "touchstart", "pointerdown", "keydown"];
    const stop = () => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      clearTimeout(timer);
      for (const t of USER) window.removeEventListener(t, finish, true);
      window.removeEventListener("scroll", onScroll);
    };
    // 다 맞췄거나 사용자가 손댐: 맞추던 자리를 내려놓는다(이제부터 저장은 화면에서 잰 자리)
    function finish() {
      stop();
      if (restoreRef.current === r) restoreRef.current = null;
    }
    function onScroll() {
      if (expected !== null && !raf && Math.abs(window.scrollY - expected) > 2) finish();
    }
    const timer = setTimeout(finish, RESTORE_SETTLE_MS);
    raf = requestAnimationFrame(apply);
    ro?.observe(body);
    for (const t of USER) window.addEventListener(t, finish, { capture: true, passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    // 정리(StrictMode 의 두 번 실행 포함)에서는 자리를 버리지 않는다 — 다시 실행되면 이어서 맞춤
    return stop;
  }, [showing, currentId]);

  useEffect(() => {
    if (!resumeChip) return undefined;
    const t = setTimeout(() => setResumeChip(false), RESUME_CHIP_MS);
    return () => clearTimeout(t);
  }, [resumeChip]);

  function toggleInk() {
    const next = !inkOn;
    setInkOn(next);
    saveInkMode(next);
  }

  // 빈칸 하나 열고 닫기. 고정된 함수(빈칸 230개의 FillBlank memo 가 맞게) — 지금 문항은 live 에서 읽는다
  const toggleFill = useCallback((i) => {
    const s = live.current;
    const n = s ? s.n : 0;
    // 질문 메모 맥락용: 열든 닫든 마지막으로 누른 빈칸을 기억(문항 id 로 묶어 다른 문항으로 넘어가면 쓰지 않음)
    setLastBlank({ qid: s ? s.qid : null, i });
    setFillRevealed((prev) => {
      // prev(실제 상태)로 base를 만들고 base[i]를 토글 — fillRev(외부 파생값) 참조 금지
      const base = prev.length === n ? [...prev] : Array(n).fill(false);
      base[i] = !base[i];
      return base;
    });
  }, []);

  // 빈칸 단추 그리기: 상태(state)는 TableAwareText 가 빈칸마다 넘겨준다 → 바뀐 빈칸이 든 줄만 다시 그림
  const renderBlank = useCallback((i, { inTable, state }) => (
    <FillBlank
      index={i}
      revealed={!!state}
      answer={fillAnswers[i]}
      inTable={inTable}
      fixed={inkLayer}
      onToggle={toggleFill}
    />
  ), [fillAnswers, inkLayer, toggleFill]);

  // 목차: 지금 읽는 제목(읽는 줄 위로 올라간 마지막 제목)
  const currentHeading = useCallback(() => {
    const body = bodyRef.current;
    if (!body) return null;
    const line = lineOf(headRef.current) + 8;
    let cur = null;
    for (const el of body.querySelectorAll("[data-qm-h]")) {
      if (el.getBoundingClientRect().top <= line) cur = Number(el.getAttribute("data-qm-h"));
      else break;
    }
    return cur;
  }, []);
  // 목차에서 고른 제목으로: 읽는 줄 바로 아래에 오게
  const jumpToHeading = useCallback((hid) => {
    const el = bodyRef.current?.querySelector(`[data-qm-h="${hid}"]`);
    if (!el) return;
    scrollElTo(el, lineOf(headRef.current), 6);
    lastJump.current = null;
    pulse(el);
  }, []);

  // '↓ 빈칸': 읽는 줄 아래의 다음 가린 빈칸으로 가서 잠깐 깜빡인다(빈칸을 열지는 않음).
  // 그 빈칸이 이미 화면 안(떠 있는 단추들 위)이면 스크롤하지 않고 깜빡이기만. 연달아 누르면(그사이 스크롤 안 함) 다음 번호로.
  // 아래에 더 없으면 맨 앞의 가린 빈칸으로 돌아가고, 가린 빈칸이 하나도 없으면 알린다
  function goNextHidden() {
    const body = bodyRef.current;
    const s = live.current;
    if (!body || !s) return;
    const line = lineOf(headRef.current);
    const hidden = [];
    for (const el of body.querySelectorAll("[data-ink-blank]")) {
      const i = Number(el.getAttribute("data-ink-blank"));
      if (!s.revealed[i]) hidden.push({ el, i });
    }
    if (!hidden.length) {
      showToast("가린 빈칸이 더 없습니다", "info");
      return;
    }
    const lj = lastJump.current;
    let target = lj && Math.abs(window.scrollY - lj.y) <= 4
      ? hidden.find((h) => h.i > lj.i)
      : hidden.find((h) => h.el.getBoundingClientRect().top > line + 2);
    let wrapped = false;
    if (!target) {
      target = hidden[0];
      wrapped = true;
    }
    const r = target.el.getBoundingClientRect();
    let y = window.scrollY;
    if (r.top < line + 4 || r.bottom > window.innerHeight - 110) {
      y = scrollElTo(target.el, line, Math.min(120, Math.round((window.innerHeight - line) * 0.3)), true);
    }
    lastJump.current = { i: target.i, y };
    pulse(target.el);
    if (wrapped) showToast("맨 앞의 가린 빈칸으로 돌아왔습니다", "info");
  }

  // 진행 표시(여러 문항): 머리줄 숫자는 지금 보는 문항 번호, 막대는 끝낸 문항 수(지나온 문항 + 지금 문항을 채점했으면 1).
  // 빈칸·답안 이미지 문항은 채점 기록이 없어 예전 '채점한 수' 기준으로는 '0 / 1'·0% 에 멈춰 있었다
  const doneCount = currentIndex + (answered ? 1 : 0);
  const progressPct = questions.length > 0
    ? Math.round((doneCount / questions.length) * 100)
    : 0;

  function recordAnswer(correct, userAnswer) {
    setResults((r) => ({ ...r, [currentIndex]: { correct, userAnswer } }));
    setShowExplanation(false);
  }

  function handleMultiple(selectedIdx) {
    if (answered) return;
    recordAnswer(selectedIdx === current.answerIndex, String(selectedIdx));
  }

  function handleShort() {
    if (answered || !userInput.trim()) return;
    const correct =
      userInput.trim().toLowerCase() === (current.answer || "").trim().toLowerCase();
    recordAnswer(correct, userInput.trim());
  }

  function handleOX(v) {
    if (answered) return;
    recordAnswer(v === current.answer, v);
  }

  // 화면 위치·안내를 새 문항(또는 처음) 기준으로
  function resetView() {
    restoreRef.current = null;
    lastJump.current = null;
    setResumeChip(false);
    window.scrollTo(0, 0);
  }

  function handleNext() {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setShowExplanation(false);
      setUserInput("");
      setFillRevealed(Array(blankCountOf(questions[currentIndex + 1])).fill(false));
      setLastBlank(null);
      setShowAnswerImage(false);
    } else {
      setDone(true);
    }
    // 긴 문항 끝에서 넘어가도 새 문항은 맨 위부터
    resetView();
  }

  // 순번대로는 늘 서버 순서로(랜덤으로 푼 뒤 다시 순번대로를 골라도 섞인 순서가 남지 않게)
  function startQuiz(selectedMode) {
    const order = selectedMode === "random" ? shuffleArray(baseQuestions) : baseQuestions;
    setQuestions(order);
    setMode(selectedMode);
    setCurrentIndex(0);
    setResults({});
    setShowExplanation(false);
    setUserInput("");
    setFillRevealed(Array(blankCountOf(order[0])).fill(false));
    setLastBlank(null);
    setShowAnswerImage(false);
    setDone(false);
    resetView();
  }

  function handleRetry() {
    // 문항이 하나면 바로 다시, 여럿이면 모드 선택으로
    if (baseQuestions.length === 1) {
      startQuiz("ordered");
      return;
    }
    setMode(null);
    setModeChoice("ordered");
    setQuestions(baseQuestions);
    setCurrentIndex(0);
    setResults({});
    setShowExplanation(false);
    setUserInput("");
    setFillRevealed([]);
    setLastBlank(null);
    setShowAnswerImage(false);
    setDone(false);
    resetView();
  }

  // 이어 보기 띠의 '처음부터': 이 문제집 기록을 지우고 맨 위·전부 가림부터
  function restartFromTop() {
    clearStudy(username, setId);
    handleRetry();
  }

  // ← 목록으로: 떠나기 전에 읽던 자리를 바로 저장(화면이 아직 있을 때)
  function leave() {
    persist();
    onBack();
  }

  function onModeKey(e) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const next = modeChoice === "ordered" ? "random" : "ordered";
    setModeChoice(next);
    e.currentTarget.parentElement?.querySelector(`[data-mode="${next}"]`)?.focus();
  }

  const backButton = (
    <button
      style={S.backBtn}
      onClick={leave}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.color = "#f1f1f1"; }}
      onPointerLeave={(e) => { e.currentTarget.style.color = "#a0a0a0"; }}
    >
      ← 목록으로
    </button>
  );

  // ── 모드 선택 화면(문항이 둘 이상일 때만 — 하나면 바로 시작) ──
  if (!loadingQ && !loadError && questions.length > 0 && mode === null) {
    return (
      <div style={S.page}>
        <nav style={S.nav} className="qm-solve-nav">
          <div style={S.navLeft}>{backButton}</div>
          <span style={S.navTitle} className="qm-solve-title">{set.title}</span>
          <div className="qm-solve-spacer" />
        </nav>
        <div style={S.progressBar}><div style={S.progressFill(0)} /></div>

        <div style={S.modeSelectPage} className="qm-mode-page">
          <div style={S.modeSelectTitle}>문제 풀기</div>
          <div style={S.modeSelectSetName}>{set.title}</div>
          <div style={S.modeSelectCount}>총 {questions.length}문항</div>

          <div style={S.modeCards} role="radiogroup" aria-label="푸는 순서">
            {MODES.map(({ key, icon, title, desc }) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={modeChoice === key}
                tabIndex={modeChoice === key ? 0 : -1}
                data-mode={key}
                style={S.modeCard(modeChoice === key)}
                onClick={() => setModeChoice(key)}
                onKeyDown={onModeKey}
                onPointerEnter={(e) => { if (e.pointerType === "mouse" && modeChoice !== key) e.currentTarget.style.borderColor = "#555"; }}
                onPointerLeave={(e) => { if (modeChoice !== key) e.currentTarget.style.borderColor = "#2e2e2e"; }}
              >
                <span style={S.modeCardIcon} aria-hidden="true">{icon}</span>
                <span style={S.modeCardTitle}>{title}</span>
                <span style={S.modeCardDesc}>{desc}</span>
              </button>
            ))}
          </div>

          <button
            style={S.modeStartBtn}
            onClick={() => startQuiz(modeChoice)}
            onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.85"; }}
            onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
          >
            {modeChoice === "random" ? "🔀 랜덤으로 시작" : "📋 순번대로 시작"}
          </button>
        </div>
      </div>
    );
  }

  // ── 결과 화면 ──
  if (done) {
    // 채점 없는 문항(FILL·답안 이미지·모르는 유형)은 채점 제외
    const isNoGrade = (q) => !GRADED_TYPES.has(normalizeType(q.type)) || !!q.answerImageUrl;
    const gradable = questions.filter((q) => !isNoGrade(q));
    const total = gradable.length;
    const gradableCorrect = Object.entries(results).filter(
      ([i, r]) => questions[parseInt(i)] && !isNoGrade(questions[parseInt(i)]) && r.correct
    ).length;
    const rate = total > 0 ? Math.round((gradableCorrect / total) * 100) : 0;
    const blankTotal = questions.reduce((n, q) => n + blankCountOf(q), 0);
    return (
      <div style={S.page}>
        <nav style={S.nav} className="qm-solve-nav">
          <div style={S.navLeft}>{backButton}</div>
          <span style={S.navTitle} className="qm-solve-title">{set.title}</span>
          <div className="qm-solve-spacer" />
        </nav>
        <div style={S.progressBar}>
          <div style={S.progressFill(100)} />
        </div>

        <div style={S.resultPage} className="qm-result-page">
          <div style={S.resultCard} className="qm-result-card">
            <div style={S.resultTop}>
              <div style={S.resultEmoji}>🎉</div>
              <div style={S.resultHeading}>풀이 완료!</div>
              {total > 0 ? (
                <>
                  <div style={S.scoreNum(rate)}>{gradableCorrect} / {total}</div>
                  <div style={S.scoreRate(rate)}>정답률 {rate}%</div>
                </>
              ) : (
                // 채점할 문항이 없으면(빈칸·답안 이미지 문항만) 점수 대신 학습 완료로 — 빨간 '0 / 0' 은 다 틀린 것처럼 보였다
                <>
                  <div style={S.studyDone}>학습 완료</div>
                  <div style={S.studySub}>
                    {blankTotal > 0 ? `빈칸 ${blankTotal}개 · ` : ""}학습 문항 {questions.length}개
                  </div>
                </>
              )}
              {total > 0 && total < questions.length && (
                <div style={S.noGradeNote}>
                  (채점 없는 학습 문항 {questions.length - total}개 제외)
                </div>
              )}
            </div>

            <div style={S.resultList}>
              <div style={S.resultListTitle}>문항별 결과</div>
              {questions.map((q, i) => {
                if (isNoGrade(q)) {
                  return (
                    <div key={q.id} style={S.resultItem}>
                      <div style={{
                        ...S.resultIcon(null),
                        background: "rgba(245,158,11,0.15)", color: "#f59e0b",
                        fontSize: 10,
                      }}>
                        학습
                      </div>
                      <div style={S.resultItemText}>
                        <strong style={{ color: "#f59e0b" }}>{i + 1}번</strong>
                        {" "}— {plainPreview(q.text, 50) || "(내용 없음)"}
                      </div>
                    </div>
                  );
                }
                const r = results[i];
                const correct = r?.correct ?? false;
                return (
                  <div key={q.id} style={S.resultItem}>
                    <div style={S.resultIcon(correct)}>
                      {correct ? "✓" : "✗"}
                    </div>
                    <div style={S.resultItemText}>
                      <strong style={{ color: correct ? "#34d399" : "#f87171" }}>
                        {i + 1}번
                      </strong>
                      {" "}— {plainPreview(q.text, 50) || "(내용 없음)"}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={S.resultBtns}>
              <button
                style={S.retryBtn}
                onClick={handleRetry}
                onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.7"; }}
                onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
              >
                다시 풀기
              </button>
              <button
                style={S.backToDashBtn}
                onClick={leave}
                onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.85"; }}
                onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
              >
                목록으로
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── 문항 풀기 화면 ──
  const opts = current ? parseOptions(current.options) : [];
  const isLast = currentIndex === questions.length - 1;
  const graded = GRADED_TYPES.has(qtype);

  function getOptionState(i) {
    if (!answered) return "default";
    if (i === current.answerIndex) return "correct";
    if (String(i) === result.userAnswer) return "wrong";
    return "dim";
  }

  // 질문 메모 창 열기: 문제집·문항 + (빈칸 문항이면) 마지막으로 누른 빈칸과 그 줄의 글,
  // (다른 유형이면) 문제 본문 앞부분. 빈칸을 누른 적이 없으면 문제집·문항만.
  function openNote() {
    const info = { setId, setTitle: set.title, questionId: current?.id ?? null, qNo: currentIndex + 1, blankNo: null, context: null };
    if (isFill) {
      if (lastBlank && lastBlank.qid === current.id && lastBlank.i < fillBlankCount) {
        info.blankNo = lastBlank.i + 1;
        info.context = blankContext(current.text, lastBlank.i, fillAnswers) || null;
      }
    } else if (current) {
      info.context = questionContext(current.text, qtype === "multiple" ? opts : []) || null;
    }
    setNoteInfo(info);
  }

  // 저장한 메모가 이 문제집 것이면(불러온 초안은 다른 문제집 것일 수 있다) 단추의 수를 다시 센다
  function handleNoteSaved(note, info) {
    setNoteInfo(null);
    showToast("메모했습니다");
    if (String(info.setId) !== String(setId)) return;
    listNotes({ status: "open", setId })
      .then((list) => { if (Array.isArray(list)) setNoteCount(list.length); })
      .catch(() => setNoteCount((n) => (n == null ? n : n + 1)));
  }

  const bodyClass = ["qm-solve-body", showing && "qm-solve-body--fab", showNext && "qm-solve-body--fab2"].filter(Boolean).join(" ");

  return (
    <div style={S.page}>
      {/* data-ink-palm-safe: 손바닥이 닿기 어려운 곳 — 필기 모드의 손바닥 무시를 짧게(펜을 든 손으로 단추를 누를 수 있게) */}
      <div style={S.head} ref={headRef} data-ink-palm-safe="">
        <nav style={S.nav} className="qm-solve-nav">
          <div style={S.navLeft}>{backButton}</div>
          <span style={S.navTitle} className="qm-solve-title qm-solve-title--ink">{set.title}</span>
          {singleFill ? (
            <span style={S.navProgress} title={`연 빈칸 ${revealedCount}개 / 전체 ${fillBlankCount}개`} aria-label={`연 빈칸 ${revealedCount}개 / 전체 ${fillBlankCount}개`}>
              {revealedCount}/{fillBlankCount}
            </span>
          ) : (
            <span style={S.navProgress}>
              {questions.length > 0 ? currentIndex + 1 : 0} / {questions.length}
            </span>
          )}
          {showing && <InkModeButton on={inkOn} onToggle={toggleInk} />}
        </nav>
        {inkActive && <InkToolbar store={ink} />}
        <div style={S.progressBar} role="presentation">
          {singleFill && showing
            ? <div ref={barRef} style={S.readFill} />
            : <div style={S.progressFill(progressPct)} />}
        </div>
        {showing && <InkNotices store={ink} enabled={inkActive} />}
        {showing && resumeChip && (
          <div style={S.chipBand}>
            <div style={S.chip} role="status">
              <span>지난번 읽던 곳에서 이어 봅니다</span>
              <button style={S.chipBtn} onClick={restartFromTop}>처음부터</button>
              <button style={S.chipClose} onClick={() => setResumeChip(false)} aria-label="안내 닫기">✕</button>
            </div>
          </div>
        )}
      </div>

      {/* --fab: 맨 아래 '다음 문제' 단추가 떠 있는 메모 단추 위로 올라올 만큼 아래 여백을 더 둔다(--fab2: '↓ 빈칸'까지 두 개) */}
      <div style={S.body} className={bodyClass}>
        {loadingQ ? (
          <div style={S.center}>불러오는 중...</div>
        ) : loadError ? (
          <div style={S.loadError} role="alert">
            문항을 불러오지 못했습니다.
            <br />({loadError})
            <br />
            <button style={S.loadRetryBtn} onClick={retryLoad}>다시 시도</button>
          </div>
        ) : questions.length === 0 || !current ? (
          <div style={S.center}>문항이 없습니다.</div>
        ) : (
          <div style={S.card}>
            {/* 채점 결과 배너 (채점 없는 유형은 표시 안 함) */}
            {answered && graded && (
              <div style={S.resultBanner(result.correct)}>
                {result.correct ? "✓ 정답입니다!" : "✗ 오답입니다"}
              </div>
            )}

            <div className="qm-solve-card-body" ref={bodyRef}>
              {/* 문항 번호 + 유형 (+ 본문이 긴 빈칸 문항은 목차·모두 보기/가리기 — 긴 본문 끝까지 내려가지 않아도 되게) */}
              <div style={S.qMeta}>
                <span style={S.qNum}>Q{currentIndex + 1}</span>
                <span style={S.typeBadge(qtype)}>{TYPE_LABEL[qtype] ?? "학습"}</span>
                {!current.answerImageUrl && fillLong && fillBlankCount > 0 && (
                  <div style={S.qMetaBtns}>
                    {showToc && (
                      <SolveToc
                        headings={fillHeadings}
                        blankState={fillRev}
                        blankCount={fillBlankCount}
                        getCurrent={currentHeading}
                        onJump={jumpToHeading}
                      />
                    )}
                    <button
                      style={S.revealToggleBtn}
                      onClick={() => setFillRevealed(Array(fillBlankCount).fill(!fillRev.every(Boolean)))}
                      onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.7"; }}
                      onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                    >
                      {fillRev.every(Boolean) ? "모두 가리기" : "모두 보기"}
                    </button>
                  </div>
                )}
              </div>

              {/* 문제 텍스트 (빈칸 채우기는 아래 토글 UI에서 렌더링) */}
              {!isFill && (
                <InkSurface store={ink} enabled={inkActive} layerOn={inkLayer} style={S.qText}>
                  <TableAwareText text={current.text} headings />
                </InkSurface>
              )}

              {/* 문제 이미지 */}
              {current.questionImageUrl && (
                <img src={current.questionImageUrl} style={S.qImage} alt="문제 이미지" />
              )}

              {/* 답안 이미지 (있으면 기존 답안 UI 대체) */}
              {current.answerImageUrl && (
                <div>
                  <button
                    style={S.answerImgToggleBtn(showAnswerImage)}
                    onClick={() => setShowAnswerImage((v) => !v)}
                  >
                    {showAnswerImage ? "▲ 답안 닫기" : "▼ 답안 보기"}
                  </button>
                  <div style={S.answerImgBox(showAnswerImage)}>
                    <div style={S.answerImgInner}>
                      <img src={current.answerImageUrl} style={S.answerImg} alt="답안 이미지" />
                    </div>
                  </div>
                </div>
              )}

              {/* 객관식 */}
              {!current.answerImageUrl && qtype === "multiple" && (
                <div>
                  {opts.map((opt, i) => (
                    <button
                      key={i}
                      style={S.optionBtn(answered ? getOptionState(i) : "default")}
                      onClick={() => handleMultiple(i)}
                      onPointerEnter={(e) => {
                        if (e.pointerType === "mouse" && !answered) e.currentTarget.style.borderColor = "#f59e0b";
                      }}
                      onPointerLeave={(e) => {
                        if (!answered) e.currentTarget.style.borderColor = "#2e2e2e";
                      }}
                    >
                      <span style={S.optionCircle}>{CIRCLED[i] ?? `(${i + 1})`}</span>
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {/* 주관식 */}
              {!current.answerImageUrl && qtype === "short" && (
                <div>
                  {!answered ? (
                    <div style={S.shortRow}>
                      <input
                        style={S.shortInput}
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        onFocus={(e) => { e.target.style.borderColor = "#f59e0b"; }}
                        onBlur={(e) => { e.target.style.borderColor = "#2e2e2e"; }}
                        onKeyDown={(e) => { if (e.key === "Enter") handleShort(); }}
                        placeholder="답안을 입력하세요"
                        autoFocus
                      />
                      <button
                        style={S.submitBtn}
                        onClick={handleShort}
                        onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.85"; }}
                        onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                      >
                        제출
                      </button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 14, color: "#a0a0a0", marginBottom: 4 }}>
                      내 답안: <span style={{ color: "#f1f1f1" }}>{result.userAnswer}</span>
                    </div>
                  )}
                  {answered && !result.correct && (
                    <div style={S.correctAnswer}>정답: {current.answer}</div>
                  )}
                </div>
              )}

              {/* O/X */}
              {!current.answerImageUrl && qtype === "ox" && (
                <div>
                  <div style={S.oxRow}>
                    {["O", "X"].map((v) => (
                      <button
                        key={v}
                        style={S.oxBtn(v, result?.userAnswer === v, answered)}
                        onClick={() => handleOX(v)}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  {answered && !result.correct && (
                    <div style={S.correctAnswer}>정답: {current.answer}</div>
                  )}
                </div>
              )}

              {/* 빈칸 채우기 – 학습 모드 (채점 없음, 토글 방식) */}
              {!current.answerImageUrl && isFill && (
                <div>
                  {/* 문제 텍스트 + 빈칸 토글 버튼 (표 문법 포함 가능)
                      가린 빈칸에는 번호(i + 1)를 표시 — 글·표 칸을 통틀어 읽는 순서대로 answers[i] 와 같은 번호.
                      '■ '·'□ ' 제목 줄은 색·굵기만 다르게(줄 위치는 그대로 — 필기가 어긋나지 않게) */}
                  <InkSurface
                    store={ink}
                    enabled={inkActive}
                    layerOn={inkLayer}
                    onBlankTap={toggleFill}
                    style={S.fillText}
                  >
                    <TableAwareText text={current.text} renderBlank={renderBlank} blankState={fillRev} headings />
                  </InkSurface>
                  {/* 모두 보기 / 모두 가리기 */}
                  <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                    <button
                      style={S.revealAllBtn}
                      onClick={() => setFillRevealed(Array(fillBlankCount).fill(true))}
                      onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.85"; }}
                      onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                    >
                      모두 보기
                    </button>
                    <button
                      style={S.hideAllBtn}
                      onClick={() => setFillRevealed(Array(fillBlankCount).fill(false))}
                      onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.7"; }}
                      onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                    >
                      모두 가리기
                    </button>
                  </div>
                </div>
              )}

              {/* 해설/다음 버튼: 채점 완료 또는 채점 없는 유형(FILL·답안 이미지·모르는 유형 — 그 문항에 갇히지 않게) */}
              {(answered || !graded || !!current.answerImageUrl) && (
                <>
                  <div style={S.actionRow}>
                    {current.explanation && (
                      <button
                        style={S.hintBtn}
                        onClick={() => setShowExplanation((v) => !v)}
                        onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.7"; }}
                        onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                      >
                        💡 해설 {showExplanation ? "닫기" : "보기"}
                      </button>
                    )}
                    <button
                      style={S.nextBtn}
                      onClick={handleNext}
                      onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.85"; }}
                      onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                    >
                      {isLast ? "결과 보기" : "다음 문제 →"}
                    </button>
                  </div>
                  {showExplanation && current.explanation && (
                    <div style={S.explanationBox}>{current.explanation}</div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── 다음 가린 빈칸 (빈칸이 많은 문항) ── */}
      {showNext && (
        <button
          style={S.nextFab}
          className="qm-next-fab"
          data-ink-palm-safe=""
          onClick={goNextHidden}
          onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.85"; }}
          onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
          title="다음 가린 빈칸으로 (열지는 않음)"
          aria-label="다음 가린 빈칸으로 이동"
        >
          <span aria-hidden="true">↓</span>
          <span>빈칸</span>
        </button>
      )}

      {/* ── 질문 메모 ── */}
      {showing && (
        <button
          style={S.noteFab}
          className="qm-note-fab"
          onClick={openNote}
          onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.85"; }}
          onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
          title={noteCount ? `이 문제집의 미해결 메모 ${noteCount}개` : "읽다가 든 질문 적기"}
          aria-label={noteCount ? `질문 메모 (이 문제집의 미해결 ${noteCount}개)` : "질문 메모"}
        >
          <PencilIcon size={16} />
          {/* 휴대폰(480px 이하)에서는 글자를 숨겨 본문을 덜 가린다(index.css) */}
          <span className="qm-note-fab-label">질문 메모</span>
          {noteCount > 0 && <span style={S.noteFabCount}>{noteCount}</span>}
        </button>
      )}
      {noteInfo && (
        <QuestionNoteSheet info={noteInfo} onClose={() => setNoteInfo(null)} onSaved={handleNoteSaved} />
      )}
      {toast && <div style={S.toast(toast.type)} role="status">{toast.message}</div>}
    </div>
  );
}
