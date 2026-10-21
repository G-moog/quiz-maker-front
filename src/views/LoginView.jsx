import { useState } from "react";
import { login, sendRecovery } from "../api/auth";

// 로그인(설계서 3.1·3.5절): 이메일 + 비밀번호. 회원가입은 없다(Supabase 에서 새 가입을 끔).
// '비밀번호를 잊었어요' → 재설정 메일 → 메일의 링크 → 새 비밀번호 화면(App 이 PASSWORD_RECOVERY 를 받아 엶)

const S = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f0f0f",
    fontFamily: "system-ui, sans-serif",
    padding: 16,
  },
  // 휴대폰: 화면 끝에서 16px 띄우고, 좁을수록 안쪽 여백을 줄여 입력칸을 넓게(clamp). 넓은 화면은 380px 그대로
  card: {
    background: "#1a1a1a",
    borderRadius: 12,
    border: "1px solid #2e2e2e",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    padding: "clamp(28px, 8vw, 40px) clamp(20px, 7vw, 48px)",
    width: "100%",
    maxWidth: 380,
  },
  logo: {
    textAlign: "center",
    color: "#f59e0b",
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 28,
    letterSpacing: 1,
  },
  heading: {
    color: "#f1f1f1",
    fontSize: 16,
    fontWeight: 700,
    margin: "0 0 10px",
    textAlign: "center",
  },
  intro: {
    color: "#a0a0a0",
    fontSize: 13,
    lineHeight: 1.6,
    margin: "0 0 18px",
    textAlign: "center",
  },
  label: {
    display: "block",
    fontSize: 13,
    color: "#a0a0a0",
    fontWeight: 600,
    marginBottom: 6,
  },
  input: (hasError) => ({
    width: "100%",
    padding: "10px 12px",
    background: "#242424",
    border: `1px solid ${hasError ? "#f87171" : "#2e2e2e"}`,
    borderRadius: 7,
    fontSize: 14,
    marginBottom: hasError ? 4 : 16,
    color: "#f1f1f1",
    outline: "none",
    transition: "border-color 0.15s ease",
  }),
  btn: {
    width: "100%",
    padding: "12px 0",
    background: "#f59e0b",
    color: "#000000",
    border: "none",
    borderRadius: 7,
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 4,
    letterSpacing: 0.5,
    transition: "opacity 0.15s ease",
  },
  // 여백 10 + 음수 여백: 보이는 자리는 그대로, 누르는 자리만 넓게
  linkBtn: {
    display: "block",
    margin: "14px auto -10px",
    padding: 10,
    background: "none",
    border: "none",
    color: "#a0a0a0",
    fontSize: 13,
    textDecoration: "underline",
    cursor: "pointer",
  },
  serverError: {
    color: "#f87171",
    fontSize: 13,
    marginBottom: 12,
    textAlign: "center",
  },
  sent: {
    color: "#34d399",
    fontSize: 14,
    lineHeight: 1.6,
    margin: "0 0 8px",
    textAlign: "center",
  },
  notice: {
    color: "#f59e0b",
    background: "rgba(245,158,11,0.1)",
    border: "1px solid rgba(245,158,11,0.4)",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    marginBottom: 20,
    textAlign: "center",
  },
};

