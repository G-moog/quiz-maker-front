import { useState, useEffect } from "react";
import { getQuestions, addQuestion, updateQuestion, deleteQuestion } from "../api/quiz";

const ANTHROPIC_API_KEY = "YOUR_API_KEY_HERE"; // TODO: 환경변수로 교체

const TYPE_LABEL = { multiple: "객관식", short: "주관식", ox: "O/X" };

const blank = (type) => ({
  type,
  text: "",
  options: type === "multiple" ? JSON.stringify(["", "", "", ""]) : null,
  answerIndex: type === "multiple" ? 0 : null,
  answer: "",
  explanation: "",
  orderIndex: 0,
});

const S = {
  page: { minHeight: "100vh", background: "#f0f2f8", fontFamily: "sans-serif" },
  nav: {
    background: "#1e2d5a", color: "#fff", display: "flex",
    alignItems: "center", justifyContent: "space-between", padding: "0 24px", height: 52,
  },
  navLeft: { display: "flex", alignItems: "center", gap: 12 },
  backBtn: { background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" },
  navTitle: { fontWeight: 700, fontSize: 16 },
  navRight: { display: "flex", gap: 10 },
  previewBtn: {
    background: "#d97706", color: "#fff", border: "none",
    padding: "7px 18px", borderRadius: 6, fontWeight: 700, cursor: "pointer", fontSize: 13,
  },
  aiBtn: {
    background: "rgba(255,255,255,0.15)", color: "#fff", border: "none",
    padding: "7px 18px", borderRadius: 6, fontWeight: 700, cursor: "pointer", fontSize: 13,
  },
  layout: { display: "flex", height: "calc(100vh - 52px)" },
  sidebar: {
    width: 300, background: "#fff", borderRight: "1px solid #e5e7ef",
    display: "flex", flexDirection: "column", overflowY: "auto",
  },
  addBtns: { padding: "16px 14px", display: "flex", gap: 8, borderBottom: "1px solid #f0f2f8" },
  typeBtn: (color) => ({
    flex: 1, padding: "7px 0", background: color, color: "#fff",
    border: "none", borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: "pointer",
  }),
  qItem: (active) => ({
    padding: "12px 16px", borderBottom: "1px solid #f0f2f8", cursor: "pointer",
    background: active ? "#eef2ff" : "#fff", display: "flex",
    justifyContent: "space-between", alignItems: "flex-start",
  }),
  qNum: { fontSize: 11, color: "#6b7280", marginBottom: 3 },
  qText: { fontSize: 13, color: "#1e2d5a", fontWeight: 500, lineHeight: 1.4 },
  qDel: {
    background: "none", border: "none", color: "#ef4444",
    cursor: "pointer", fontSize: 16, padding: "0 0 0 8px", flexShrink: 0,
  },
  editor: { flex: 1, padding: "28px 36px", overflowY: "auto" },
  empty: { color: "#9ca3af", textAlign: "center", marginTop: 80 },
  fieldLabel: { fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6, display: "block" },
  textarea: {
    width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 7,
    fontSize: 14, marginBottom: 16, boxSizing: "border-box", resize: "vertical", minHeight: 72,
  },
  input: {
    width: "100%", padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 7,
    fontSize: 14, marginBottom: 14, boxSizing: "border-box",
  },
  optionRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  optionNum: { color: "#1e2d5a", fontWeight: 700, width: 20, flexShrink: 0 },
  optionInput: {
    flex: 1, padding: "8px 10px", border: "1px solid #d1d5db",
    borderRadius: 6, fontSize: 13, boxSizing: "border-box",
  },
  radio: { accentColor: "#1e2d5a" },
  saveBtn: {
    background: "#1e2d5a", color: "#fff", border: "none",
    padding: "10px 28px", borderRadius: 7, fontWeight: 700, cursor: "pointer", fontSize: 14,
  },
  sectionTitle: { fontWeight: 700, fontSize: 15, color: "#1e2d5a", marginBottom: 16 },
  typeBadge: (type) => ({
    display: "inline-block", fontSize: 11, fontWeight: 700, borderRadius: 4, padding: "2px 7px",
    marginBottom: 12,
    background: type === "multiple" ? "#dbeafe" : type === "short" ? "#d1fae5" : "#fef3c7",
    color: type === "multiple" ? "#1d4ed8" : type === "short" ? "#065f46" : "#92400e",
  }),
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
  },
  modal: {
    background: "#fff", borderRadius: 12, padding: "32px 36px",
    width: 380, boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
  },
  modalTitle: { fontWeight: 700, fontSize: 16, color: "#1e2d5a", marginBottom: 16 },
  modalBtns: { display: "flex", gap: 10, marginTop: 8 },
  confirmBtn: {
    flex: 1, padding: "10px 0", background: "#1e2d5a", color: "#fff",
    border: "none", borderRadius: 7, fontWeight: 700, cursor: "pointer",
  },
  cancelBtn: {
    flex: 1, padding: "10px 0", background: "#f3f4f6", color: "#374151",
    border: "none", borderRadius: 7, fontWeight: 700, cursor: "pointer",
  },
};

