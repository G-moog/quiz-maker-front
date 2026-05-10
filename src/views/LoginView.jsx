import { useState } from "react";
import { login, register } from "../api/auth";

const S = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f0f0f",
    fontFamily: "system-ui, sans-serif",
  },
  card: {
    background: "#1a1a1a",
    borderRadius: 12,
    border: "1px solid #2e2e2e",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    padding: "40px 48px",
    width: 380,
  },
  logo: {
    textAlign: "center",
    color: "#f59e0b",
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 28,
    letterSpacing: 1,
  },
  tabs: {
    display: "flex",
    marginBottom: 28,
    borderBottom: "1px solid #2e2e2e",
    gap: 4,
  },
  tab: (active) => ({
    flex: 1,
    padding: "10px 0",
    border: "none",
    background: active ? "#242424" : "none",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 15,
    color: active ? "#f59e0b" : "#555555",
    borderBottom: active ? "2px solid #f59e0b" : "2px solid transparent",
    marginBottom: -1,
    borderRadius: "6px 6px 0 0",
    transition: "color 0.15s ease, background 0.15s ease",
  }),
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
  fieldError: {
    color: "#f87171",
    fontSize: 12,
    marginBottom: 12,
  },
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
  serverError: {
    color: "#f87171",
    fontSize: 13,
    marginBottom: 12,
    textAlign: "center",
  },
};

const INIT_REGISTER = {
  username: "",
  nickname: "",
  email: "",
  password: "",
  passwordConfirm: "",
};

function validateRegister(fields) {
  const errors = {};
  if (fields.username.length < 4 || fields.username.length > 20)
    errors.username = "아이디는 4자 이상 20자 이하여야 합니다.";
  if (fields.nickname.length < 2 || fields.nickname.length > 20)
    errors.nickname = "닉네임은 2자 이상 20자 이하여야 합니다.";
  if (!fields.email.includes("@"))
    errors.email = "올바른 이메일 형식이 아닙니다.";
  if (fields.password.length < 6)
    errors.password = "비밀번호는 6자 이상이어야 합니다.";
  if (fields.password !== fields.passwordConfirm)
    errors.passwordConfirm = "비밀번호가 일치하지 않습니다.";
  return errors;
}

