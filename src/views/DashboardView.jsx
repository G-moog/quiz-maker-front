import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { getSets, createSet, updateSet, deleteSet, getQuestions } from "../api/quiz";
import { listNotes } from "../api/notes";
import { downloadSet, downloadAll, downloadTemplate, uploadToSet, uploadAsNew } from "../api/excel";
import { groupHardSets, hardTitleOf, loadHardModeIds, saveHardModeIds } from "../utils/hardMode";
import { SESSION_EXPIRED_MESSAGE } from "../utils/session";
import { exportStudy, lastStudiedMap, studyDay, studyDaysMap } from "../utils/studyState";
import { syncStudy } from "../api/study";
import { STAY, useBack } from "../utils/backStack";
import {
  SORT_DEFAULT, SORT_RECENT, SORT_REVIEW, cardNoteCount, countNotesBySet, filterCards, lastStudiedOf, loadSortMode,
  readDashCache, relativeDay, saveSortMode, sortCards, studySummary, summaryText, writeDashCache,
} from "../utils/dashboard";
import { backupFileName, backupSummary, buildBackup, downloadJson } from "../utils/backup";
import { exportInkJson, importInkJson } from "../ink/inkBackup";
import { PencilIcon } from "../components/NoteIcons";
import { SHOW_EXCEL } from "../config";
import "./DashboardView.css";

// 문제집이 이보다 많으면 찾기·정렬 줄을 보인다
const TOOLS_MIN_CARDS = 8;

// 화면 밖(효과·비동기)에서 쓰는 이 기기 사용자 이름(App 이 qm_me 로 받아 둠)
function currentUser() {
  try { return localStorage.getItem("username") || ""; } catch { return ""; }
}

// 백업 확장 자리: 돌려준 칸은 파일 맨 위에 더해진다(utils/backup.js 의 extras — 기본 칸 이름과 겹치면 오류).
// 필기(이 기기 IndexedDB 에만 있음)를 ink 칸으로, 공부 기록(이어 보기·공부한 날 — 다른 기기 것과 합친 이 기기 사본)을
// study 칸으로 함께 담는다. 필기를 못 읽어도(사생활 보호 창 등) 문제집 백업은 그대로 받는다
async function backupExtras(username) {
  const out = {};
  try {
    const ink = await exportInkJson(username);
    if (ink.items.length) out.ink = ink;
  } catch (e) {
    console.warn("필기를 백업에 넣지 못했습니다", e);
  }
  const study = exportStudy(username);
  if (Object.keys(study.records).length) out.study = study;
  return Object.keys(out).length ? out : undefined;
}

