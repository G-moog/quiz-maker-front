import { useState, useEffect } from "react";
import { getSets, createSet, deleteSet } from "../api/quiz";

const S = {
  page: {
    minHeight: "100vh",
    background: "#0f0f0f",
    fontFamily: "system-ui, sans-serif",
  },
  nav: {
    background: "#1a1a1a",
    borderBottom: "1px solid #2e2e2e",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 32px",
    height: 56,
  },
  navTitle: { fontWeight: 700, fontSize: 18, letterSpacing: 1, color: "#f59e0b" },
  navRight: { display: "flex", alignItems: "center", gap: 12 },
  username: { fontSize: 14, color: "#a0a0a0" },
  roleBadge: (role) => {
    const map = {
      ADMIN:   { bg: "rgba(248,113,113,0.15)", color: "#f87171",  label: "관리자" },
      MANAGER: { bg: "rgba(245,158,11,0.15)",  color: "#f59e0b",  label: "중간관리자" },
      USER:    { bg: "rgba(96,165,250,0.15)",  color: "#60a5fa",  label: "일반사용자" },
    };
    const { bg, color, label } = map[role] ?? map.USER;
    return {
      display: "inline-block", fontSize: 11, fontWeight: 700,
      padding: "2px 8px", borderRadius: 20,
      background: bg, color,
    };
  },
  logoutBtn: {
    background: "#242424",
    border: "1px solid #2e2e2e",
    color: "#a0a0a0",
    padding: "6px 16px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    transition: "opacity 0.15s ease",
  },
  body: { padding: "32px 40px" },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  h2: { color: "#f1f1f1", fontSize: 20, fontWeight: 700, margin: 0 },
  addBtn: {
    background: "#f59e0b",
    color: "#000000",
    border: "none",
    padding: "10px 22px",
    borderRadius: 7,
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    transition: "opacity 0.15s ease",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: 20,
  },
  card: {
    background: "#1a1a1a",
    borderRadius: 10,
    border: "1px solid #2e2e2e",
    padding: "22px 24px 18px",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    transition: "border-color 0.15s ease, transform 0.15s ease",
  },
  cardTitle: { fontWeight: 700, fontSize: 16, color: "#f1f1f1", marginBottom: 8, paddingRight: 24 },
  subjectBadge: {
    display: "inline-block",
    background: "#242424",
    color: "#a0a0a0",
    fontSize: 12,
    padding: "3px 10px",
    borderRadius: 20,
    marginBottom: 10,
  },
  cardMeta: { fontSize: 12, color: "#555555", marginBottom: 16 },
  cardBtns: { display: "flex", gap: 8, marginTop: "auto" },
  editBtn: {
    flex: 1,
    padding: "8px 0",
    background: "#242424",
    color: "#a0a0a0",
    border: "1px solid #2e2e2e",
    borderRadius: 6,
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    transition: "opacity 0.15s ease",
  },
  solveBtn: {
    flex: 1,
    padding: "8px 0",
    background: "#f59e0b",
    color: "#000000",
    border: "none",
    borderRadius: 6,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    transition: "opacity 0.15s ease",
  },
  delBtn: {
    position: "absolute",
    top: 14,
    right: 14,
    background: "none",
    border: "none",
    color: "#555555",
    fontSize: 16,
    cursor: "pointer",
    lineHeight: 1,
    transition: "color 0.15s ease",
  },
  emptyWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 80,
    gap: 12,
  },
  emptyIcon: { fontSize: 48, color: "#555555" },
  emptyText: { color: "#555555", fontSize: 15 },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.75)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  modal: {
    background: "#1a1a1a",
    borderRadius: 12,
    border: "1px solid #2e2e2e",
    padding: "32px 36px",
    width: 360,
    boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
    position: "relative",
  },
  modalTitle: { fontWeight: 700, fontSize: 17, color: "#f1f1f1", marginBottom: 24 },
  modalClose: {
    position: "absolute",
    top: 16,
    right: 18,
    background: "none",
    border: "none",
    color: "#555555",
    fontSize: 20,
    cursor: "pointer",
    lineHeight: 1,
    transition: "color 0.15s ease",
  },
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: "#a0a0a0",
    marginBottom: 6,
  },
  input: {
    width: "100%",
    padding: "9px 12px",
    background: "#242424",
    border: "1px solid #2e2e2e",
    borderRadius: 7,
    fontSize: 14,
    marginBottom: 16,
    color: "#f1f1f1",
    outline: "none",
    transition: "border-color 0.15s ease",
  },
  modalBtns: { display: "flex", gap: 10, marginTop: 8 },
  confirmBtn: {
    flex: 1,
    padding: "10px 0",
    background: "#f59e0b",
    color: "#000000",
    border: "none",
    borderRadius: 7,
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 14,
    transition: "opacity 0.15s ease",
  },
  cancelBtn: {
    flex: 1,
    padding: "10px 0",
    background: "#242424",
    color: "#a0a0a0",
    border: "1px solid #2e2e2e",
    borderRadius: 7,
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 14,
    transition: "opacity 0.15s ease",
  },
};

