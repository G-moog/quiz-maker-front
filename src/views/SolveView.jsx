import { useState, useEffect } from "react";
import { getQuestions } from "../api/quiz";
import { parseAnswers } from "../components/FillText";

const TYPE_LABEL = { multiple: "객관식", short: "주관식", ox: "O/X", fill: "빈칸 채우기" };

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
function fillBlankBtnStyle(revealed) {
  return {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    minWidth: 64, padding: "2px 14px", margin: "0 3px",
    verticalAlign: "middle", borderRadius: 6,
    fontSize: 14, fontWeight: 700, cursor: "pointer",
    border: `2px ${revealed ? "solid" : "dashed"} #f59e0b`,
    background: revealed ? "#f59e0b" : "transparent",
    color: revealed ? "#1a1a1a" : "#f59e0b",
    transition: "all 0.2s ease",
    lineHeight: 1.4,
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

const S = {
  page: { minHeight: "100vh", background: "#0f0f0f", fontFamily: "system-ui, sans-serif" },
  nav: {
    background: "#1a1a1a", borderBottom: "1px solid #2e2e2e",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "0 24px", height: 52, position: "sticky", top: 0, zIndex: 10,
  },
  navLeft: { display: "flex", alignItems: "center", gap: 10 },
  backBtn: {
    background: "none", border: "none", color: "#a0a0a0",
    fontSize: 14, fontWeight: 600, cursor: "pointer",
    display: "flex", alignItems: "center", gap: 6,
    transition: "color 0.15s ease",
  },
  navTitle: { fontWeight: 700, fontSize: 15, color: "#f1f1f1" },
  navProgress: { fontSize: 13, color: "#a0a0a0", fontWeight: 600 },
  progressBar: { height: 3, background: "#2e2e2e" },
  progressFill: (pct) => ({
    height: "100%", background: "#f59e0b",
    width: `${pct}%`, transition: "width 0.3s ease",
  }),
  body: { maxWidth: 680, margin: "0 auto", padding: "32px 20px 60px" },
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
  cardBody: { padding: "24px" },
  qMeta: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 },
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
    flex: 1, padding: "10px 14px",
    background: "#242424", border: "1px solid #2e2e2e",
    borderRadius: 8, fontSize: 14, color: "#f1f1f1", outline: "none",
    transition: "border-color 0.15s ease",
  },
  submitBtn: {
    padding: "10px 20px",
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
    color: "#a0a0a0", fontSize: 14, lineHeight: 1.6,
  },
  // 로딩/빈 문항
  center: { textAlign: "center", padding: "80px 20px", color: "#555555", fontSize: 15 },

  // ── 결과 화면 ──
  resultPage: { maxWidth: 680, margin: "0 auto", padding: "48px 20px 60px" },
  resultCard: {
    background: "#1a1a1a", border: "1px solid #2e2e2e",
    borderRadius: 16, padding: "40px 36px",
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
  modeSelectPage: { maxWidth: 480, margin: "0 auto", padding: "60px 20px" },
  modeSelectTitle: { fontSize: 13, color: "#a0a0a0", fontWeight: 600, marginBottom: 6 },
  modeSelectSetName: { fontSize: 22, fontWeight: 800, color: "#f1f1f1", marginBottom: 8 },
  modeSelectCount: { fontSize: 13, color: "#555", marginBottom: 40 },
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
  modeCardDesc: { fontSize: 12, color: "#666", lineHeight: 1.5 },
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
  answerImgBox: (open) => ({
    overflow: "hidden",
    maxHeight: open ? 600 : 0,
    transition: "max-height 0.35s ease",
  }),
  answerImg: {
    display: "block", maxWidth: "100%", borderRadius: 8,
    border: "1px solid #2e2e2e", marginBottom: 8,
  },
  // FILL 학습 모드 버튼
  revealAllBtn: {
    padding: "8px 20px",
    background: "#f59e0b", color: "#000000",
    border: "none", borderRadius: 7,
    fontWeight: 700, fontSize: 13, cursor: "pointer",
    transition: "opacity 0.15s ease",
  },
  hideAllBtn: {
    padding: "8px 20px",
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
  const correctCount = Object.values(results).filter((r) => r.correct).length;
  const answeredCount = Object.keys(results).length;
  const progressPct = questions.length > 0
    ? Math.round((answeredCount / questions.length) * 100)
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
        <nav style={S.nav}>
          <div style={S.navLeft}>
            <button
              style={S.backBtn}
              onClick={onBack}
              onMouseOver={(e) => { e.currentTarget.style.color = "#f1f1f1"; }}
              onMouseOut={(e) => { e.currentTarget.style.color = "#a0a0a0"; }}
            >← 목록으로</button>
          </div>
          <span style={S.navTitle}>{set.title}</span>
          <div style={{ width: 80 }} />
        </nav>
        <div style={S.progressBar}><div style={S.progressFill(0)} /></div>

        <div style={S.modeSelectPage}>
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
                onMouseOver={(e) => { if (modeChoice !== key) e.currentTarget.style.borderColor = "#555"; }}
                onMouseOut={(e) => { if (modeChoice !== key) e.currentTarget.style.borderColor = "#2e2e2e"; }}
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
            onMouseOver={(e) => { e.currentTarget.style.opacity = "0.85"; }}
            onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
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
    return (
      <div style={S.page}>
        <nav style={S.nav}>
          <div style={S.navLeft}>
            <button
              style={S.backBtn}
              onClick={onBack}
              onMouseOver={(e) => { e.currentTarget.style.color = "#f1f1f1"; }}
              onMouseOut={(e) => { e.currentTarget.style.color = "#a0a0a0"; }}
            >
              ← 목록으로
            </button>
          </div>
          <span style={S.navTitle}>{set.title}</span>
          <div style={{ width: 80 }} />
        </nav>
        <div style={S.progressBar}>
          <div style={S.progressFill(100)} />
        </div>

        <div style={S.resultPage}>
          <div style={S.resultCard}>
            <div style={S.resultTop}>
              <div style={S.resultEmoji}>🎉</div>
              <div style={S.resultHeading}>풀이 완료!</div>
              <div style={S.scoreNum(rate)}>{gradableCorrect} / {total}</div>
              <div style={S.scoreRate(rate)}>정답률 {rate}%</div>
              {total < questions.length && (
                <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
                  (빈칸 채우기 {questions.length - total}문항은 채점 제외)
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
                        {" "}— {q.text?.slice(0, 50) || "(내용 없음)"}
                        {q.text?.length > 50 ? "…" : ""}
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
                      {" "}— {q.text?.slice(0, 50) || "(내용 없음)"}
                      {q.text?.length > 50 ? "…" : ""}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={S.resultBtns}>
              <button
                style={S.retryBtn}
                onClick={handleRetry}
                onMouseOver={(e) => { e.currentTarget.style.opacity = "0.7"; }}
                onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
              >
                다시 풀기
              </button>
              <button
                style={S.backToDashBtn}
                onClick={onBack}
                onMouseOver={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
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
      <nav style={S.nav}>
        <div style={S.navLeft}>
          <button
            style={S.backBtn}
            onClick={onBack}
            onMouseOver={(e) => { e.currentTarget.style.color = "#f1f1f1"; }}
            onMouseOut={(e) => { e.currentTarget.style.color = "#a0a0a0"; }}
          >
            ← 목록으로
          </button>
        </div>
        <span style={S.navTitle}>{set.title}</span>
        <span style={S.navProgress}>
          {answeredCount} / {questions.length}
        </span>
      </nav>

      <div style={S.progressBar}>
        <div style={S.progressFill(progressPct)} />
      </div>

      <div style={S.body}>
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

            <div style={S.cardBody}>
              {/* 문항 번호 + 유형 */}
              <div style={S.qMeta}>
                <span style={S.qNum}>Q{currentIndex + 1}</span>
                <span style={S.typeBadge(qtype)}>{TYPE_LABEL[qtype]}</span>
              </div>

              {/* 문제 텍스트 (빈칸 채우기는 아래 토글 UI에서 렌더링) */}
              {qtype !== "fill" && (
                <div style={S.qText}>{current.text}</div>
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
                    <img src={current.answerImageUrl} style={S.answerImg} alt="답안 이미지" />
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
                      onMouseOver={(e) => {
                        if (!answered) e.currentTarget.style.borderColor = "#f59e0b";
                      }}
                      onMouseOut={(e) => {
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
                        onMouseOver={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                        onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
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
                  {/* 문제 텍스트 + 빈칸 토글 버튼 */}
                  <div style={{ fontSize: 15, lineHeight: 2.8, color: "#f1f1f1", wordBreak: "keep-all" }}>
                    {fillParts.map((part, i) => (
                      <span key={i}>
                        <span style={{ whiteSpace: "pre-wrap" }}>{part}</span>
                        {i < fillBlankCount && (
                          <button
                            style={fillBlankBtnStyle(fillRev[i])}
                            onClick={() => toggleFill(i)}
                            title={fillRev[i] ? "클릭하여 가리기" : "클릭하여 정답 확인"}
                          >
                            {fillRev[i] ? (fillAnswers[i] ?? "?") : "?"}
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                  {/* 모두 보기 / 모두 가리기 */}
                  <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                    <button
                      style={S.revealAllBtn}
                      onClick={() => setFillRevealed(Array(fillBlankCount).fill(true))}
                      onMouseOver={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                      onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
                    >
                      모두 보기
                    </button>
                    <button
                      style={S.hideAllBtn}
                      onClick={() => setFillRevealed(Array(fillBlankCount).fill(false))}
                      onMouseOver={(e) => { e.currentTarget.style.opacity = "0.7"; }}
                      onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
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
                        onMouseOver={(e) => { e.currentTarget.style.opacity = "0.7"; }}
                        onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
                      >
                        💡 해설 {showExplanation ? "닫기" : "보기"}
                      </button>
                    )}
                    <button
                      style={S.nextBtn}
                      onClick={handleNext}
                      onMouseOver={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                      onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
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