// 필기 가져오기 파일: 필기만 내보낸 파일(app: quiz-maker-ink)이나, 필기가 든 전체 백업(app: quiz-maker 의 ink 칸)
function inkPartOf(obj) {
  if (obj && obj.app === "quiz-maker" && obj.ink) return obj.ink;
  return obj;
}

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
  // 이름·배지·⋯ 를 누르면 작은 메뉴('비밀번호 바꾸기'·'백업 내려받기'). 배치는 그대로 .qm-nav-who 가 정한다
  whoWrap: { position: "relative", display: "flex", minWidth: 0 },
  // 배지와 ⋯ 를 한 줄로 — 휴대폰(이름 위·배지 아래 두 줄)에서도 높이·폭이 늘지 않게 배지 옆에 둔다
  whoSub: { display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 },
  moreMark: { fontSize: 15, lineHeight: 1, color: "#8a8a8a", fontWeight: 700 },
  whoBtn: {
    background: "none", border: "none", padding: "4px 0", margin: 0, minHeight: 36, minWidth: 0,
    font: "inherit", color: "inherit", cursor: "pointer", textAlign: "inherit",
  },
  userMenu: {
    position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50, minWidth: 168,
    background: "#1a1a1a", border: "1px solid #2e2e2e", borderRadius: 8, padding: 4,
    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
  },
  userMenuItem: {
    display: "block", width: "100%", minHeight: 40, padding: "8px 12px", textAlign: "left",
    background: "none", border: "none", borderRadius: 6, color: "#f1f1f1", fontSize: 13, fontWeight: 600,
    cursor: "pointer", whiteSpace: "nowrap",
  },
  // 360px 이상은 한 줄. 그보다 좁은 휴대폰에서는 넘치지 않고 단추가 다음 줄로 내려간다
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap",
    columnGap: 8, rowGap: 8, marginBottom: 14,
  },
  h2: { color: "#f1f1f1", fontSize: 18, fontWeight: 700, margin: 0, whiteSpace: "nowrap" },
  // 공부 요약('오늘 2개 · 이번 주 7개 · 연속 3일'): 넓은 화면은 제목 옆, 휴대폰은 제목 아래 작은 줄.
  // 배치(남은 폭만 쓰고 넘치면 '…')는 DashboardView.css 의 .qm-dash-title / .qm-dash-summary
  summary: { color: "#8a8a8a", fontWeight: 600 },
  // 좌우 여백·사이 간격은 index.css 의 .qm-dash-head-btns / .qm-dash-add / .qm-dash-notes (좁은 휴대폰에서 줄임)
  addBtn: {
    height: 34, background: "#f59e0b", color: "#000000", border: "none",
    borderRadius: 7, fontWeight: 700, fontSize: 13, whiteSpace: "nowrap",
    cursor: "pointer", transition: "opacity 0.15s ease",
  },
  notesBtn: {
    height: 34, display: "inline-flex", alignItems: "center", gap: 5,
    background: "#242424", color: "#d0d0d0", border: "1px solid #2e2e2e",
    borderRadius: 7, fontWeight: 700, fontSize: 13, whiteSpace: "nowrap",
    cursor: "pointer", transition: "opacity 0.15s ease",
  },
  notesCount: {
    minWidth: 18, height: 18, padding: "0 5px", borderRadius: 5,
    background: "#f59e0b", color: "#000", fontSize: 11, fontWeight: 800,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
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
  // 마지막 공부('3일 전')·미해결 메모 수: 둘째 줄 안에서 줄지 않고, 모자라면 과목 배지가 먼저 '…' 로 준다
  studied: { flexShrink: 0 },
  noteBadge: (hard) => ({
    flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 2,
    padding: "0 4px", height: 16, borderRadius: 4, fontSize: 11, fontWeight: 700,
    background: hard ? "rgba(245,158,11,0.18)" : "rgba(245,158,11,0.12)", color: "#f5b544",
  }),
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
  // 찾기·정렬 줄(문제집이 많을 때만): 낮게 한 줄
  tools: { display: "flex", alignItems: "center", gap: 6, margin: "-4px 0 10px" },
  search: {
    flex: "1 1 auto", minWidth: 0, height: 32, padding: "0 10px",
    background: "#1a1a1a", border: "1px solid #2e2e2e", borderRadius: 7,
    color: "#f1f1f1", fontSize: 14, outline: "none", transition: "border-color 0.15s ease",
  },
  sortGroup: { display: "inline-flex", flexShrink: 0, border: "1px solid #2e2e2e", borderRadius: 7, overflow: "hidden" },
  sortBtn: (on) => ({
    height: 30, padding: "0 10px", border: "none", whiteSpace: "nowrap", cursor: "pointer",
    fontSize: 12, fontWeight: 700,
    background: on ? "rgba(245,158,11,0.14)" : "#1a1a1a", color: on ? "#f59e0b" : "#8a8a8a",
  }),
  noMatch: { color: "#8a8a8a", fontSize: 13, padding: "16px 2px" },
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

  // 토스트(info: 백업 진행처럼 잠깐 이어지는 안내). 짙은 바탕 — 아래 카드 글자가 비쳐 섞이지 않게
  toast: (type) => ({
    position: "fixed", bottom: 24, right: 24, zIndex: 300, maxWidth: "calc(100% - 32px)",
    padding: "12px 20px", borderRadius: 8,
    border: `1px solid ${type === "success" ? "#34d399" : type === "info" ? "#f59e0b" : "#f87171"}`,
    background: type === "success" ? "#11261d" : type === "info" ? "#2a2110" : "#2a1515",
    color: type === "success" ? "#34d399" : type === "info" ? "#f5b544" : "#f87171",
    fontSize: 14, fontWeight: 600, overflowWrap: "anywhere",
    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
    transition: "opacity 0.3s ease",
  }),
};

function focusGold(e) { e.target.style.borderColor = "#f59e0b"; }
function blurGray(e) { e.target.style.borderColor = "#2e2e2e"; }

const ROLE_LABEL = { ADMIN: "관리자", MANAGER: "중간관리자", USER: "일반사용자" };

