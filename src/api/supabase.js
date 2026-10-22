// Supabase 연결(설계서 3.4·4.3·5.1절). 앱의 모든 데이터 호출은 call(이름, 인자) → DB 함수(qm_*) 하나다.
// 오류는 화면에 그대로 보여 줄 수 있는 한국어 Error 로 바꾼다: { message, status, code } + 판정 표시
//   sessionExpired(다시 로그인) · notReady(서버 준비 중) · paused(서버가 쉬는 중일 수 있음) · offline(연결 실패)
// 옛 서버와 같게 '없음·검사 실패'(QM404·QM400 …)는 status 400 + 옛 문구 그대로라, 화면의 판정(QuestionNoteSheet 의
// e.status === 400·문구 정규식)이 바뀌지 않는다.
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, PROD_HOSTS, checkConfig } from "../config";
import { SESSION_EXPIRED_MESSAGE, notifyPasswordRecovery, notifySessionExpired } from "../utils/session";

export const OFFLINE_MESSAGE = "서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.";
export const PAUSED_MESSAGE =
  "서버가 쉬는 중입니다. supabase.com 대시보드 → 프로젝트 → Resume project 를 누르고 몇 분 뒤 다시 해 주세요.";
export const MAYBE_PAUSED_MESSAGE =
  "인터넷이 되는데도 계속 안 되면 서버가 쉬는 중일 수 있습니다(supabase.com 대시보드 → 프로젝트 → Resume project, 몇 분 뒤 다시).";
export const NOT_READY_MESSAGE = "서버가 아직 준비되지 않았습니다(DB 함수 없음). 잠시 뒤 다시 해 주세요.";

// 시작할 때 한 번: { ok } | { empty } (값이 아직 없음) | { error } (공개 키가 아님, 운영 주소 꼴이 틀림 등)
export const configState = checkConfig({ url: SUPABASE_URL, key: SUPABASE_PUBLISHABLE_KEY, prodHosts: PROD_HOSTS });

// 세션 확인이 이보다 오래 걸리면(갱신이 연결 문제로 다시 시도 중 — supabase-js 는 30초 가까이 다시 시도함) 서버를 직접 본다
const SESSION_WAIT_MS = 5000;
// 서버 확인(qm_schema_version) 한 번을 기다리는 한도. 넘으면 연결 실패로 본다
const PROBE_TIMEOUT_MS = 8000;

let client = null;
let userSigningOut = false; // 사용자가 누른 로그아웃(또는 이 층이 만료로 끊는 중)이면 SIGNED_OUT 을 '만료'로 알리지 않는다

// Free 프로젝트가 정지되면 Supabase 는 HTTP 540 을 준다. auth-js 는 540 을 '다시 시도할 수 없는 오류'로 보아, 액세스 토큰이
// 이미 만료된 때(며칠 쉬었다 열면 늘 그렇다) 이 기기의 세션을 지우고 SIGNED_OUT 을 낸다 — 그러면 '쉬는 중' 대신 '로그인 만료'가
// 뜨고 Resume 뒤에도 다시 로그인해야 한다. 그래서 Auth 요청(/auth/v1/)의 540 은 '연결 실패'로 바꿔 넘긴다. auth-js 는 그때
// 세션을 그대로 두고(다시 시도할 수 있는 오류), 앱은 probeServer 로 540 을 가려 '서버가 쉬는 중입니다'를 보인다.
// 데이터(rpc)·그림(storage)의 540 은 그대로 둔다(rpcError 가 직접 가림). 로그아웃하는 동안에도 그대로 둔다 — 세션을 지우려는
// 것이므로, 바꾸면 오히려 만료된 토큰을 갱신하려 30초 가까이 다시 시도하다 세션을 못 지운다
async function pauseAwareFetch(input, init) {
  const res = await fetch(input, init);
  if (res.status === 540 && !userSigningOut) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url || "");
    if (url.includes("/auth/v1/")) throw new TypeError("Supabase 프로젝트가 쉬는 중입니다(HTTP 540)");
  }
  return res;
}

