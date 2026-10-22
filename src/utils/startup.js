// 시작 판정(설계서 3.4절) — 화면 없이 값만 보고 정한다(App.jsx 가 쓴다).
// Node 시험(test/app)도 그대로 불러오도록 확장자까지 적는다
import { LEGACY_APP_HOST, PROD_HOSTS, REQUIRED_SCHEMA } from "../config.js";

/* global __QM_PRODUCTION_BUILD__ */
// Vercel 운영 빌드(VERCEL_ENV=production)인지. vite.config.js 가 빌드할 때 넣는다(로컬·미리보기 빌드와 Node 시험은 false)
export const PRODUCTION_BUILD = typeof __QM_PRODUCTION_BUILD__ !== "undefined" && __QM_PRODUCTION_BUILD__ === true;

// 주소 종류: "prod"(운영) · "legacy"(옛 Railway 앱 주소) · "preview"(그 밖: Vercel 미리보기·로컬)
// Vercel 운영 빌드는 어느 주소로 열어도 운영이다 — 운영 도메인 말고도 git-master 별칭·배포별 주소로 같은 빌드가 열린다.
// 그 밖의 빌드는 주소가 PROD_HOSTS 에 있을 때만 운영
export function hostKindOf(hostname, { prodHosts = PROD_HOSTS, legacyHost = LEGACY_APP_HOST, productionBuild = PRODUCTION_BUILD } = {}) {
  const h = String(hostname || "").toLowerCase();
  if (legacyHost && h === legacyHost.toLowerCase()) return "legacy";
  if (productionBuild) return "prod";
  if (prodHosts.some((p) => String(p).toLowerCase() === h)) return "prod";
  return "preview";
}

// qm_me 결과 → 들어갈 화면. band: 미리보기·로컬 주소의 띠("rehearsal" | "live-preview")
//   판이 낮음 → not-ready, 계정 준비 안 됨 → account, 운영 주소 + 전환 전(live 아님) → cutover(데이터를 부르지 않음),
//   미리보기 + 전환 전 → 앱 + 리허설 띠, 미리보기 + 전환 뒤 → '운영 데이터' 확인(탭마다) 뒤 앱 + 붉은 띠
export function decideAfterMe(me, kind, required = REQUIRED_SCHEMA) {
  if (!me || typeof me !== "object") return { screen: "error" };
  if (!(Number(me.schemaVersion) >= required)) return { screen: "not-ready" };
  if (me.ready !== true) return { screen: "account" };
  const live = me.live === true;
  if (kind === "prod") return live ? { screen: "app", band: null } : { screen: "cutover" };
  return live ? { screen: "confirm-preview", band: "live-preview" } : { screen: "app", band: "rehearsal" };
}

// 비밀번호 재설정 링크로 들어왔는지 주소 끝(#…)으로 본다. supabase-js 가 곧 이 부분을 지우므로 시작하자마자 읽는다.
// "recovery"(새 비밀번호 화면으로) · { error: 설명 } (링크가 만료되었거나 이미 쓴 것) · null
export function recoveryFromHash(hash) {
  const p = new URLSearchParams(String(hash || "").replace(/^#/, ""));
  if (p.get("type") === "recovery" && p.get("access_token")) return "recovery";
  if (p.get("error") || p.get("error_code")) return { error: p.get("error_description") || p.get("error_code") || p.get("error") };
  return null;
}
