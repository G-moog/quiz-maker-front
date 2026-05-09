import { useState, useEffect } from "react";
import { getSets, createSet, deleteSet } from "../api/quiz";

const S = {
  page: {
    minHeight: "100vh",
    background: "#f0f2f8",
    fontFamily: "sans-serif",
  },
  nav: {
    background: "#1e2d5a",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 32px",
    height: 56,
  },
  navTitle: { fontWeight: 700, fontSize: 18, letterSpacing: 1 },
  navRight: { display: "flex", alignItems: "center", gap: 12 },
  username: { fontSize: 14, opacity: 0.8 },
  logoutBtn: {
    background: "rgba(255,255,255,0.15)",
    border: "none",
    color: "#fff",
    padding: "6px 16px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
  },
  body: { padding: "32px 40px" },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  h2: { color: "#1e2d5a", fontSize: 20, fontWeight: 700, margin: 0 },
  addBtn: {
    background: "#d97706",
    color: "#fff",
    border: "none",
    padding: "10px 22px",
    borderRadius: 7,
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: 20,
  },
  card: {
    background: "#fff",
    borderRadius: 10,
    boxShadow: "0 2px 10px rgba(30,45,90,0.08)",
    padding: "22px 24px",
    cursor: "pointer",
    transition: "box-shadow 0.2s",
    position: "relative",
  },
  cardTitle: { fontWeight: 700, fontSize: 16, color: "#1e2d5a", marginBottom: 6 },
  cardSub: { fontSize: 13, color: "#6b7280", marginBottom: 4 },
  cardCount: { fontSize: 12, color: "#9ca3af" },
  delBtn: {
    position: "absolute",
    top: 14,
    right: 14,
    background: "none",
    border: "none",
    color: "#ef4444",
    fontSize: 18,
    cursor: "pointer",
    lineHeight: 1,
  },
  empty: { color: "#9ca3af", fontSize: 15, textAlign: "center", marginTop: 60 },
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
  },
  modal: {
    background: "#fff", borderRadius: 12, padding: "32px 36px", width: 340,
    boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
  },
  modalTitle: { fontWeight: 700, fontSize: 17, color: "#1e2d5a", marginBottom: 20 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 },
  input: {
    width: "100%", padding: "9px 12px", border: "1px solid #d1d5db",
    borderRadius: 7, fontSize: 14, marginBottom: 14, boxSizing: "border-box",
  },
  modalBtns: { display: "flex", gap: 10, marginTop: 4 },
  confirmBtn: {
    flex: 1, padding: "10px 0", background: "#1e2d5a", color: "#fff",
    border: "none", borderRadius: 7, fontWeight: 700, cursor: "pointer", fontSize: 14,
  },
  cancelBtn: {
    flex: 1, padding: "10px 0", background: "#f3f4f6", color: "#374151",
    border: "none", borderRadius: 7, fontWeight: 700, cursor: "pointer", fontSize: 14,
  },
};

export default function DashboardView({ onLogout, onOpenEditor }) {
  const [sets, setSets] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [loading, setLoading] = useState(false);
  const username = localStorage.getItem("username") || "";

  useEffect(() => { fetchSets(); }, []);

  async function fetchSets() {
    try {
      const data = await getSets();
      setSets(data);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleCreate() {
    if (!title.trim()) return;
    setLoading(true);
    try {
      await createSet(title.trim(), subject.trim());
      setShowModal(false);
      setTitle(""); setSubject("");
      fetchSets();
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!confirm("이 세트를 삭제할까요?")) return;
    try {
      await deleteSet(id);
      fetchSets();
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <div style={S.page}>
      <nav style={S.nav}>
        <span style={S.navTitle}>📝 Quiz Maker</span>
        <div style={S.navRight}>
          <span style={S.username}>{username}</span>
          <button style={S.logoutBtn} onClick={onLogout}>로그아웃</button>
        </div>
      </nav>

      <div style={S.body}>
        <div style={S.header}>
          <h2 style={S.h2}>내 문제집</h2>
          <button style={S.addBtn} onClick={() => setShowModal(true)}>+ 새 세트 만들기</button>
        </div>

        {sets.length === 0 ? (
          <p style={S.empty}>아직 문제집이 없습니다. 새 세트를 만들어보세요!</p>
        ) : (
          <div style={S.grid}>
            {sets.map((s) => (
              <div key={s.id} style={S.card} onClick={() => onOpenEditor(s)}>
                <button style={S.delBtn} onClick={(e) => handleDelete(e, s.id)}>✕</button>
                <div style={S.cardTitle}>{s.title}</div>
                {s.subject && <div style={S.cardSub}>📚 {s.subject}</div>}
                <div style={S.cardCount}>문항 {s.questionCount}개</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div style={S.overlay} onClick={() => setShowModal(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>새 문제집 만들기</div>
            <label style={S.label}>제목 *</label>
            <input style={S.input} value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 2025 수능 국어" autoFocus />
            <label style={S.label}>과목</label>
            <input style={S.input} value={subject} onChange={(e) => setSubject(e.target.value)}
              placeholder="예: 국어, 수학 ..." />
            <div style={S.modalBtns}>
              <button style={S.cancelBtn} onClick={() => setShowModal(false)}>취소</button>
              <button style={S.confirmBtn} onClick={handleCreate} disabled={loading}>
                {loading ? "생성 중..." : "만들기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
