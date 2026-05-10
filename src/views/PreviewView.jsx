import { useState, useEffect } from "react";
import { getQuestions } from "../api/quiz";

const CIRCLE = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"];

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
  backBtn: { background: "none", border: "none", color: "#a0a0a0", fontSize: 20, cursor: "pointer", transition: "color 0.15s ease" },
  toolbarTitle: { fontWeight: 700, fontSize: 16, color: "#f1f1f1" },
  printBtn: {
    background: "#f59e0b", color: "#000000", border: "none",
    padding: "7px 22px", borderRadius: 6, fontWeight: 700, cursor: "pointer", fontSize: 13,
    transition: "opacity 0.15s ease",
  },
  sheet: {
    maxWidth: 800, margin: "32px auto 60px", background: "#1a1a1a",
    borderRadius: 10, border: "1px solid #2e2e2e",
    boxShadow: "0 4px 24px rgba(0,0,0,0.3)", padding: "48px 56px",
  },
  docTitle: {
    textAlign: "center", fontSize: 22, fontWeight: 800,
    color: "#f59e0b", marginBottom: 6, letterSpacing: 1,
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
  answerItem: { fontSize: 14, color: "#a0a0a0", marginBottom: 8, lineHeight: 1.6 },
  answerNum: { fontWeight: 700, color: "#34d399" },
  explanation: { color: "#555555", marginLeft: 20, fontSize: 13 },
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

  const withAnswer = questions.filter((q) => q.explanation || q.answer || q.answerIndex != null);

  return (
    <div style={S.page}>
      <div className="no-print" style={S.toolbar}>
        <div style={S.toolbarLeft}>
          <button
            style={S.backBtn}
            onClick={onBack}
            onMouseOver={(e) => { e.currentTarget.style.color = "#f1f1f1"; }}
            onMouseOut={(e) => { e.currentTarget.style.color = "#a0a0a0"; }}
          >
            ←
          </button>
          <span style={S.toolbarTitle}>출력 미리보기</span>
        </div>
        <button
          style={S.printBtn}
          onClick={() => window.print()}
          onMouseOver={(e) => { e.currentTarget.style.opacity = "0.85"; }}
          onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
        >
          🖨 인쇄
        </button>
      </div>

      <div className="print-sheet" style={S.sheet}>
        <div className="print-doc-title" style={S.docTitle}>{set.title}</div>
        {set.subject && <div style={S.docSub}>{set.subject}</div>}
        <hr style={S.divider} />

        {questions.map((q, i) => (
          <div key={q.id} style={S.qBlock}>
            <div style={S.qHeader}>
              <span style={S.qNum}>{i + 1}.</span>
              <span style={S.qText}>{q.text}</span>
            </div>

            {q.type === "multiple" && (
              <ul style={S.optList}>
                {parseOptions(q.options).map((opt, oi) => (
                  <li key={oi} style={S.optItem}>{CIRCLE[oi]} {opt}</li>
                ))}
              </ul>
            )}

            {q.type === "short" && <div style={S.answerLine} />}

            {q.type === "ox" && (
              <div style={S.oxRow}>
                <span style={S.oxOpt}>O</span>
                <span style={S.oxOpt}>X</span>
              </div>
            )}
          </div>
        ))}

        {withAnswer.length > 0 && (
          <div style={S.answerSection}>
            <div style={S.answerTitle}>정답 및 해설</div>
            {withAnswer.map((q) => {
              const num = questions.indexOf(q) + 1;
              let ans = "";
              if (q.type === "multiple") {
                const options = parseOptions(q.options);
                ans = `${CIRCLE[q.answerIndex] ?? ""} ${options[q.answerIndex] ?? ""}`;
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
