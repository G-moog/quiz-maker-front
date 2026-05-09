import { useState, useEffect } from "react";
import { getQuestions } from "../api/quiz";

const CIRCLE = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"];

function parseOptions(opts) {
  if (!opts) return [];
  try { return JSON.parse(opts); } catch { return []; }
}

const S = {
  page: { minHeight: "100vh", background: "#f0f2f8", fontFamily: "sans-serif" },
  toolbar: {
    background: "#1e2d5a", color: "#fff", display: "flex",
    alignItems: "center", justifyContent: "space-between",
    padding: "0 24px", height: 52, printDisplay: "none",
  },
  toolbarLeft: { display: "flex", alignItems: "center", gap: 12 },
  backBtn: { background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" },
  toolbarTitle: { fontWeight: 700, fontSize: 16 },
  printBtn: {
    background: "#d97706", color: "#fff", border: "none",
    padding: "7px 22px", borderRadius: 6, fontWeight: 700, cursor: "pointer", fontSize: 13,
  },
  sheet: {
    maxWidth: 800, margin: "32px auto 60px", background: "#fff",
    borderRadius: 10, boxShadow: "0 2px 16px rgba(30,45,90,0.1)", padding: "48px 56px",
  },
  docTitle: {
    textAlign: "center", fontSize: 22, fontWeight: 800,
    color: "#1e2d5a", marginBottom: 6, letterSpacing: 1,
  },
  docSub: { textAlign: "center", fontSize: 14, color: "#6b7280", marginBottom: 36 },
  divider: { border: "none", borderTop: "2px solid #1e2d5a", marginBottom: 32 },
  qBlock: { marginBottom: 32 },
  qHeader: { display: "flex", gap: 8, marginBottom: 8 },
  qNum: { fontWeight: 800, color: "#1e2d5a", fontSize: 15, flexShrink: 0 },
  qText: { fontSize: 15, color: "#111", lineHeight: 1.7, fontWeight: 500 },
  optList: { listStyle: "none", padding: "0 0 0 24px", margin: "10px 0 0" },
  optItem: { fontSize: 14, color: "#374151", marginBottom: 6, lineHeight: 1.5 },
  answerLine: {
    borderBottom: "1px solid #9ca3af", marginTop: 14, marginLeft: 24,
    height: 28, width: "80%",
  },
  oxRow: { display: "flex", gap: 32, marginTop: 12, marginLeft: 24 },
  oxOpt: { fontSize: 22, fontWeight: 800, color: "#374151" },
  answerSection: {
    marginTop: 48, paddingTop: 28,
    borderTop: "2px dashed #d1d5db",
  },
  answerTitle: { fontWeight: 800, fontSize: 16, color: "#1e2d5a", marginBottom: 16 },
  answerItem: { fontSize: 14, color: "#374151", marginBottom: 8, lineHeight: 1.6 },
  answerNum: { fontWeight: 700, color: "#1e2d5a" },
  explanation: { color: "#6b7280", marginLeft: 20, fontSize: 13 },
};

const printStyle = `
@media print {
  .no-print { display: none !important; }
  body { background: #fff; }
  .print-sheet {
    box-shadow: none !important;
    border-radius: 0 !important;
    margin: 0 !important;
    padding: 20px 32px !important;
  }
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
          <button style={S.backBtn} onClick={onBack}>←</button>
          <span style={S.toolbarTitle}>출력 미리보기</span>
        </div>
        <button style={S.printBtn} onClick={() => window.print()}>🖨 인쇄</button>
      </div>

      <div className="print-sheet" style={S.sheet}>
        <div style={S.docTitle}>{set.title}</div>
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
            {withAnswer.map((q, i) => {
              const num = questions.indexOf(q) + 1;
              let ans = "";
              if (q.type === "multiple") {
                const opts = parseOptions(q.options);
                ans = `${CIRCLE[q.answerIndex] ?? ""} ${opts[q.answerIndex] ?? ""}`;
              } else {
                ans = q.answer || "";
              }
              return (
                <div key={q.id} style={S.answerItem}>
                  <span style={S.answerNum}>{num}번.</span> {ans}
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
