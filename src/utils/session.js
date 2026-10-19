// 로그인 토큰(JWT) 만료 확인과 만료 알림
export const SESSION_EXPIRED_EVENT = "qm:session-expired";
export const SESSION_EXPIRED_MESSAGE = "로그인이 만료되었습니다. 다시 로그인해 주세요.";

// 토큰의 exp(초)가 지났으면 true. 읽을 수 없는 토큰은 여기서 판단하지 않는다(false).
export function isTokenExpired(token, skewMs = 30_000) {
  if (!token) return false;
  try {
    const part = token.split(".")[1];
    if (!part) return false;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const { exp } = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")));
    return typeof exp === "number" && exp * 1000 <= Date.now() + skewMs;
  } catch {
    return false;
  }
}

export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  localStorage.removeItem("role");
}

export function notifySessionExpired() {
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}