// promise 를 ms 까지만 기다린다. 넘으면 TIMED_OUT 을 돌려준다(promise 는 뒤에서 계속 돈다)
const TIMED_OUT = Symbol("timed-out");
async function within(promise, ms) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((resolve) => { timer = setTimeout(() => resolve(TIMED_OUT), ms); })]);
  } finally {
    clearTimeout(timer);
  }
}

// 클라이언트는 처음 쓸 때 만든다(설정이 비었거나 잘못이면 만들지 않음 — App 이 안내 화면을 보인다).
// 만들자마자 supabase-js 가 저장된 세션을 갱신하려 하므로, App 은 그 전에 serverDownError() 로 서버가 닿는지 먼저 본다
export function getSupabase() {
  if (client) return client;
  if (!configState.ok) {
    throw new Error(configState.error || "앱 설정(src/config.js)의 Supabase 주소와 공개 키가 비어 있습니다.");
  }
  client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: { fetch: pauseAwareFetch },
  });
  // 콜백 안에서는 다른 supabase 호출을 기다리지 않는다(supabase-js 안내) — 알림만 낸다
  client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT" && !userSigningOut) notifySessionExpired(); // 갱신 실패·다른 탭 로그아웃 등
    if (event === "PASSWORD_RECOVERY") notifyPasswordRecovery();
  });
  return client;
}

// 이 기기의 세션만 끊는다(다른 기기는 그대로). 사용자가 누른 로그아웃이면 만료 알림을 내지 않는다
export async function signOutLocal({ expired = false } = {}) {
  if (!client) return;
  userSigningOut = true;
  try {
    await client.auth.signOut({ scope: "local" });
  } catch {
    // 서버에 못 알려도 이 기기의 세션은 지워진다
  } finally {
    userSigningOut = false;
  }
  if (expired) notifySessionExpired();
}

// 지금 세션. { session, error } — 갱신이 연결 문제로 실패하면 session 은 null 이고 error 가 있다(세션은 이 기기에 남음).
// 갱신이 연결 문제로 다시 시도 중이면 supabase-js 는 30초 가까이 붙잡고 있으므로, SESSION_WAIT_MS 가 넘으면 서버를 직접 보고
// 닿지 않으면(정지 540·연결 실패) 기다리지 않고 { session: null, error: { status } } 를 돌려준다
export async function loadSession() {
  const pending = getSupabase()
    .auth.getSession()
    .then(({ data, error }) => ({ session: data?.session ?? null, error: error ?? null }));
  pending.catch(() => { /* 아래에서 먼저 돌아가도 처리 안 된 거절로 남지 않게 */ });
  const first = await within(pending, SESSION_WAIT_MS);
  if (first !== TIMED_OUT) return first;
  const probe = await probeServer();
  if (probe.status === 540 || probe.status === 0) return { session: null, error: { status: probe.status } };
  return pending; // 서버는 닿음 — 갱신이 끝나기를 기다린다
}

// 로그인 없이 부를 수 있는 qm_schema_version 으로 서버가 살아 있는지 본다(supabase-js 세션을 거치지 않음).
// PROBE_TIMEOUT_MS 안에 답이 없으면 연결 실패(status 0)
export async function probeServer() {
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS) : null;
  try {
    const r = await fetch(`${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/rpc/qm_schema_version`, {
      method: "POST",
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: "{}",
      signal: ctrl ? ctrl.signal : undefined,
    });
    if (r.status === 540) return { ok: false, status: 540 };
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, status: r.status, version: Number(await r.text()) };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function makeError(message, { status, code, ...flags } = {}) {
  const err = new Error(message);
  if (status !== undefined) err.status = status;
  if (code) err.code = code;
  Object.assign(err, flags);
  return err;
}

export function sessionExpiredError() {
  return makeError(SESSION_EXPIRED_MESSAGE, { status: 401, sessionExpired: true });
}

// probeServer 결과 → 연결 오류. 540 이면 '쉬는 중', 서버는 닿으면 '연결 실패', 그것도 안 되면 '쉬는 중일 수 있음'을 함께
function errorFromProbe(probe, status) {
  if (probe.status === 540) return makeError(PAUSED_MESSAGE, { status: 540, paused: true });
  if (probe.ok) return makeError(OFFLINE_MESSAGE, { status, offline: true });
  return makeError(`${OFFLINE_MESSAGE} ${MAYBE_PAUSED_MESSAGE}`, { status, offline: true, paused: true });
}