export default function LoginView({ onLoginSuccess, notice = "" }) {
  // login(로그인) · forgot(재설정 메일 받기) · sent(메일 보냄)
  const [mode, setMode] = useState("login");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [forgotEmail, setForgotEmail] = useState("");
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);

  function changeMode(next) {
    setMode(next);
    setServerError("");
    if (next === "forgot") setForgotEmail((cur) => cur || loginForm.email);
  }

  async function handleLoginSubmit(e) {
    e.preventDefault();
    if (loading) return;
    if (!loginForm.email.trim() || !loginForm.password) {
      setServerError("이메일과 비밀번호를 넣어 주세요.");
      return;
    }
    setServerError("");
    setLoading(true);
    try {
      await login(loginForm.email, loginForm.password);
      onLoginSuccess();
    } catch (err) {
      setServerError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotSubmit(e) {
    e.preventDefault();
    if (loading) return;
    if (!forgotEmail.includes("@")) {
      setServerError("로그인에 쓰는 이메일을 넣어 주세요.");
      return;
    }
    setServerError("");
    setLoading(true);
    try {
      await sendRecovery(forgotEmail);
      setMode("sent");
    } catch (err) {
      setServerError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function focusStyle(e) {
    e.target.style.borderColor = "#f59e0b";
  }
  function blurStyle(e) {
    e.target.style.borderColor = "#2e2e2e";
  }

  const submitHover = {
    onPointerEnter: (e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.85"; },
    onPointerLeave: (e) => { e.currentTarget.style.opacity = "1"; },
  };

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logo}>📝 Quiz Maker</div>
        {notice && mode === "login" && <div style={S.notice} role="status">{notice}</div>}

        {mode === "login" && (
          <form onSubmit={handleLoginSubmit}>
            <label style={S.label} htmlFor="qm-login-email">이메일</label>
            <input
              id="qm-login-email"
              style={S.input(false)}
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={loginForm.email}
              onChange={(e) => setLoginForm((f) => ({ ...f, email: e.target.value }))}
              onFocus={focusStyle}
              onBlur={blurStyle}
              placeholder="이메일 입력"
              autoFocus
            />
            <label style={S.label} htmlFor="qm-login-password">비밀번호</label>
            <input
              id="qm-login-password"
              style={S.input(false)}
              type="password"
              autoComplete="current-password"
              value={loginForm.password}
              onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
              onFocus={focusStyle}
              onBlur={blurStyle}
              placeholder="비밀번호 입력"
            />
            {serverError && <div style={S.serverError} role="alert">{serverError}</div>}
            <button style={S.btn} type="submit" disabled={loading} {...submitHover}>
              {loading ? "처리 중..." : "로그인"}
            </button>
            <button type="button" style={S.linkBtn} onClick={() => changeMode("forgot")}>
              비밀번호를 잊었어요
            </button>
          </form>
        )}

        {mode === "forgot" && (
          <form onSubmit={handleForgotSubmit}>
            <h1 style={S.heading}>비밀번호 다시 정하기</h1>
            <p style={S.intro}>
              로그인에 쓰는 이메일을 넣으면 새 비밀번호를 정하는 링크를 메일로 보냅니다(한 시간에 2통까지).
            </p>
            <label style={S.label} htmlFor="qm-forgot-email">이메일</label>
            <input
              id="qm-forgot-email"
              style={S.input(false)}
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              onFocus={focusStyle}
              onBlur={blurStyle}
              placeholder="이메일 입력"
              autoFocus
            />
            {serverError && <div style={S.serverError} role="alert">{serverError}</div>}
            <button style={S.btn} type="submit" disabled={loading} {...submitHover}>
              {loading ? "보내는 중..." : "재설정 메일 보내기"}
            </button>
            <button type="button" style={S.linkBtn} onClick={() => changeMode("login")}>
              ← 로그인으로
            </button>
          </form>
        )}

        {mode === "sent" && (
          <div>
            <h1 style={S.heading}>메일을 보냈습니다</h1>
            <p style={S.sent} role="status">
              메일의 링크를 누르면 새 비밀번호를 정하는 화면이 열립니다.
            </p>
            <p style={S.intro}>
              메일이 오지 않으면 스팸함을 보거나 잠시 뒤 다시 해 주세요. 그래도 안 오면 Supabase 대시보드
              Users 에서 그 사용자의 재설정 메일 보내기를 씁니다(사용자를 지우고 다시 만들지 않습니다).
            </p>
            <button type="button" style={S.btn} onClick={() => changeMode("login")} {...submitHover}>
              로그인으로
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
