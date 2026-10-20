import { useState, useEffect } from "react";
import { getQuestions } from "../api/quiz";
import { parseAnswers } from "../utils/answers";
import TableAwareText from "../components/TableAwareText";

const CIRCLE = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"];
const NBSP = String.fromCharCode(0xa0); // 줄이 바뀌지 않는 공백

// 백엔드 타입명(short_answer, multiple_choice 등)을 프론트엔드 내부명으로 정규화
function normalizeType(type) {
  const map = { short_answer: "short", multiple_choice: "multiple" };
  const lower = (type || "").toLowerCase();
  return map[lower] ?? lower;
}

function parseOptions(opts) {
  if (!opts) return [];
  try { return JSON.parse(opts); } catch { return []; }
}

const S = {
  page: { minHeight: "100vh", background: "#0f0f0f", fontFamily: "system-ui, sans-serif" },
  toolbar: {
    background: "#1a1a1a",
    borderBottom: "1px solid #2e2e2e",
    display: "flex",
    alignItems: "center", justifyContent: "space-between",
    padding: "0 24px", height: 52,
  },
  toolbarLeft: { display: "flex", alignItems: "center", gap: 12 },
  // 여백 10 + 음수 여백 -10: 보이는 자리는 그대로, 누르는 자리만 넓게
  backBtn: {
    background: "none", border: "none", color: "#a0a0a0", padding: 10, margin: -10,
    fontSize: 20, cursor: "pointer", transition: "color 0.15s ease",
  },
  toolbarTitle: { fontWeight: 700, fontSize: 16, color: "#f1f1f1" },
  printBtn: {
    background: "#f59e0b", color: "#000000", border: "none",
    padding: "7px 22px", minHeight: 36, borderRadius: 6, fontWeight: 700, cursor: "pointer", fontSize: 13,
    transition: "opacity 0.15s ease",
  },
  // 바깥 여백·안쪽 여백·테두리는 index.css 의 .qm-sheet (휴대폰에서는 화면 폭에 맞춰 줄임)
  sheet: {
    maxWidth: 800, background: "#1a1a1a",
    boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
  },
  docTitle: {
    textAlign: "center", fontWeight: 800,
    color: "#f59e0b", marginBottom: 6,
  },
  docSub: { textAlign: "center", fontSize: 14, color: "#a0a0a0", marginBottom: 36 },
  divider: { border: "none", borderTop: "1px solid #2e2e2e", marginBottom: 32 },
  qBlock: { marginBottom: 32 },
  qHeader: { display: "flex", gap: 8, marginBottom: 8 },
  qNum: { fontWeight: 800, color: "#f59e0b", fontSize: 15, flexShrink: 0 },
  qText: { fontSize: 15, color: "#f1f1f1", lineHeight: 1.7, fontWeight: 500 },
  optList: { listStyle: "none", padding: "0 0 0 24px", margin: "10px 0 0" },
  optItem: { fontSize: 14, color: "#a0a0a0", marginBottom: 6, lineHeight: 1.5 },
  answerLine: {
    borderBottom: "1px solid #3a3a3a", marginTop: 14, marginLeft: 24,
    height: 28, width: "80%",
  },
  oxRow: { display: "flex", gap: 32, marginTop: 12, marginLeft: 24 },
  oxOpt: { fontSize: 22, fontWeight: 800, color: "#555555" },
  answerSection: {
    marginTop: 48, paddingTop: 28,
    borderTop: "2px dashed #2e2e2e",
  },
  answerTitle: { fontWeight: 800, fontSize: 16, color: "#f1f1f1", marginBottom: 16 },
  answerItem: { fontSize: 14, color: "#a0a0a0", marginBottom: 8, lineHeight: 1.6, overflowWrap: "anywhere" },
  answerNum: { fontWeight: 700, color: "#34d399" },
  explanation: { color: "#8a8a8a", marginLeft: 20, fontSize: 13, overflowWrap: "anywhere" },
};

const printStyle = `
@media print {
  .no-print { display: none !important; }
  body { background: #fff !important; color: #111 !important; }
  .print-sheet {
    background: #fff !important;
    border: none !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    margin: 0 !important;
    padding: 20px 32px !important;
    color: #111 !important;
  }
  .print-sheet * { color: #111 !important; border-color: #ccc !important; }
  .print-doc-title { color: #1e2d5a !important; }
  .print-answer-num { color: #1e2d5a !important; }
  .qm-table tr { break-inside: avoid; }
}
`;

