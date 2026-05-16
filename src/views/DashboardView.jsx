import { useState, useEffect, useRef } from "react";
import { getSets, createSet, updateSet, deleteSet } from "../api/quiz";
import { downloadSet, downloadAll, downloadTemplate, uploadToSet, uploadAsNew } from "../api/excel";

const S = {
  page: { minHeight: "100vh", background: "#0f0f0f", fontFamily: "system-ui, sans-serif" },
  nav: {
    background: "#1a1a1a", borderBottom: "1px solid #2e2e2e",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "0 24px", height: 56,
  },
  navTitle: { fontWeight: 700, fontSize: 18, letterSpacing: 1, color: "#f59e0b" },
  navRight: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  username: { fontSize: 14, color: "#a0a0a0" },
  roleBadge: (role) => {
    const map = {
      ADMIN:   { bg: "rgba(248,113,113,0.15)", color: "#f87171" },
      MANAGER: { bg: "rgba(245,158,11,0.15)",  color: "#f59e0b" },
      USER:    { bg: "rgba(96,165,250,0.15)",  color: "#60a5fa" },
    };
    const { bg, color } = map[role] ?? map.USER;
    return { display: "inline-block", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: bg, color };
  },
  navIconBtn: {
    background: "#242424", border: "1px solid #2e2e2e", color: "#a0a0a0",
    padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 13,
    fontWeight: 600, transition: "opacity 0.15s ease", whiteSpace: "nowrap",
  },
  navUploadBtn: {
    background: "#f59e0b", border: "none", color: "#000000",
    padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 13,
    fontWeight: 700, transition: "opacity 0.15s ease", whiteSpace: "nowrap",
  },
  logoutBtn: {
    background: "#242424", border: "1px solid #2e2e2e", color: "#a0a0a0",
    padding: "6px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13,
    transition: "opacity 0.15s ease",
  },
  body: { padding: "32px 40px" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  h2: { color: "#f1f1f1", fontSize: 20, fontWeight: 700, margin: 0 },
  addBtn: {
    background: "#f59e0b", color: "#000000", border: "none",
    padding: "10px 22px", borderRadius: 7, fontWeight: 700, fontSize: 14,
    cursor: "pointer", transition: "opacity 0.15s ease",
  },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 },
  card: {
    background: "#1a1a1a", borderRadius: 10, border: "1px solid #2e2e2e",
    padding: "22px 24px 18px", position: "relative", display: "flex",
    flexDirection: "column", transition: "border-color 0.15s ease, transform 0.15s ease",
  },
  cardTitle: { fontWeight: 700, fontSize: 16, color: "#f1f1f1", marginBottom: 8, paddingRight: 24 },
  subjectBadge: {
    display: "inline-block", background: "#242424", color: "#a0a0a0",
    fontSize: 12, padding: "3px 10px", borderRadius: 20, marginBottom: 10,
  },
  cardMeta: { fontSize: 12, color: "#555555", marginBottom: 16 },
  cardBtns: { display: "flex", gap: 8, marginTop: "auto" },
  editBtn: {
    flex: 1, padding: "8px 0", background: "#242424", color: "#a0a0a0",
    border: "1px solid #2e2e2e", borderRadius: 6, fontWeight: 600, fontSize: 13,
    cursor: "pointer", transition: "opacity 0.15s ease",
  },
  solveBtn: {
    flex: 1, padding: "8px 0", background: "#f59e0b", color: "#000000",
    border: "none", borderRadius: 6, fontWeight: 700, fontSize: 13,
    cursor: "pointer", transition: "opacity 0.15s ease",
  },
  excelBtn: {
    padding: "8px 12px", background: "#242424", color: "#a0a0a0",
    border: "1px solid #2e2e2e", borderRadius: 6, fontWeight: 600, fontSize: 12,
    cursor: "pointer", transition: "opacity 0.15s ease", whiteSpace: "nowrap",
  },
  delBtn: {
    position: "absolute", top: 14, right: 14, background: "none",
    border: "none", color: "#555555", fontSize: 16, cursor: "pointer",
    lineHeight: 1, transition: "color 0.15s ease",
  },
  renameBtn: {
    position: "absolute", top: 14, right: 40, background: "none",
    border: "none", color: "#555555", fontSize: 14, cursor: "pointer",
    lineHeight: 1, transition: "color 0.15s ease",
  },
  emptyWrap: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", marginTop: 80, gap: 12 },
  emptyIcon: { fontSize: 48, color: "#555555" },
  emptyText: { color: "#555555", fontSize: 15 },

  // 공통 모달
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
  },
  modal: {
    background: "#1a1a1a", borderRadius: 12, border: "1px solid #2e2e2e",
    padding: "32px 36px", width: 360, boxShadow: "0 16px 48px rgba(0,0,0,0.6)", position: "relative",
  },
  uploadModal: {
    background: "#1a1a1a", borderRadius: 12, border: "1px solid #2e2e2e",
    padding: "32px 36px", width: 420, boxShadow: "0 16px 48px rgba(0,0,0,0.6)", position: "relative",
    maxHeight: "90vh", overflowY: "auto",
  },
  modalTitle: { fontWeight: 700, fontSize: 17, color: "#f1f1f1", marginBottom: 20 },
  modalClose: {
    position: "absolute", top: 16, right: 18, background: "none", border: "none",
    color: "#555555", fontSize: 20, cursor: "pointer", lineHeight: 1, transition: "color 0.15s ease",
  },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#a0a0a0", marginBottom: 6 },
  input: {
    width: "100%", padding: "9px 12px", background: "#242424", border: "1px solid #2e2e2e",
    borderRadius: 7, fontSize: 14, marginBottom: 16, color: "#f1f1f1", outline: "none",
    transition: "border-color 0.15s ease",
  },
  select: {
    width: "100%", padding: "9px 12px", background: "#242424", border: "1px solid #2e2e2e",
    borderRadius: 7, fontSize: 14, marginBottom: 16, color: "#f1f1f1", outline: "none",
    cursor: "pointer", transition: "border-color 0.15s ease",
  },
  fileInputWrap: {
    width: "100%", padding: "10px 12px", background: "#242424", border: "1px dashed #2e2e2e",
    borderRadius: 7, fontSize: 13, marginBottom: 8, color: "#a0a0a0", cursor: "pointer",
    display: "flex", alignItems: "center", gap: 8, transition: "border-color 0.15s ease",
  },
  templateLink: {
    fontSize: 12, color: "#f59e0b", cursor: "pointer", background: "none", border: "none",
    padding: 0, marginBottom: 16, textDecoration: "underline", display: "block",
    transition: "opacity 0.15s ease",
  },
  modalBtns: { display: "flex", gap: 10, marginTop: 8 },
  confirmBtn: {
    flex: 1, padding: "10px 0", background: "#f59e0b", color: "#000000",
    border: "none", borderRadius: 7, fontWeight: 700, cursor: "pointer", fontSize: 14,
    transition: "opacity 0.15s ease",
  },
  cancelBtn: {
    flex: 1, padding: "10px 0", background: "#242424", color: "#a0a0a0",
    border: "1px solid #2e2e2e", borderRadius: 7, fontWeight: 700, cursor: "pointer", fontSize: 14,
    transition: "opacity 0.15s ease",
  },
  modalError: { color: "#f87171", fontSize: 13, marginBottom: 12 },

  // 업로드 모달 탭
  tabs: { display: "flex", borderBottom: "1px solid #2e2e2e", marginBottom: 24, gap: 4 },
  tab: (active) => ({
    flex: 1, padding: "9px 0", border: "none", background: active ? "#242424" : "none",
    cursor: "pointer", fontWeight: 600, fontSize: 14,
    color: active ? "#f59e0b" : "#555555",
    borderBottom: active ? "2px solid #f59e0b" : "2px solid transparent",
    marginBottom: -1, borderRadius: "6px 6px 0 0", transition: "color 0.15s ease, background 0.15s ease",
  }),

  // 토스트
  toast: (type) => ({
    position: "fixed", bottom: 24, right: 24, zIndex: 300,
    padding: "12px 20px", borderRadius: 8,
    border: `1px solid ${type === "success" ? "#34d399" : "#f87171"}`,
    background: type === "success" ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)",
    color: type === "success" ? "#34d399" : "#f87171",
    fontSize: 14, fontWeight: 600,
    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
    transition: "opacity 0.3s ease",
  }),
};

