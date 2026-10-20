import { SESSION_EXPIRED_MESSAGE, isTokenExpired, notifySessionExpired } from "../utils/session";

const BASE_URL = import.meta.env.VITE_API_URL;

// 로그인·회원가입에는 토큰을 싣지 않고, 실패해도 만료로 보지 않는다
const AUTH_FREE = ["/api/auth/login", "/api/auth/register"];

export async function authFetch(path, options = {}) {
  const authFree = AUTH_FREE.includes(path);
  const token = authFree ? null : localStorage.getItem("token");

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    if (token && (res.status === 401 || res.status === 403) && (await isSessionGone(token))) {
      // 그새 다시 로그인했으면 새 토큰을 건드리지 않는다
      if (localStorage.getItem("token") === token) notifySessionExpired();
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }
    const message = await res.text();
    // status: 부르는 쪽이 '아직 서버에 없는 기능(404 등)' 같은 경우를 가릴 수 있게
    const err = new Error(message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// 401·403 이 토큰 만료 때문인지 가린다.
// 토큰의 만료 시각이 지났거나 서버가 토큰 자체를 받지 않으면(/api/auth/me 가 4xx) 만료로 본다.
// 토큰은 살아 있는데 역할 등으로 막힌 403 이나 네트워크 오류는 만료로 단정하지 않는다.
async function isSessionGone(token) {
  if (isTokenExpired(token)) return true;
  try {
    const me = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return !me.ok && me.status >= 400 && me.status < 500;
  } catch {
    return false;
  }
}
