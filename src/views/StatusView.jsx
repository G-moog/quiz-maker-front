import AuthCard from "../components/AuthCard";

// 시작 판정의 안내 화면(설계서 3.4절): 확인 중 · 서버 준비 중 · 서버가 쉬는 중 · 계정 준비 필요 · 전환 준비 중 ·
// 주소가 바뀌었습니다 · 미리보기 확인 · 설정 필요. 단추는 actions: [{ label, onClick | href, primary }]
const TONE = {
  info: "#a0a0a0",
  warn: "#f59e0b",
  error: "#f87171",
};

const S = {
  message: (tone) => ({
    color: TONE[tone] ?? TONE.info,
    fontSize: 14,
    lineHeight: 1.6,
    textAlign: "center",
    whiteSpace: "pre-line",
    overflowWrap: "anywhere",
    margin: "0 0 20px",
  }),
  btns: { display: "flex", flexDirection: "column", gap: 8 },
  btn: (primary) => ({
    width: "100%",
    minHeight: 44,
    padding: "10px 0",
    background: primary ? "#f59e0b" : "#242424",
    color: primary ? "#000000" : "#a0a0a0",
    border: primary ? "none" : "1px solid #2e2e2e",
    borderRadius: 7,
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    textAlign: "center",
    textDecoration: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
  }),
};

export default function StatusView({ title, message, tone = "info", actions = [], busy = false }) {
  return (
    <AuthCard title={title} maxWidth={420}>
      {message && (
        <p style={S.message(tone)} role={tone === "error" ? "alert" : "status"}>
          {message}
        </p>
      )}
      {actions.length > 0 && (
        <div style={S.btns}>
          {actions.map((a) =>
            a.href ? (
              <a key={a.label} href={a.href} style={S.btn(a.primary)}>{a.label}</a>
            ) : (
              <button key={a.label} type="button" style={S.btn(a.primary)} onClick={a.onClick} disabled={busy}>
                {a.label}
              </button>
            )
          )}
        </div>
      )}
    </AuthCard>
  );
}