export default function LoginView({ onLoginSuccess }) {
  const [tab, setTab] = useState("login");

  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [registerForm, setRegisterForm] = useState(INIT_REGISTER);
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleTabChange(next) {
    setTab(next);
    setServerError("");
    setFieldErrors({});
  }

  async function handleLoginSubmit(e) {
    e.preventDefault();
    setServerError("");
    setLoading(true);
    try {
      const res = await login(loginForm.username, loginForm.password);
      localStorage.setItem("token", res.token);
      localStorage.setItem("username", res.username);
      localStorage.setItem("role", res.role ?? "USER");
      onLoginSuccess();
    } catch (err) {
      setServerError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterSubmit(e) {
    e.preventDefault();
    setServerError("");

    const errors = validateRegister(registerForm);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setLoading(true);
    try {
      const res = await register(
        registerForm.username,
        registerForm.nickname,
        registerForm.email,
        registerForm.password
      );
      localStorage.setItem("token", res.token);
      localStorage.setItem("username", res.username);
      localStorage.setItem("role", res.role ?? "USER");
      onLoginSuccess();
    } catch (err) {
      setServerError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function setRegField(key, value) {
    setRegisterForm((f) => ({ ...f, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((e) => ({ ...e, [key]: undefined }));
  }

  function focusStyle(e) {
    e.target.style.borderColor = "#f59e0b";
  }
  function blurStyle(e, hasError) {
    e.target.style.borderColor = hasError ? "#f87171" : "#2e2e2e";
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logo}>📝 Quiz Maker</div>
        <div style={S.tabs}>
          <button style={S.tab(tab === "login")} onClick={() => handleTabChange("login")}>
            로그인
          </button>
          <button style={S.tab(tab === "register")} onClick={() => handleTabChange("register")}>
            회원가입
          </button>
        </div>

        {tab === "login" ? (
          <form onSubmit={handleLoginSubmit}>
            <label style={S.label}>아이디</label>
            <input
              style={S.input(false)}
              value={loginForm.username}
              onChange={(e) => setLoginForm((f) => ({ ...f, username: e.target.value }))}
              onFocus={focusStyle}
              onBlur={(e) => blurStyle(e, false)}
              placeholder="아이디 입력"
              autoFocus
            />
            <label style={S.label}>비밀번호</label>
            <input
              style={S.input(false)}
              type="password"
              value={loginForm.password}
              onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
              onFocus={focusStyle}
              onBlur={(e) => blurStyle(e, false)}
              placeholder="비밀번호 입력"
            />
            {serverError && <div style={S.serverError}>{serverError}</div>}
            <button
              style={S.btn}
              type="submit"
              disabled={loading}
              onMouseOver={(e) => { e.currentTarget.style.opacity = "0.85"; }}
              onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
            >
              {loading ? "처리 중..." : "로그인"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit}>
            <label style={S.label}>아이디</label>
            <input
              style={S.input(!!fieldErrors.username)}
              value={registerForm.username}
              onChange={(e) => setRegField("username", e.target.value)}
              onFocus={focusStyle}
              onBlur={(e) => blurStyle(e, !!fieldErrors.username)}
              placeholder="4~20자"
              autoFocus
            />
            {fieldErrors.username && <div style={S.fieldError}>{fieldErrors.username}</div>}

            <label style={S.label}>닉네임</label>
            <input
              style={S.input(!!fieldErrors.nickname)}
              value={registerForm.nickname}
              onChange={(e) => setRegField("nickname", e.target.value)}
              onFocus={focusStyle}
              onBlur={(e) => blurStyle(e, !!fieldErrors.nickname)}
              placeholder="2~20자"
            />
            {fieldErrors.nickname && <div style={S.fieldError}>{fieldErrors.nickname}</div>}

            <label style={S.label}>이메일</label>
            <input
              style={S.input(!!fieldErrors.email)}
              type="email"
              value={registerForm.email}
              onChange={(e) => setRegField("email", e.target.value)}
              onFocus={focusStyle}
              onBlur={(e) => blurStyle(e, !!fieldErrors.email)}
              placeholder="example@email.com"
            />
            {fieldErrors.email && <div style={S.fieldError}>{fieldErrors.email}</div>}

            <label style={S.label}>비밀번호</label>
            <input
              style={S.input(!!fieldErrors.password)}
              type="password"
              value={registerForm.password}
              onChange={(e) => setRegField("password", e.target.value)}
              onFocus={focusStyle}
              onBlur={(e) => blurStyle(e, !!fieldErrors.password)}
              placeholder="6자 이상"
            />
            {fieldErrors.password && <div style={S.fieldError}>{fieldErrors.password}</div>}

            <label style={S.label}>비밀번호 재확인</label>
            <input
              style={S.input(!!fieldErrors.passwordConfirm)}
              type="password"
              value={registerForm.passwordConfirm}
              onChange={(e) => setRegField("passwordConfirm", e.target.value)}
              onFocus={focusStyle}
              onBlur={(e) => blurStyle(e, !!fieldErrors.passwordConfirm)}
              placeholder="비밀번호 재입력"
            />
            {fieldErrors.passwordConfirm && <div style={S.fieldError}>{fieldErrors.passwordConfirm}</div>}

            {serverError && <div style={S.serverError}>{serverError}</div>}
            <button
              style={S.btn}
              type="submit"
              disabled={loading}
              onMouseOver={(e) => { e.currentTarget.style.opacity = "0.85"; }}
              onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
            >
              {loading ? "처리 중..." : "회원가입"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
