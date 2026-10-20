import { useEffect, useState } from "react";
import { SESSION_EXPIRED_EVENT, SESSION_EXPIRED_MESSAGE, clearSession, isTokenExpired } from "./utils/session";
import LoginView from "./views/LoginView";
import DashboardView from "./views/DashboardView";
import EditorView from "./views/EditorView";
import PreviewView from "./views/PreviewView";
import SolveView from "./views/SolveView";
import NotesView from "./views/NotesView";

// 토큰이 살아 있으면 대시보드로 시작한다. 만료된 토큰은 지우고 안내와 함께 로그인 화면으로.
// (만료된 토큰으로 대시보드를 열면 목록 요청이 거절돼 문제집이 없는 것처럼 보였다)
function initialSession() {
  const token = localStorage.getItem("token");
  if (!token) return { view: "login", notice: "" };
  if (isTokenExpired(token)) {
    clearSession();
    return { view: "login", notice: SESSION_EXPIRED_MESSAGE };
  }
  return { view: "dashboard", notice: "" };
}

export default function App() {
  const [start] = useState(initialSession);
  const [view, setView] = useState(start.view);
  const [loginNotice, setLoginNotice] = useState(start.notice);
  const [currentSet, setCurrentSet] = useState(null);
  const [role, setRole] = useState(() => localStorage.getItem("role") || "USER");

  // 쓰는 도중 서버가 만료된 토큰을 거절하면(api/client.js) 로그인 화면으로
  useEffect(() => {
    function handleSessionExpired() {
      clearSession();
      setRole("USER");
      setLoginNotice(SESSION_EXPIRED_MESSAGE);
      setView("login");
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  function handleLogout() {
    clearSession();
    setRole("USER");
    setLoginNotice("");
    setView("login");
  }

  function handleLoginSuccess() {
    setRole(localStorage.getItem("role") || "USER");
    setLoginNotice("");
    setView("dashboard");
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

  if (view === "login") {
    return <LoginView onLoginSuccess={handleLoginSuccess} notice={loginNotice} />;
  }

  if (view === "dashboard") {
    return (
      <DashboardView
        onLogout={handleLogout}
        onOpenEditor={handleOpenEditor}
        onSolve={handleSolve}
        onOpenNotes={() => setView("notes")}
        role={role}
      />
    );
  }

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
}
