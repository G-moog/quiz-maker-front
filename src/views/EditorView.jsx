import { useState, useEffect } from "react";
import { getQuestions, addQuestion, updateQuestion, deleteQuestion } from "../api/quiz";

const ANTHROPIC_API_KEY = "YOUR_API_KEY_HERE"; // TODO: 환경변수로 교체

const TYPE_LABEL = { multiple: "객관식", short: "주관식", ox: "O/X" };

const TYPE_COLOR = {
  multiple: { text: "#60a5fa", bg: "rgba(96,165,250,0.1)", border: "#60a5fa" },
  short:    { text: "#34d399", bg: "rgba(52,211,153,0.1)",  border: "#34d399" },
  ox:       { text: "#f87171", bg: "rgba(248,113,113,0.1)", border: "#f87171" },
};

function emptyForm(type, orderIndex = 0) {
  return {
    type,
    text: "",
    options: type === "multiple" ? ["", "", "", ""] : null,
    answerIndex: type === "multiple" ? 0 : null,
    answer: "",
    explanation: "",
    orderIndex,
  };
}

function parseOptions(opts) {
  if (!opts) return ["", "", "", ""];
  if (Array.isArray(opts)) return opts;
  try { return JSON.parse(opts); } catch { return ["", "", "", ""]; }
}

