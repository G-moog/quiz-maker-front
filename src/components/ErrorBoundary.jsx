import { Component } from "react";

// 화면을 그리다 예외가 나면 빈 화면 대신 짧은 안내와 '다시 불러오기'·'목록으로'를 보인다.
// onHome: '목록으로'를 누르면 부르는 함수(App 이 대시보드로 바꿈). 없으면 경계만 다시 그린다(아래 화면을 새로 올림)
const S = {
  wrap: {
    minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center",
    padding: 16, background: "#0f0f0f", fontFamily: "system-ui, sans-serif",
  },
  box: {
    width: "100%", maxWidth: 360, padding: "18px 16px", borderRadius: 10,
    background: "#1a1a1a", border: "1px solid rgba(248,113,113,0.4)", textAlign: "center",
  },
  title: { color: "#f87171", fontSize: 15, fontWeight: 700, marginBottom: 6 },
  detail: { color: "#8a8a8a", fontSize: 12, lineHeight: 1.5, marginBottom: 14, overflowWrap: "anywhere" },
  btns: { display: "flex", gap: 8 },
  btn: (primary) => ({
    flex: 1, minHeight: 40, borderRadius: 7, fontSize: 14, fontWeight: 700, cursor: "pointer",
    background: primary ? "#f59e0b" : "#242424", color: primary ? "#000" : "#d0d0d0",
    border: primary ? "none" : "1px solid #2e2e2e",
  }),
};

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.goHome = this.goHome.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("화면 오류:", error, info?.componentStack);
  }

  goHome() {
    this.setState({ error: null });
    this.props.onHome?.();
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const msg = String(error?.message || error || "").slice(0, 160);
    return (
      <div style={S.wrap}>
        <div style={S.box} role="alert">
          <div style={S.title}>화면을 그리다 문제가 생겼습니다</div>
          {msg && <div style={S.detail}>{msg}</div>}
          <div style={S.btns}>
            <button type="button" style={S.btn(false)} onClick={this.goHome}>목록으로</button>
            <button type="button" style={S.btn(true)} onClick={() => window.location.reload()}>다시 불러오기</button>
          </div>
        </div>
      </div>
    );
  }
}