export default function PreviewView({ set, onBack }) {
  const [questions, setQuestions] = useState([]);

  useEffect(() => {
    (async () => {
      try { setQuestions(await getQuestions(set.id)); } catch (e) { console.error(e); }
    })();
    const style = document.createElement("style");
    style.textContent = printStyle;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  const withAnswer = questions.filter(
    (q) => q.explanation || q.answer || q.answerIndex != null || parseAnswers(q.answers).length > 0
  );

  return (
    <div style={S.page}>
      <div className="no-print" style={S.toolbar}>
        <div style={S.toolbarLeft}>
          <button
            style={S.backBtn}
            onClick={onBack}
            onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.color = "#f1f1f1"; }}
            onPointerLeave={(e) => { e.currentTarget.style.color = "#a0a0a0"; }}
          >
            ←
          </button>
          <span style={S.toolbarTitle}>출력 미리보기</span>
        </div>
        <button
          style={S.printBtn}
          onClick={() => window.print()}
          onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.85"; }}
          onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
        >
          🖨 인쇄
        </button>
      </div>

      <div className="print-sheet qm-sheet" style={S.sheet}>
        <div className="print-doc-title qm-doc-title" style={S.docTitle}>{set.title}</div>
        {set.subject && <div style={S.docSub}>{set.subject}</div>}
        <hr style={S.divider} />

        {questions.map((q, i) => {
          const type = normalizeType(q.type);
          // 빈칸이 둘 이상인 FILL 은 아래 정답 목록의 "(번호) 정답" 과 맞춰 본문 빈칸에도 번호를 붙임.
          // 표 칸 안에서는 번호만 붙여 두고 밑줄 앞에서 줄바꿈을 허용 — 좁은 화면의 고정 배치 표에서 옆 칸 글을 덮지 않게
          const numberBlanks = type === "fill" && ((q.text || "").match(/___/g) || []).length > 1;
          return (
            <div key={q.id} style={S.qBlock}>
              <div style={S.qHeader}>
                <span style={S.qNum}>{i + 1}.</span>
                <div style={S.qText}>
                  <TableAwareText
                    text={q.text}
                    renderBlank={numberBlanks
                      ? (bi, { inTable }) => (inTable
                        ? <><span style={{ whiteSpace: "nowrap" }}>({bi + 1})</span><wbr />____</>
                        : <span style={{ whiteSpace: "nowrap" }}>({bi + 1})____</span>)
                      : undefined}
                  />
                </div>
              </div>

              {type === "multiple" && (
                <ul style={S.optList}>
                  {parseOptions(q.options).map((opt, oi) => (
                    <li key={oi} style={S.optItem}>{CIRCLE[oi]} {opt}</li>
                  ))}
                </ul>
              )}

              {type === "short" && <div style={S.answerLine} />}

              {type === "ox" && (
                <div style={S.oxRow}>
                  <span style={S.oxOpt}>O</span>
                  <span style={S.oxOpt}>X</span>
                </div>
              )}
            </div>
          );
        })}

        {withAnswer.length > 0 && (
          <div style={S.answerSection}>
            <div style={S.answerTitle}>정답 및 해설</div>
            {withAnswer.map((q) => {
              const num = questions.indexOf(q) + 1;
              const type = normalizeType(q.type);
              let ans;
              if (type === "multiple") {
                const options = parseOptions(q.options);
                ans = `${CIRCLE[q.answerIndex] ?? ""} ${options[q.answerIndex] ?? ""}`;
              } else if (type === "fill") {
                // 빈칸이 여러 개면 순서 번호를 붙여 표시. 번호와 답 사이는 줄이 바뀌지 않는 공백(NBSP)
                // — '(31)' 끝에서 줄이 바뀌어 '0.44' 가 다음 줄로 떨어지지 않게
                const answers = parseAnswers(q.answers);
                ans = answers.length > 1
                  ? answers.map((a, ai) => `(${ai + 1})${NBSP}${a}`).join(", ")
                  : (answers[0] ?? "");
              } else {
                ans = q.answer || "";
              }
              return (
                <div key={q.id} style={S.answerItem}>
                  <span className="print-answer-num" style={S.answerNum}>{num}번.</span> {ans}
                  {q.explanation && (
                    <div style={S.explanation}>▸ {q.explanation}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
