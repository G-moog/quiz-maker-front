import { useState } from "react";

/**
 * FillText – 빈칸 채우기 렌더러 (재사용 가능 컴포넌트)
 *
 * text      : "___" 로 빈칸이 표시된 문제 문자열
 * answers   : string[] – 각 빈칸의 정답 (순서 일치)
 * mode      : "learn" | "exam"
 *   learn → 빈칸 클릭 시 정답 즉시 공개, 전체 공개 시 onAnswer(true, "") 호출
 *   exam  → 텍스트 직접 입력 후 제출, onAnswer(correct, joined) 호출
 * answered  : boolean – 이미 채점 완료 여부 (부모에서 전달)
 * onAnswer  : (correct: boolean, userAnswer: string) => void
 */

export function parseAnswers(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

function blankBtnStyle(revealed) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 64,
    padding: "2px 14px",
    margin: "0 3px",
    verticalAlign: "middle",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 700,
    cursor: revealed ? "default" : "pointer",
    border: `2px ${revealed ? "solid" : "dashed"} #f59e0b`,
    background: revealed ? "#f59e0b" : "transparent",
    color: revealed ? "#000" : "#f59e0b",
    transition: "all 0.2s ease",
    lineHeight: 1.4,
  };
}

function examInputStyle(state) {
  const palette = {
    default: { border: "#2e2e2e", bg: "#242424", color: "#f1f1f1" },
    correct: { border: "#34d399", bg: "rgba(52,211,153,0.1)", color: "#34d399" },
    wrong:   { border: "#f87171", bg: "rgba(248,113,113,0.1)", color: "#f87171" },
  };
  const c = palette[state] ?? palette.default;
  return {
    display: "inline-block",
    minWidth: 80,
    width: 100,
    padding: "3px 8px",
    margin: "0 3px",
    verticalAlign: "middle",
    background: c.bg,
    border: `2px solid ${c.border}`,
    borderRadius: 6,
    fontSize: 14,
    color: c.color,
    outline: "none",
    textAlign: "center",
    transition: "border-color 0.15s ease, background 0.15s ease",
  };
}

export default function FillText({ text, answers: rawAnswers = [], mode = "learn", answered, onAnswer }) {
  const answers = parseAnswers(rawAnswers);
  const parts = (text || "").split("___");
  const blankCount = parts.length - 1;

  const [revealed, setRevealed] = useState(() => Array(blankCount).fill(false));
  const [inputs, setInputs] = useState(() => Array(blankCount).fill(""));

  // 학습 모드: 빈칸 클릭 → 공개
  function handleLearnClick(i) {
    if (answered || revealed[i]) return;
    setRevealed((prev) => {
      const next = [...prev];
      next[i] = true;
      if (next.every(Boolean)) {
        // 모든 빈칸 공개 → 부모에 알림 (setState 중 setState 방지를 위해 defer)
        setTimeout(() => onAnswer?.(true, ""), 0);
      }
      return next;
    });
  }

  // 시험 모드: 제출
  function handleSubmit() {
    if (answered) return;
    const correct = inputs.every(
      (inp, i) => inp.trim().toLowerCase() === (answers[i] ?? "").trim().toLowerCase()
    );
    onAnswer?.(correct, inputs.join("|||"));
  }

  function getInputState(i) {
    if (!answered) return "default";
    return inputs[i].trim().toLowerCase() === (answers[i] ?? "").trim().toLowerCase()
      ? "correct"
      : "wrong";
  }

  function setInput(i, val) {
    setInputs((prev) => {
      const n = [...prev];
      n[i] = val;
      return n;
    });
  }

  return (
    <div>
      {/* 문제 텍스트 + 빈칸 */}
      <div style={{ fontSize: 15, lineHeight: 2.5, color: "#f1f1f1", wordBreak: "keep-all" }}>
        {parts.map((part, i) => (
          <span key={i}>
            <span style={{ whiteSpace: "pre-wrap" }}>{part}</span>
            {i < blankCount && (
              mode === "learn" ? (
                <button
                  style={blankBtnStyle(revealed[i])}
                  onClick={() => handleLearnClick(i)}
                  title={revealed[i] ? "" : "클릭하여 정답 확인"}
                >
                  {revealed[i] ? (answers[i] ?? "?") : "?"}
                </button>
              ) : (
                <span style={{ whiteSpace: "nowrap" }}>
                  <input
                    style={examInputStyle(getInputState(i))}
                    value={inputs[i]}
                    onChange={(e) => { if (!answered) setInput(i, e.target.value); }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                    disabled={answered}
                    placeholder={`빈칸${i + 1}`}
                    onFocus={(e) => { if (!answered) e.target.style.borderColor = "#f59e0b"; }}
                    onBlur={(e) => {
                      if (!answered) e.target.style.borderColor = "#2e2e2e";
                    }}
                  />
                  {/* 오답 시 정답 힌트 */}
                  {answered && getInputState(i) === "wrong" && (
                    <span style={{ fontSize: 12, color: "#34d399", marginLeft: 2, fontWeight: 600 }}>
                      → {answers[i]}
                    </span>
                  )}
                </span>
              )
            )}
          </span>
        ))}
      </div>

      {/* 시험 모드 제출 버튼 */}
      {mode === "exam" && !answered && (
        <button
          style={{
            marginTop: 20,
            padding: "10px 28px",
            background: "#f59e0b",
            color: "#000",
            border: "none",
            borderRadius: 7,
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
            transition: "opacity 0.15s ease",
          }}
          onClick={handleSubmit}
          onMouseOver={(e) => { e.currentTarget.style.opacity = "0.85"; }}
          onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
        >
          제출
        </button>
      )}
    </div>
  );
}
