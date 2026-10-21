import { useState } from "react";
import AuthCard from "../components/AuthCard";
import { updatePassword } from "../api/auth";
import { PASSWORD_MIN_LENGTH } from "../config";
import { SESSION_EXPIRED_MESSAGE } from "../utils/session";

// 새 비밀번호(설계서 3.5절). mode: "recovery"(재설정 메일의 링크로 들어옴) | "change"(대시보드 이름 메뉴의 '비밀번호 바꾸기')
const S = {
  intro: { color: "#a0a0a0", fontSize: 13, lineHeight: 1.6, textAlign: "center", margin: "0 0 20px" },
  label: { display: "block", fontSize: 13, color: "#a0a0a0", fontWeight: 600, marginBottom: 6 },
  input: {
    width: "100%",
    padding: "10px 12px",
    background: "#242424",
    border: "1px solid #2e2e2e",
    borderRadius: 7,
    fontSize: 14,
    marginBottom: 16,
    color: "#f1f1f1",
    outline: "none",
    boxSizing: "border-box",
  },
  error: { color: "#f87171", fontSize: 13, marginBottom: 12, textAlign: "center" },
  done: { color: "#34d399", fontSize: 14, lineHeight: 1.6, textAlign: "center", margin: "0 0 20px" },
  btn: (primary) => ({
    width: "100%",
    minHeight: 44,
    padding: "10px 0",
    background: primary ? "#f59e0b" : "#242424",
    color: primary ? "#000000" : "#a0a0a0",
    border: primary ? "none" : "1px solid #2e2e2e",
    borderRadius: 7,
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    marginTop: primary ? 4 : 8,
  }),
};

export default function NewPasswordView({ mode = "change", onDone, onCancel, onLogout }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const recovery = mode === "recovery";

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    if (pw.length < PASSWORD_MIN_LENGTH) { setError(`비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`); return; }
    if (pw !== pw2) { setError("두 칸의 비밀번호가 같지 않습니다."); return; }
    setSaving(true);
    setError("");
    try {
      await updatePassword(pw);
      setDone(true);
    } catch (err) {
      // 로그인이 끊겼으면 App 이 로그인 화면으로 보낸다
      if (err.message !== SESSION_EXPIRED_MESSAGE) setError(err.message || "비밀번호를 바꾸지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function focusStyle(e) { e.target.style.borderColor = "#f59e0b"; }
  function blurStyle(e) { e.target.style.borderColor = "#2e2e2e"; }

  if (done) {
    return (
      <AuthCard title={recovery ? "새 비밀번호를 정했습니다" : "비밀번호를 바꿨습니다"}>
        <p style={S.done} role="status">다음 로그인부터 새 비밀번호를 씁니다.</p>
        <button type="button" style={S.btn(true)} onClick={onDone} autoFocus>계속</button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={recovery ? "새 비밀번호 정하기" : "비밀번호 바꾸기"}>
      <p style={S.intro}>
        {recovery ? "메일의 링크로 들어왔습니다. " : ""}
        새 비밀번호를 두 번 넣어 주세요({PASSWORD_MIN_LENGTH}자 이상).
      </p>
      <form onSubmit={handleSubmit}>
        <label style={S.label} htmlFor="qm-new-pw">새 비밀번호</label>
        <input
          id="qm-new-pw"
          style={S.input}
          type="password"
          autoComplete="new-password"
          value={pw}
          onChange={(e) => { setPw(e.target.value); setError(""); }}
          onFocus={focusStyle}
          onBlur={blurStyle}
          placeholder={`${PASSWORD_MIN_LENGTH}자 이상`}
          autoFocus
        />
        <label style={S.label} htmlFor="qm-new-pw2">새 비밀번호 다시</label>
        <input
          id="qm-new-pw2"
          style={S.input}
          type="password"
          autoComplete="new-password"
          value={pw2}
          onChange={(e) => { setPw2(e.target.value); setError(""); }}
          onFocus={focusStyle}
          onBlur={blurStyle}
          placeholder="한 번 더"
        />
        {error && <div style={S.error} role="alert">{error}</div>}
        <button style={S.btn(true)} type="submit" disabled={saving}>
          {saving ? "저장 중..." : "저장"}
        </button>
        {recovery ? (
          <button type="button" style={S.btn(false)} onClick={onLogout} disabled={saving}>로그아웃</button>
        ) : (
          <button type="button" style={S.btn(false)} onClick={onCancel} disabled={saving}>취소</button>
        )}
      </form>
    </AuthCard>
  );
}