function focusGold(e) { e.target.style.borderColor = "#f59e0b"; }
function blurGray(e) { e.target.style.borderColor = "#2e2e2e"; }

const ROLE_LABEL = { ADMIN: "관리자", MANAGER: "중간관리자", USER: "일반사용자" };

export default function DashboardView({ onLogout, onOpenEditor, onSolve, role = "USER" }) {
  const canExcel = role === "ADMIN" || role === "MANAGER";

  const [sets, setSets] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [creating, setCreating] = useState(false);


  // 업로드 모달 상태
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadTab, setUploadTab] = useState("existing");
  const [selectedSetId, setSelectedSetId] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // 세트 수정 모달 상태
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSet, setEditingSet] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // 토스트
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const username = localStorage.getItem("username") || "";

  useEffect(() => { fetchSets(); }, []);

  async function fetchSets() {
    try { setSets(await getSets()); } catch (e) { console.error(e); }
  }

  function showToast(message, type = "success") {
    clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  // 세트 생성
  async function handleCreate() {
    if (!title.trim()) return;
    setCreating(true);
    try {
      await createSet(title.trim(), subject.trim());
      setShowCreateModal(false);
      setTitle(""); setSubject("");
      fetchSets();
    } catch (e) {
      alert(e.message);
    } finally {
      setCreating(false);
    }
  }

  // 세트 수정
  function openEditModal(e, s) {
    e.stopPropagation();
    setEditingSet(s);
    setEditTitle(s.title);
    setEditSubject(s.subject || "");
    setEditError("");
    setShowEditModal(true);
  }

  async function handleEditSave() {
    if (!editTitle.trim()) { setEditError("제목을 입력해주세요."); return; }
    setEditSaving(true);
    setEditError("");
    try {
      await updateSet(editingSet.id, editTitle.trim(), editSubject.trim());
      setShowEditModal(false);
      fetchSets();
      showToast("문제집 정보가 수정되었습니다.", "success");
    } catch (e) {
      setEditError(e.message.includes("403") ? "수정 권한이 없습니다." : e.message);
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!confirm("이 세트를 삭제할까요?")) return;
    try { await deleteSet(id); fetchSets(); } catch (e) { alert(e.message); }
  }

  // 엑셀 다운로드
  function handleDownloadAll() { downloadAll(); }

  function handleDownloadSet(e, id) {
    e.stopPropagation();
    downloadSet(id);
  }

  // 엑셀 업로드
  function openUploadModal() {
    setShowUploadModal(true);
    setUploadTab("existing");
    setSelectedSetId(sets[0]?.id ?? "");
    setUploadFile(null);
    setNewTitle(""); setNewSubject("");
    setUploadError("");
  }

  function closeUploadModal() {
    setShowUploadModal(false);
    setUploadFile(null);
    setUploadError("");
  }

  async function handleUpload() {
    if (!uploadFile) { setUploadError("파일을 선택해주세요."); return; }
    setUploading(true);
    setUploadError("");
    try {
      if (uploadTab === "existing") {
        if (!selectedSetId) { setUploadError("문제집을 선택해주세요."); setUploading(false); return; }
        await uploadToSet(selectedSetId, uploadFile);
      } else {
        if (!newTitle.trim()) { setUploadError("문제집 이름을 입력해주세요."); setUploading(false); return; }
        await uploadAsNew(uploadFile, newTitle.trim(), newSubject.trim());
      }
      closeUploadModal();
      fetchSets();
      showToast("업로드가 완료되었습니다!", "success");
    } catch (e) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
    }
  }

  function handleDownloadTemplate(e) {
    e.preventDefault();
    downloadTemplate();
  }

  return (
    <div style={S.page}>
      <nav style={S.nav}>
        <span style={S.navTitle}>📝 Quiz Maker</span>
        <div style={S.navRight}>
          {canExcel && (
            <>
              <button
                style={S.navIconBtn}
                onClick={handleDownloadAll}
                onMouseOver={(e) => { e.currentTarget.style.opacity = "0.7"; }}
                onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
              >
                ⬇ 전체 다운로드
              </button>
              <button
                style={S.navUploadBtn}
                onClick={openUploadModal}
                onMouseOver={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
              >
                ⬆ 엑셀 업로드
              </button>
            </>
          )}
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
            onClick={() => setShowCreateModal(true)}
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
                  style={S.renameBtn}
                  onClick={(e) => openEditModal(e, s)}
                  onMouseOver={(e) => { e.currentTarget.style.color = "#f59e0b"; }}
                  onMouseOut={(e) => { e.currentTarget.style.color = "#555555"; }}
                  title="제목/과목 수정"
                >✏</button>
                <button
                  style={S.delBtn}
                  onClick={(e) => handleDelete(e, s.id)}
                  onMouseOver={(e) => { e.currentTarget.style.color = "#f87171"; }}
                  onMouseOut={(e) => { e.currentTarget.style.color = "#555555"; }}
                >✕</button>
                <div style={S.cardTitle}>{s.title}</div>
                {s.subject && <div style={S.subjectBadge}>📚 {s.subject}</div>}
                <div style={S.cardMeta}>문항 {s.questionCount}개</div>
                <div style={S.cardBtns}>
                  <button
                    style={S.editBtn}
                    onClick={(e) => { e.stopPropagation(); onOpenEditor(s); }}
                    onMouseOver={(e) => { e.currentTarget.style.opacity = "0.7"; }}
                    onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
                  >편집</button>
                  <button
                    style={S.solveBtn}
                    onClick={(e) => { e.stopPropagation(); onSolve(s); }}
                    onMouseOver={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                    onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
                  >풀기</button>
                  {canExcel && (
                    <button
                      style={S.excelBtn}
                      onClick={(e) => handleDownloadSet(e, s.id)}
                      onMouseOver={(e) => { e.currentTarget.style.opacity = "0.7"; }}
                      onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
                    >
                      ⬇ 엑셀
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 세트 생성 모달 ── */}
      {showCreateModal && (
        <div style={S.overlay} onClick={() => setShowCreateModal(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <button
              style={S.modalClose}
              onClick={() => setShowCreateModal(false)}
              onMouseOver={(e) => { e.currentTarget.style.color = "#f1f1f1"; }}
              onMouseOut={(e) => { e.currentTarget.style.color = "#555555"; }}
            >✕</button>
            <div style={S.modalTitle}>새 문제집 만들기</div>
            <label style={S.label}>제목 *</label>
            <input
              style={S.input} value={title}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={focusGold} onBlur={blurGray}
              placeholder="예: 2025 수능 국어" autoFocus
            />
            <label style={S.label}>과목</label>
            <input
              style={S.input} value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onFocus={focusGold} onBlur={blurGray}
              placeholder="예: 국어, 수학 ..."
            />
            <div style={S.modalBtns}>
              <button
                style={S.cancelBtn} onClick={() => setShowCreateModal(false)}
                onMouseOver={(e) => { e.currentTarget.style.opacity = "0.7"; }}
                onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
              >취소</button>
              <button
                style={S.confirmBtn} onClick={handleCreate} disabled={creating}
                onMouseOver={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
              >{creating ? "생성 중..." : "만들기"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 세트 수정 모달 ── */}
      {showEditModal && (
        <div style={S.overlay} onClick={() => setShowEditModal(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <button
              style={S.modalClose}
              onClick={() => setShowEditModal(false)}
              onMouseOver={(e) => { e.currentTarget.style.color = "#f1f1f1"; }}
              onMouseOut={(e) => { e.currentTarget.style.color = "#555555"; }}
            >✕</button>
            <div style={S.modalTitle}>문제집 수정</div>
            <label style={S.label}>제목 *</label>
            <input
              style={S.input}
              value={editTitle}
              onChange={(e) => { setEditTitle(e.target.value); setEditError(""); }}
              onFocus={focusGold} onBlur={blurGray}
              placeholder="문제집 제목"
              autoFocus
            />
            <label style={S.label}>과목</label>
            <input
              style={S.input}
              value={editSubject}
              onChange={(e) => setEditSubject(e.target.value)}
              onFocus={focusGold} onBlur={blurGray}
              placeholder="예: 국어, 수학 ..."
            />
            {editError && <div style={S.modalError}>{editError}</div>}
            <div style={S.modalBtns}>
              <button
                style={S.cancelBtn}
                onClick={() => setShowEditModal(false)}
                onMouseOver={(e) => { e.currentTarget.style.opacity = "0.7"; }}
                onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
              >취소</button>
              <button
                style={S.confirmBtn}
                onClick={handleEditSave}
                disabled={editSaving}
                onMouseOver={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
              >{editSaving ? "저장 중..." : "저장"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 엑셀 업로드 모달 ── */}
      {showUploadModal && (
        <div style={S.overlay} onClick={closeUploadModal}>
          <div style={S.uploadModal} onClick={(e) => e.stopPropagation()}>
            <button
              style={S.modalClose}
              onClick={closeUploadModal}
              onMouseOver={(e) => { e.currentTarget.style.color = "#f1f1f1"; }}
              onMouseOut={(e) => { e.currentTarget.style.color = "#555555"; }}
            >✕</button>
            <div style={S.modalTitle}>엑셀로 문제 업로드</div>

            <div style={S.tabs}>
              <button
                style={S.tab(uploadTab === "existing")}
                onClick={() => { setUploadTab("existing"); setUploadError(""); setUploadFile(null); }}
              >기존 문제집에 추가</button>
              <button
                style={S.tab(uploadTab === "new")}
                onClick={() => { setUploadTab("new"); setUploadError(""); setUploadFile(null); }}
              >새 문제집으로 만들기</button>
            </div>

            {uploadTab === "existing" ? (
              <>
                <label style={S.label}>문제집 선택 *</label>
                <select
                  style={S.select}
                  value={selectedSetId}
                  onChange={(e) => setSelectedSetId(e.target.value)}
                  onFocus={focusGold} onBlur={blurGray}
                >
                  {sets.length === 0
                    ? <option value="">문제집이 없습니다</option>
                    : sets.map((s) => (
                        <option key={s.id} value={s.id}>{s.title}</option>
                      ))
                  }
                </select>
              </>
            ) : (
              <>
                <label style={S.label}>문제집 이름 *</label>
                <input
                  style={S.input} value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onFocus={focusGold} onBlur={blurGray}
                  placeholder="예: 2025 수능 영어"
                />
                <label style={S.label}>과목 (선택)</label>
                <input
                  style={S.input} value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  onFocus={focusGold} onBlur={blurGray}
                  placeholder="예: 영어"
                />
              </>
            )}

            <label style={S.label}>파일 선택 *</label>
            <label
              style={{
                ...S.fileInputWrap,
                borderColor: uploadFile ? "#f59e0b" : "#2e2e2e",
                color: uploadFile ? "#f1f1f1" : "#555555",
              }}
            >
              <span style={{ fontSize: 16 }}>📎</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {uploadFile ? uploadFile.name : ".xlsx 파일을 선택하세요"}
              </span>
              <input
                type="file"
                accept=".xlsx"
                style={{ display: "none" }}
                onChange={(e) => { setUploadFile(e.target.files[0] ?? null); setUploadError(""); }}
              />
            </label>

            <button
              style={S.templateLink}
              onClick={handleDownloadTemplate}
              onMouseOver={(e) => { e.currentTarget.style.opacity = "0.7"; }}
              onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
            >
              📥 업로드 양식 다운로드
            </button>

            {uploadError && <div style={S.modalError}>{uploadError}</div>}

            <div style={S.modalBtns}>
              <button
                style={S.cancelBtn} onClick={closeUploadModal}
                onMouseOver={(e) => { e.currentTarget.style.opacity = "0.7"; }}
                onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
              >취소</button>
              <button
                style={S.confirmBtn} onClick={handleUpload} disabled={uploading}
                onMouseOver={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
              >{uploading ? "업로드 중..." : "업로드"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 토스트 ── */}
      {toast && (
        <div style={S.toast(toast.type)}>{toast.message}</div>
      )}
    </div>
  );
}