const S = {
  page: { minHeight: "100vh", background: "#0f0f0f", fontFamily: "system-ui, sans-serif" },
  nav: {
    background: "#1a1a1a", borderBottom: "1px solid #2e2e2e",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "0 24px", height: 52,
  },
  navLeft: { display: "flex", alignItems: "center", gap: 12 },
  backBtn: {
    background: "none", border: "none", color: "#a0a0a0",
    fontSize: 20, cursor: "pointer", transition: "color 0.15s ease",
  },
  navTitle: { fontWeight: 700, fontSize: 16, color: "#f1f1f1" },
  navRight: { display: "flex", gap: 10 },
  previewBtn: {
    background: "#242424", color: "#f1f1f1", border: "1px solid #2e2e2e",
    padding: "7px 18px", borderRadius: 6, fontWeight: 700, cursor: "pointer",
    fontSize: 13, transition: "opacity 0.15s ease",
  },
  aiBtn: {
    background: "#f59e0b", color: "#000000", border: "none",
    padding: "7px 18px", borderRadius: 6, fontWeight: 700, cursor: "pointer",
    fontSize: 13, transition: "opacity 0.15s ease",
  },
  layout: { display: "flex", height: "calc(100vh - 52px)" },

  // 사이드바
  sidebar: {
    width: 300, background: "#1a1a1a", borderRight: "1px solid #2e2e2e",
    display: "flex", flexDirection: "column", overflowY: "auto",
  },
  addBtns: { padding: "16px 14px", display: "flex", gap: 8, borderBottom: "1px solid #2e2e2e" },
  typeBtn: (color) => ({
    flex: 1, padding: "7px 0", background: "transparent",
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
  qNum: { fontSize: 11, color: "#555555", marginBottom: 3 },
  qText: { fontSize: 13, color: "#f1f1f1", fontWeight: 500, lineHeight: 1.4 },
  qDel: {
    background: "none", border: "none", color: "#555555",
    cursor: "pointer", fontSize: 16, padding: "0 0 0 8px", flexShrink: 0,
    transition: "color 0.15s ease",
  },
  sideEmpty: { color: "#555555", fontSize: 13, textAlign: "center", padding: "32px 16px" },

  // 편집 패널
  editor: { flex: 1, padding: "28px 36px", overflowY: "auto", background: "#0f0f0f" },
  idle: { color: "#555555", textAlign: "center", marginTop: 80, fontSize: 15 },
  typeBadge: (type) => ({
    display: "inline-block", fontSize: 11, fontWeight: 700, borderRadius: 4,
    padding: "2px 7px", marginBottom: 16,
    background: TYPE_COLOR[type]?.bg ?? "rgba(245,158,11,0.1)",
    color: TYPE_COLOR[type]?.text ?? "#f59e0b",
  }),
  modeLabel: { fontWeight: 700, fontSize: 15, color: "#f1f1f1", marginBottom: 20 },
  fieldLabel: { fontSize: 13, fontWeight: 600, color: "#a0a0a0", marginBottom: 6, display: "block" },
  textarea: {
    width: "100%", padding: "10px 12px",
    background: "#242424", border: "1px solid #2e2e2e", borderRadius: 7,
    fontSize: 14, marginBottom: 16, color: "#f1f1f1",
    resize: "vertical", minHeight: 80, outline: "none",
    transition: "border-color 0.15s ease",
  },
  input: {
    width: "100%", padding: "9px 12px",
    background: "#242424", border: "1px solid #2e2e2e", borderRadius: 7,
    fontSize: 14, marginBottom: 14, color: "#f1f1f1", outline: "none",
    transition: "border-color 0.15s ease",
  },
  optionRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  optionNum: { color: "#a0a0a0", fontWeight: 700, width: 20, flexShrink: 0 },
  optionInput: (selected) => ({
    flex: 1, padding: "8px 10px",
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
    border: `2px solid ${selected
      ? (v === "O" ? "#34d399" : "#f87171")
      : "#2e2e2e"}`,
    background: selected
      ? (v === "O" ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)")
      : "#242424",
    color: v === "O" ? "#34d399" : "#f87171",
    transition: "all 0.15s ease",
  }),
  btnRow: { display: "flex", gap: 10, marginTop: 4 },
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

  // AI 모달
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
  },
  modal: {
    background: "#1a1a1a", borderRadius: 12, padding: "32px 36px",
    width: 380, border: "1px solid #2e2e2e",
    boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
  },
  modalTitle: { fontWeight: 700, fontSize: 16, color: "#f1f1f1", marginBottom: 16 },
  modalBtns: { display: "flex", gap: 10, marginTop: 8 },
  confirmBtn: {
    flex: 1, padding: "10px 0", background: "#f59e0b", color: "#000000",
    border: "none", borderRadius: 7, fontWeight: 700, cursor: "pointer",
    transition: "opacity 0.15s ease",
  },
  modalCancelBtn: {
    flex: 1, padding: "10px 0", background: "#242424", color: "#a0a0a0",
    border: "1px solid #2e2e2e", borderRadius: 7, fontWeight: 700, cursor: "pointer",
    transition: "opacity 0.15s ease",
  },
  modalInput: {
    width: "100%", padding: "9px 12px",
    background: "#242424", border: "1px solid #2e2e2e", borderRadius: 7,
    fontSize: 14, marginBottom: 14, color: "#f1f1f1", outline: "none",
    transition: "border-color 0.15s ease",
  },
};

function focusGold(e) { e.target.style.borderColor = "#f59e0b"; }
function blurGray(e) { e.target.style.borderColor = "#2e2e2e"; }

export default function EditorView({ set, onBack, onPreview }) {
  const [questions, setQuestions] = useState([]);
  // form: null(idle) | { ...fields, id?(edit모드) }
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

  // 유형 버튼 클릭 → 빈 폼 표시 (API 호출 없음)
  function handleSelectType(type) {
    setForm(emptyForm(type, questions.length));
  }

  // 기존 문항 클릭 → 편집 폼 표시
  function handleSelectQuestion(q) {
    setForm({
      id: q.id,
      type: q.type,
      text: q.text || "",
      options: parseOptions(q.options),
      answerIndex: q.answerIndex ?? 0,
      answer: q.answer || "",
      explanation: q.explanation || "",
      orderIndex: q.orderIndex,
    });
  }

  // 저장 버튼
  async function handleSave() {
    if (!form) return;
    if (!form.text.trim()) {
      alert("문제 내용을 입력해주세요.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        type: form.type,
        text: form.text,
        options: form.type === "multiple" ? JSON.stringify(form.options) : null,
        answerIndex: form.type === "multiple" ? form.answerIndex : null,
        answer: form.answer,
        explanation: form.explanation,
        orderIndex: form.orderIndex,
      };
      if (form.id) {
        await updateQuestion(form.id, payload);
      } else {
        await addQuestion(set.id, payload);
        setForm(null); // 새 문항 저장 후 폼 초기화
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

  function setOpt(idx, val) {
    const opts = [...(form.options ?? ["", "", "", ""])];
    opts[idx] = val;
    setForm((f) => ({ ...f, options: opts }));
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

  const isEdit = !!form?.id;
  const opts = form?.options ?? ["", "", "", ""];

  return (
    <div style={S.page}>
      <nav style={S.nav}>
        <div style={S.navLeft}>
          <button
            style={S.backBtn}
            onClick={onBack}
            onMouseOver={(e) => { e.currentTarget.style.color = "#f1f1f1"; }}
            onMouseOut={(e) => { e.currentTarget.style.color = "#a0a0a0"; }}
          >←</button>
          <span style={S.navTitle}>{set.title}</span>
        </div>
        <div style={S.navRight}>
          <button
            style={S.aiBtn}
            onClick={() => setShowAI(true)}
            onMouseOver={(e) => { e.currentTarget.style.opacity = "0.85"; }}
            onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
          >✨ AI 생성</button>
          <button
            style={S.previewBtn}
            onClick={() => onPreview(set)}
            onMouseOver={(e) => { e.currentTarget.style.opacity = "0.7"; }}
            onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
          >출력 미리보기</button>
        </div>
      </nav>

      <div style={S.layout}>
        {/* 사이드바 */}
        <div style={S.sidebar}>
          <div style={S.addBtns}>
            {["multiple", "short", "ox"].map((type) => (
              <button
                key={type}
                style={S.typeBtn(TYPE_COLOR[type].text)}
                onClick={() => handleSelectType(type)}
                onMouseOver={(e) => { e.currentTarget.style.background = TYPE_COLOR[type].bg; }}
                onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                {TYPE_LABEL[type]}
              </button>
            ))}
          </div>

          {questions.length === 0 ? (
            <div style={S.sideEmpty}>문항을 추가해보세요</div>
          ) : (
            questions.map((q, i) => (
              <div
                key={q.id}
                style={S.qItem(form?.id === q.id, q.type)}
                onClick={() => handleSelectQuestion(q)}
              >
                <div>
                  <div style={S.qNum}>{i + 1}번 · {TYPE_LABEL[q.type]}</div>
                  <div style={S.qText}>{q.text?.slice(0, 40) || "(내용 없음)"}</div>
                </div>
                <button
                  style={S.qDel}
                  onClick={(e) => handleDelete(e, q.id)}
                  onMouseOver={(e) => { e.currentTarget.style.color = "#f87171"; }}
                  onMouseOut={(e) => { e.currentTarget.style.color = "#555555"; }}
                >✕</button>
              </div>
            ))
          )}
        </div>

        {/* 우측 편집 패널 */}
        <div style={S.editor}>
          {!form ? (
            <div style={S.idle}>
              위에서 유형을 선택해 새 문항을 작성하거나,<br />
              목록에서 문항을 클릭해 편집하세요.
            </div>
          ) : (
            <>
              <div style={S.typeBadge(form.type)}>{TYPE_LABEL[form.type]}</div>
              <div style={S.modeLabel}>{isEdit ? "문항 편집" : "새 문항 작성"}</div>

              {/* 문제 */}
              <label style={S.fieldLabel}>문제</label>
              <textarea
                style={S.textarea}
                value={form.text}
                onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
                onFocus={focusGold}
                onBlur={blurGray}
                placeholder="문제를 입력하세요"
              />

              {/* 객관식 보기 */}
              {form.type === "multiple" && (
                <>
                  <label style={S.fieldLabel}>보기 (정답 라디오 선택)</label>
                  {opts.map((opt, i) => (
                    <div key={i} style={S.optionRow}>
                      <input
                        type="radio"
                        name="answerIndex"
                        checked={form.answerIndex === i}
                        onChange={() => setForm((f) => ({ ...f, answerIndex: i }))}
                        style={{ accentColor: "#60a5fa", cursor: "pointer" }}
                      />
                      <span style={S.optionNum}>{"①②③④"[i]}</span>
                      <input
                        style={S.optionInput(form.answerIndex === i)}
                        value={opt}
                        onChange={(e) => setOpt(i, e.target.value)}
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

              {/* 주관식 모범 답안 */}
              {form.type === "short" && (
                <>
                  <label style={S.fieldLabel}>모범 답안</label>
                  <input
                    style={S.input}
                    value={form.answer}
                    onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
                    onFocus={focusGold}
                    onBlur={blurGray}
                    placeholder="모범 답안을 입력하세요"
                  />
                </>
              )}

              {/* O·X 정답 */}
              {form.type === "ox" && (
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

              {/* 해설 */}
              <label style={S.fieldLabel}>해설 (선택)</label>
              <input
                style={{ ...S.input, marginBottom: 20 }}
                value={form.explanation}
                onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value }))}
                onFocus={focusGold}
                onBlur={blurGray}
                placeholder="해설을 입력하세요 (선택)"
              />

              {/* 버튼 */}
              <div style={S.btnRow}>
                <button
                  style={S.cancelBtn}
                  onClick={() => setForm(null)}
                  onMouseOver={(e) => { e.currentTarget.style.opacity = "0.7"; }}
                  onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
                >
                  취소
                </button>
                <button
                  style={S.saveBtn}
                  onClick={handleSave}
                  disabled={saving}
                  onMouseOver={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                  onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
                >
                  {saving ? "저장 중..." : "저장"}
                </button>
              </div>
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
            <input
              style={S.modalInput}
              value={aiTopic}
              onChange={(e) => setAiTopic(e.target.value)}
              onFocus={focusGold}
              onBlur={blurGray}
              placeholder="예: 조선시대 역사"
              autoFocus
            />
            <label style={{ ...S.fieldLabel, display: "block", marginBottom: 6 }}>생성할 문항 수</label>
            <input
              style={S.modalInput}
              type="number"
              min={1}
              max={10}
              value={aiCount}
              onChange={(e) => setAiCount(Number(e.target.value))}
              onFocus={focusGold}
              onBlur={blurGray}
            />
            <div style={S.modalBtns}>
              <button
                style={S.modalCancelBtn}
                onClick={() => setShowAI(false)}
                onMouseOver={(e) => { e.currentTarget.style.opacity = "0.7"; }}
                onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
              >취소</button>
              <button
                style={S.confirmBtn}
                onClick={handleAIGenerate}
                disabled={aiLoading}
                onMouseOver={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
              >{aiLoading ? "생성 중..." : "생성"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