function parseOptions(opts) {
  if (!opts) return ["", "", "", ""];
  try { return JSON.parse(opts); } catch { return ["", "", "", ""]; }
}

export default function EditorView({ set, onBack, onPreview }) {
  const [questions, setQuestions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [aiCount, setAiCount] = useState(3);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => { fetchQ(); }, []);

  async function fetchQ() {
    try { setQuestions(await getQuestions(set.id)); } catch (e) { console.error(e); }
  }

  async function handleAdd(type) {
    try {
      const q = await addQuestion(set.id, { ...blank(type), orderIndex: questions.length });
      await fetchQ();
      setSelected(q.id ?? questions.length);
      setForm({ ...q });
    } catch (e) { alert(e.message); }
  }

  function handleSelect(q) {
    setSelected(q.id);
    setForm({ ...q });
  }

  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!confirm("문항을 삭제할까요?")) return;
    try {
      await deleteQuestion(id);
      if (selected === id) { setSelected(null); setForm(null); }
      fetchQ();
    } catch (e) { alert(e.message); }
  }

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    try {
      const payload = { ...form };
      if (form.type === "multiple") {
        payload.options = JSON.stringify(parseOptions(form.options));
      }
      await updateQuestion(form.id, payload);
      fetchQ();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  }

  function setOpt(idx, val) {
    const opts = parseOptions(form.options);
    opts[idx] = val;
    setForm((f) => ({ ...f, options: JSON.stringify(opts) }));
  }

  async function handleAIGenerate() {
    if (!aiTopic.trim()) return;
    setAiLoading(true);
    try {
      const prompt = `다음 주제로 객관식 문항 ${aiCount}개를 JSON 배열로 생성해줘. 주제: ${aiTopic}\n각 항목: {"text":"문제","options":["①","②","③","④"],"answerIndex":0,"explanation":"해설"}`;
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 2048,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text ?? "";
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) throw new Error("JSON 파싱 실패");
      const items = JSON.parse(match[0]);
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        await addQuestion(set.id, {
          type: "multiple",
          text: item.text,
          options: JSON.stringify(item.options),
          answerIndex: item.answerIndex ?? 0,
          answer: "",
          explanation: item.explanation ?? "",
          orderIndex: questions.length + i,
        });
      }
      await fetchQ();
      setShowAI(false);
      setAiTopic("");
    } catch (e) {
      alert("AI 생성 실패: " + e.message);
    } finally {
      setAiLoading(false);
    }
  }

  const opts = form ? parseOptions(form.options) : [];

  return (
    <div style={S.page}>
      <nav style={S.nav}>
        <div style={S.navLeft}>
          <button style={S.backBtn} onClick={onBack}>←</button>
          <span style={S.navTitle}>{set.title}</span>
        </div>
        <div style={S.navRight}>
          <button style={S.aiBtn} onClick={() => setShowAI(true)}>✨ AI 생성</button>
          <button style={S.previewBtn} onClick={() => onPreview(set)}>출력 미리보기</button>
        </div>
      </nav>

      <div style={S.layout}>
        {/* 사이드바 */}
        <div style={S.sidebar}>
          <div style={S.addBtns}>
            <button style={S.typeBtn("#1d4ed8")} onClick={() => handleAdd("multiple")}>객관식</button>
            <button style={S.typeBtn("#065f46")} onClick={() => handleAdd("short")}>주관식</button>
            <button style={S.typeBtn("#92400e")} onClick={() => handleAdd("ox")}>O/X</button>
          </div>
          {questions.map((q, i) => (
            <div key={q.id} style={S.qItem(selected === q.id)} onClick={() => handleSelect(q)}>
              <div>
                <div style={S.qNum}>{i + 1}번 · {TYPE_LABEL[q.type]}</div>
                <div style={S.qText}>{q.text?.slice(0, 40) || "(내용 없음)"}</div>
              </div>
              <button style={S.qDel} onClick={(e) => handleDelete(e, q.id)}>✕</button>
            </div>
          ))}
        </div>

        {/* 편집 영역 */}
        <div style={S.editor}>
          {!form ? (
            <div style={S.empty}>왼쪽에서 문항을 선택하거나 새 문항을 추가하세요.</div>
          ) : (
            <>
              <div style={S.typeBadge(form.type)}>{TYPE_LABEL[form.type]}</div>
              <div style={S.sectionTitle}>문항 편집</div>

              <label style={S.fieldLabel}>문제</label>
              <textarea style={S.textarea} value={form.text || ""}
                onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))} />

              {form.type === "multiple" && (
                <>
                  <label style={S.fieldLabel}>보기 (정답 라디오 선택)</label>
                  {opts.map((opt, i) => (
                    <div key={i} style={S.optionRow}>
                      <input type="radio" style={S.radio} name="answer"
                        checked={form.answerIndex === i}
                        onChange={() => setForm((f) => ({ ...f, answerIndex: i }))} />
                      <span style={S.optionNum}>{"①②③④"[i]}</span>
                      <input style={S.optionInput} value={opt}
                        onChange={(e) => setOpt(i, e.target.value)} placeholder={`보기 ${i + 1}`} />
                    </div>
                  ))}
                </>
              )}

              {form.type === "short" && (
                <>
                  <label style={S.fieldLabel}>정답</label>
                  <input style={S.input} value={form.answer || ""}
                    onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))} />
                </>
              )}

              {form.type === "ox" && (
                <>
                  <label style={S.fieldLabel}>정답</label>
                  <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                    {["O", "X"].map((v) => (
                      <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                        <input type="radio" style={S.radio} name="oxAnswer"
                          checked={form.answer === v}
                          onChange={() => setForm((f) => ({ ...f, answer: v }))} />
                        <span style={{ fontSize: 20, fontWeight: 700 }}>{v}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}

              <label style={S.fieldLabel}>해설 (선택)</label>
              <textarea style={{ ...S.textarea, minHeight: 54 }} value={form.explanation || ""}
                onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value }))} />

              <button style={S.saveBtn} onClick={handleSave} disabled={saving}>
                {saving ? "저장 중..." : "저장"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* AI 생성 모달 */}
      {showAI && (
        <div style={S.overlay} onClick={() => setShowAI(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>✨ AI 문항 생성</div>
            <label style={{ ...S.fieldLabel, display: "block", marginBottom: 6 }}>주제</label>
            <input style={{ ...S.input, marginBottom: 14 }} value={aiTopic}
              onChange={(e) => setAiTopic(e.target.value)} placeholder="예: 조선시대 역사" autoFocus />
            <label style={{ ...S.fieldLabel, display: "block", marginBottom: 6 }}>생성할 문항 수</label>
            <input style={{ ...S.input }} type="number" min={1} max={10} value={aiCount}
              onChange={(e) => setAiCount(Number(e.target.value))} />
            <div style={S.modalBtns}>
              <button style={S.cancelBtn} onClick={() => setShowAI(false)}>취소</button>
              <button style={S.confirmBtn} onClick={handleAIGenerate} disabled={aiLoading}>
                {aiLoading ? "생성 중..." : "생성"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
