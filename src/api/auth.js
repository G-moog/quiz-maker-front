import { connectionError, getSupabase, sessionExpiredError, signOutLocal } from "./supabase";
import { clearSession } from "../utils/session";
import { PASSWORD_MIN_LENGTH } from "../config";

// 로그인·로그아웃·비밀번호(설계서 3절). 회원가입은 없다(Supabase 에서 새 가입을 끔).
// 로그인한 뒤 이름·역할은 App 이 qm_me 로 받아 이 기기에 둔다(utils/session.js saveUser).

// supabase-js(Auth) 오류 → 한국어. 키·비밀번호 같은 값은 문구에 넣지 않는다
async function authError(error, action) {
  const status = typeof error?.status === "number" ? error.status : undefined;
  const code = error?.code || "";
  if (error?.name === "AuthRetryableFetchError" || status === 0) return connectionError(status || 0);
  // 응답 몸이 JSON 이 아님(정지 540 의 평문 등) → auth-js 는 상태 없는 AuthUnknownError 를 낸다. 기술 문구 대신 연결 오류로 —
  // connectionError 가 qm_schema_version 으로 540 을 가려 '서버가 쉬는 중입니다'를 낸다
  if (error?.name === "AuthUnknownError" || status === undefined) return connectionError(0);
  if (status === 540) return connectionError(540);
  if (status >= 500) {
    const err = new Error(`서버 오류로 처리하지 못했습니다(HTTP ${status}). 잠시 뒤 다시 해 주세요.`);
    err.status = status;
    return err;
  }
  let message;
  if (code === "invalid_credentials" || (action === "login" && status === 400 && !code)) {
    message = "이메일 또는 비밀번호가 맞지 않습니다.";
  } else if (code === "email_not_confirmed") {
    message = "이메일 확인이 끝나지 않은 계정입니다. Supabase 대시보드 Users 에서 확인해 주세요.";
  } else if (code === "user_banned") {
    message = "이 계정은 지금 막혀 있습니다.";
  } else if (code === "over_email_send_rate_limit") {
    message = "메일을 너무 자주 요청했습니다. 한 시간쯤 뒤 다시 해 주세요(한 시간에 2통까지 보낼 수 있습니다).";
  } else if (code === "over_request_rate_limit" || status === 429) {
    message = "요청이 너무 많습니다. 잠시 뒤 다시 해 주세요.";
  } else if (code === "weak_password") {
    message = `비밀번호가 너무 약합니다. ${PASSWORD_MIN_LENGTH}자 이상으로, 쉽게 짐작할 수 없게 정해 주세요.`;
  } else if (code === "same_password") {
    message = "지금 쓰는 비밀번호와 다른 비밀번호를 넣어 주세요.";
  } else if (code === "reauthentication_needed") {
    message = "비밀번호를 바꾸려면 다시 로그인해야 합니다. 로그아웃한 뒤 다시 로그인해서 바꿔 주세요.";
  } else if (
    error?.name === "AuthSessionMissingError" || code === "session_not_found" || code === "bad_jwt" || status === 401
  ) {
    if (action !== "login") {
      await signOutLocal({ expired: true });
      return sessionExpiredError();
    }
    message = "이메일 또는 비밀번호가 맞지 않습니다.";
  } else {
    const what = { login: "로그인하지", recovery: "메일을 보내지", password: "비밀번호를 바꾸지" }[action] || "처리하지";
    message = `${what} 못했습니다(${error?.message || "알 수 없는 오류"}).`;
  }
  const err = new Error(message);
  if (status !== undefined) err.status = status;
  if (code) err.code = code;
  return err;
}

// 이메일 + 비밀번호. 성공하면 세션이 이 기기(localStorage)에 남고 스스로 갱신된다
export async function login(email, password) {
  const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw await authError(error, "login");
}

// 이 기기만 로그아웃(다른 기기의 세션은 그대로)
export async function logout() {
  try {
    await signOutLocal();
  } finally {
    clearSession();
  }
}

// 재설정 링크가 돌아올 주소: 지금 연 주소(운영 주소에서 요청하면 운영 주소). Supabase 의 Redirect URLs 에 없는 주소면
// Supabase 가 Site URL(운영 주소)로 바꿔 보내므로 넓어지는 것은 없다. 미리보기에서 재설정을 시험하려면 설계서 3.2-6 대로
// 계정 이름으로 좁힌 와일드카드를 잠깐 넣는다. 주의: merge 전에는 운영 주소에 옛 앱이 떠 있어 재설정 링크가 동작하지 않는다
// (그동안은 로그인된 기기에서 '비밀번호 바꾸기')
function recoveryRedirect() {
  return `${window.location.origin}/`;
}

// '비밀번호를 잊었어요' — 재설정 메일(기본 메일 서버: 한 시간에 2통, Supabase 계정 이메일로만 감)
export async function sendRecovery(email) {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: recoveryRedirect() });
  if (error) throw await authError(error, "recovery");
}

// 새 비밀번호(재설정 링크로 들어온 뒤, 또는 로그인한 채 '비밀번호 바꾸기')
export async function updatePassword(password) {
  const { error } = await getSupabase().auth.updateUser({ password });
  if (error) throw await authError(error, "password");
}
