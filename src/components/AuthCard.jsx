// 로그인 화면과 같은 모양의 가운데 카드 — 안내 화면(StatusView)·새 비밀번호 화면이 함께 쓴다
const S = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f0f0f",
    fontFamily: "system-ui, sans-serif",
    padding: 16,
  },
  // 휴대폰: 화면 끝에서 16px 띄우고, 좁을수록 안쪽 여백을 줄인다(clamp)
  card: {
    background: "#1a1a1a",
    borderRadius: 12,
    border: "1px solid #2e2e2e",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    padding: "clamp(28px, 8vw, 40px) clamp(20px, 7vw, 48px)",
    width: "100%",
  },
  logo: {
    textAlign: "center",
    color: "#f59e0b",
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 24,
    letterSpacing: 1,
  },
  title: {
    color: "#f1f1f1",
    fontSize: 18,
    fontWeight: 700,
    margin: "0 0 14px",
    textAlign: "center",
  },
};

export default function AuthCard({ title, maxWidth = 380, children }) {
  return (
    <div style={S.page}>
      <div style={{ ...S.card, maxWidth }}>
        <div style={S.logo}>📝 Quiz Maker</div>
        {title && <h1 style={S.title}>{title}</h1>}
        {children}
      </div>
    </div>
  );
}
