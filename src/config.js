// 공개 설정 — 저장소(공개)에 그대로 올라가는 값만 둔다(설계서 1.4·5.1절). 환경 변수는 쓰지 않는다.
// Supabase 주소와 publishable 키(sb_publishable_…)는 공개 값이다. secret(sb_secret_…)·service_role 키와 DB 비밀번호는 어디에도 넣지 않는다.
// 키가 공개 키 꼴이 아니면 앱이 시작하지 않고(api/supabase.js) 빌드도 실패한다(vite.config.js).
// 이 파일은 브라우저(앱)와 Node(vite.config.js·api/keepalive.js)가 함께 읽으므로 다른 파일을 불러오지 않는다.

// Supabase 프로젝트 주소(예: "https://abcdefghijklmnop.supabase.co"). 프로젝트를 만든 뒤 채운다 — 지금은 비어 있음
export const SUPABASE_URL = "";
// publishable 키(sb_publishable_ 로 시작). 지금은 비어 있음
export const SUPABASE_PUBLISHABLE_KEY = "";
// 운영 주소(Vercel production 도메인, 호스트 이름만. 예: "quiz-maker-xx.vercel.app"). Vercel 프로젝트를 만든 뒤 채운다 — 지금은 없음
// 여기 없는 주소(미리보기·로컬)에서는 리허설 띠나 '운영 데이터' 확인을 보인다(설계서 3.4절)
export const PROD_HOSTS = [];
// 옛 Railway 앱 주소: 여기서 열리면 '주소가 바뀌었습니다' 화면만 보인다
export const LEGACY_APP_HOST = "quiz-maker.up.railway.app";
// 앱이 요구하는 DB 판(supabase/migrations 의 마지막 schema_version). DB 가 이보다 낮으면 '서버 준비 중'
export const REQUIRED_SCHEMA = 4;
// 엑셀 단추(전체 다운로드·엑셀 업로드·카드의 ⬇ 엑셀). 결정 4(엑셀)가 미정이라 숨긴다.
// true 로 바꾸기 전에 src/api/excel.js 를 브라우저 엑셀(설계서 5.1절)로 다시 써야 한다 — 지금 그 함수들은 '준비 안 됨' 오류만 낸다
export const SHOW_EXCEL = false;
// 새 비밀번호 최소 길이. Supabase Authentication → 비밀번호 최소 길이 설정과 같게(설계서 3.2절, 12자 이상 권함)
export const PASSWORD_MIN_LENGTH = 12;

// JWT 꼴 키의 payload(읽을 수 없으면 null). 서명은 보지 않는다 — 키 종류만 가린다
function jwtPayload(key) {
  const parts = String(key).split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")));
  } catch {
    return null;
  }
}

// 공개 키(publishable)가 아니면 멈춘다. 오류 문구에 키 값은 넣지 않는다
export function assertPublicKey(key) {
  const k = typeof key === "string" ? key.trim() : "";
  if (!k) throw new Error("공개 키가 비어 있습니다. src/config.js 에 publishable 키(sb_publishable_…)를 넣어 주세요.");
  if (k.startsWith("sb_secret_")) {
    throw new Error("공개 키가 아닙니다: secret 키(sb_secret_…)입니다. publishable 키(sb_publishable_…)만 넣어야 합니다.");
  }
  const payload = jwtPayload(k);
  if (payload && payload.role === "service_role") {
    throw new Error("공개 키가 아닙니다: service_role 키입니다. publishable 키(sb_publishable_…)만 넣어야 합니다.");
  }
  if (!k.startsWith("sb_publishable_")) {
    throw new Error(
      payload
        ? "공개 키가 아닙니다: 옛 JWT 꼴 키입니다. publishable 키(sb_publishable_…)를 넣어 주세요."
        : "공개 키가 아닙니다: sb_publishable_ 로 시작해야 합니다."
    );
  }
}

// Supabase 주소 꼴 검사: https(로컬 시험만 http) + 경로 없음
export function assertSupabaseUrl(url) {
  let u;
  try {
    u = new URL(String(url));
  } catch {
    throw new Error("Supabase 주소가 올바르지 않습니다(예: https://abcdefghijklmnop.supabase.co).");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) || u.hostname.endsWith(".localhost");
  if (!(u.protocol === "https:" || (u.protocol === "http:" && loopback))) {
    throw new Error("Supabase 주소는 https:// 로 시작해야 합니다.");
  }
  if ((u.pathname && u.pathname !== "/") || u.search || u.hash) {
    throw new Error("Supabase 주소에는 경로를 붙이지 않습니다(예: https://abcdefghijklmnop.supabase.co).");
  }
}

// 설정 전체 검사. { ok: true } | { empty: true } (아직 비어 있음) | { error: "…" }
// production: Vercel 운영 빌드처럼 반드시 채워져 있어야 하는 경우(비어 있어도 오류, 운영 주소도 필요)
export function checkConfig({ url, key, prodHosts = [], production = false } = {}) {
  const hasUrl = typeof url === "string" && url.trim() !== "";
  const hasKey = typeof key === "string" && key.trim() !== "";
  if (!hasUrl && !hasKey) {
    if (production) return { error: "운영 빌드인데 src/config.js 의 Supabase 주소와 공개 키가 비어 있습니다." };
    return { empty: true };
  }
  if (!hasUrl || !hasKey) {
    return { error: "src/config.js 의 SUPABASE_URL 과 SUPABASE_PUBLISHABLE_KEY 는 함께 채워야 합니다." };
  }
  try {
    assertPublicKey(key);
    assertSupabaseUrl(url);
  } catch (e) {
    return { error: e.message };
  }
  if (production && !(Array.isArray(prodHosts) && prodHosts.length > 0)) {
    return { error: "운영 빌드인데 src/config.js 의 PROD_HOSTS(운영 주소)가 비어 있습니다." };
  }
  return { ok: true };
}
