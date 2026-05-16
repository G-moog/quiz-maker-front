import { useState, useEffect } from "react";
import { getQuestions } from "../api/quiz";
import FillText from "../components/FillText";

const TYPE_LABEL = { multiple: "객관식", short: "주관식", ox: "O/X", fill: "빈칸 채우기" };

const TYPE_COLOR = {
  multiple: { text: "#60a5fa", bg: "rgba(96,165,250,0.1)" },
  short:    { text: "#34d399", bg: "rgba(52,211,153,0.1)" },
  ox:       { text: "#f87171", bg: "rgba(248,113,113,0.1)" },
  fill:     { text: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
};

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
};

export default function SolveView({ set, onBack }) {
  const [questions, setQuestions] = useState([]);
  const [loadingQ, setLoadingQ] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  // results: { [index]: { correct: bool, userAnswer: string } }
  const [results, setResults] = useState({});
  const [showExplanation, setShowExplanation] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [done, setDone] = useState(false);

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
    } else {
      setDone(true);
    }
  }

  function handleRetry() {
    setCurrentIndex(0);
    setResults({});
    setShowExplanation(false);
    setUserInput("");
    setDone(false);
  }

  // ── 결과 화면 ──
  if (done) {
    const total = questions.length;
    const rate = total > 0 ? Math.round((correctCount / total) * 100) : 0;
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
              <div style={S.scoreNum(rate)}>{correctCount} / {total}</div>
              <div style={S.scoreRate(rate)}>정답률 {rate}%</div>
            </div>

            <div style={S.resultList}>
              <div style={S.resultListTitle}>문항별 결과</div>
              {questions.map((q, i) => {
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
  // 백엔드가 대문자 enum("SHORT", "MULTIPLE" 등)을 반환할 수 있으므로 소문자로 정규화
  const qtype = (current?.type || "").toLowerCase();
  const opts = current ? parseOptions(current.options) : [];
  const isLast = currentIndex === questions.length - 1;

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
            {/* 채점 결과 배너 */}
            {answered && (
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

              {/* 문제 (빈칸 채우기는 FillText 내부에서 렌더링) */}
              {qtype !== "fill" && (
                <div style={S.qText}>{current.text}</div>
              )}

              {/* 객관식 */}
              {qtype === "multiple" && (
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
              {qtype === "short" && (
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
              {qtype === "ox" && (
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

              {/* 빈칸 채우기 */}
              {qtype === "fill" && (
                <FillText
                  key={currentIndex}
                  text={current.text}
                  answers={current.answers}
                  mode="exam"
                  answered={answered}
                  onAnswer={recordAnswer}
                />
              )}

              {/* 채점 후 해설/다음 버튼 */}
              {answered && (
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
