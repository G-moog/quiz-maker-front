// Vercel 함수 /api/keepalive — Supabase Free 프로젝트가 7일 동안 쓰이지 않아 정지되는 것을 막는다(설계서 1.5절).
// 공개 값(주소·publishable 키)만 쓰고, 로그인 없이 부를 수 있는 qm_schema_version 하나만 부른다. 비밀값은 없다.
// 크론 등록(vercel.json 의 crons 2개)은 요금제(결정 3)를 Free 로 정한 뒤에 한다 — README.md '정지 막기' 참고.
// 등록하기 전에는 아무도 부르지 않으며, 누가 불러도 숫자 하나를 읽을 뿐이다.
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, checkConfig } from "../src/config.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const check = checkConfig({ url: SUPABASE_URL, key: SUPABASE_PUBLISHABLE_KEY });
  if (!check.ok) {
    res.status(503).json({ ok: false, error: check.error || "src/config.js 의 Supabase 주소·공개 키가 비어 있습니다." });
    return;
  }
  try {
    const r = await fetch(`${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/rpc/qm_schema_version`, {
      method: "POST",
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: "{}",
    });
    const text = await r.text();
    const version = r.ok ? Number(text) : null;
    res.status(r.ok ? 200 : 502).json({
      ok: r.ok,
      status: r.status,
      paused: r.status === 540,
      schemaVersion: Number.isFinite(version) ? version : null,
      at: new Date().toISOString(),
    });
  } catch (e) {
    res.status(502).json({ ok: false, status: 0, error: String(e?.message || e), at: new Date().toISOString() });
  }
}
