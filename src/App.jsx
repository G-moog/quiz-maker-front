import { useEffect, useRef, useState } from "react";
import {
  PASSWORD_RECOVERY_EVENT, SESSION_EXPIRED_EVENT, SESSION_EXPIRED_MESSAGE, clearSession, saveUser,
} from "./utils/session";
import { decideAfterMe, hostKindOf, recoveryFromHash } from "./utils/startup";
import { configState, connectionError, fetchMe, loadSession } from "./api/supabase";
import { logout } from "./api/auth";
import { PROD_HOSTS, REQUIRED_SCHEMA } from "./config";
import LoginView from "./views/LoginView";
import StatusView from "./views/StatusView";
import NewPasswordView from "./views/NewPasswordView";
import EnvBand from "./components/EnvBand";
import DashboardView from "./views/DashboardView";
import EditorView from "./views/EditorView";
import PreviewView from "./views/PreviewView";
import SolveView from "./views/SolveView";
import NotesView from "./views/NotesView";

// 시작 판정(설계서 3.4절): 주소 종류 → 세션 확인 → qm_me → 화면.
// 세션은 supabase-js 가 스스로 갱신하므로 24시간마다 끊기지 않는다. 로그인이 끊기면(갱신 실패·다른 탭 로그아웃)
// api 층이 qm:session-expired 를 내고, 여기서 로그인 화면으로 보낸다.

const HOST_KIND = hostKindOf(window.location.hostname);
const PREVIEW_OK_KEY = "qm:preview-live-ok"; // 미리보기 + 운영 데이터 확인(탭마다 한 번 — sessionStorage)

// 재설정 메일의 링크로 들어왔는지는 supabase-js 가 주소를 지우기 전에 읽어 둔다
const START_LINK = recoveryFromHash(window.location.hash);
if (START_LINK && START_LINK.error) {
  try { window.history.replaceState(null, "", window.location.pathname + window.location.search); } catch { /* 그대로 둠 */ }
}

function previewConfirmed() {
  try { return sessionStorage.getItem(PREVIEW_OK_KEY) === "1"; } catch { return false; }
}

// 세션을 보기 전에 정해지는 안내: 옛 Railway 주소, 앱 설정이 비었거나 잘못(공개 키가 아님 등)
function staticScreen() {
  if (HOST_KIND === "legacy") return { kind: "moved", message: "" };
  if (configState.error) return { kind: "config-bad", message: configState.error };
  if (!configState.ok) return { kind: "config-empty", message: "" };
  return null;
}
const STATIC_SCREEN = staticScreen();

