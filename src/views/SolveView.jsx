import { useState, useEffect } from "react";
import { getQuestions } from "../api/quiz";
import { parseAnswers } from "../utils/answers";
import TableAwareText from "../components/TableAwareText";
import { plainPreview } from "../utils/textBlocks";

const TYPE_LABEL = { multiple: "객관식", short: "주관식", ox: "O/X", fill: "빈칸 채우기" };

// 빈칸 문항 본문이 이 글자 수보다 길면(휴대폰 한 화면을 넘는 정도) 문항 머리에도 '모두 보기/가리기' 토글을 둔다.
// 짧은 문항은 본문 바로 아래 단추 두 개로 충분 — 작은 카드에 같은 일을 하는 단추가 셋이 되지 않게
const LONG_FILL_CHARS = 500;

const TYPE_COLOR = {
  multiple: { text: "#60a5fa", bg: "rgba(96,165,250,0.1)" },
  short:    { text: "#34d399", bg: "rgba(52,211,153,0.1)" },
  ox:       { text: "#f87171", bg: "rgba(248,113,113,0.1)" },
  fill:     { text: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
};

// 백엔드 타입명(short_answer, multiple_choice 등)을 프론트엔드 내부명으로 정규화
function normalizeType(type) {
  const map = { short_answer: "short", multiple_choice: "multiple" };
  const lower = (type || "").toLowerCase();
  return map[lower] ?? lower;
}

// FILL 빈칸 버튼 스타일
//  표 칸 안(inTable): 좁은 칸을 넘지 않게 여백·테두리를 줄임. 연 상태의 긴 정답은 버튼 안에서 줄바꿈
//  가린 상태의 번호는 줄바꿈 금지 — 칸이 좁아도 "13" 이 "1/3" 처럼 세로로 쪼개지지 않게
function fillBlankBtnStyle(revealed, inTable = false) {
  return {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    minWidth: inTable ? "min(40px, 100%)" : 64, maxWidth: "100%",
    padding: inTable ? "1px 3px" : "2px 14px", margin: inTable ? "1px 0" : "0 3px",
    verticalAlign: "middle", borderRadius: inTable ? 5 : 6,
    fontSize: inTable ? 13 : 14, fontWeight: 700, cursor: "pointer",
    border: `${inTable ? 1.5 : 2}px ${revealed ? "solid" : "dashed"} #f59e0b`,
    background: revealed ? "#f59e0b" : "transparent",
    color: revealed ? "#1a1a1a" : "#f59e0b",
    transition: "all 0.2s ease",
    lineHeight: 1.4,
    ...(revealed ? {} : { whiteSpace: "nowrap", overflowWrap: "normal" }),
  };
}

function parseOptions(opts) {
  if (!opts) return [];
  if (Array.isArray(opts)) return opts;
  try { return JSON.parse(opts); } catch { return []; }
}

function scoreColor(rate) {
  if (rate >= 80) return "#34d399";
  if (rate >= 60) return "#f59e0b";
  return "#f87171";
}

// 화면 폭에 따라 바뀌는 여백·글자 크기(.qm-solve-*, .qm-result-*, .qm-mode-page)는 index.css 참고.
// 마우스 올림 효과는 마우스에서만 켠다(onPointerEnter + pointerType) — 휴대폰에서 누른 뒤 흐린 채 남지 않게.
const S = {
  page: { minHeight: "100vh", background: "#0f0f0f", fontFamily: "system-ui, sans-serif" },
  // 머리줄: ← 목록으로 | 제목(가운데, 최대 두 줄) | 진행. 세 덩어리가 맞닿거나 쪼개지지 않게
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
  navTitle: {
    flex: "1 1 0", minWidth: 0, textAlign: "center",
    fontWeight: 700, color: "#f1f1f1", lineHeight: 1.3,
    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
    overflowWrap: "anywhere",
  },
  navProgress: { fontSize: 13, color: "#a0a0a0", fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 },
  progressBar: { height: 3, background: "#2e2e2e" },
  progressFill: (pct) => ({
    height: "100%", background: "#f59e0b",
    width: `${pct}%`, transition: "width 0.3s ease",
  }),
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
  // 본문이 긴 빈칸 문항(LONG_FILL_CHARS): 본문 위에서도 모두 보기/가리기 (긴 페이지 끝까지 내려가지 않아도 되게)
  revealToggleBtn: {
    marginLeft: "auto", padding: "6px 12px", minHeight: 36,
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
  modeCard: (active) => ({
    flex: 1, padding: "24px 20px", borderRadius: 12, cursor: "pointer",
    border: `2px solid ${active ? "#f59e0b" : "#2e2e2e"}`,
    background: active ? "rgba(245,158,11,0.06)" : "#1a1a1a",
    transition: "border-color 0.15s ease, background 0.15s ease",
    textAlign: "center",
  }),
  modeCardIcon: { fontSize: 32, marginBottom: 12 },
  modeCardTitle: { fontSize: 15, fontWeight: 800, color: "#f1f1f1", marginBottom: 6 },
  modeCardDesc: { fontSize: 12, color: "#8a8a8a", lineHeight: 1.5, whiteSpace: "pre-line" },
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
};

export default function SolveView({ set, onBack }) {
  const [questions, setQuestions] = useState([]);
  const [loadingQ, setLoadingQ] = useState(true);
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

  useEffect(() => {
    (async () => {
      try {
        const data = await getQuestions(set.id);
        setQuestions(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingQ(false);
      }
    })();
  }, []);

  const current = questions[currentIndex];
  const answered = results[currentIndex] !== undefined;
  const result = results[currentIndex];
  // 진행 표시: 머리줄 숫자는 지금 보는 문항 번호, 막대는 끝낸 문항 수(지나온 문항 + 지금 문항을 채점했으면 1).
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

  function handleNext() {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setShowExplanation(false);
      setUserInput("");
      setFillRevealed([]);
      setShowAnswerImage(false);
    } else {
      setDone(true);
    }
  }

  function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function startQuiz(selectedMode) {
    if (selectedMode === "random") setQuestions((q) => shuffleArray(q));
    setMode(selectedMode);
    setCurrentIndex(0);
    setResults({});
    setShowExplanation(false);
    setUserInput("");
    setFillRevealed([]);
    setShowAnswerImage(false);
    setDone(false);
  }

  function handleRetry() {
    // 결과 화면 → 모드 선택으로 돌아가기
    setMode(null);
    setModeChoice("ordered");
    setCurrentIndex(0);
    setResults({});
    setShowExplanation(false);
    setUserInput("");
    setFillRevealed([]);
    setShowAnswerImage(false);
    setDone(false);
  }

  // ── 모드 선택 화면 ──
  if (!loadingQ && questions.length > 0 && mode === null) {
    return (
      <div style={S.page}>
        <nav style={S.nav} className="qm-solve-nav">
          <div style={S.navLeft}>
            <button
              style={S.backBtn}
              onClick={onBack}
              onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.color = "#f1f1f1"; }}
              onPointerLeave={(e) => { e.currentTarget.style.color = "#a0a0a0"; }}
            >← 목록으로</button>
          </div>
          <span style={S.navTitle} className="qm-solve-title">{set.title}</span>
          <div className="qm-solve-spacer" />
        </nav>
        <div style={S.progressBar}><div style={S.progressFill(0)} /></div>

        <div style={S.modeSelectPage} className="qm-mode-page">
          <div style={S.modeSelectTitle}>문제 풀기</div>
          <div style={S.modeSelectSetName}>{set.title}</div>
          <div style={S.modeSelectCount}>총 {questions.length}문항</div>

          <div style={S.modeCards}>
            {[
              { key: "ordered", icon: "📋", title: "순번대로", desc: "문제집에 저장된\n순서대로 풀기" },
              { key: "random",  icon: "🔀", title: "랜덤 배치", desc: "문제 순서를\n무작위로 섞어 풀기" },
            ].map(({ key, icon, title, desc }) => (
              <div
                key={key}
                style={S.modeCard(modeChoice === key)}
                onClick={() => setModeChoice(key)}
                onPointerEnter={(e) => { if (e.pointerType === "mouse" && modeChoice !== key) e.currentTarget.style.borderColor = "#555"; }}
                onPointerLeave={(e) => { if (modeChoice !== key) e.currentTarget.style.borderColor = "#2e2e2e"; }}
              >
                <div style={S.modeCardIcon}>{icon}</div>
                <div style={S.modeCardTitle}>{title}</div>
                <div style={S.modeCardDesc}>{desc}</div>
              </div>
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
    // FILL 유형 및 답안 이미지 문항은 채점 제외
    const isNoGrade = (q) => normalizeType(q.type) === "fill" || !!q.answerImageUrl;
    const gradable = questions.filter((q) => !isNoGrade(q));
    const total = gradable.length;
    const gradableCorrect = Object.entries(results).filter(
      ([i, r]) => !isNoGrade(questions[parseInt(i)]) && r.correct
    ).length;
    const rate = total > 0 ? Math.round((gradableCorrect / total) * 100) : 0;
    const blankTotal = questions
      .filter((q) => normalizeType(q.type) === "fill")
      .reduce((n, q) => n + ((q.text || "").match(/___/g) || []).length, 0);
    return (
      <div style={S.page}>
        <nav style={S.nav} className="qm-solve-nav">
          <div style={S.navLeft}>
            <button
              style={S.backBtn}
              onClick={onBack}
              onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.color = "#f1f1f1"; }}
              onPointerLeave={(e) => { e.currentTarget.style.color = "#a0a0a0"; }}
            >
              ← 목록으로
            </button>
          </div>
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
                const ntype = normalizeType(q.type);
                if (ntype === "fill" || !!q.answerImageUrl) {
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
                onClick={onBack}
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
  // 백엔드 타입명 정규화 (short_answer → short, multiple_choice → multiple 등)
  const qtype = normalizeType(current?.type);
  const opts = current ? parseOptions(current.options) : [];
  const isLast = currentIndex === questions.length - 1;

  // FILL 학습 모드 관련 (채점 없이 토글 방식)
  const fillAnswers = qtype === "fill" ? parseAnswers(current?.answers) : [];
  // 비-fill 문항에서는 [""] 로 초기화하여 fillBlankCount 가 절대 음수가 되지 않도록 함
  const fillParts  = qtype === "fill" ? (current?.text || "").split("___") : [""];
  const fillBlankCount = Math.max(0, fillParts.length - 1);
  const fillLong = qtype === "fill" && (current?.text || "").length > LONG_FILL_CHARS;
  // fillRevealed 길이가 문항 빈칸 수와 다를 경우 자동 보정
  const fillRev = fillRevealed.length === fillBlankCount
    ? fillRevealed
    : Array(fillBlankCount).fill(false);
  function toggleFill(i) {
    setFillRevealed((prev) => {
      // prev(실제 상태)로 base를 만들고 base[i]를 토글 — fillRev(외부 파생값) 참조 금지
      const base = prev.length === fillBlankCount
        ? [...prev]
        : Array(fillBlankCount).fill(false);
      base[i] = !base[i];
      return base;
    });
  }

  function getOptionState(i) {
    if (!answered) return "default";
    if (i === current.answerIndex) return "correct";
    if (String(i) === result.userAnswer) return "wrong";
    return "dim";
  }

  return (
    <div style={S.page}>
      <nav style={S.nav} className="qm-solve-nav">
        <div style={S.navLeft}>
          <button
            style={S.backBtn}
            onClick={onBack}
            onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.color = "#f1f1f1"; }}
            onPointerLeave={(e) => { e.currentTarget.style.color = "#a0a0a0"; }}
          >
            ← 목록으로
          </button>
        </div>
        <span style={S.navTitle} className="qm-solve-title">{set.title}</span>
        <span style={S.navProgress}>
          {questions.length > 0 ? currentIndex + 1 : 0} / {questions.length}
        </span>
      </nav>

      <div style={S.progressBar}>
        <div style={S.progressFill(progressPct)} />
      </div>

      <div style={S.body} className="qm-solve-body">
        {loadingQ ? (
          <div style={S.center}>불러오는 중...</div>
        ) : questions.length === 0 ? (
          <div style={S.center}>문항이 없습니다.</div>
        ) : (
          <div style={S.card}>
            {/* 채점 결과 배너 (FILL 유형은 채점 없으므로 표시 안 함) */}
            {answered && qtype !== "fill" && (
              <div style={S.resultBanner(result.correct)}>
                {result.correct ? "✓ 정답입니다!" : "✗ 오답입니다"}
              </div>
            )}

            <div className="qm-solve-card-body">
              {/* 문항 번호 + 유형 (+ 본문이 긴 빈칸 문항은 모두 보기/가리기 — 긴 본문 끝까지 내려가지 않아도 되게) */}
              <div style={S.qMeta}>
                <span style={S.qNum}>Q{currentIndex + 1}</span>
                <span style={S.typeBadge(qtype)}>{TYPE_LABEL[qtype]}</span>
                {!current.answerImageUrl && fillLong && fillBlankCount > 0 && (
                  <button
                    style={S.revealToggleBtn}
                    onClick={() => setFillRevealed(Array(fillBlankCount).fill(!fillRev.every(Boolean)))}
                    onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.7"; }}
                    onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                  >
                    {fillRev.every(Boolean) ? "모두 가리기" : "모두 보기"}
                  </button>
                )}
              </div>

              {/* 문제 텍스트 (빈칸 채우기는 아래 토글 UI에서 렌더링) */}
              {qtype !== "fill" && (
                <div style={S.qText}><TableAwareText text={current.text} /></div>
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
                      <span style={S.optionCircle}>{"①②③④"[i]}</span>
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
              {!current.answerImageUrl && qtype === "fill" && (
                <div>
                  {/* 문제 텍스트 + 빈칸 토글 버튼 (표 문법 포함 가능)
                      가린 빈칸에는 번호(i + 1)를 표시 — 글·표 칸을 통틀어 읽는 순서대로 answers[i] 와 같은 번호.
                      줄 간격 2.1: 번호 단추(높이 약 28px)가 줄(31.5px) 안에 들어가 줄이 들쭉날쭉하지 않는 가장 촘촘한 값 */}
                  <div style={{ fontSize: 15, lineHeight: 2.1, color: "#f1f1f1", wordBreak: "keep-all" }}>
                    <TableAwareText
                      text={current.text}
                      renderBlank={(i, { inTable }) => (
                        <button
                          className="qm-blank"
                          style={fillBlankBtnStyle(fillRev[i], inTable)}
                          onClick={() => toggleFill(i)}
                          title={fillRev[i] ? "클릭하여 가리기" : `클릭하여 ${i + 1}번 빈칸 정답 확인`}
                        >
                          {fillRev[i] ? (fillAnswers[i] ?? "?") : i + 1}
                        </button>
                      )}
                    />
                  </div>
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

              {/* 해설/다음 버튼: 채점 완료 또는 채점 불필요 유형 (FILL / 답안이미지) */}
              {(answered || qtype === "fill" || !!current.answerImageUrl) && (
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
    </div>
  );
}
