import { authFetch } from "./client";

export function register(username, nickname, email, password) {
  return authFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, nickname, email, password }),
  });
}

export function login(username, password) {
  return authFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}