export default function App() {
  // phase: checking · status · login · password · app
  const [phase, setPhase] = useState(STATIC_SCREEN ? "status" : "checking");
  const [status, setStatus] = useState(STATIC_SCREEN); // 안내 화면 { kind, message }
  const [loginNotice, setLoginNotice] = useState(
    START_LINK && START_LINK.error
      ? "재설정 링크를 쓸 수 없습니다(만료되었거나 이미 쓴 링크). '비밀번호를 잊었어요'로 다시 받아 주세요."
      : ""
  );
  const [pwMode, setPwMode] = useState("change");
  const [band, setBand] = useState(null);
  const [view, setView] = useState("dashboard");
  const [currentSet, setCurrentSet] = useState(null);
  const [role, setRole] = useState(() => localStorage.getItem("role") || "USER");
  const [busy, setBusy] = useState(false);
  const recoveryPending = useRef(START_LINK === "recovery");
  const bootSeq = useRef(0); // 늦게 끝난 옛 판정이 새 판정을 덮지 않게

  function toLogin(notice = "") {
    clearSession();
    setRole("USER");
    setBand(null);
    setLoginNotice(notice);
    setPhase("login");
  }

  function showStatus(kind, message = "") {
    setStatus({ kind, message });
    setPhase("status");
  }

  // 세션이 있는 상태에서: 재설정 링크면 새 비밀번호 화면, 아니면 qm_me 로 판정
  async function enter(seq) {
    if (recoveryPending.current) {
      setPwMode("recovery");
      setPhase("password");
      return;
    }
    let me;
    try {
      me = await fetchMe();
    } catch (e) {
      if (seq !== bootSeq.current) return;
      if (e.sessionExpired) return; // 만료 알림(아래 효과)이 로그인 화면으로 보낸다
      if (e.notReady) return showStatus("not-ready");
      if (e.paused || e.offline) return showStatus(e.paused && !e.offline ? "paused" : "offline", e.message);
      return showStatus("error", e.message);
    }
    if (seq !== bootSeq.current) return;
    const d = decideAfterMe(me, HOST_KIND, REQUIRED_SCHEMA);
    if (d.screen === "app" || d.screen === "confirm-preview") {
      saveUser(me);
      setRole(me.role || "USER");
    }
    if (d.screen === "app") {
      setBand(d.band);
      setView("dashboard");
      setPhase("app");
    } else if (d.screen === "confirm-preview") {
      setBand(d.band);
      if (previewConfirmed()) {
        setView("dashboard");
        setPhase("app");
      } else {
        showStatus("confirm-preview");
      }
    } else {
      showStatus(d.screen);
    }
  }

  // 세션 확인 → enter. seq 는 부르는 쪽이 올린다(늦게 끝난 옛 판정을 버리려고)
  async function boot(seq) {
    let r;
    try {
      r = await loadSession();
    } catch (e) {
      if (seq === bootSeq.current) showStatus("error", e.message);
      return;
    }
    if (seq !== bootSeq.current) return;
    if (!r.session) {
      // 세션 갱신이 연결 문제로 실패: 로그인 화면 대신 연결 안내(세션은 남아 있어 나중에 그대로 이어짐)
      if (r.error && (r.error.status === 0 || r.error.status >= 500)) {
        const e = await connectionError(r.error.status || 0);
        if (seq !== bootSeq.current) return;
        return showStatus(e.paused && !e.offline ? "paused" : "offline", e.message);
      }
      recoveryPending.current = false; // 재설정 링크가 받아들여지지 않았으면 보통 로그인으로
      return setPhase("login");
    }
    await enter(seq);
  }

  useEffect(() => {
    // 쓰는 도중 로그인이 끊기면(api 층의 만료 판정, 다른 탭 로그아웃, 갱신 실패) 로그인 화면으로
    function handleSessionExpired() {
      bootSeq.current++;
      recoveryPending.current = false;
      toLogin(SESSION_EXPIRED_MESSAGE);
    }
    // 재설정 메일의 링크(supabase-js PASSWORD_RECOVERY)
    function handleRecovery() {
      recoveryPending.current = true;
      setPwMode("recovery");
      setPhase("password");
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    window.addEventListener(PASSWORD_RECOVERY_EVENT, handleRecovery);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
      window.removeEventListener(PASSWORD_RECOVERY_EVENT, handleRecovery);
    };
  }, []);

  // 첫 판정은 화면이 뜬 뒤 비동기로(그동안 '확인 중'). 처음 한 번만 돈다 — 다시 판정은 '다시 시도'·로그인이 부른다
  useEffect(() => {
    if (!STATIC_SCREEN) boot(++bootSeq.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogout() {
    bootSeq.current++;
    setBusy(true);
    try {
      await logout();
    } finally {
      setBusy(false);
      recoveryPending.current = false;
      toLogin("");
    }
  }

  async function retry() {
    const seq = ++bootSeq.current;
    setBusy(true);
    setPhase("checking");
    try {
      await boot(seq);
    } finally {
      setBusy(false);
    }
  }

  function handleLoginSuccess() {
    setLoginNotice("");
    const seq = ++bootSeq.current;
    setPhase("checking");
    enter(seq);
  }

  function handlePasswordDone() {
    if (pwMode === "recovery") {
      recoveryPending.current = false;
      const seq = ++bootSeq.current;
      setPhase("checking");
      enter(seq);
    } else {
      setPhase("app");
    }
  }

  function confirmPreview() {
    try { sessionStorage.setItem(PREVIEW_OK_KEY, "1"); } catch { /* 이 탭에서만 다시 물음 */ }
    setView("dashboard");
    setPhase("app");
  }

  function handleOpenEditor(set) {
    setCurrentSet(set);
    setView("editor");
  }

  function handleOpenPreview(set) {
    setCurrentSet(set);
    setView("preview");
  }

  function handleSolve(set) {
    setCurrentSet(set);
    setView("solve");
  }

  if (phase === "checking") {
    return <StatusView title="확인 중…" message="로그인 상태와 서버를 확인하고 있습니다." />;
  }

  if (phase === "login") {
    return <LoginView onLoginSuccess={handleLoginSuccess} notice={loginNotice} />;
  }

  if (phase === "password") {
    return (
      <NewPasswordView
        key={pwMode}
        mode={pwMode}
        onDone={handlePasswordDone}
        onCancel={() => setPhase("app")}
        onLogout={handleLogout}
      />
    );
  }

  if (phase === "status") {
    return renderStatus();
  }

  return (
    <>
      <EnvBand kind={band} />
      {renderApp()}
    </>
  );

  function renderStatus() {
    const k = status?.kind;
    const logoutBtn = { label: "로그아웃", onClick: handleLogout };
    const retryBtn = { label: "다시 시도", onClick: retry, primary: true };
    const newHost = PROD_HOSTS[0];
    const screens = {
      moved: {
        title: "주소가 바뀌었습니다",
        message: newHost
          ? "Quiz Maker 는 새 주소로 옮겼습니다. 홈 화면 바로가기도 새 주소로 다시 만들어 주세요."
          : "Quiz Maker 는 새 주소로 옮겼습니다. 홈 화면 바로가기도 새 주소로 다시 만들어 주세요.\n(새 주소가 아직 이 앱에 적혀 있지 않습니다.)",
        tone: "warn",
        actions: newHost ? [{ label: `새 주소로 가기 (${newHost})`, href: `https://${newHost}/`, primary: true }] : [],
      },
      "config-empty": {
        title: "앱 설정이 비어 있습니다",
        message: "src/config.js 에 Supabase 주소와 공개 키(sb_publishable_…)를 넣은 뒤 다시 빌드해야 합니다.",
        tone: "warn",
      },
      "config-bad": {
        title: "앱 설정이 잘못되었습니다",
        message: `${status?.message || ""}\n(src/config.js 를 고친 뒤 다시 빌드해야 합니다)`,
        tone: "error",
      },
      "not-ready": {
        title: "서버 준비 중",
        message: `DB 가 아직 이 앱에 맞게 준비되지 않았습니다(필요한 판 ${REQUIRED_SCHEMA}). 잠시 뒤 다시 열어 주세요.`,
        tone: "warn",
        actions: [retryBtn, logoutBtn],
      },
      paused: {
        title: "서버가 쉬는 중입니다",
        message: status?.message,
        tone: "warn",
        actions: [retryBtn],
      },
      offline: {
        title: "서버에 연결하지 못했습니다",
        message: status?.message,
        tone: "warn",
        actions: [retryBtn],
      },
      account: {
        title: "계정 준비 필요",
        message:
          "로그인은 되었지만 계정 준비가 끝나지 않았습니다.\nPC 터미널에서 문제 등록 도구로 node quiz.mjs login --backend supabase 를 한 번 해 주세요(처음 한 번만).",
        tone: "warn",
        actions: [{ ...retryBtn, label: "다시 확인" }, logoutBtn],
      },
      cutover: {
        title: "전환 준비 중",
        message: "새 서버로 옮기는 중입니다. 전환이 끝나면 이 주소에서 바로 쓸 수 있습니다.",
        tone: "warn",
        actions: [{ ...retryBtn, label: "다시 확인" }, logoutBtn],
      },
      "confirm-preview": {
        title: "미리보기 주소입니다",
        message: "이 주소는 운영 데이터를 바로 읽고 씁니다.\n쓰기 시험은 [시험] 문제집에서만 해 주세요.",
        tone: "error",
        actions: [{ label: "확인하고 들어가기", onClick: confirmPreview, primary: true }, logoutBtn],
      },
      error: {
        title: "시작하지 못했습니다",
        message: status?.message,
        tone: "error",
        actions: [retryBtn, logoutBtn],
      },
    };
    const s = screens[k] || screens.error;
    // 오류 문구가 제목과 같은 문장으로 시작하면(예: '서버가 쉬는 중입니다. …') 그 문장은 한 번만
    const message = s.message && s.message.startsWith(`${s.title}.`) ? s.message.slice(s.title.length + 1).trim() : s.message;
    return <StatusView title={s.title} message={message} tone={s.tone} actions={s.actions} busy={busy} />;
  }

  function renderApp() {
    if (view === "notes") {
      return <NotesView onBack={() => setView("dashboard")} />;
    }

    if (view === "editor") {
      return (
        <EditorView
          set={currentSet}
          onBack={() => setView("dashboard")}
          onPreview={handleOpenPreview}
        />
      );
    }

    if (view === "preview") {
      return (
        <PreviewView
          set={currentSet}
          onBack={() => setView("editor")}
        />
      );
    }

    if (view === "solve") {
      return (
        <SolveView
          set={currentSet}
          onBack={() => setView("dashboard")}
        />
      );
    }

    return (
      <DashboardView
        onLogout={handleLogout}
        onOpenEditor={handleOpenEditor}
        onSolve={handleSolve}
        onOpenNotes={() => setView("notes")}
        onChangePassword={() => { setPwMode("change"); setPhase("password"); }}
        role={role}
      />
    );
  }
}
