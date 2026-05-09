import { useState } from "react";
import { login, register } from "../api/auth";

const S = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f0f2f8",
    fontFamily: "sans-serif",
  },
  card: {
    background: "#fff",
    borderRadius: 12,
    boxShadow: "0 4px 24px rgba(30,45,90,0.12)",
    padding: "40px 48px",
    width: 360,
  },
  logo: {
    textAlign: "center",
    color: "#1e2d5a",
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 28,
    letterSpacing: 1,
  },
  tabs: {
    display: "flex",
    marginBottom: 28,
    borderBottom: "2px solid #e5e7ef",
  },
  tab: (active) => ({
    flex: 1,
    padding: "10px 0",
    border: "none",
    background: "none",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 15,
    color: active ? "#1e2d5a" : "#9ca3af",
    borderBottom: active ? "2px solid #1e2d5a" : "2px solid transparent",
    marginBottom: -2,
    transition: "color 0.2s",
  }),
  label: {
    display: "block",
    fontSize: 13,
    color: "#374151",
    fontWeight: 600,
    marginBottom: 6,
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 7,
    fontSize: 14,
    marginBottom: 16,
    boxSizing: "border-box",
    outline: "none",
    color: "#1e2d5a",
  },
  btn: {
    width: "100%",
    padding: "12px 0",
    background: "#1e2d5a",
    color: "#fff",
    border: "none",
    borderRadius: 7,
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 4,
    letterSpacing: 0.5,
  },
  error: {
    color: "#dc2626",
    fontSize: 13,
    marginBottom: 12,
    textAlign: "center",
  },
};

export default function LoginView({ onLoginSuccess }) {
  const [tab, setTab] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const fn = tab === "login" ? login : register;
      const res = await fn(username, password);
      localStorage.setItem("token", res.token);
      localStorage.setItem("username", res.username);
      onLoginSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logo}>📝 Quiz Maker</div>
        <div style={S.tabs}>
          <button style={S.tab(tab === "login")} onClick={() => { setTab("login"); setError(""); }}>
            로그인
          </button>
          <button style={S.tab(tab === "register")} onClick={() => { setTab("register"); setError(""); }}>
            회원가입
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <label style={S.label}>아이디</label>
          <input
            style={S.input}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="아이디 입력"
            autoFocus
          />
          <label style={S.label}>비밀번호</label>
          <input
            style={S.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호 입력"
          />
          {error && <div style={S.error}>{error}</div>}
          <button style={S.btn} type="submit" disabled={loading}>
            {loading ? "처리 중..." : tab === "login" ? "로그인" : "회원가입"}
          </button>
        </form>
      </div>
    </div>
  );
}
