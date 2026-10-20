import { useState, useEffect, useRef } from "react";
import { getSets, createSet, updateSet, deleteSet } from "../api/quiz";
import { downloadSet, downloadAll, downloadTemplate, uploadToSet, uploadAsNew } from "../api/excel";
import { groupHardSets, hardTitleOf, loadHardModeIds, saveHardModeIds } from "../utils/hardMode";
import { SESSION_EXPIRED_MESSAGE } from "../utils/session";

// 마우스 올림 효과는 마우스에서만 켠다(onPointerEnter + pointerType). 휴대폰에서 누른 뒤
// 흐리거나 떠오른 모양이 그대로 남지 않게.
const ICON_GRAY = "#6b6b6b";
const CARD_BORDER = "#2e2e2e";
const CARD_BORDER_HARD = "#ef4444";
const CARD_BORDER_HOVER = "#f59e0b";
const CARD_BORDER_HARD_HOVER = "#f87171";

const S = {
  page: { minHeight: "100vh", background: "#0f0f0f", fontFamily: "system-ui, sans-serif" },
  // 머리: 여백·줄 배치(넓은 화면 한 줄, 휴대폰 두 줄)는 index.css 의 .qm-nav 참고. 높이는 고정하지 않음(줄이 늘면 같이 늘어남)
  nav: {
    background: "#1a1a1a", borderBottom: "1px solid #2e2e2e",
    display: "flex", alignItems: "center", minHeight: 56,
  },
  navTitle: { fontWeight: 700, color: "#f59e0b", whiteSpace: "nowrap", flexShrink: 0 },
  navGroup: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 },
  // 이름 + 역할 배지의 배치는 index.css 의 .qm-nav-who (휴대폰에서는 위아래 두 줄로 쌓아 이름 자리를 넓힘)
  username: {
    fontSize: 14, color: "#a0a0a0", maxWidth: "100%",
    minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  roleBadge: (role) => {
    const map = {
      ADMIN:   { bg: "rgba(248,113,113,0.15)", color: "#f87171" },
      MANAGER: { bg: "rgba(245,158,11,0.15)",  color: "#f59e0b" },
      USER:    { bg: "rgba(96,165,250,0.15)",  color: "#60a5fa" },
    };
    const { bg, color } = map[role] ?? map.USER;
    return {
      display: "inline-block", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
      background: bg, color, whiteSpace: "nowrap", flexShrink: 0,
    };
  },
  navIconBtn: {
    background: "#242424", border: "1px solid #2e2e2e", color: "#a0a0a0",
    padding: "6px 14px", minHeight: 36, borderRadius: 6, cursor: "pointer", fontSize: 13,
    fontWeight: 600, transition: "opacity 0.15s ease", whiteSpace: "nowrap",
  },
  navUploadBtn: {
    background: "#f59e0b", border: "none", color: "#000000",
    padding: "6px 14px", minHeight: 36, borderRadius: 6, cursor: "pointer", fontSize: 13,
    fontWeight: 700, transition: "opacity 0.15s ease", whiteSpace: "nowrap",
  },
  logoutBtn: {
    background: "#242424", border: "1px solid #2e2e2e", color: "#a0a0a0",
    padding: "6px 14px", minHeight: 36, borderRadius: 6, cursor: "pointer", fontSize: 13,
    transition: "opacity 0.15s ease", whiteSpace: "nowrap", flexShrink: 0,
  },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  h2: { color: "#f1f1f1", fontSize: 18, fontWeight: 700, margin: 0 },
  addBtn: {
    background: "#f59e0b", color: "#000000", border: "none",
    padding: "8px 16px", borderRadius: 7, fontWeight: 700, fontSize: 13,
    cursor: "pointer", transition: "opacity 0.15s ease",
  },
  // 본문·카드 여백과 카드 사이 간격은 index.css 의 .qm-dash-body / .qm-dash-grid / .qm-card (휴대폰에서 촘촘하게)
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))" },
  // 하드모드를 켠 카드는 짙은 빨강 배경 + 빨간 테두리. 마우스 올림(hover)도 상태로 그려서
  // 올린 채 하드모드를 눌러 다시 그려져도 강조 테두리가 풀리지 않게 한다
  card: (hard, hover) => ({
    background: hard ? "#3a1416" : "#1a1a1a", borderRadius: 10,
    border: `1px solid ${hard
      ? (hover ? CARD_BORDER_HARD_HOVER : CARD_BORDER_HARD)
      : (hover ? CARD_BORDER_HOVER : CARD_BORDER)}`,
    transform: hover ? "translateY(-2px)" : "translateY(0)",
    position: "relative", display: "flex", flexDirection: "column",
    transition: "border-color 0.15s ease, background-color 0.15s ease, transform 0.15s ease",
  }),
  // 카드는 두 줄: ① 제목 + ✏ ✕  ② 과목·문항 수 + 작은 단추들 (사용자 요청: 칩을 낮고 촘촘하게)
  // 제목 글자 크기·줄 간격은 index.css 의 .qm-card-title (휴대폰에서 한 단계 작게)
  // ✏ ✕ 는 제목 글 안에서 오른쪽으로 띄움(float) — 첫 줄만 아이콘 폭만큼 줄고 둘째 줄부터는 카드 폭 전체를 씀
  cardTitle: {
    fontWeight: 700, color: "#f1f1f1", overflowWrap: "anywhere", marginBottom: 6,
  },
  // 음수 여백: 누르는 자리(28×28)는 넓히고 float 가 차지하는 높이는 제목 한 줄(약 20px) 안으로 맞춰
  // 첫 줄만 비켜 가게. position: relative — 둘째 줄 위로 살짝 걸친 누르는 자리가 글자보다 위에 놓여 그대로 눌리게
  cardIcons: { float: "right", display: "flex", position: "relative", margin: "-5px -7px -4px 4px" },
  cardFoot: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: "auto",
  },
  // 둘째 줄 글자·단추 좌우 여백과 단추 사이 간격은 index.css 의 .qm-card-meta / .qm-card-btns / .qm-cbtn-*
  // (카드가 좁으면 '문항 N개' → 'N문항', 여백을 줄여 한 줄에 들어가게)
  cardMeta: (hard) => ({
    display: "flex", alignItems: "center", minWidth: 0,
    fontSize: 12, color: hard ? "#e3b0b0" : "#7a7a7a", whiteSpace: "nowrap",
  }),
  subjectBadge: (hard) => ({
    minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
    background: hard ? "#4d1c1f" : "#242424", color: hard ? "#e3b0b0" : "#a0a0a0",
    fontSize: 11, padding: "1px 6px", borderRadius: 4,
  }),
  count: { flexShrink: 0 },
  cardBtns: { display: "flex", flexShrink: 0 },
  editBtn: {
    height: 30, background: "#242424", color: "#a0a0a0",
    border: "1px solid #2e2e2e", borderRadius: 6, fontWeight: 600, fontSize: 12,
    cursor: "pointer", transition: "opacity 0.15s ease", whiteSpace: "nowrap",
  },
  solveBtn: {
    height: 30, background: "#f59e0b", color: "#000000",
    border: "none", borderRadius: 6, fontWeight: 700, fontSize: 12,
    cursor: "pointer", transition: "opacity 0.15s ease", whiteSpace: "nowrap",
  },
  excelBtn: {
    height: 30, background: "#242424", color: "#a0a0a0",
    border: "1px solid #2e2e2e", borderRadius: 6, fontWeight: 600, fontSize: 12,
    cursor: "pointer", transition: "opacity 0.15s ease", whiteSpace: "nowrap",
  },
  // 하드모드 켜고 끄기: 꺼짐은 회색 단추에 붉은 테두리·글자, 켜짐은 빨간 바탕에 흰 글자
  hardBtn: (on) => ({
    height: 30, borderRadius: 6, fontWeight: 700, fontSize: 12,
    background: on ? "#dc2626" : "#242424", color: on ? "#ffffff" : "#f87171",
    border: `1px solid ${on ? "#dc2626" : "rgba(239,68,68,0.5)"}`,
    cursor: "pointer", transition: "opacity 0.15s ease, background-color 0.15s ease", whiteSpace: "nowrap",
  }),
  iconBtn: {
    width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center",
    background: "none", border: "none", borderRadius: 6, color: ICON_GRAY, fontSize: 14,
    cursor: "pointer", lineHeight: 1, transition: "color 0.15s ease",
  },
  emptyWrap: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    marginTop: 80, gap: 12, padding: "0 16px",
  },
  emptyIcon: { fontSize: 48, color: "#555555" },
  emptyText: { color: "#777777", fontSize: 15, textAlign: "center" },
  loadError: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
    padding: "12px 16px", marginBottom: 20, borderRadius: 8,
    border: "1px solid rgba(248,113,113,0.4)", background: "rgba(248,113,113,0.1)",
    color: "#f87171", fontSize: 14,
  },
  retryBtn: {
    padding: "6px 14px", minHeight: 36, borderRadius: 6, border: "1px solid #f87171",
    background: "none", color: "#f87171", fontSize: 13, fontWeight: 600, cursor: "pointer",
  },

  // 공통 모달: 휴대폰에서도 화면 끝에서 16px 띄우고, 좁으면 안쪽 여백을 줄인다(clamp)
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", padding: 16,
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
  },
  modal: {
    background: "#1a1a1a", borderRadius: 12, border: "1px solid #2e2e2e",
    padding: "clamp(22px, 6vw, 32px) clamp(18px, 6vw, 36px)", width: "100%", maxWidth: 360,
    boxShadow: "0 16px 48px rgba(0,0,0,0.6)", position: "relative",
  },
  uploadModal: {
    background: "#1a1a1a", borderRadius: 12, border: "1px solid #2e2e2e",
    padding: "clamp(22px, 6vw, 32px) clamp(18px, 6vw, 36px)", width: "100%", maxWidth: 420,
    boxShadow: "0 16px 48px rgba(0,0,0,0.6)", position: "relative",
    maxHeight: "100%", overflowY: "auto",
  },
  modalTitle: { fontWeight: 700, fontSize: 17, color: "#f1f1f1", marginBottom: 20, paddingRight: 32 },
  modalClose: {
    position: "absolute", top: 8, right: 8, width: 40, height: 40,
    display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8,
    background: "none", border: "none",
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
    padding: "10px 0", margin: "-2px 0 6px", textDecoration: "underline", display: "block",
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
  const [editingHard, setEditingHard] = useState(null); // 짝인 하드 문제집(제목·과목을 함께 고친다)
  const [editTitle, setEditTitle] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  // 원래 문제집만 새 제목이 되고 하드 문제집은 옛 제목으로 남은 상태(되돌리기도 실패). 이대로 두면
  // 하드 문제집이 짝을 잃고 따로 된 카드로 보이므로, 글을 고쳐도 지우지 않고 창을 닫을 때도 알린다.
  // { text: 창 안내, hardTitle: 하드 문제집의 지금(옛) 제목, wantTitle: 짝이 되려면 필요한 제목 } 또는 null
  const [editMismatch, setEditMismatch] = useState(null);

  // 토스트
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const username = localStorage.getItem("username") || "";

  // 하드모드를 켠 원래 문제집 id(문자열). 기기에 기억한다(utils/hardMode.js)
  const [hardOn, setHardOn] = useState(() => new Set(loadHardModeIds(username)));
  useEffect(() => { saveHardModeIds(username, hardOn); }, [username, hardOn]);

  // 마우스를 올린 카드(원래 문제집 id). 마우스에서만 쓴다
  const [hoverId, setHoverId] = useState(null);

  // 바꿀 때는 늘 바로 앞 값에서 고친다(함수형 갱신) — 삭제를 기다리는 동안 다른 카드를 켜고 꺼도 되돌아가지 않게
  function toggleHard(e, id) {
    e.stopPropagation();
    // 지금 목록에 없는 문제집(다른 곳에서 지운 것)의 기억은 이참에 뺀다
    const alive = new Set(sets.map((s) => String(s.id)));
    const key = String(id);
    setHardOn((prev) => {
      const next = new Set([...prev].filter((k) => alive.has(k)));
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function forgetHard(id) {
    const key = String(id);
    setHardOn((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  // 목록 상태: loading(처음 불러오는 중) · ok · error. 실패를 빈 목록으로 보이지 않게 한다.
  const [loadState, setLoadState] = useState("loading");
  const [loadError, setLoadError] = useState("");

  useEffect(() => { fetchSets(); }, []);

  async function fetchSets() {
    try {
      setSets(await getSets());
      setLoadState("ok");
      setLoadError("");
    } catch (e) {
      console.error(e);
      setLoadState("error");
      setLoadError(e.message || "");
    }
  }

  function retryLoad() {
    setLoadState("loading");
    fetchSets();
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
  // ✏ 는 늘 원래 문제집을 고친다. 짝인 하드 문제집이 있으면 제목("[하드] " + 새 제목)·과목도 함께.
  function openEditModal(e, s, hard) {
    e.stopPropagation();
    setEditingSet(s);
    setEditingHard(hard);
    setEditTitle(s.title);
    setEditSubject(s.subject || "");
    setEditError("");
    setEditMismatch(null);
    setShowEditModal(true);
  }

  // 저장 중에는 닫지 않는다(바깥·✕·취소) — 두 번째 수정이 실패한 것을 못 보고 지나치지 않게.
  // 어긋난 채로 닫으면 어떻게 다시 묶는지 창으로 알린다(드문 경우라 토스트보다 오래 보이게)
  function closeEditModal() {
    if (editSaving) return;
    setShowEditModal(false);
    if (editMismatch) {
      alert(
        "하드 문제집 제목은 바꾸지 못했습니다.\n" +
        `하드 문제집은 "${editMismatch.hardTitle}" 카드로 따로 보입니다. ` +
        `그 카드의 ✏ 에서 제목을 "${editMismatch.wantTitle}" 로 고치면 다시 하드모드로 묶입니다.`
      );
    }
  }

  const editErrorText = (e) => (e.message.includes("403") ? "수정 권한이 없습니다" : e.message);

  async function handleEditSave() {
    const nextTitle = editTitle.trim();
    const nextSubject = editSubject.trim();
    if (!nextTitle) { setEditError("제목을 입력해주세요."); return; }
    setEditSaving(true);
    setEditError("");
    try {
      await updateSet(editingSet.id, nextTitle, nextSubject);
    } catch (e) {
      setEditError(e.message.includes("403") ? "수정 권한이 없습니다." : e.message);
      setEditSaving(false);
      return;
    }
    if (editingHard) {
      try {
        await updateSet(editingHard.id, hardTitleOf(nextTitle), nextSubject);
      } catch (e) {
        // 둘 중 원래만 바뀌면 하드 문제집이 짝을 잃는다 → 원래 문제집을 처음 값으로 되돌려 둘을 맞춘다.
        // 창은 열어 둔 채 알리고, 저장을 다시 누르면 둘 다 다시 보낸다
        let rolledBack = false;
        if (e.message !== SESSION_EXPIRED_MESSAGE) {
          try {
            await updateSet(editingSet.id, editingSet.title, editingSet.subject ?? "");
            rolledBack = true;
          } catch {
            // 되돌리지 못하면 아래에서 어긋난 상태를 알린다
          }
        }
        fetchSets();
        if (rolledBack) {
          setEditError(
            `하드 문제집을 고치지 못해(${editErrorText(e)}) 원래 문제집도 바꾸지 않았습니다. 저장을 다시 누르면 다시 시도합니다.`
          );
          setEditMismatch(null);
        } else {
          setEditError("");
          setEditMismatch({
            text:
              `원래 문제집은 고쳤지만 하드 문제집은 고치지 못했습니다(${editErrorText(e)}). ` +
              "저장을 다시 누르면 다시 시도합니다. 이대로 닫으면 하드 문제집은 옛 제목으로 따로 된 카드로 보입니다.",
            hardTitle: editingHard.title,
            wantTitle: hardTitleOf(nextTitle),
          });
        }
        setEditSaving(false);
        return;
      }
    }
    setEditSaving(false);
    setEditMismatch(null);
    setShowEditModal(false);
    fetchSets();
    showToast(editingHard ? "문제집 정보가 수정되었습니다(하드 문제집 포함)." : "문제집 정보가 수정되었습니다.", "success");
  }

  // ✕: 짝인 하드 문제집이 있으면 함께 지운다(하드 먼저 — 중간에 실패해도 원래 문제집은 남게)
  async function handleDelete(e, s, hard) {
    e.stopPropagation();
    const message = hard ? "이 세트를 삭제할까요?\n하드 문제집도 함께 지웁니다." : "이 세트를 삭제할까요?";
    if (!confirm(message)) return;
    let hardDeleted = false;
    try {
      if (hard) { await deleteSet(hard.id); hardDeleted = true; }
      await deleteSet(s.id);
      forgetHard(s.id);
      fetchSets();
    } catch (err) {
      if (hardDeleted) fetchSets();
      alert(hardDeleted ? `하드 문제집은 지웠지만 원래 문제집은 지우지 못했습니다.\n${err.message}` : err.message);
    }
  }

  // 엑셀 다운로드
  function handleDownloadAll() { downloadAll(); }

  function handleDownloadSet(e, id) {
    e.stopPropagation();
    downloadSet(id);
  }

  // 카드 목록: 짝인 하드 문제집은 원래 문제집 카드에 묶는다(utils/hardMode.js)
  const cards = groupHardSets(sets);

  // 엑셀 업로드
  function openUploadModal() {
    setShowUploadModal(true);
    setUploadTab("existing");
    // 기본 선택은 화면의 첫 카드(원래 문제집). 서버 목록 맨 앞이 카드로는 숨은 하드 문제집일 수 있다
    setSelectedSetId(cards[0]?.set.id ?? "");
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
      <nav style={S.nav} className="qm-nav">
        <span style={S.navTitle} className="qm-nav-title">📝 Quiz Maker</span>
        {canExcel && (
          <div style={S.navGroup} className="qm-nav-excel">
            <button
              style={S.navIconBtn}
              onClick={handleDownloadAll}
              onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.7"; }}
              onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
            >
              ⬇ 전체 다운로드
            </button>
            <button
              style={S.navUploadBtn}
              onClick={openUploadModal}
              onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.85"; }}
              onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
            >
              ⬆ 엑셀 업로드
            </button>
          </div>
        )}
        <div style={S.navGroup} className="qm-nav-user">
          <span className="qm-nav-who">
            <span style={S.username} title={username}>{username}</span>
            <span style={S.roleBadge(role)}>{ROLE_LABEL[role] ?? "일반사용자"}</span>
          </span>
          <button
            style={S.logoutBtn}
            onClick={onLogout}
            onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.7"; }}
            onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
          >
            로그아웃
          </button>
        </div>
      </nav>

      <div className="qm-dash-body">
        <div style={S.header}>
          <h2 style={S.h2}>내 문제집</h2>
          <button
            style={S.addBtn}
            onClick={() => setShowCreateModal(true)}
            onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.85"; }}
            onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
          >
            + 새 세트 만들기
          </button>
        </div>

        {loadState === "error" && (
          <div style={S.loadError} role="alert">
            <span>
              문제집 목록을 불러오지 못했습니다.
              {/* 짧은 오류 내용('HTTP 500')은 괄호째 한 줄로 — '(HTTP' / '500)' 처럼 갈리지 않게 */}
              {loadError && loadError.length <= 80 && (
                <>
                  {" "}
                  <span style={loadError.length <= 24 ? { whiteSpace: "nowrap" } : undefined}>({loadError})</span>
                </>
              )}
            </span>
            <button style={S.retryBtn} onClick={retryLoad}>다시 시도</button>
          </div>
        )}

        {sets.length === 0 ? (
          loadState === "ok" ? (
            <div style={S.emptyWrap}>
              <div style={S.emptyIcon}>📭</div>
              <p style={S.emptyText}>아직 문제집이 없습니다. 새 세트를 만들어보세요!</p>
            </div>
          ) : loadState === "loading" ? (
            <div style={S.emptyWrap}>
              <p style={S.emptyText}>문제집을 불러오는 중…</p>
            </div>
          ) : null
        ) : (
          <div style={S.grid} className="qm-dash-grid">
            {cards.map(({ set: s, hard }) => {
              // 하드모드가 켜지면 풀기·편집·⬇ 엑셀·문항 수가 짝인 하드 문제집을 따른다
              const hardActive = !!hard && hardOn.has(String(s.id));
              const target = hardActive ? hard : s;
              return (
                <div
                  key={s.id}
                  style={S.card(hardActive, hoverId === s.id)}
                  // 과목 배지와 하드모드 단추가 함께 있으면 좁을 때 한 단계 먼저 줄여 과목 글자 자리를 남긴다(index.css)
                  className={hard && s.subject ? "qm-card qm-card--crowded" : "qm-card"}
                  onPointerEnter={(e) => { if (e.pointerType === "mouse") setHoverId(s.id); }}
                  onPointerLeave={() => setHoverId((cur) => (cur === s.id ? null : cur))}
                >
                  <div style={S.cardTitle} className="qm-card-title">
                    <div style={S.cardIcons}>
                      <button
                        style={S.iconBtn}
                        onClick={(e) => openEditModal(e, s, hard)}
                        onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.color = "#f59e0b"; }}
                        onPointerLeave={(e) => { e.currentTarget.style.color = ICON_GRAY; }}
                        title="제목/과목 수정"
                      >✏</button>
                      <button
                        style={S.iconBtn}
                        onClick={(e) => handleDelete(e, s, hard)}
                        onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.color = "#f87171"; }}
                        onPointerLeave={(e) => { e.currentTarget.style.color = ICON_GRAY; }}
                        title="삭제"
                      >✕</button>
                    </div>
                    {s.title}
                  </div>
                  <div style={S.cardFoot}>
                    <div style={S.cardMeta(hardActive)} className="qm-card-meta">
                      {s.subject && (
                        <span style={S.subjectBadge(hardActive)} title={s.subject}>
                          <span className="qm-subj-icon">📚 </span>{s.subject}
                        </span>
                      )}
                      {/* 카드가 좁으면 짧은 글씨(index.css) */}
                      <span style={S.count}>
                        <span className="qm-count-long">문항 {target.questionCount}개</span>
                        <span className="qm-count-short">{target.questionCount}문항</span>
                      </span>
                    </div>
                    <div style={S.cardBtns} className="qm-card-btns">
                      {hard && (
                        <button
                          style={S.hardBtn(hardActive)}
                          className="qm-cbtn-hard"
                          onClick={(e) => toggleHard(e, s.id)}
                          onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.8"; }}
                          onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                          aria-pressed={hardActive}
                          title={hardActive ? "하드모드 끄기" : "하드모드: 빈칸이 더 많은 문제"}
                        >하드모드</button>
                      )}
                      <button
                        style={S.editBtn}
                        className="qm-cbtn-edit"
                        onClick={(e) => { e.stopPropagation(); onOpenEditor(target); }}
                        onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.7"; }}
                        onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                      >편집</button>
                      <button
                        style={S.solveBtn}
                        className="qm-cbtn-solve"
                        onClick={(e) => { e.stopPropagation(); onSolve(target); }}
                        onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.85"; }}
                        onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                      >풀기</button>
                      {canExcel && (
                        <button
                          style={S.excelBtn}
                          className="qm-cbtn-excel"
                          onClick={(e) => handleDownloadSet(e, target.id)}
                          onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.7"; }}
                          onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                        >
                          ⬇ 엑셀
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
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
              onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.color = "#f1f1f1"; }}
              onPointerLeave={(e) => { e.currentTarget.style.color = "#555555"; }}
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
                onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.7"; }}
                onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
              >취소</button>
              <button
                style={S.confirmBtn} onClick={handleCreate} disabled={creating}
                onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.85"; }}
                onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
              >{creating ? "생성 중..." : "만들기"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 세트 수정 모달 ── */}
      {showEditModal && (
        <div style={S.overlay} onClick={closeEditModal}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <button
              style={S.modalClose}
              onClick={closeEditModal}
              disabled={editSaving}
              onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.color = "#f1f1f1"; }}
              onPointerLeave={(e) => { e.currentTarget.style.color = "#555555"; }}
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
            {editMismatch && <div style={S.modalError} role="alert">{editMismatch.text}</div>}
            <div style={S.modalBtns}>
              <button
                style={S.cancelBtn}
                onClick={closeEditModal}
                disabled={editSaving}
                onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.7"; }}
                onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
              >취소</button>
              <button
                style={S.confirmBtn}
                onClick={handleEditSave}
                disabled={editSaving}
                onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.85"; }}
                onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
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
              onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.color = "#f1f1f1"; }}
              onPointerLeave={(e) => { e.currentTarget.style.color = "#555555"; }}
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
                  {/* 카드 순서대로, 짝인 하드 문제집은 원래 문제집 바로 뒤('[하드] …') */}
                  {cards.length === 0
                    ? <option value="">문제집이 없습니다</option>
                    : cards.flatMap(({ set: s, hard }) => [
                        <option key={s.id} value={s.id}>{s.title}</option>,
                        ...(hard ? [<option key={hard.id} value={hard.id}>{hard.title}</option>] : []),
                      ])
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
              onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.7"; }}
              onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
            >
              📥 업로드 양식 다운로드
            </button>

            {uploadError && <div style={S.modalError}>{uploadError}</div>}

            <div style={S.modalBtns}>
              <button
                style={S.cancelBtn} onClick={closeUploadModal}
                onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.7"; }}
                onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
              >취소</button>
              <button
                style={S.confirmBtn} onClick={handleUpload} disabled={uploading}
                onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.85"; }}
                onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
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