// 540(프로젝트 정지)·연결 실패. 연결 실패면 qm_schema_version 을 한 번 더 불러 보고, 그것도 안 되면 '쉬는 중일 수 있음'을 함께 알린다
export async function connectionError(status) {
  if (status === 540) return makeError(PAUSED_MESSAGE, { status: 540, paused: true });
  return errorFromProbe(await probeServer(), status);
}

// 시작할 때 세션을 보기 전에(클라이언트를 만들기 전에) 서버가 닿는지 본다. 정지(540)·연결 실패면 그 오류, 닿으면 null.
// 먼저 보지 않으면 supabase-js 가 만료된 토큰을 갱신하려다 30초 가까이 다시 시도해 '확인 중'이 길어진다
export async function serverDownError() {
  const probe = await probeServer();
  if (probe.status === 540 || probe.status === 0) return errorFromProbe(probe, 0);
  return null; // 닿음(함수 없음 404 등도 여기 — 뒤의 qm_me 판정이 '서버 준비 중'을 정한다)
}

// PostgREST 응답(rpc 결과의 status·error)을 앱 오류로(설계서 4.3절 표)
export async function rpcError({ status, error }) {
  const code = (error && error.code) || "";
  if (!status) return connectionError(0);
  if (status === 540) return connectionError(540);
  if (status === 401 || code === "PGRST301" || code === "PGRST302" || code === "PGRST303") {
    await signOutLocal({ expired: true });
    return sessionExpiredError();
  }
  if (code === "PGRST202" || (status === 404 && code.startsWith("PGRST"))) {
    return makeError(NOT_READY_MESSAGE, { status, code, notReady: true });
  }
  if (status >= 500) {
    return makeError(`서버 오류로 처리하지 못했습니다(HTTP ${status}). 잠시 뒤 다시 해 주세요.`, { status, code });
  }
  if (code === "42501") return makeError("권한이 없습니다.", { status, code });
  if (code === "22001" || code === "23514" || code === "22P02") {
    // 함수가 먼저 한국어로 검사하므로 여기 오는 것은 마지막 방어선(표 제약)에 걸린 경우다
    return makeError(`입력값이 저장 한도를 넘었거나 형식이 맞지 않습니다(${error.message || code}).`, { status, code });
  }
  const message = (error && typeof error.message === "string" && error.message) || `요청을 처리하지 못했습니다(HTTP ${status}).`;
  return makeError(message, { status, code });
}

// 세션이 있어야 부른다 — 로그인 없이 부르면 '권한 없음'이나 빈 목록이 와서 '문제집이 없음'처럼 보일 수 있다.
// 갱신이 연결 문제로 실패한 것이면 만료가 아니라 연결 오류로 알린다(세션은 남아 있음)
async function requireSession() {
  const { session, error } = await loadSession();
  if (session) return session;
  if (error && (error.status === 0 || error.status >= 500)) throw await connectionError(error.status || 0);
  notifySessionExpired();
  throw sessionExpiredError();
}

// DB 함수 하나 부르기. expect: "array"|"object" 면 그 꼴이 아닌 응답(빈 몸·0행)을 성공으로 넘기지 않는다
export async function call(fn, args = {}, { expect } = {}) {
  const sb = getSupabase();
  await requireSession();
  const res = await sb.rpc(fn, args);
  if (res.error || !res.status || res.status >= 300) throw await rpcError(res);
  const data = res.data;
  const shapeOk =
    expect === "array" ? Array.isArray(data)
      : expect === "object" ? data !== null && typeof data === "object" && !Array.isArray(data)
        : data !== null && data !== undefined;
  if (!shapeOk) {
    throw makeError(`서버 응답이 비어 있거나 꼴이 다릅니다(${fn}). 잠시 뒤 다시 해 주세요.`, { status: res.status, code: "QM_EMPTY" });
  }
  return data;
}

export function fetchMe() {
  return call("qm_me", {}, { expect: "object" });
}

// 로그인한 사용자 id(그림 폴더 이름). 세션이 없으면 만료로 처리
export async function currentUserId() {
  const session = await requireSession();
  return session.user.id;
}
