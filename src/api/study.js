// 공부 기록 나누기 API(DB 함수 qm_list_study·qm_put_study, 마이그레이션 ⑥). 언제 부를지는 utils/studyState.js 가 정한다.
// 뒤에서 도는 '조용한' 부르기다: 로그인 세션이 없으면 요청하지 않고, 오류는 화면에 띄우지 않는다.
// 오류의 판정(연결 실패·서버 쉼·함수 없음·로그인 만료)은 다른 api 와 같은 rpcError(api/supabase.js)를 쓴다 —
// 서버가 로그인 만료(401)라고 하면 다른 호출처럼 이 기기의 세션을 끊고 로그인 화면으로 간다.
// 이 파일을 불러오면(App → DashboardView) studyState 에 이어진다.
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../config";
import { configState, getSupabase, loadSession, rpcError } from "./supabase";
import { connectStudySync } from "../utils/studyState";

function quietError(message, flags) {
  return Object.assign(new Error(message), flags);
}

// 세션이 있을 때만. 없으면(로그아웃) 요청 없이 signedOut, 갱신이 연결 문제로 실패했으면 offline
async function sessionOrThrow() {
  if (!configState.ok) throw quietError("앱 설정이 비어 있습니다.", { signedOut: true });
  const { session, error } = await loadSession();
  if (session) return session;
  if (error && (error.status === 0 || error.status >= 500)) {
    throw quietError("서버에 연결하지 못했습니다.", { offline: true, status: error.status || 0 });
  }
  throw quietError("로그인하지 않았습니다.", { signedOut: true });
}

// 앱이 가려지거나 닫힐 때: 페이지가 사라져도 요청이 끝까지 가게 fetch keepalive 로 직접 부른다(supabase-js 는 keepalive 를
// 넘기지 못함). 응답은 supabase-js 의 rpc 결과와 같은 꼴({ status, data, error })로
async function keepaliveRpc(fn, args, token) {
  let r;
  try {
    r = await fetch(`${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/rpc/${fn}`, {
      method: "POST",
      keepalive: true,
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
  } catch {
    return { status: 0, data: null, error: null };
  }
  let body = null;
  try { const text = await r.text(); body = text ? JSON.parse(text) : null; } catch { /* 몸이 JSON 이 아님 */ }
  if (r.ok) return { status: r.status, data: body, error: null };
  return { status: r.status, data: null, error: body && typeof body === "object" ? body : { message: `HTTP ${r.status}` } };
}

async function quietCall(fn, args, { keepalive = false, expect } = {}) {
  const session = await sessionOrThrow();
  const res = keepalive ? await keepaliveRpc(fn, args, session.access_token) : await getSupabase().rpc(fn, args);
  if (res.error || !res.status || res.status >= 300) throw await rpcError(res);
  const ok = expect === "array" ? Array.isArray(res.data) : res.data && typeof res.data === "object" && !Array.isArray(res.data);
  if (!ok) throw quietError(`서버 응답 꼴이 다릅니다(${fn}).`, { status: res.status, code: "QM_EMPTY" });
  return res.data;
}

// 내 공부 기록 줄 [{ setId, data, clientAt, updatedAt }]. since(ISO)를 주면 그 뒤에 서버에서 바뀐 줄만
export function listStudy(since = null) {
  return quietCall("qm_list_study", since ? { p_since: since } : {}, { expect: "array" });
}

// 한 줄 올리기 → 서버에서 합친 뒤 남은 줄 { setId, data, clientAt, updatedAt }
export function putStudy(setId, data, clientAt, { keepalive = false } = {}) {
  return quietCall("qm_put_study", { p_set_id: setId, p_data: data, p_client_at: clientAt }, { keepalive, expect: "object" });
}

connectStudySync({ list: listStudy, put: putStudy });

export { syncStudy, pullStudy, flushStudy, freshStudyBeforeOpen, refreshStudy, pendingStudyPull } from "../utils/studyState";
