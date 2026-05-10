import { useState, useEffect } from "react";
import LoginView from "./views/LoginView";
import DashboardView from "./views/DashboardView";
import EditorView from "./views/EditorView";
import PreviewView from "./views/PreviewView";
import SolveView from "./views/SolveView";

export default function App() {
  const [view, setView] = useState("login");
  const [currentSet, setCurrentSet] = useState(null);

  useEffect(() => {
    if (localStorage.getItem("token")) {
      setView("dashboard");
    }
  }, []);

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    setView("login");
  }

  function handleLoginSuccess() {
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
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  if (view === "dashboard") {
    return (
      <DashboardView
        onLogout={handleLogout}
        onOpenEditor={handleOpenEditor}
        onSolve={handleSolve}
      />
    );
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