export default function DashboardView({ onLogout, onOpenEditor, onSolve, onOpenNotes, onChangePassword, role = "USER" }) {
  // 엑셀 단추는 설정(SHOW_EXCEL)으로 켤 때만 — 결정 4 미정이라 기본은 숨김(src/config.js)
  const canExcel = SHOW_EXCEL && (role === "ADMIN" || role === "MANAGER");

  // 이름·배지·⋯ 를 누르면 여는 메뉴. 바깥을 누르거나 Esc·뒤로 가기면 닫는다
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menuOpen) return undefined;
    function onDown(e) { if (!menuRef.current?.contains(e.target)) setMenuOpen(false); }
    function onKey(e) { if (e.key === "Escape") setMenuOpen(false); }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const username = currentUser();

  // 풀기·편집·메모에서 돌아오면 지난 목록(이 탭 메모리)으로 바로 그리고 뒤에서 새로 받는다 — '불러오는 중'·맨 위로 튀기 없이
  const [cached] = useState(() => readDashCache(username));
  const [sets, setSets] = useState(() => cached?.sets ?? []);
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
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // 백업 진행 안내('문제집 12/49'). 빈 글이면 안 보임
  const [backupMsg, setBackupMsg] = useState("");
  const backupBusy = useRef(false);
  const inkFileRef = useRef(null); // '필기 가져오기' 파일 고르기(숨김)

  // 찾기·정렬(고른 정렬은 기기에 기억)·마지막 공부 때와 공부한 날(공부 기록 — 대시보드를 열 때마다 이 기기 사본을 읽고,
  // 서버에서 다른 기기 기록을 받아 합치면 다시 읽는다)
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState(() => loadSortMode(username));
  const [studied, setStudied] = useState(() => lastStudiedMap(username));
  const [studyDays, setStudyDays] = useState(() => studyDaysMap(username));
  const [now, setNow] = useState(() => new Date());

  // 공부 기록 나누기: 열 때·다시 보일 때(휴대폰을 집어 들 때) 서버에서 받아 합치고, 이 기기에 모아 둔 것은 올린다.
  // 화면은 기다리지 않는다(받기가 끝나 바뀐 것이 있으면 마지막 공부·요약만 다시 그림). 오류는 보이지 않는다(utils/studyState.js)
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    function run() {
      // 받기를 건너뛰어도(간격) 다시 읽는다 — 풀기 화면이 떠나며 한 마지막 저장은 이 화면의 첫 그리기보다 늦게 들어온다
      syncStudy(currentUser()).then(() => {
        if (!mounted.current) return;
        setStudied(lastStudiedMap(currentUser()));
        setStudyDays(studyDaysMap(currentUser()));
      });
    }
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      setNow(new Date()); // 자정을 넘겨 다시 보면 '오늘'·'3일 전'도 새로
      run();
    }
    run();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

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
  // 기억해 둔 목록이 있으면 처음부터 ok(뒤에서 새로 받는 동안 그대로 보임)
  const [loadState, setLoadState] = useState(cached?.sets ? "ok" : "loading");
  const [loadError, setLoadError] = useState("");
  // 목록 요청 순번: 만들기·지우기 직후 겹친 요청 중 늦게 온 옛 응답이 새 목록을 덮지 않게
  const fetchSeq = useRef(0);

  useEffect(() => { fetchSets(); }, []);

  // 미해결 질문 메모: '질문 메모' 단추의 수와 카드마다의 수. 덤이라 못 불러오면(백엔드 배포 전 등) 숫자만 안 보인다
  const [openNotes, setOpenNotes] = useState(() => cached?.openNotes ?? null);
  useEffect(() => {
    let alive = true;
    listNotes({ status: "open" })
      .then((list) => {
        if (!alive || !Array.isArray(list)) return;
        setOpenNotes(list);
        writeDashCache(currentUser(), { openNotes: list });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const openNoteCount = openNotes ? openNotes.length : null;
  const noteCounts = openNotes ? countNotesBySet(openNotes) : null;

  // 스크롤 자리: 움직일 때마다 기억하고, 기억한 목록으로 다시 열 때 그 자리로(그리기 전에 — 맨 위가 잠깐 보이지 않게).
  // 기억이 없거나 맨 위였으면 맨 위로 — 앞 화면(질문 메모 목록 등)의 스크롤 자리가 그대로 남지 않게.
  // 듣기를 layout 효과로 두는 까닭: 화면을 떠날 때 다른 화면이 짧아져 생기는 스크롤(0 으로)을 기억하지 않게 먼저 뗀다
  useLayoutEffect(() => {
    window.scrollTo(0, cached?.sets ? cached.scrollY || 0 : 0);
  }, [cached]);
  useLayoutEffect(() => {
    const user = currentUser();
    function onScroll() { writeDashCache(user, { scrollY: window.scrollY }); }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function fetchSets() {
    const my = ++fetchSeq.current;
    try {
      const list = await getSets();
      if (my !== fetchSeq.current) return;
      setSets(list);
      writeDashCache(currentUser(), { sets: list });
      setLoadState("ok");
      setLoadError("");
    } catch (e) {
      if (my !== fetchSeq.current) return;
      console.error(e);
      setLoadState("error");
      setLoadError(e.message || "");
    }
  }

  function retryLoad() {
    setLoadState("loading");
    fetchSets();
  }

  function showToast(message, type = "success", ms = 3000) {
    clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }

  // 로그아웃은 묻고 한다(이름 옆이라 잘못 누르기 쉽고, 태블릿에서 긴 비밀번호를 다시 쳐야 함)
  function confirmLogout() {
    if (confirm("로그아웃할까요?")) onLogout();
  }

  function changeSort(mode) {
    setSortMode(mode);
    saveSortMode(currentUser(), mode);
  }

  // 전체 백업(JSON): 문제집·문항·메모를 모두 받아 파일 하나로 내려받는다(서버에는 쓰지 않음)
  async function runBackup() {
    setMenuOpen(false);
    if (backupBusy.current) return;
    backupBusy.current = true;
    setBackupMsg("백업 준비 중…");
    try {
      const data = await buildBackup({
        api: { getSets, getQuestions, listNotes },
        username: currentUser(),
        concurrency: 4,
        onProgress: (p) => setBackupMsg(
          p.phase === "sets" ? `백업 준비 중… 문제집 ${p.done}/${p.total}` : "백업 준비 중… 질문 메모"
        ),
        extras: await backupExtras(currentUser()),
      });
      downloadJson(data, backupFileName(new Date()));
      const n = backupSummary(data);
      const inkNote = data.ink ? ` · 필기 ${data.ink.items.length}` : "";
      const studyNote = n.study ? ` · 공부 기록 ${n.study}` : "";
      showToast(`백업 파일을 내려받았습니다(문제집 ${n.sets} · 문항 ${n.questions} · 메모 ${n.notes}${inkNote}${studyNote})`, "success", 5000);
    } catch (e) {
      console.error(e);
      // 로그인이 끊긴 것이면 App 이 로그인 화면으로 보낸다
      if (e.message !== SESSION_EXPIRED_MESSAGE) showToast(`백업하지 못했습니다. ${e.message || ""}`.trim(), "error", 8000);
    } finally {
      backupBusy.current = false;
      setBackupMsg("");
    }
  }

  // 필기 가져오기: 다른 기기·옛 주소에서 받은 백업 파일의 필기를 이 기기에 넣는다(이 기기의 더 새 필기는 덮지 않음)
  function pickInkFile() {
    setMenuOpen(false);
    inkFileRef.current?.click();
  }

  async function handleInkFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일을 다시 골라도 change 가 오게
    if (!file) return;
    try {
      const obj = JSON.parse(await file.text());
      const r = await importInkJson(inkPartOf(obj), currentUser());
      showToast(
        r.imported > 0
          ? `필기 ${r.imported}개를 가져왔습니다${r.skipped ? `(이 기기 것이 더 새것이라 ${r.skipped}개는 그대로)` : ""}`
          : `가져올 새 필기가 없습니다${r.skipped ? `(${r.skipped}개는 이 기기 것이 더 새것)` : ""}`,
        "success", 5000
      );
    } catch (err) {
      console.error(err);
      const msg = err instanceof SyntaxError ? "JSON 파일이 아닙니다." : (err.message || "");
      showToast(`필기를 가져오지 못했습니다. ${msg}`.trim(), "error", 8000);
    }
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

  // 403 = 칸 권한 등으로 막힘(api/supabase.js 가 status 를 붙임). '없음'(QM404)·검사 실패는 400 + 옛 문구 그대로
  const editErrorText = (e) => (e.status === 403 ? "수정 권한이 없습니다" : e.message);

  async function handleEditSave() {
    const nextTitle = editTitle.trim();
    const nextSubject = editSubject.trim();
    if (!nextTitle) { setEditError("제목을 입력해주세요."); return; }
    setEditSaving(true);
    setEditError("");
    try {
      await updateSet(editingSet.id, nextTitle, nextSubject);
    } catch (e) {
      setEditError(e.status === 403 ? "수정 권한이 없습니다." : e.message);
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

  // 엑셀 다운로드(아직 준비 안 됨이면 그 안내를 토스트로 — src/api/excel.js)
  function handleDownloadAll() {
    try { downloadAll(); } catch (err) { showToast(err.message, "error"); }
  }

  function handleDownloadSet(e, id) {
    e.stopPropagation();
    try { downloadSet(id); } catch (err) { showToast(err.message, "error"); }
  }

  // 카드 목록: 짝인 하드 문제집은 원래 문제집 카드에 묶는다(utils/hardMode.js)
  const cards = groupHardSets(sets);
  // 문제집이 많을 때만 찾기·정렬 줄. 줄이 없으면 찾기·정렬도 쓰지 않는다(늘 기본 순서 그대로)
  const showTools = cards.length > TOOLS_MIN_CARDS;
  const shownCards = showTools ? sortCards(filterCards(cards, query), sortMode, studied) : cards;
  // 공부 요약 한 줄(공부 기록이 없으면 빈 글 — 줄을 그리지 않음). 날짜는 서울 기준(studyState 의 days 와 같게)
  const studySum = studySummary(cards, studyDays, studyDay(now));
  const summary = summaryText(studySum);

  // 뒤로 가기(안드로이드)로 창·메뉴를 닫는다. 수정 창은 저장 중이면 닫지 않는다(칸을 다시 쌓음)
  useBack(menuOpen, () => setMenuOpen(false));
  useBack(showCreateModal, () => setShowCreateModal(false));
  useBack(showEditModal, () => {
    if (editSaving) return STAY;
    closeEditModal();
  });
  useBack(showUploadModal, () => closeUploadModal());

  // Esc 로 창을 닫는다(✕ 와 같은 길 — 뒤로 가기 칸도 함께 걷힘). 수정 창은 저장 중이면 그대로.
  // 한글 입력 중(조합 중)의 Esc 는 조합만 끝내게 둔다. 닫는 함수가 그때그때 상태를 읽으므로 렌더마다 다시 건다
  const modalOpen = showCreateModal || showEditModal || showUploadModal;
  useEffect(() => {
    if (!modalOpen) return undefined;
    function onKey(e) {
      if (e.key !== "Escape" || e.defaultPrevented || e.isComposing) return;
      e.preventDefault();
      if (showEditModal) {
        if (!editSaving) closeEditModal();
      } else if (showUploadModal) {
        closeUploadModal();
      } else {
        setShowCreateModal(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

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
    try { downloadTemplate(); } catch (err) { setUploadError(err.message); }
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
          <span style={S.whoWrap} ref={menuRef}>
            <button
              type="button"
              style={S.whoBtn}
              className="qm-nav-who"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`${username} 메뉴(비밀번호 바꾸기·백업)`}
              title="메뉴"
            >
              <span style={S.username} title={username}>{username}</span>
              <span style={S.whoSub}>
                <span style={S.roleBadge(role)}>{ROLE_LABEL[role] ?? "일반사용자"}</span>
                <span style={S.moreMark} aria-hidden="true">⋯</span>
              </span>
            </button>
            {menuOpen && (
              <div role="menu" style={S.userMenu}>
                <button
                  type="button"
                  role="menuitem"
                  style={S.userMenuItem}
                  onClick={() => { setMenuOpen(false); onChangePassword?.(); }}
                  onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.background = "#242424"; }}
                  onPointerLeave={(e) => { e.currentTarget.style.background = "none"; }}
                >
                  비밀번호 바꾸기
                </button>
                <button
                  type="button"
                  role="menuitem"
                  style={S.userMenuItem}
                  onClick={runBackup}
                  disabled={!!backupMsg}
                  title="문제집·문항·질문 메모와 이 기기의 필기·공부 기록을 모두 파일로 받기"
                  onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.background = "#242424"; }}
                  onPointerLeave={(e) => { e.currentTarget.style.background = "none"; }}
                >
                  백업 내려받기 (JSON)
                </button>
                <button
                  type="button"
                  role="menuitem"
                  style={S.userMenuItem}
                  onClick={pickInkFile}
                  title="백업 파일에 든 필기를 이 기기에 넣기(이 기기의 더 새 필기는 그대로)"
                  onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.background = "#242424"; }}
                  onPointerLeave={(e) => { e.currentTarget.style.background = "none"; }}
                >
                  필기 가져오기
                </button>
              </div>
            )}
            <input
              ref={inkFileRef}
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={handleInkFile}
              aria-hidden="true"
              tabIndex={-1}
            />
          </span>
          <button
            style={S.logoutBtn}
            onClick={confirmLogout}
            onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.7"; }}
            onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
          >
            로그아웃
          </button>
        </div>
      </nav>

      <div className="qm-dash-body">
        <div style={S.header}>
          <div className="qm-dash-title">
            <h2 style={S.h2}>내 문제집</h2>
            {summary && (
              <div
                style={S.summary}
                className="qm-dash-summary"
                data-study-summary=""
                title={"공부한 문제집 수(하드 짝은 하나로) — 휴대폰·태블릿 기록을 합친 값.\n이번 주는 월요일부터, 연속은 하루도 빠짐없이 공부한 날 수(오늘 아직이면 어제까지)"}
              >
                {/* 휴대폰은 짧은 꼴('개' 뺌) — 제목 아래 폭(412px 에서 172px)에 두 자리 수까지 들어가게(DashboardView.css) */}
                <span className="qm-sum-long">{summary}</span>
                <span className="qm-sum-short">{summaryText(studySum, { short: true })}</span>
              </div>
            )}
          </div>
          <div className="qm-dash-head-btns">
            <button
              style={S.notesBtn}
              className="qm-dash-notes"
              onClick={onOpenNotes}
              onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.8"; }}
              onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
              title={openNoteCount ? `미해결 질문 메모 ${openNoteCount}개` : "읽다가 적어 둔 질문 모아 보기"}
            >
              질문 메모
              {openNoteCount > 0 && <span style={S.notesCount}>{openNoteCount > 99 ? "99+" : openNoteCount}</span>}
            </button>
            <button
              style={S.addBtn}
              className="qm-dash-add"
              onClick={() => setShowCreateModal(true)}
              onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.85"; }}
              onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
            >
              + 새 세트 만들기
            </button>
          </div>
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

        {showTools && (
          <div style={S.tools} className="qm-dash-tools">
            <input
              type="search"
              style={S.search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={focusGold}
              onBlur={blurGray}
              placeholder="제목·과목 찾기"
              aria-label="문제집 찾기(제목·과목)"
              enterKeyHint="search"
            />
            <div style={S.sortGroup} role="group" aria-label="정렬">
              <button type="button" style={S.sortBtn(sortMode === SORT_DEFAULT)} aria-pressed={sortMode === SORT_DEFAULT} onClick={() => changeSort(SORT_DEFAULT)} title="만든 순(새것부터)">기본</button>
              <button type="button" style={S.sortBtn(sortMode === SORT_RECENT)} aria-pressed={sortMode === SORT_RECENT} onClick={() => changeSort(SORT_RECENT)} title="최근에 공부한 순(휴대폰·태블릿 기록을 합쳐서)">최근 공부</button>
              <button type="button" style={S.sortBtn(sortMode === SORT_REVIEW)} aria-pressed={sortMode === SORT_REVIEW} onClick={() => changeSort(SORT_REVIEW)} title="공부한 지 오래된 것부터, 공부한 적 없는 것은 그 뒤에">복습 차례</button>
            </div>
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
        ) : shownCards.length === 0 ? (
          <div style={S.noMatch}>‘{query.trim()}’ 에 맞는 문제집이 없습니다.</div>
        ) : (
          <div style={S.grid} className="qm-dash-grid">
            {shownCards.map((card) => {
              const { set: s, hard } = card;
              // 하드모드가 켜지면 풀기·편집·⬇ 엑셀·문항 수가 짝인 하드 문제집을 따른다
              const hardActive = !!hard && hardOn.has(String(s.id));
              const target = hardActive ? hard : s;
              const lastAt = lastStudiedOf(card, studied);
              const studiedText = lastAt ? relativeDay(lastAt, now) : "";
              const noteCount = cardNoteCount(card, noteCounts);
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
                        aria-label={`「${s.title}」 제목·과목 수정`}
                      >✏</button>
                      <button
                        style={S.iconBtn}
                        onClick={(e) => handleDelete(e, s, hard)}
                        onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.color = "#f87171"; }}
                        onPointerLeave={(e) => { e.currentTarget.style.color = ICON_GRAY; }}
                        title="삭제"
                        aria-label={`「${s.title}」 삭제`}
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
                      {/* 마지막 공부(이 기기 기록, 하드 짝은 늦은 쪽)·미해결 메모 수 — 같은 줄 안에서만(카드 높이 그대로) */}
                      {studiedText && (
                        <span style={S.studied} className="qm-card-studied" title={`마지막 공부: ${new Date(lastAt).toLocaleString()}`}>
                          <span className="qm-card-studied-dot">· </span>{studiedText}
                        </span>
                      )}
                      {noteCount > 0 && (
                        <span
                          style={S.noteBadge(hardActive)}
                          className="qm-card-notes"
                          title={`미해결 질문 메모 ${noteCount}개`}
                          aria-label={`미해결 질문 메모 ${noteCount}개`}
                        >
                          <PencilIcon size={10} />{noteCount > 99 ? "99+" : noteCount}
                        </span>
                      )}
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
          <div style={S.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="qm-create-title">
            <button
              style={S.modalClose}
              onClick={() => setShowCreateModal(false)}
              onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.color = "#f1f1f1"; }}
              onPointerLeave={(e) => { e.currentTarget.style.color = "#555555"; }}
              aria-label="닫기"
              title="닫기"
            >✕</button>
            <div style={S.modalTitle} id="qm-create-title">새 문제집 만들기</div>
            <label style={S.label} htmlFor="qm-create-name">제목 *</label>
            <input
              id="qm-create-name"
              style={S.input} value={title}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={focusGold} onBlur={blurGray}
              placeholder="예: 2025 수능 국어" autoFocus
            />
            <label style={S.label} htmlFor="qm-create-subject">과목</label>
            <input
              id="qm-create-subject"
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
          <div style={S.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="qm-edit-title">
            <button
              style={S.modalClose}
              onClick={closeEditModal}
              disabled={editSaving}
              onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.color = "#f1f1f1"; }}
              onPointerLeave={(e) => { e.currentTarget.style.color = "#555555"; }}
              aria-label="닫기"
              title="닫기"
            >✕</button>
            <div style={S.modalTitle} id="qm-edit-title">문제집 수정</div>
            <label style={S.label} htmlFor="qm-edit-name">제목 *</label>
            <input
              id="qm-edit-name"
              style={S.input}
              value={editTitle}
              onChange={(e) => { setEditTitle(e.target.value); setEditError(""); }}
              onFocus={focusGold} onBlur={blurGray}
              placeholder="문제집 제목"
              autoFocus
            />
            <label style={S.label} htmlFor="qm-edit-subject">과목</label>
            <input
              id="qm-edit-subject"
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
          <div style={S.uploadModal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="qm-upload-title">
            <button
              style={S.modalClose}
              onClick={closeUploadModal}
              onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.color = "#f1f1f1"; }}
              onPointerLeave={(e) => { e.currentTarget.style.color = "#555555"; }}
              aria-label="닫기"
              title="닫기"
            >✕</button>
            <div style={S.modalTitle} id="qm-upload-title">엑셀로 문제 업로드</div>

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
                <label style={S.label} htmlFor="qm-upload-set">문제집 선택 *</label>
                <select
                  id="qm-upload-set"
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
                <label style={S.label} htmlFor="qm-upload-name">문제집 이름 *</label>
                <input
                  id="qm-upload-name"
                  style={S.input} value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onFocus={focusGold} onBlur={blurGray}
                  placeholder="예: 2025 수능 영어"
                />
                <label style={S.label} htmlFor="qm-upload-subject">과목 (선택)</label>
                <input
                  id="qm-upload-subject"
                  style={S.input} value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  onFocus={focusGold} onBlur={blurGray}
                  placeholder="예: 영어"
                />
              </>
            )}

            <label style={S.label} htmlFor="qm-upload-file">파일 선택 *</label>
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
                id="qm-upload-file"
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

      {/* ── 토스트(백업 진행 중이면 그 안내가 먼저) ── */}
      {backupMsg ? (
        <div style={S.toast("info")} role="status" data-backup-progress="">{backupMsg}</div>
      ) : toast && (
        <div style={S.toast(toast.type)} role={toast.type === "error" ? "alert" : "status"}>{toast.message}</div>
      )}
    </div>
  );
}