function focusGold(e) { e.target.style.borderColor = "#f59e0b"; }
function blurGray(e) { e.target.style.borderColor = "#2e2e2e"; }

const ROLE_LABEL = { ADMIN: "관리자", MANAGER: "중간관리자", USER: "일반사용자" };

export default function DashboardView({ onLogout, onOpenEditor, onSolve, role = "USER" }) {
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
      setTitle("");
      setSubject("");
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
          <span style={S.roleBadge(role)}>{ROLE_LABEL[role] ?? "일반사용자"}</span>
          <button
            style={S.logoutBtn}
            onClick={onLogout}
            onMouseOver={(e) => { e.currentTarget.style.opacity = "0.7"; }}
            onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
          >
            로그아웃
          </button>
        </div>
      </nav>

      <div style={S.body}>
        <div style={S.header}>
          <h2 style={S.h2}>내 문제집</h2>
          <button
            style={S.addBtn}
            onClick={() => setShowModal(true)}
            onMouseOver={(e) => { e.currentTarget.style.opacity = "0.85"; }}
            onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
          >
            + 새 세트 만들기
          </button>
        </div>

        {sets.length === 0 ? (
          <div style={S.emptyWrap}>
            <div style={S.emptyIcon}>📭</div>
            <p style={S.emptyText}>아직 문제집이 없습니다. 새 세트를 만들어보세요!</p>
          </div>
        ) : (
          <div style={S.grid}>
            {sets.map((s) => (
              <div
                key={s.id}
                style={S.card}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = "#f59e0b";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = "#2e2e2e";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <button
                  style={S.delBtn}
                  onClick={(e) => handleDelete(e, s.id)}
                  onMouseOver={(e) => { e.currentTarget.style.color = "#f87171"; }}
                  onMouseOut={(e) => { e.currentTarget.style.color = "#555555"; }}
                >
                  ✕
                </button>
                <div style={S.cardTitle}>{s.title}</div>
                {s.subject && <div style={S.subjectBadge}>📚 {s.subject}</div>}
                <div style={S.cardMeta}>문항 {s.questionCount}개</div>
                <div style={S.cardBtns}>
                  <button
                    style={S.editBtn}
                    onClick={(e) => { e.stopPropagation(); onOpenEditor(s); }}
                    onMouseOver={(e) => { e.currentTarget.style.opacity = "0.7"; }}
                    onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
                  >
                    편집
                  </button>
                  <button
                    style={S.solveBtn}
                    onClick={(e) => { e.stopPropagation(); onSolve(s); }}
                    onMouseOver={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                    onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
                  >
                    풀기
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div style={S.overlay} onClick={() => setShowModal(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <button
              style={S.modalClose}
              onClick={() => setShowModal(false)}
              onMouseOver={(e) => { e.currentTarget.style.color = "#f1f1f1"; }}
              onMouseOut={(e) => { e.currentTarget.style.color = "#555555"; }}
            >
              ✕
            </button>
            <div style={S.modalTitle}>새 문제집 만들기</div>

            <label style={S.label}>제목 *</label>
            <input
              style={S.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={focusGold}
              onBlur={blurGray}
              placeholder="예: 2025 수능 국어"
              autoFocus
            />

            <label style={S.label}>과목</label>
            <input
              style={S.input}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onFocus={focusGold}
              onBlur={blurGray}
              placeholder="예: 국어, 수학 ..."
            />

            <div style={S.modalBtns}>
              <button
                style={S.cancelBtn}
                onClick={() => setShowModal(false)}
                onMouseOver={(e) => { e.currentTarget.style.opacity = "0.7"; }}
                onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
              >
                취소
              </button>
              <button
                style={S.confirmBtn}
                onClick={handleCreate}
                disabled={loading}
                onMouseOver={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
              >
                {loading ? "생성 중..." : "만들기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
