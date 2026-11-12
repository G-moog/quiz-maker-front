// 폴더 창(옮길 곳 고르기·새 폴더·이름 바꾸기·지우기 묻기)의 공통 모양 — 대시보드의 다른 창(DashboardView 의 S.overlay·S.modal)과 같은 꼴.
// 휴대폰에서도 화면 끝에서 16px 띄우고, 좁으면 안쪽 여백을 줄인다(clamp). 키보드가 올라와 보이는 영역이 낮아지면 덮개를 그 영역에 맞춰
// (useFitOverlay) 창이 그 안에서 스크롤 — 저장·만들기 단추가 자판 뒤에 숨지 않게
import { useEffect, useState } from "react";

export const SHEET = {
  // 덮개 자리는 긴 속성으로(useFitOverlay 가 top·bottom·height 만 바꾼다 — 줄임 속성 inset 과 섞으면 자판이 내려갈 때 자리가 어긋남)
  overlay: {
    position: "fixed", left: 0, right: 0, top: 0, bottom: 0, background: "rgba(0,0,0,0.75)", padding: 16,
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
  },
  modal: {
    background: "#1a1a1a", borderRadius: 12, border: "1px solid #2e2e2e",
    padding: "clamp(22px, 6vw, 32px) clamp(16px, 5vw, 32px)", width: "100%", maxWidth: 420,
    boxShadow: "0 16px 48px rgba(0,0,0,0.6)", position: "relative",
    maxHeight: "100%", overflowY: "auto",
  },
  title: { fontWeight: 700, fontSize: 17, color: "#f1f1f1", marginBottom: 6, paddingRight: 32 },
  sub: { fontSize: 13, color: "#8a8a8a", marginBottom: 16 },
  close: {
    position: "absolute", top: 8, right: 8, width: 40, height: 40,
    display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8,
    background: "none", border: "none", color: "#777777", fontSize: 20, cursor: "pointer", lineHeight: 1,
  },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#a0a0a0", marginBottom: 6 },
  input: {
    width: "100%", padding: "9px 12px", minHeight: 40, background: "#242424", border: "1px solid #2e2e2e",
    borderRadius: 7, fontSize: 14, marginBottom: 8, color: "#f1f1f1", outline: "none",
  },
  hint: { fontSize: 12, color: "#a0a0a0", marginBottom: 10, lineHeight: 1.5 },
  error: { color: "#f87171", fontSize: 13, marginBottom: 10 },
  btns: { display: "flex", gap: 10, marginTop: 8 },
  confirm: {
    flex: 1, minHeight: 42, padding: "10px 0", background: "#f59e0b", color: "#000000",
    border: "none", borderRadius: 7, fontWeight: 700, cursor: "pointer", fontSize: 14,
  },
  cancel: {
    flex: 1, minHeight: 42, padding: "10px 0", background: "#242424", color: "#a0a0a0",
    border: "1px solid #2e2e2e", borderRadius: 7, fontWeight: 700, cursor: "pointer", fontSize: 14,
  },
  danger: {
    flex: 1, minHeight: 42, padding: "10px 0", background: "none", color: "#f87171",
    border: "1px solid rgba(248,113,113,0.6)", borderRadius: 7, fontWeight: 700, cursor: "pointer", fontSize: 14,
  },
};

// 휴대폰 자판이 올라오면 보이는 영역(visualViewport)만 줄고 레이아웃 화면은 그대로다(크롬 안드로이드 기본값) — fixed 덮개는
// 화면 전체 높이 그대로라 창 아래쪽이 자판 뒤로 간다. 열려 있는 동안 덮개를 보이는 영역의 위치·높이에 맞춘다(QuestionNoteSheet 와 같은 방법).
// base: 덮개 모양(top·bottom 은 긴 속성), active: 창이 열려 있을 때만 듣는다
export function useFitOverlay(base = SHEET.overlay, active = true) {
  const [box, setBox] = useState(null);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!active || !vv) return undefined;
    const update = () => setBox({ top: Math.round(vv.offsetTop), height: Math.round(vv.height) });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setBox(null);
    };
  }, [active]);
  return box ? { ...base, top: box.top, bottom: "auto", height: box.height } : base;
}
