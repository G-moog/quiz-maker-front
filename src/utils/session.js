// 로그인 세션 알림과 이 기기에 둔 사용자 이름·역할.
// 세션(토큰) 자체는 supabase-js 가 localStorage(sb-<ref>-auth-token)에 두고 만료 전에 스스로 갱신한다(api/supabase.js).
export const SESSION_EXPIRED_EVENT = "qm:session-expired";
export const SESSION_EXPIRED_MESSAGE = "로그인이 만료되었습니다. 다시 로그인해 주세요.";
// 비밀번호 재설정 메일의 링크로 들어왔을 때(supabase-js 의 PASSWORD_RECOVERY)
export const PASSWORD_RECOVERY_EVENT = "qm:password-recovery";

// 화면이 쓰는 이름·역할(qm_me 에서 받음). username 은 필기·하드모드·메모 초안의 열쇠라 옛 아이디와 같은 값이다
export function saveUser({ username, role }) {
  localStorage.setItem("username", username || "");
  localStorage.setItem("role", role || "USER");
}

// 이 기기에 둔 이름·역할을 지운다("token" 은 옛 서버의 JWT 자리 — 남아 있으면 함께 지움).
// 세션 끊기(signOut)는 api/auth.js 의 logout 이 한다
export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  localStorage.removeItem("role");
}

export function notifySessionExpired() {
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

export function notifyPasswordRecovery() {
  window.dispatchEvent(new Event(PASSWORD_RECOVERY_EVENT));
}
